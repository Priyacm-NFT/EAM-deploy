import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';
import { usePagination } from '../../../hooks/usePagination.js';
import { Pagination } from '../../../components/Pagination.js';

interface Connection { id: string; name: string; adapterType: string; }

interface Job {
  id: string;
  connectionId: string;
  jobType: string;
  scheduleCron: string | null;
  triggerEvent: string | null;
  mappingConfig: Record<string, unknown>;
  isActive: boolean;
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'failed' | 'running' | null;
  nextRunAt: string | null;
}

const JOB_STATUS_STYLE: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  running: 'bg-accent/15 text-accent-dark',
};

/**
 * Maps each adapter type (as stored in Connection.adapterType) to the
 * job types that make sense for it, per PRD §12.0.4 P0-4.
 *
 * Adapter types here must match whatever the Connections admin UI stores
 * in the `adapterType` field (e.g. 'REST', 'SOAP', 'SFTP', 'MQ', 'JDBC').
 */
const ADAPTER_JOB_TYPES: Record<string, { value: string; label: string }[]> = {
  REST: [
    { value: 'REST_PULL', label: 'REST Pull (inbound sync)' },
    { value: 'REST_PUSH', label: 'REST Push (outbound sync)' },
    { value: 'WEBHOOK_REPLAY', label: 'Webhook replay' },
  ],
  SOAP: [
    { value: 'SOAP_PULL', label: 'SOAP Pull (inbound sync)' },
    { value: 'SOAP_PUSH', label: 'SOAP Push (outbound sync)' },
  ],
  SFTP: [
    { value: 'SFTP_PULL', label: 'SFTP Pull (inbound file)' },
    { value: 'SFTP_PUSH', label: 'SFTP Push (outbound file)' },
    { value: 'BULK_EXPORT', label: 'Bulk export to SFTP' },
  ],
  MQ: [
    { value: 'KAFKA_PUBLISH', label: 'Kafka / MQ Publish' },
    { value: 'KAFKA_SUBSCRIBE', label: 'Kafka / MQ Subscribe' },
  ],
  JDBC: [
    { value: 'JDBC_QUERY_SYNC', label: 'JDBC Query Sync (read-only)' },
  ],
};

/** Fallback list shown when no connection is selected or the adapter type is unknown. */
const FALLBACK_JOB_TYPES: { value: string; label: string }[] = [
  { value: 'INBOUND_SYNC',   label: 'Inbound sync'   },
  { value: 'OUTBOUND_SYNC',  label: 'Outbound sync'  },
  { value: 'BULK_EXPORT',    label: 'Bulk export'    },
  { value: 'WEBHOOK_REPLAY', label: 'Webhook replay' },
];

function getJobTypesForConnection(
  connectionId: string,
  connections: Connection[],
): { value: string; label: string }[] {
  const conn = connections.find((c) => c.id === connectionId);
  if (!conn) return FALLBACK_JOB_TYPES;
  // adapterType might be stored as 'REST', 'rest', 'REST_HTTP', etc. — normalise.
  const key = conn.adapterType.toUpperCase().split('_')[0]; // 'REST_HTTP' → 'REST'
  return ADAPTER_JOB_TYPES[key] ?? FALLBACK_JOB_TYPES;
}

const EMPTY_FORM = {
  connectionId: '',
  jobType: '',
  scheduleCron: '0 * * * *',
  triggerEvent: '',
  mappingConfig: '{}',
};

export function IntegrationJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<Job[]>('/admin/integrations/jobs').then(setJobs).catch(() => setJobs([]));
    api<Connection[]>('/admin/integrations/connections').then(setConnections).catch(() => setConnections([]));
  }

  useEffect(() => { load(); }, []);

  const connName = (id: string) => connections.find((c) => c.id === id)?.name ?? id;

  /** When connection changes, reset jobType to the first valid option for that adapter. */
  function handleConnectionChange(connectionId: string) {
    const types = getJobTypesForConnection(connectionId, connections);
    setForm((prev) => ({ ...prev, connectionId, jobType: types[0]?.value ?? '' }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    try {
      let mapping: Record<string, unknown> = {};
      try { mapping = JSON.parse(form.mappingConfig); } catch { throw new Error('Mapping config must be valid JSON'); }
      const payload = {
        ...form,
        mappingConfig: mapping,
        scheduleCron: form.scheduleCron || null,
        triggerEvent: form.triggerEvent || null,
      };
      if (editId) {
        await api(`/admin/integrations/jobs/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg('Job updated.');
      } else {
        await api('/admin/integrations/jobs', { method: 'POST', body: JSON.stringify(payload) });
        setMsg('Job created.');
      }
      setShowCreate(false);
      setEditId(null);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function runNow(job: Job) {
    setRunning(job.id);
    setMsg('');
    setError('');
    try {
      await api(`/admin/integrations/jobs/${job.id}/run`, { method: 'POST' });
      setMsg(`Job "${job.jobType}" triggered. Check run history for results.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Run failed');
    } finally {
      setRunning(null);
    }
  }

  async function toggleActive(job: Job) {
    await api(`/admin/integrations/jobs/${job.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !job.isActive }) });
    load();
  }

  async function deleteJob(job: Job) {
    if (!window.confirm(`Delete job "${job.jobType}"?`)) return;
    await api(`/admin/integrations/jobs/${job.id}`, { method: 'DELETE' });
    setMsg('Job deleted.');
    load();
  }

  function startEdit(job: Job) {
    setForm({
      connectionId: job.connectionId,
      jobType: job.jobType,
      scheduleCron: job.scheduleCron ?? '',
      triggerEvent: job.triggerEvent ?? '',
      mappingConfig: JSON.stringify(job.mappingConfig, null, 2),
    });
    setEditId(job.id);
    setShowCreate(true);
  }

  // Job type options that match the currently-selected connection
  const jobTypeOptions = getJobTypesForConnection(form.connectionId, connections);

  const { page, setPage, paged, totalPages, totalItems } = usePagination(connections, 10);

  return (
    <IdentityPageLayout
      title="Integration jobs"
      subtitle="Schedule recurring sync jobs or event-triggered jobs between EAM and external systems"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <h2 className="admin-section-title">Scheduled & triggered jobs</h2>

        <div className="flex justify-end">
          <button
            type="button"
            className="btn-primary !w-auto px-4"
            onClick={() => { setShowCreate((v) => !v); setEditId(null); setForm(EMPTY_FORM); }}
          >
            {showCreate && !editId ? 'Cancel' : '+ New job'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={submit} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
            <h3 className="font-semibold text-primary text-sm">{editId ? 'Edit job' : 'New integration job'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

              {/* Connection — drives the job type list */}
              <FormField label="Connection" htmlFor="job-conn">
                <select
                  id="job-conn"
                  className="form-select"
                  required
                  value={form.connectionId}
                  onChange={(e) => handleConnectionChange(e.target.value)}
                >
                  <option value="">Select connection…</option>
                  {paged.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.adapterType})</option>
                  ))}
                </select>
              </FormField>

              {/* Job type — options filtered by selected connection's adapterType */}
              <FormField
                label="Job type"
                htmlFor="job-type"
                hint={form.connectionId ? undefined : 'Select a connection first'}
              >
                <select
                  id="job-type"
                  className="form-select"
                  required
                  disabled={!form.connectionId}
                  value={form.jobType}
                  onChange={(e) => setForm({ ...form, jobType: e.target.value })}
                >
                  {!form.connectionId && <option value="">— select connection first —</option>}
                  {jobTypeOptions.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Cron schedule" htmlFor="job-cron" hint="e.g. 0 * * * * for every hour">
                <input
                  id="job-cron"
                  className="form-input font-mono"
                  placeholder="0 6 * * *"
                  value={form.scheduleCron}
                  onChange={(e) => setForm({ ...form, scheduleCron: e.target.value })}
                />
              </FormField>

              <FormField label="Trigger event" htmlFor="job-event" hint="EAM event that fires this job (optional)">
                <input
                  id="job-event"
                  className="form-input"
                  placeholder="e.g. work_order.closed"
                  value={form.triggerEvent}
                  onChange={(e) => setForm({ ...form, triggerEvent: e.target.value })}
                />
              </FormField>
            </div>

            <FormField label="Mapping configuration (JSON)" htmlFor="job-mapping" hint="Field mapping between EAM and external system">
              <textarea
                id="job-mapping"
                className="form-input font-mono text-xs"
                rows={4}
                value={form.mappingConfig}
                onChange={(e) => setForm({ ...form, mappingConfig: e.target.value })}
              />
            </FormField>

            <div className="flex gap-3">
              <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn-outline text-slate-500" onClick={() => { setShowCreate(false); setEditId(null); }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Job type</th>
                <th>Connection</th>
                <th>Schedule</th>
                <th>Trigger event</th>
                <th>Last run</th>
                <th>Next run</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr><td colSpan={8} className="text-center text-slate-400 py-10">No jobs configured yet.</td></tr>
              )}
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="font-medium text-primary">{j.jobType.replace(/_/g, ' ')}</td>
                  <td className="text-sm text-slate-600">{connName(j.connectionId)}</td>
                  <td><code className="text-xs bg-slate-100 px-1 rounded">{j.scheduleCron ?? '—'}</code></td>
                  <td className="text-xs text-slate-500">{j.triggerEvent ?? '—'}</td>
                  <td className="text-xs text-slate-500">{j.lastRunAt ? new Date(j.lastRunAt).toLocaleString() : '—'}</td>
                  <td className="text-xs text-slate-500">{j.nextRunAt ? new Date(j.nextRunAt).toLocaleString() : '—'}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleActive(j)}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer ${j.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      {j.isActive ? 'Enabled' : 'Disabled'}
                    </button>
                    {j.lastRunStatus && (
                      <span className={`ml-2 text-xs font-semibold px-1.5 py-0.5 rounded-full ${JOB_STATUS_STYLE[j.lastRunStatus]}`}>
                        {j.lastRunStatus}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="flex gap-2 items-center">
                      <button type="button" className="btn-link text-xs" disabled={running === j.id} onClick={() => runNow(j)}>
                        {running === j.id ? 'Running…' : 'Run now'}
                      </button>
                      <button type="button" className="btn-link text-xs" onClick={() => startEdit(j)}>Edit</button>
                      <button type="button" className="btn-danger text-xs" onClick={() => deleteJob(j)}>Delete</button>
                    </div>
                  </td>
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
