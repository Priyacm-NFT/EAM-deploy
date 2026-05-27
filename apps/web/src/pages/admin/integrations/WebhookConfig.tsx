import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface Webhook {
  id: string;
  name: string;
  targetUrl: string;
  entityType: string;
  events: string[];
  isActive: boolean;
  signingSecret: string;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: 'success' | 'failed' | null;
  deliveryCount: number;
  createdAt: string;
}

const ENTITY_TYPES = ['work_order', 'asset', 'purchase_requisition', 'service_request', 'purchase_order', 'attachment'];
const EVENT_TYPES = ['created', 'updated', 'status_changed', 'deleted', 'approved', 'rejected'];

const EMPTY_FORM = { name: '', targetUrl: '', entityType: 'work_order', events: [] as string[], signingSecret: '' };

export function WebhookConfigPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; status: string } | null>(null);
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
    if (form.events.length === 0) { setError('Select at least one event.'); return; }
    setSaving(true);
    setError('');
    setMsg('');
    try {
      if (editId) {
        await api(`/admin/integrations/webhooks/${editId}`, { method: 'PUT', body: JSON.stringify(form) });
        setMsg('Webhook updated.');
      } else {
        await api('/admin/integrations/webhooks', { method: 'POST', body: JSON.stringify(form) });
        setMsg('Webhook created.');
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

  async function testDelivery(wh: Webhook) {
    setTesting(wh.id);
    setTestResult(null);
    setMsg('');
    setError('');
    try {
      const result = await api<{ deliveryId: string; httpStatus: number }>(`/admin/integrations/webhooks/${wh.id}/test`, { method: 'POST' });
      setTestResult({ id: wh.id, status: `HTTP ${result.httpStatus}` });
    } catch (e) {
      setTestResult({ id: wh.id, status: 'Failed — check target URL' });
    } finally {
      setTesting(null);
    }
  }

  async function toggleActive(wh: Webhook) {
    await api(`/admin/integrations/webhooks/${wh.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !wh.isActive }) });
    load();
  }

  async function deleteWh(wh: Webhook) {
    if (!window.confirm(`Delete webhook "${wh.name}"?`)) return;
    await api(`/admin/integrations/webhooks/${wh.id}`, { method: 'DELETE' });
    setMsg('Webhook deleted.');
    load();
  }

  function startEdit(wh: Webhook) {
    setForm({ name: wh.name, targetUrl: wh.targetUrl, entityType: wh.entityType, events: wh.events, signingSecret: wh.signingSecret });
    setEditId(wh.id);
    setShowCreate(true);
  }

  return (
    <IdentityPageLayout
      title="Webhook subscriptions"
      subtitle="Emit signed JSON events to external URLs when EAM records change — with retry and delivery logging"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <h2 className="admin-section-title">Webhooks</h2>

        <div className="flex justify-end">
          <button type="button" className="btn-primary !w-auto px-4" onClick={() => { setShowCreate((v) => !v); setEditId(null); setForm(EMPTY_FORM); }}>
            {showCreate && !editId ? 'Cancel' : '+ New webhook'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={submit} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
            <h3 className="font-semibold text-primary text-sm">{editId ? 'Edit webhook' : 'New webhook subscription'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label="Name" htmlFor="wh-name">
                <input id="wh-name" className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. SAP Work Order Sync" />
              </FormField>
              <FormField label="Target URL" htmlFor="wh-url">
                <input id="wh-url" className="form-input" required type="url" value={form.targetUrl} onChange={(e) => setForm({ ...form, targetUrl: e.target.value })} placeholder="https://receiver.example.com/hook" />
              </FormField>
              <FormField label="Entity type" htmlFor="wh-entity">
                <select id="wh-entity" className="form-select" value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })}>
                  {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </FormField>
              <FormField label="HMAC signing secret" htmlFor="wh-secret" hint="Sent as X-EAM-Signature header for receiver verification">
                <input id="wh-secret" className="form-input font-mono" value={form.signingSecret} onChange={(e) => setForm({ ...form, signingSecret: e.target.value })} placeholder="Leave blank to auto-generate" />
              </FormField>
            </div>
            <div>
              <p className="form-label">Events to subscribe</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {EVENT_TYPES.map((ev) => (
                  <label key={ev} className="inline-flex items-center gap-1.5 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={form.events.includes(ev)}
                      onChange={() => toggleEvent(ev)}
                      className="rounded border-slate-300 text-accent focus:ring-accent"
                    />
                    <span className="text-slate-700">{ev}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
              <button type="button" className="btn-outline text-slate-500" onClick={() => { setShowCreate(false); setEditId(null); }}>Cancel</button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Entity</th>
                <th>Events</th>
                <th>Target URL</th>
                <th>Deliveries</th>
                <th>Last delivery</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {webhooks.length === 0 && (
                <tr><td colSpan={8} className="text-center text-slate-400 py-10">No webhooks configured yet.</td></tr>
              )}
              {webhooks.map((wh) => (
                <tr key={wh.id}>
                  <td className="font-medium text-primary">{wh.name}</td>
                  <td><code className="text-xs bg-slate-100 px-1 rounded">{wh.entityType}</code></td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {wh.events.map((ev) => (
                        <span key={ev} className="text-xs bg-accent/10 text-accent-dark px-1.5 py-0.5 rounded">{ev}</span>
                      ))}
                    </div>
                  </td>
                  <td className="max-w-[160px] truncate text-xs text-slate-600" title={wh.targetUrl}>{wh.targetUrl}</td>
                  <td className="text-sm">{wh.deliveryCount}</td>
                  <td className="text-xs text-slate-500">
                    {wh.lastDeliveryAt ? new Date(wh.lastDeliveryAt).toLocaleString() : '—'}
                    {wh.lastDeliveryStatus && (
                      <span className={`ml-1 text-xs font-semibold px-1.5 py-0.5 rounded-full ${wh.lastDeliveryStatus === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {wh.lastDeliveryStatus}
                      </span>
                    )}
                    {testResult?.id === wh.id && (
                      <span className="ml-1 text-xs font-semibold text-purple-700">Test: {testResult.status}</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleActive(wh)}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer ${wh.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      {wh.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <div className="flex gap-2 items-center">
                      <button type="button" className="btn-link text-xs" disabled={testing === wh.id} onClick={() => testDelivery(wh)}>
                        {testing === wh.id ? 'Sending…' : 'Test'}
                      </button>
                      <button type="button" className="btn-link text-xs" onClick={() => startEdit(wh)}>Edit</button>
                      <button type="button" className="btn-danger text-xs" onClick={() => deleteWh(wh)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </IdentityPageLayout>
  );
}
