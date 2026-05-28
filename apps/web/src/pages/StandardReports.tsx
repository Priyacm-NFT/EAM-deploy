import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../components/identity/IdentityLayout.js';

interface ReportSubject { id: string; label: string; category: string; description: string | null }

const REPORT_CATEGORIES = [
  'Work Orders', 'Assets', 'Service Requests', 'Preventive Maintenance',
  'Inventory', 'Labour', 'Permits', 'Audit',
];

export function StandardReportsPage() {
  const [subjects, setSubjects] = useState<ReportSubject[]>([]);
  const [error, setError] = useState('');
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, unknown[]>>({});
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api<ReportSubject[]>('/reports/subjects').then(setSubjects).catch((e) => setError(String(e)));
  }, []);

  const runReport = async (subjectId: string) => {
    setRunning(subjectId);
    setError('');
    try {
      const data = await api<unknown[]>(`/reports/run/${subjectId}`);
      setResults((prev) => ({ ...prev, [subjectId]: data }));
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(null);
    }
  };

  const filtered = subjects.filter(
    (s) => !filter || s.label.toLowerCase().includes(filter.toLowerCase()) || s.category.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <IdentityPageLayout title="Standard Reports" subtitle="15 built-in EAM operational reports">
      {error && <MessageBanner type="error" text={error} />}

      <div className="admin-section mb-4">
        <label className="block">
          <span className="form-label">Search reports</span>
          <input className="form-input max-w-sm" placeholder="Filter by name or category…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </label>
      </div>

      {REPORT_CATEGORIES.map((cat) => {
        const catReports = filtered.filter((s) => s.category === cat);
        if (catReports.length === 0) return null;
        return (
          <div key={cat} className="admin-section mb-4">
            <h2 className="admin-section-title mb-3">{cat}</h2>
            <div className="space-y-3">
              {catReports.map((s) => (
                <div key={s.id}>
                  <div className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded">
                    <div className="flex-1">
                      <p className="font-medium text-sm">{s.label}</p>
                      {s.description && <p className="text-xs text-slate-400 mt-0.5">{s.description}</p>}
                    </div>
                    <button
                      type="button"
                      className="btn-primary !w-auto px-4 text-sm"
                      onClick={() => runReport(s.id)}
                      disabled={running === s.id}
                    >
                      {running === s.id ? 'Running…' : 'Run'}
                    </button>
                  </div>

                  {results[s.id] && (
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded overflow-x-auto">
                      <div className="p-2 flex justify-between items-center">
                        <span className="text-xs text-slate-500">{(results[s.id] as unknown[]).length} rows</span>
                        <button type="button" className="btn-link text-xs" onClick={() => setResults((prev) => { const n = { ...prev }; delete n[s.id]; return n; })}>Clear</button>
                      </div>
                      {(results[s.id] as unknown[]).length > 0 && (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-200">
                              {Object.keys((results[s.id] as Record<string, unknown>[])[0]!).map((col) => (
                                <th key={col} className="py-1.5 px-3 text-left text-slate-500 font-medium">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(results[s.id] as Record<string, unknown>[]).slice(0, 50).map((row, i) => (
                              <tr key={i} className="border-b border-slate-100">
                                {Object.values(row).map((val, j) => (
                                  <td key={j} className="py-1.5 px-3 text-slate-700">
                                    {val === null || val === undefined ? '—' : String(val)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </IdentityPageLayout>
  );
}
