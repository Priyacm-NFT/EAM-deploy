import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';
import type { ReportDefinitionRow, ReportSubject } from './report-types.js';

export function ReportLibraryPage() {
  const [reports, setReports] = useState<ReportDefinitionRow[]>([]);
  const [subjects, setSubjects] = useState<ReportSubject[]>([]);
  const [filter, setFilter] = useState('');
  const [running, setRunning] = useState<string | null>(null);
  const [lastDownload, setLastDownload] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [r, s] = await Promise.all([
          api<ReportDefinitionRow[]>('/reports/definitions'),
          api<ReportSubject[]>('/reports/subjects'),
        ]);
        setReports(r);
        setSubjects(s);
      } catch (e) {
        setError(String(e));
      }
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
    <IdentityPageLayout
      title="Reports"
      subtitle="Build, schedule, and run reports — all definitions are created by you"
    >
      {error && <MessageBanner type="error" text={error} />}

      <div className="admin-section">
        <h2 className="admin-section-title">Report tools</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link to="/admin/reporting/designer" className="btn-primary !w-auto px-4">
            Create report (designer)
          </Link>
          <Link to="/admin/reporting/schedules" className="btn-primary !w-auto px-4">
            Scheduled reports
          </Link>
          <Link to="/admin/reporting/bi" className="btn-primary !w-auto px-4">
            BI connections
          </Link>
        </div>
      </div>

      <div className="admin-section">
        <h2 className="admin-section-title">Saved reports</h2>
        <FormField label="Search reports" htmlFor="report-search">
          <input
            id="report-search"
            type="search"
            className="form-input max-w-md"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </FormField>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Report name</th>
                <th>Data subject</th>
                <th>Chart type</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-500 py-8">
                    No reports yet. Open the designer and type a report name to create one.
                  </td>
                </tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td>{subjectLabel(r.subjectId)}</td>
                  <td>{r.definition.chartType ?? 'table'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-link disabled:opacity-50"
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
        </div>

        {lastDownload && (
          <p className="text-sm text-slate-700 mt-3">
            Download:{' '}
            <a href={lastDownload} className="btn-link" target="_blank" rel="noreferrer">
              latest report output
            </a>
          </p>
        )}
      </div>
    </IdentityPageLayout>
  );
}

