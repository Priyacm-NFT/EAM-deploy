import { Fragment, useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface RunLog {
  id: string;
  jobId: string | null;
  jobType: string;
  connectionName: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'success' | 'failed' | 'running';
  rowsProcessed: number | null;
  errorMessage: string | null;
  durationMs: number | null;
}

const STATUS_STYLE: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  running: 'bg-accent/15 text-accent-dark',
};

export function IntegrationHistoryPage() {
  const [logs, setLogs] = useState<RunLog[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  function load() {
    api<{ data: RunLog[]; total: number }>('/admin/integrations/run-log')
      .then((res) => setLogs(res.data ?? []))
      .catch(() => setLogs([]));
  }

  useEffect(() => { load(); }, []);

  const jobTypes = [...new Set(logs.map((l) => l.jobType))].sort();

  const filtered = logs.filter((l) => {
    const matchStatus = !statusFilter || l.status === statusFilter;
    const matchJob = !jobFilter || l.jobType === jobFilter;
    return matchStatus && matchJob;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  async function retry(log: RunLog) {
    if (!log.jobId) return;
    setRetrying(log.id);
    setMsg('');
    setError('');
    try {
      await api(`/admin/integrations/jobs/${log.jobId}/run`, { method: 'POST' });
      setMsg('Job re-triggered. Check history for the new run.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetrying(null);
    }
  }

  const failedCount = logs.filter((l) => l.status === 'failed').length;
  const runningCount = logs.filter((l) => l.status === 'running').length;

  return (
    <IdentityPageLayout
      title="Integration run history"
      subtitle="Full audit of every scheduled and triggered integration job — retry failed runs directly from this log"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total runs', value: logs.length, color: 'text-slate-700 bg-white border-slate-200' },
          { label: 'Failed', value: failedCount, color: 'text-red-700 bg-red-50 border-red-200' },
          { label: 'Running now', value: runningCount, color: 'text-accent-dark bg-blue-50 border-accent/20' },
        ].map((s) => (
          <div key={s.label} className={`content-card border ${s.color} text-center`}>
            <p className="text-3xl font-bold">{s.value}</p>
            <p className="text-sm font-medium mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="admin-section">
        <div className="flex justify-between items-center">
          <h2 className="admin-section-title mb-0">Run log</h2>
          <button type="button" className="btn-outline text-xs" onClick={load}>Refresh</button>
        </div>

        <div className="flex flex-wrap gap-3">
          <select className="form-select w-44" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="running">Running</option>
          </select>
          <select className="form-select w-52" value={jobFilter} onChange={(e) => { setJobFilter(e.target.value); setPage(0); }}>
            <option value="">All job types</option>
            {jobTypes.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Job type</th>
                <th>Connection</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Rows</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr><td colSpan={7} className="text-center text-slate-400 py-10">No run records found.</td></tr>
              )}
              {paginated.map((log) => (
                <Fragment key={log.id}>
                  <tr>
                    <td className="font-medium text-primary">{log.jobType.replace('_', ' ')}</td>
                    <td className="text-sm text-slate-600">{log.connectionName}</td>
                    <td className="text-xs text-slate-500">{new Date(log.startedAt).toLocaleString()}</td>
                    <td className="text-xs text-slate-500">
                      {log.durationMs != null ? `${(log.durationMs / 1000).toFixed(1)}s` : log.status === 'running' ? '…' : '—'}
                    </td>
                    <td className="text-sm">{log.rowsProcessed ?? '—'}</td>
                    <td>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[log.status]}`}>
                        {log.status}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2 items-center">
                        {log.errorMessage && (
                          <button type="button" className="btn-link text-xs text-red-600" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                            {expanded === log.id ? 'Hide error' : 'View error'}
                          </button>
                        )}
                        {log.status === 'failed' && log.jobId && (
                          <button type="button" className="btn-link text-xs" disabled={retrying === log.id} onClick={() => retry(log)}>
                            {retrying === log.id ? 'Retrying…' : 'Retry'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === log.id && log.errorMessage && (
                    <tr key={`${log.id}-error`}>
                      <td colSpan={7} className="bg-red-50 px-4 py-3">
                        <p className="text-xs font-semibold text-red-700 mb-1">Error detail</p>
                        <pre className="text-xs text-red-800 whitespace-pre-wrap font-mono">{log.errorMessage}</pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-3 justify-end text-sm">
            <button type="button" className="btn-outline py-1 px-3 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <span className="text-slate-600">Page {page + 1} of {totalPages}</span>
            <button type="button" className="btn-outline py-1 px-3 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </IdentityPageLayout>
  );
}

