import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

// FIX (P1-1 gap — AC-P1-1.7): "Bulk import of 1,000 assets validates
// against required custom fields; invalid rows reported, valid rows
// committed." There was no UI for this at all before — POST
// /assets/import existed but nothing in the browser could call it. This
// page is the "Bulk import wizard with validation preview" screen named
// in the PRD's P1-1 UI list.
//
// CSV parsing happens entirely client-side (no new dependency added —
// this is a small hand-rolled parser, good enough for the comma-
// separated, optionally-quoted CSV a spreadsheet export produces). The
// API only ever sees already-parsed rows, same as if this were an Excel
// import instead — the wizard's job is turning whatever file format into
// plain objects, not the API's.

interface LocationOption { id: string; code: string; name: string; }

interface ImportResult {
  totalRows: number;
  insertedCount: number;
  insertedIds: string[];
  failedCount: number;
  errors: { row: number; assetNum?: string; errors: string[] }[];
}

const TEMPLATE_HEADER = 'description,assetNum,locationCode,criticality,manufacturer,model,serialNum';
const TEMPLATE_EXAMPLE =
  'Centrifugal Pump 3B,,LINE-1,HIGH,Grundfos,CR-64,SN-88213\n' +
  'Air Compressor 2,AST-00042,LINE-1,MEDIUM,Atlas Copco,GA-30,SN-77410';

/** Minimal CSV parser: handles quoted fields (with escaped "" inside),
 * commas inside quotes, and CRLF/LF line endings. Not a full RFC-4180
 * implementation, but covers what Excel/Sheets exports produce. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushRow();
    } else if (c === '\r') {
      // swallow — \n right after handles the row break
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

export function AssetImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawText, setRawText] = useState('');
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api<LocationOption[]>('/locations').then(setLocations).catch(() => setLocations([]));
  }, []);

  function downloadTemplate() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`${TEMPLATE_HEADER}\n${TEMPLATE_EXAMPLE}\n`], { type: 'text/csv' }));
    a.download = 'asset-import-template.csv';
    a.click();
  }

  function parseFromText(text: string) {
    setParseError(''); setResult(null);
    const table = parseCsv(text.trim());
    if (table.length < 2) {
      setParseError('Need a header row plus at least one data row.');
      setParsedRows([]);
      return;
    }
    const headers = table[0]!.map((h) => h.trim());
    if (!headers.includes('description')) {
      setParseError('The header row must include a "description" column — it\'s the one required field.');
      setParsedRows([]);
      return;
    }
    const rows = table.slice(1).map((cells) =>
      Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])),
    );
    setParsedRows(rows);
  }

  // FIX: matches the existing "Bulk import users" pattern (Download CSV
  // template → fill it in Excel/Sheets → Choose File) instead of the
  // paste-into-a-textarea flow this started with. Selecting a file
  // parses it immediately and drops straight into the preview step below
  // — no separate "Parse & preview" click needed for the file-upload
  // path, since choosing a file already is that intent. The manual paste
  // option further down is kept as a fallback for a quick one-off row or
  // two without leaving the browser.
  function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      setRawText(text);
      parseFromText(text);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function submitImport() {
    setSubmitting(true); setError(''); setResult(null);
    const locationByCode = new Map(locations.map((l) => [l.code.toLowerCase(), l.id]));

    const rows = parsedRows.map((r) => {
      const out: Record<string, unknown> = { description: r.description };
      if (r.assetNum) out.assetNum = r.assetNum;
      if (r.criticality) out.criticality = r.criticality.toUpperCase();
      if (r.manufacturer) out.manufacturer = r.manufacturer;
      if (r.model) out.model = r.model;
      if (r.serialNum) out.serialNum = r.serialNum;
      if (r.locationCode) {
        const locId = locationByCode.get(r.locationCode.toLowerCase());
        out.locationId = locId ?? undefined;
        if (!locId) out._locationCodeNotFound = r.locationCode; // surfaced in preview, not sent as a real field
      }
      return out;
    });

    try {
      const res = await api<ImportResult>('/assets/import', {
        method: 'POST',
        body: JSON.stringify({ rows: rows.map(({ _locationCodeNotFound, ...rest }) => rest) }),
      });
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  const unresolvedLocationCodes = [
    ...new Set(
      parsedRows
        .map((r) => r.locationCode)
        .filter((code): code is string => !!code && !locations.some((l) => l.code.toLowerCase() === code.toLowerCase())),
    ),
  ];

  return (
    <IdentityPageLayout
      title="Bulk import assets"
      subtitle="Download the template, fill it in, upload it — preview before you commit. Bad rows are reported without blocking the good ones."
      backTo="/assets"
      backLabel="Back to assets"
    >
      {error && <MessageBanner type="error" text={error} />}

      <div className="admin-section" style={{ marginBottom: '20px' }}>
        <h2 className="admin-section-title">1. Get your data in</h2>
        <p className="text-sm text-slate-500 mt-1">
          Only <code className="text-xs bg-slate-100 px-1 rounded">description</code> is required. Everything else is
          optional. <code className="text-xs bg-slate-100 px-1 rounded">locationCode</code> should match an existing
          Location's Code (not its internal id) — it's resolved for you below.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded p-4 mt-3">
          <p className="text-sm text-slate-700">
            <button type="button" className="btn-link text-sm" onClick={downloadTemplate}>↓ Download CSV template</button>
            {' '}— fill it in with a spreadsheet app, then upload it below.
          </p>
          <label className="block mt-3">
            <span className="form-label">Choose file</span>
            <input
              ref={fileInputRef} type="file" accept=".csv,text/csv" className="form-input"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }}
            />
          </label>
        </div>

        <details className="mt-3">
          <summary className="text-sm text-slate-500 cursor-pointer select-none">Or paste CSV text directly</summary>
          <textarea
            className="form-input mt-2 font-mono text-xs"
            rows={8}
            placeholder={`${TEMPLATE_HEADER}\n${TEMPLATE_EXAMPLE}`}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
          <div className="flex gap-2 mt-3">
            <button type="button" className="btn-primary !w-auto px-6" onClick={() => parseFromText(rawText)} disabled={!rawText.trim()}>
              Parse &amp; preview
            </button>
          </div>
        </details>

        {parseError && <p className="text-red-600 text-sm mt-2">{parseError}</p>}
      </div>

      {parsedRows.length > 0 && !result && (
        <div className="admin-section" style={{ marginBottom: '20px' }}>
          <h2 className="admin-section-title">2. Preview ({parsedRows.length} row{parsedRows.length === 1 ? '' : 's'})</h2>

          {unresolvedLocationCodes.length > 0 && (
            <p className="text-amber-700 text-sm mt-2 bg-amber-50 border border-amber-200 rounded p-2">
              These locationCode values don't match any existing Location and will be left blank on import:{' '}
              <strong>{unresolvedLocationCodes.join(', ')}</strong>
            </p>
          )}

          <div className="overflow-x-auto mt-3">
            <table className="admin-table">
              <thead>
                <tr>{Object.keys(parsedRows[0]!).map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {parsedRows.slice(0, 50).map((r, i) => (
                  <tr key={i}>
                    {Object.entries(r).map(([k, v]) => (
                      <td key={k} className={k === 'description' && !v ? 'text-red-600' : ''}>{v || (k === 'description' ? '(missing)' : '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedRows.length > 50 && (
              <p className="text-slate-400 text-xs mt-2">Showing first 50 of {parsedRows.length} rows — all will be submitted.</p>
            )}
          </div>

          <div className="flex gap-2 mt-4">
            <button type="button" className="btn-primary !w-auto px-6" disabled={submitting} onClick={submitImport}>
              {submitting ? 'Importing…' : `Commit ${parsedRows.length} row${parsedRows.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="admin-section">
          <h2 className="admin-section-title">3. Result</h2>
          <div className="flex gap-6 mt-2 text-sm">
            <div><span className="form-label">Total rows</span><p className="text-lg">{result.totalRows}</p></div>
            <div><span className="form-label">Committed</span><p className="text-lg text-green-700">{result.insertedCount}</p></div>
            <div><span className="form-label">Failed</span><p className="text-lg text-red-600">{result.failedCount}</p></div>
          </div>

          {result.errors.length > 0 && (
            <table className="admin-table mt-4">
              <thead><tr><th>Row #</th><th>Asset #</th><th>Errors</th></tr></thead>
              <tbody>
                {result.errors.map((e) => (
                  <tr key={e.row}>
                    <td>{e.row + 1}</td>
                    <td>{e.assetNum ?? '—'}</td>
                    <td className="text-red-600 text-sm">{e.errors.join('; ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="flex gap-2 mt-4">
            {result.insertedCount > 0 && (
              <button type="button" className="btn-primary !w-auto px-6" onClick={() => navigate('/assets')}>
                Go to Assets list
              </button>
            )}
            <button
              type="button" className="btn-outline-light !w-auto px-6"
              onClick={() => { setResult(null); setParsedRows([]); setRawText(''); }}
            >
              Import more
            </button>
          </div>
        </div>
      )}

      {parsedRows.length === 0 && !result && (
        <p className="text-slate-400 text-sm">
          Or, if you'd rather not build a CSV by hand right now, go create assets one at a time from{' '}
          <Link to="/assets/new" className="text-accent hover:underline">+ New asset</Link>.
        </p>
      )}
    </IdentityPageLayout>
  );
}
