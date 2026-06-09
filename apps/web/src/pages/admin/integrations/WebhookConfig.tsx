import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

// ── These match the actual DB columns ──────────────────────────────────────────
interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

interface DeliveryLog {
  id: string;
  subscriptionId: string;
  eventType: string;
  attempt: number;
  status: string;           // DELIVERED | FAILED | RETRYING
  httpStatus: number | null;
  error: string | null;
  deliveredAt: string;
}

// All real EAM event types emitted by the API
const EAM_EVENTS = [
  'WO_CREATED', 'WO_STATUS_CHANGED', 'WO_ASSIGNED',
  'SR_CREATED', 'SR_STATUS_CHANGED',
  'ASSET_CREATED', 'ASSET_STATUS_CHANGED',
  'PM_GENERATED',
  'PERMIT_CREATED', 'PERMIT_APPROVED',
  'WF_TASK_ASSIGNED', 'WF_TASK_APPROVED', 'WF_TASK_ESCALATED',
  'ATTACHMENT_VIRUS_FOUND',
];

const EMPTY_FORM = { url: '', secret: '', events: [] as string[], isActive: true };

export function WebhookConfigPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; status: number | null } | null>(null);
  const [logWebhookId, setLogWebhookId] = useState<string | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([]);
  const [loadingLog, setLoadingLog] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<Webhook[]>('/admin/integrations/webhooks').then(setWebhooks).catch(() => setWebhooks([]));
  }

  useEffect(() => { load(); }, []);

  function toggleEvent(ev: string) {
    setForm((f) =>
      f.events.includes(ev)
        ? { ...f, events: f.events.filter((e) => e !== ev) }
        : { ...f, events: [...f.events, ev] },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.url.trim()) { setError('Target URL is required.'); return; }
    if (form.events.length === 0) { setError('Select at least one event.'); return; }
    setSaving(true); setError(''); setMsg('');
    try {
      const payload = {
        url: form.url.trim(),
        secret: form.secret.trim() || crypto.randomUUID(),
        events: form.events,
        isActive: form.isActive,
      };
      if (editId) {
        await api(`/admin/integrations/webhooks/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg('Webhook updated.');
      } else {
        await api('/admin/integrations/webhooks', { method: 'POST', body: JSON.stringify(payload) });
        setMsg('Webhook created.');
      }
      setShowCreate(false); setEditId(null); setForm(EMPTY_FORM); load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function testDelivery(wh: Webhook) {
    setTesting(wh.id); setTestResult(null); setMsg(''); setError('');
    try {
      const result = await api<{ ok: boolean; status: number }>(`/admin/integrations/webhooks/${wh.id}/test`, { method: 'POST' });
      setTestResult({ id: wh.id, ok: result.ok, status: result.status });
    } catch {
      setTestResult({ id: wh.id, ok: false, status: null });
    } finally {
      setTesting(null);
    }
  }

  async function toggleActive(wh: Webhook) {
    await api(`/admin/integrations/webhooks/${wh.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !wh.isActive }) });
    load();
  }

  async function deleteWh(wh: Webhook) {
    if (!window.confirm(`Delete this webhook subscription?\n${wh.url}`)) return;
    await api(`/admin/integrations/webhooks/${wh.id}`, { method: 'DELETE' });
    setMsg('Webhook deleted.'); load();
    if (logWebhookId === wh.id) setLogWebhookId(null);
  }

  function startEdit(wh: Webhook) {
    setForm({ url: wh.url, secret: wh.secret, events: wh.events, isActive: wh.isActive });
    setEditId(wh.id); setShowCreate(true);
  }

  async function openDeliveryLog(wh: Webhook) {
    if (logWebhookId === wh.id) { setLogWebhookId(null); return; }
    setLogWebhookId(wh.id); setLoadingLog(true);
    try {
      const logs = await api<DeliveryLog[]>(`/admin/integrations/webhooks/${wh.id}/delivery-log`);
      setDeliveryLogs(logs);
    } catch {
      setDeliveryLogs([]);
    } finally {
      setLoadingLog(false);
    }
  }

  async function retryDelivery(logId: string) {
    setRetrying(logId); setError(''); setMsg('');
    try {
      const res = await api<{ ok: boolean; httpStatus?: number }>(`/admin/integrations/webhooks/delivery-log/${logId}/retry`, { method: 'POST' });
      setMsg(`Retry ${res.ok ? 'succeeded' : 'failed'} — HTTP ${res.httpStatus ?? '?'}`);
      // Refresh log
      const whId = logWebhookId!;
      const logs = await api<DeliveryLog[]>(`/admin/integrations/webhooks/${whId}/delivery-log`);
      setDeliveryLogs(logs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetrying(null);
    }
  }

  const STATUS_COLORS: Record<string, string> = {
    DELIVERED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-600',
    RETRYING: 'bg-amber-100 text-amber-700',
  };

  return (
    <IdentityPageLayout
      title="Webhook subscriptions"
      subtitle="Emit HMAC-signed JSON events to external URLs — with exponential-backoff retry and per-delivery log"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="admin-section-title !border-0 !pb-0 !mb-0">Subscriptions ({webhooks.length})</h2>
          <button type="button" className="btn-primary !w-auto px-4"
            onClick={() => { setShowCreate((v) => !v); setEditId(null); setForm(EMPTY_FORM); }}>
            {showCreate && !editId ? 'Cancel' : '+ New webhook'}
          </button>
        </div>

        {/* ── Create / Edit form ── */}
        {showCreate && (
          <form onSubmit={submit} className="border border-slate-200 rounded-xl p-5 bg-slate-50/80 space-y-4 mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">{editId ? 'Edit webhook' : 'New webhook subscription'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Target URL *" htmlFor="wh-url">
                <input id="wh-url" className="form-input" required type="url"
                  value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://receiver.example.com/hook" />
              </FormField>
              <FormField label="HMAC signing secret" htmlFor="wh-secret">
                <input id="wh-secret" className="form-input font-mono text-xs"
                  value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })}
                  placeholder="Leave blank to auto-generate — sent as X-EAM-Signature" />
              </FormField>
            </div>
            <div>
              <p className="form-label mb-2">Events to subscribe *</p>
              <div className="flex flex-wrap gap-2">
                {EAM_EVENTS.map((ev) => (
                  <label key={ev} className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-mono">
                    <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)}
                      className="rounded border-slate-300 text-accent focus:ring-accent" />
                    <span className="text-slate-700">{ev}</span>
                  </label>
                ))}
              </div>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="rounded border-slate-300 text-accent" />
              Active
            </label>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn-outline" onClick={() => { setShowCreate(false); setEditId(null); }}>Cancel</button>
            </div>
          </form>
        )}

        {/* ── Webhook list ── */}
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Target URL</th>
                <th>Events</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-400 py-10">No webhook subscriptions yet.</td></tr>
              )}
              {webhooks.map((wh) => (
                <>
                  <tr key={wh.id}>
                    <td className="font-mono text-xs text-slate-600 max-w-[220px] truncate" title={wh.url}>{wh.url}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {wh.events.length === 0
                          ? <span className="text-xs text-slate-400">All events</span>
                          : wh.events.slice(0, 3).map((ev) => (
                            <span key={ev} className="text-[10px] bg-accent/10 text-accent-dark px-1.5 py-0.5 rounded font-mono">{ev}</span>
                          ))}
                        {wh.events.length > 3 && <span className="text-xs text-slate-400">+{wh.events.length - 3}</span>}
                      </div>
                    </td>
                    <td>
                      <button type="button" onClick={() => toggleActive(wh)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${wh.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        {wh.isActive ? 'Active' : 'Inactive'}
                      </button>
                      {testResult?.id === wh.id && (
                        <span className={`ml-2 text-xs font-medium ${testResult.ok ? 'text-green-600' : 'text-red-500'}`}>
                          Test: {testResult.ok ? '✓' : '✗'} HTTP {testResult.status ?? '?'}
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-slate-500">{new Date(wh.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-2 flex-wrap">
                        <button type="button" className="btn-link text-xs" disabled={testing === wh.id}
                          onClick={() => testDelivery(wh)}>
                          {testing === wh.id ? 'Testing…' : 'Test'}
                        </button>
                        <button type="button" className="btn-link text-xs" onClick={() => openDeliveryLog(wh)}>
                          {logWebhookId === wh.id ? 'Hide log' : 'Delivery log'}
                        </button>
                        <button type="button" className="btn-link text-xs" onClick={() => startEdit(wh)}>Edit</button>
                        <button type="button" className="btn-danger text-xs" onClick={() => deleteWh(wh)}>Delete</button>
                      </div>
                    </td>
                  </tr>

                  {/* ── Delivery log panel ── */}
                  {logWebhookId === wh.id && (
                    <tr key={`${wh.id}-log`}>
                      <td colSpan={5} className="bg-slate-50 p-0">
                        <div className="p-4 space-y-2">
                          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">
                            Delivery log — {wh.url}
                          </p>
                          {loadingLog
                            ? <p className="text-xs text-slate-400">Loading…</p>
                            : deliveryLogs.length === 0
                              ? <p className="text-xs text-slate-400 italic">No deliveries yet. Send a test or trigger an event.</p>
                              : (
                                <table className="admin-table text-xs">
                                  <thead>
                                    <tr>
                                      <th>Event</th>
                                      <th>Attempt</th>
                                      <th>Status</th>
                                      <th>HTTP</th>
                                      <th>Error</th>
                                      <th>Delivered at</th>
                                      <th>Retry</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {deliveryLogs.map((log) => (
                                      <tr key={log.id}>
                                        <td><code className="bg-slate-100 px-1 rounded text-[10px]">{log.eventType}</code></td>
                                        <td className="text-center">{log.attempt}</td>
                                        <td>
                                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[log.status] ?? 'bg-slate-100 text-slate-500'}`}>
                                            {log.status}
                                          </span>
                                        </td>
                                        <td className="text-center">{log.httpStatus ?? '—'}</td>
                                        <td className="max-w-[180px] truncate text-red-500" title={log.error ?? ''}>{log.error ?? '—'}</td>
                                        <td>{new Date(log.deliveredAt).toLocaleString()}</td>
                                        <td>
                                          {log.status === 'FAILED' && (
                                            <button type="button" className="btn-link text-xs text-orange-600"
                                              disabled={retrying === log.id}
                                              onClick={() => retryDelivery(log.id)}>
                                              {retrying === log.id ? '…' : 'Retry'}
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </IdentityPageLayout>
  );
}
