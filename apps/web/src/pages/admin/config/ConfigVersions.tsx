import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface ConfigVersion {
  id: string;
  entityType: string;
  entityId: string;
  versionNum: number;
  snapshot: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

function diffObjects(a: Record<string, unknown>, b: Record<string, unknown>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs: Array<{ key: string; before: unknown; after: unknown; type: 'added' | 'removed' | 'changed' }> = [];
  for (const key of keys) {
    const av = a[key]; const bv = b[key];
    if (!(key in a)) diffs.push({ key, before: undefined, after: bv, type: 'added' });
    else if (!(key in b)) diffs.push({ key, before: av, after: undefined, type: 'removed' });
    else if (JSON.stringify(av) !== JSON.stringify(bv)) diffs.push({ key, before: av, after: bv, type: 'changed' });
  }
  return diffs;
}

export function ConfigVersionsPage() {
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [filter, setFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [rolling, setRolling] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<ConfigVersion[]>('/admin/config/versions').then(setVersions).catch(() => setVersions([]));
  }

  useEffect(() => { load(); }, []);

  const entityTypes = [...new Set(versions.map((v) => v.entityType))].sort();

  const filtered = versions.filter((v) => {
    const matchEntity = !entityFilter || v.entityType === entityFilter;
    const matchSearch = !filter ||
      v.entityType.toLowerCase().includes(filter.toLowerCase()) ||
      v.entityId.toLowerCase().includes(filter.toLowerCase());
    return matchEntity && matchSearch;
  });

  const vA = versions.find((v) => v.id === compareA);
  const vB = versions.find((v) => v.id === compareB);
  const diffs = vA && vB ? diffObjects(vA.snapshot, vB.snapshot) : [];

  async function rollback(version: ConfigVersion) {
    if (!window.confirm(`Rollback to v${version.versionNum} of ${version.entityType}? This creates a new version with the old snapshot.`)) return;
    setRolling(version.id);
    setError(''); setMsg('');
    try {
      await api(`/admin/config/versions/${version.id}/promote`, {
        method: 'POST',
        body: JSON.stringify({ targetEnv: 'current', rollback: true }),
      });
      setMsg(`Rolled back to v${version.versionNum}. A new version has been created.`);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setRolling(null);
    }
  }

  function exportVersion(v: ConfigVersion) {
    const blob = new Blob([JSON.stringify(v.snapshot, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `config-${v.entityType}-v${v.versionNum}.json`;
    a.click();
  }

  function exportAll() {
    api('/admin/config/export').then((data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `eam-config-${Date.now()}.json`;
      a.click();
    }).catch((e) => setError(String(e)));
  }

  return (
    <IdentityPageLayout
      title="Config versions"
      subtitle="Audit trail of all configuration changes — compare versions, rollback, and export"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-3 items-end justify-between mb-4">
          <div className="flex gap-3 flex-1 min-w-0">
            <input
              type="search"
              placeholder="Search by entity type or ID…"
              className="form-input flex-1"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <select className="form-select w-48" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">All entity types</option>
              {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" className="btn-outline text-xs px-3 py-1.5"
              disabled={!compareA || !compareB}
              onClick={() => setShowDiff(!showDiff)}>
              {showDiff ? 'Hide diff' : 'Compare selected'}
            </button>
            <button type="button" className="btn-primary !w-auto px-4 text-xs" onClick={exportAll}>
              ↓ Export all config
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Total versions', value: versions.length },
            { label: 'Entity types', value: entityTypes.length },
            { label: 'Today', value: versions.filter((v) => new Date(v.createdAt).toDateString() === new Date().toDateString()).length },
            { label: 'Filtered', value: filtered.length },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-center">
              <p className="text-xs text-slate-500">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Diff panel */}
        {showDiff && vA && vB && (
          <div className="mb-4 border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex gap-4 text-xs font-medium text-slate-600">
              <span className="text-red-600">← v{vA.versionNum} ({vA.entityType})</span>
              <span className="text-green-600">→ v{vB.versionNum} ({vB.entityType})</span>
              <span className="ml-auto">{diffs.length} change{diffs.length !== 1 ? 's' : ''}</span>
            </div>
            {diffs.length === 0
              ? <p className="text-slate-400 text-sm p-4">No differences found.</p>
              : (
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {diffs.map((d) => (
                    <div key={d.key} className={`px-4 py-2 text-xs flex gap-4 ${d.type === 'added' ? 'bg-green-50' : d.type === 'removed' ? 'bg-red-50' : 'bg-yellow-50'}`}>
                      <code className="font-mono text-slate-600 w-32 shrink-0">{d.key}</code>
                      <span className={`${d.type === 'added' ? 'text-green-700' : 'text-red-600'} line-through w-40 truncate`}>
                        {d.type !== 'added' ? JSON.stringify(d.before) : ''}
                      </span>
                      <span className="text-green-700 w-40 truncate">
                        {d.type !== 'removed' ? JSON.stringify(d.after) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="w-8">Compare</th>
                <th>Entity type</th>
                <th>Entity ID</th>
                <th>Version</th>
                <th>Changed at</th>
                <th>Changed by</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center text-slate-400 py-10">No config versions found.</td></tr>
              )}
              {filtered.map((v) => (
                <>
                  <tr key={v.id} className={`${compareA === v.id || compareB === v.id ? 'bg-accent/5' : ''}`}>
                    <td>
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={compareA === v.id || compareB === v.id}
                        onChange={(e) => {
                          if (e.target.checked) {
                            if (!compareA) setCompareA(v.id);
                            else if (!compareB && compareA !== v.id) setCompareB(v.id);
                          } else {
                            if (compareA === v.id) setCompareA(null);
                            if (compareB === v.id) setCompareB(null);
                          }
                        }}
                      />
                    </td>
                    <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{v.entityType}</code></td>
                    <td className="text-xs font-mono text-slate-500 max-w-[120px] truncate">{v.entityId}</td>
                    <td><span className="text-xs font-mono bg-accent/10 text-accent-dark px-2 py-0.5 rounded-full">v{v.versionNum}</span></td>
                    <td className="text-xs text-slate-500">{new Date(v.createdAt).toLocaleString()}</td>
                    <td className="text-xs text-slate-500">{v.createdBy ? <span className="font-mono">{v.createdBy.slice(0, 8)}…</span> : '—'}</td>
                    <td>
                      <div className="flex gap-2">
                        <button type="button" className="btn-link text-xs" onClick={() => setExpanded(expanded === v.id ? null : v.id)}>
                          {expanded === v.id ? 'Hide' : 'View'}
                        </button>
                        <button type="button" className="btn-link text-xs" onClick={() => exportVersion(v)}>Export</button>
                        <button type="button" className="btn-link text-xs text-orange-600 hover:text-orange-700"
                          disabled={rolling === v.id}
                          onClick={() => rollback(v)}>
                          {rolling === v.id ? '…' : 'Rollback'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === v.id && (
                    <tr key={`${v.id}-exp`}>
                      <td colSpan={7} className="bg-slate-50 p-0">
                        <pre className="text-xs text-slate-600 font-mono p-4 overflow-x-auto max-h-64">
                          {JSON.stringify(v.snapshot, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Config import section */}
      <div className="admin-section">
        <h3 className="admin-section-title">Import configuration</h3>
        <p className="text-sm text-slate-600 mb-3">Upload a previously exported config JSON file. Use <strong>merge</strong> to skip existing items, or <strong>replace</strong> to overwrite.</p>
        <ImportConfig onDone={() => { setMsg('Import complete.'); load(); }} onError={setError} />
      </div>
    </IdentityPageLayout>
  );
}

function ImportConfig({ onDone, onError }: { onDone: () => void; onError: (e: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [importing, setImporting] = useState(false);

  async function run() {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await api<{ ok: boolean; imported: number; skipped: number; conflicts: string[] }>(
        '/admin/config/import',
        { method: 'POST', body: JSON.stringify({ data, mode }) }
      );
      onDone();
      alert(`Import complete. Imported: ${result.imported}, Skipped: ${result.skipped}${result.conflicts.length ? `\n\nConflicts:\n${result.conflicts.join('\n')}` : ''}`);
    } catch (e) {
      onError(String(e));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex gap-3 items-end flex-wrap">
      <div>
        <label className="form-label">Config JSON file</label>
        <input type="file" accept=".json" className="form-input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <div>
        <label className="form-label">Mode</label>
        <select className="form-select" value={mode} onChange={(e) => setMode(e.target.value as 'merge' | 'replace')}>
          <option value="merge">Merge (skip existing)</option>
          <option value="replace">Replace (overwrite)</option>
        </select>
      </div>
      <button type="button" className="btn-primary !w-auto px-5" onClick={run} disabled={!file || importing}>
        {importing ? 'Importing…' : 'Import'}
      </button>
    </div>
  );
}
