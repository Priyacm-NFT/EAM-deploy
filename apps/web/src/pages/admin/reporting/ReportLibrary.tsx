import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import type { ReportDefinitionRow, ReportSubject } from './report-types.js';

export function ReportLibraryPage() {
  const [reports, setReports] = useState<ReportDefinitionRow[]>([]);
  const [subjects, setSubjects] = useState<ReportSubject[]>([]);
  const [filter, setFilter] = useState('');
  const [running, setRunning] = useState<string | null>(null);
  const [lastDownload, setLastDownload] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [r, s] = await Promise.all([
        api<ReportDefinitionRow[]>('/reports/definitions'),
        api<ReportSubject[]>('/reports/subjects'),
      ]);
      setReports(r);
      setSubjects(s);
    })();
  }, []);

  const subjectLabel = (id: string) => subjects.find((s) => s.id === id)?.label ?? id;

  const filtered = reports.filter(
    (r) =>
      !filter ||
      r.name.toLowerCase().includes(filter.toLowerCase()) ||
      subjectLabel(r.subjectId).toLowerCase().includes(filter.toLowerCase()),
  );

  const runPdf = async (id: string) => {
    setRunning(id);
    try {
      const result = await api<{ downloadUrl?: string }>(`/reports/definitions/${id}/run`, {
        method: 'POST',
        body: JSON.stringify({ format: 'PDF' }),
      });
      if (result.downloadUrl) setLastDownload(result.downloadUrl);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Report library</h1>
        <Link to="/admin/reporting/designer" className="text-sm text-blue-600">
          Open designer
        </Link>
      </div>
      <input
        className="border rounded px-3 py-2 w-full max-w-md"
        placeholder="Filter by name or subject…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <table className="w-full text-sm border bg-white rounded-lg overflow-hidden">
        <thead className="bg-slate-100 text-left">
          <tr>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2">Subject</th>
            <th className="px-3 py-2">Chart</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2">{subjectLabel(r.subjectId)}</td>
              <td className="px-3 py-2">{r.definition.chartType ?? 'table'}</td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="text-blue-600 hover:underline disabled:opacity-50"
                  disabled={running === r.id}
                  onClick={() => runPdf(r.id)}
                >
                  {running === r.id ? 'Running…' : 'Run PDF'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {lastDownload && (
        <p className="text-sm">
          Download:{' '}
          <a href={lastDownload} className="text-blue-600 underline" target="_blank" rel="noreferrer">
            latest report output
          </a>
        </p>
      )}
    </div>
  );
}
