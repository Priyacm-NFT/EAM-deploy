import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import type {
  ReportDefinitionRow,
  ReportRunRow,
  ReportScheduleRow,
} from './report-types.js';

export function ScheduledReportsPage() {
  const [schedules, setSchedules] = useState<ReportScheduleRow[]>([]);
  const [reports, setReports] = useState<ReportDefinitionRow[]>([]);
  const [runs, setRuns] = useState<ReportRunRow[]>([]);
  const [reportId, setReportId] = useState('');
  const [cronExpr, setCronExpr] = useState('0 8 * * 1');
  const [emails, setEmails] = useState('');
  const [skipIfEmpty, setSkipIfEmpty] = useState(true);

  const load = async () => {
    const [s, r, runLog] = await Promise.all([
      api<ReportScheduleRow[]>('/reports/schedules'),
      api<ReportDefinitionRow[]>('/reports/definitions'),
      api<ReportRunRow[]>('/reports/runs'),
    ]);
    setSchedules(s);
    setReports(r);
    setRuns(runLog);
    if (r[0] && !reportId) setReportId(r[0].id);
  };

  useEffect(() => {
    load();
  }, []);

  const createSchedule = async () => {
    await api('/reports/schedules', {
      method: 'POST',
      body: JSON.stringify({
        reportId,
        cronExpr,
        outputFormat: 'PDF',
        skipIfEmpty,
        distribution: {
          emails: emails.split(',').map((e) => e.trim()).filter(Boolean),
        },
      }),
    });
    await load();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Scheduled reports</h1>
      <section className="border rounded-lg bg-white p-4 max-w-lg space-y-3">
        <h2 className="font-medium text-sm">New schedule</h2>
        <select
          className="w-full border rounded px-2 py-1"
          value={reportId}
          onChange={(e) => setReportId(e.target.value)}
        >
          {reports.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <input
          className="w-full border rounded px-2 py-1"
          value={cronExpr}
          onChange={(e) => setCronExpr(e.target.value)}
          placeholder="Cron expression"
        />
        <input
          className="w-full border rounded px-2 py-1"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder="Emails (comma-separated)"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={skipIfEmpty}
            onChange={(e) => setSkipIfEmpty(e.target.checked)}
          />
          Skip email when result is empty
        </label>
        <button
          type="button"
          className="rounded bg-slate-900 text-white px-4 py-2 text-sm"
          onClick={createSchedule}
        >
          Create schedule
        </button>
      </section>
      <section>
        <h2 className="font-medium mb-2">Active schedules</h2>
        <table className="w-full text-sm border bg-white rounded-lg">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-3 py-2">Report</th>
              <th className="px-3 py-2">Cron</th>
              <th className="px-3 py-2">Format</th>
              <th className="px-3 py-2">Skip empty</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-3 py-2">
                  {reports.find((r) => r.id === s.reportId)?.name ?? s.reportId}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{s.cronExpr}</td>
                <td className="px-3 py-2">{s.outputFormat}</td>
                <td className="px-3 py-2">{s.skipIfEmpty ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h2 className="font-medium mb-2">Run history</h2>
        <table className="w-full text-sm border bg-white rounded-lg">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Rows</th>
              <th className="px-3 py-2">Started</th>
            </tr>
          </thead>
          <tbody>
            {runs.slice(0, 20).map((run) => (
              <tr key={run.id} className="border-t">
                <td className="px-3 py-2">{run.status}</td>
                <td className="px-3 py-2">{run.rowCount ?? '—'}</td>
                <td className="px-3 py-2">{new Date(run.startedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
