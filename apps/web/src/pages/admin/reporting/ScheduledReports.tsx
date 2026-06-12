import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';
import type {
  ReportDefinitionRow,
  ReportRunRow,
  ReportScheduleRow,
} from './report-types.js';
import { usePagination } from '../../../hooks/usePagination.js';
import { Pagination } from '../../../components/Pagination.js';

export function ScheduledReportsPage() {
  const [schedules, setSchedules] = useState<ReportScheduleRow[]>([]);
  const [reports, setReports] = useState<ReportDefinitionRow[]>([]);
  const [runs, setRuns] = useState<ReportRunRow[]>([]);
  const [reportId, setReportId] = useState('');
  const [cronExpr, setCronExpr] = useState('');
  const [emails, setEmails] = useState('');
  const [skipIfEmpty, setSkipIfEmpty] = useState(true);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const [s, r, runLog] = await Promise.all([
      api<ReportScheduleRow[]>('/reports/schedules'),
      api<ReportDefinitionRow[]>('/reports/definitions'),
      api<ReportRunRow[]>('/reports/runs'),
    ]);
    setSchedules(s);
    setReports(r);
    setRuns(runLog);
  };

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  const createSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    if (!reportId) {
      setError('Select a report');
      return;
    }
    if (!cronExpr.trim()) {
      setError('Enter a cron expression');
      return;
    }
    try {
      await api('/reports/schedules', {
        method: 'POST',
        body: JSON.stringify({
          reportId,
          cronExpr: cronExpr.trim(),
          outputFormat: 'PDF',
          skipIfEmpty,
          distribution: {
            emails: emails.split(',').map((x) => x.trim()).filter(Boolean),
          },
        }),
      });
      setCronExpr('');
      setEmails('');
      setMsg('Schedule created.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const { page, setPage, paged, totalPages, totalItems } = usePagination(reports, 10);

  return (
    <IdentityPageLayout
      title="Scheduled reports"
      subtitle="Type a cron schedule and email recipients — create reports in the designer first"
      backTo="/admin/reporting/library"
      backLabel="Back to reports"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <form onSubmit={createSchedule} className="admin-section">
        <h2 className="admin-section-title">Create schedule</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-slate-600">
            No reports available.{' '}
            <Link to="/admin/reporting/designer" className="btn-link">
              Create a report first
            </Link>
            .
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Report" htmlFor="sched-report">
                <select
                  id="sched-report"
                  className="form-select"
                  value={reportId}
                  onChange={(e) => setReportId(e.target.value)}
                  required
                >
                  <option value="">Select report…</option>
                  {paged.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Cron expression" htmlFor="sched-cron" hint="Example: 0 8 * * 1 = every Monday 8am">
                <input
                  id="sched-cron"
                  type="text"
                  className="form-input font-mono"
                  value={cronExpr}
                  onChange={(e) => setCronExpr(e.target.value)}
                  required
                />
              </FormField>
              <FormField label="Email recipients" htmlFor="sched-emails" hint="Comma-separated addresses">
                <input
                  id="sched-emails"
                  type="text"
                  className="form-input"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                />
              </FormField>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mt-2">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-accent focus:ring-accent"
                checked={skipIfEmpty}
                onChange={(e) => setSkipIfEmpty(e.target.checked)}
              />
              Skip email when result is empty
            </label>
            <FormActions>
              <button type="submit" className="btn-primary !w-auto px-6">
                Create schedule
              </button>
            </FormActions>
          </>
        )}
      </form>

      <div className="admin-section">
        <h2 className="admin-section-title">Active schedules</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Cron</th>
                <th>Format</th>
                <th>Skip empty</th>
              </tr>
            </thead>
            <tbody>
              {schedules.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-500 py-6">
                    No schedules yet.
                  </td>
                </tr>
              )}
              {schedules.map((s) => (
                <tr key={s.id}>
                  <td>{reports.find((r) => r.id === s.reportId)?.name ?? s.reportId}</td>
                  <td className="font-mono text-xs">{s.cronExpr}</td>
                  <td>{s.outputFormat}</td>
                  <td>{s.skipIfEmpty ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-section">
        <h2 className="admin-section-title">Run history</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Rows</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-center text-slate-500 py-6">
                    No runs yet.
                  </td>
                </tr>
              )}
              {runs.slice(0, 20).map((run) => (
                <tr key={run.id}>
                  <td>{run.status}</td>
                  <td>{run.rowCount ?? '—'}</td>
                  <td>{new Date(run.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={10} onChange={setPage} />
    </IdentityPageLayout>
  );
}
