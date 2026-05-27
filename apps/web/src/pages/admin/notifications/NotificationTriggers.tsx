import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface NotificationTemplate { id: string; name: string; }

interface NotificationTrigger {
  id: string;
  eventType: string;
  entityType: string | null;
  conditionExpression: string | null;
  templateId: string | null;
  templateName: string | null;
  distributionConfig: {
    roles?: string[];
    userIds?: string[];
    emails?: string[];
    notifyRequester?: boolean;
    notifyAssignee?: boolean;
  };
  isMandatory: boolean;
  isActive: boolean;
  createdAt: string;
}

const EVENT_TYPES = [
  'work_order.created', 'work_order.approved', 'work_order.status_changed', 'work_order.completed',
  'purchase_requisition.submitted', 'purchase_requisition.approved', 'purchase_requisition.rejected',
  'asset.status_changed', 'service_request.created', 'service_request.converted',
  'attachment.infected', 'workflow.task_assigned', 'workflow.sla_breached',
];

const EMPTY_FORM = {
  eventType: 'work_order.approved',
  entityType: '',
  conditionExpression: '',
  templateId: '',
  roles: '',
  emails: '',
  notifyRequester: false,
  notifyAssignee: true,
  isMandatory: false,
};

export function NotificationTriggersPage() {
  const [triggers, setTriggers] = useState<NotificationTrigger[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<NotificationTrigger[]>('/admin/notifications/triggers').then(setTriggers).catch(() => setTriggers([]));
    api<NotificationTemplate[]>('/admin/notifications/templates').then(setTemplates).catch(() => setTemplates([]));
  }

  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const payload = {
        eventType: form.eventType,
        entityType: form.entityType || null,
        conditionExpression: form.conditionExpression || null,
        templateId: form.templateId || null,
        distributionConfig: {
          roles: form.roles.split(',').map((s) => s.trim()).filter(Boolean),
          emails: form.emails.split(',').map((s) => s.trim()).filter(Boolean),
          notifyRequester: form.notifyRequester,
          notifyAssignee: form.notifyAssignee,
        },
        isMandatory: form.isMandatory,
      };
      if (editId) {
        await api(`/admin/notifications/triggers/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setMsg('Trigger updated.');
      } else {
        await api('/admin/notifications/triggers', { method: 'POST', body: JSON.stringify(payload) });
        setMsg('Trigger created.');
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

  async function toggleActive(t: NotificationTrigger) {
    await api(`/admin/notifications/triggers/${t.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !t.isActive }) });
    load();
  }

  async function deleteTrigger(t: NotificationTrigger) {
    if (t.isMandatory) { setError('Mandatory triggers cannot be deleted.'); return; }
    if (!window.confirm(`Delete trigger for "${t.eventType}"?`)) return;
    try {
      await api(`/admin/notifications/triggers/${t.id}`, { method: 'DELETE' });
      setMsg('Trigger deleted.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function startEdit(t: NotificationTrigger) {
    setForm({
      eventType: t.eventType,
      entityType: t.entityType ?? '',
      conditionExpression: t.conditionExpression ?? '',
      templateId: t.templateId ?? '',
      roles: t.distributionConfig.roles?.join(', ') ?? '',
      emails: t.distributionConfig.emails?.join(', ') ?? '',
      notifyRequester: t.distributionConfig.notifyRequester ?? false,
      notifyAssignee: t.distributionConfig.notifyAssignee ?? false,
      isMandatory: t.isMandatory,
    });
    setEditId(t.id);
    setShowCreate(true);
  }

  return (
    <IdentityPageLayout
      title="Notification triggers"
      subtitle="Define which EAM events send emails, who receives them, and any conditional filters"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <h2 className="admin-section-title">Triggers</h2>

        <div className="flex justify-end">
          <button type="button" className="btn-outline" onClick={() => { setShowCreate((v) => !v); setEditId(null); setForm(EMPTY_FORM); }}>
            {showCreate && !editId ? 'Cancel' : '+ New trigger'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={submit} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
            <h3 className="font-semibold text-primary text-sm">{editId ? 'Edit trigger' : 'New notification trigger'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label="Event type" htmlFor="trig-event">
                <select id="trig-event" className="form-select" required value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })}>
                  {EVENT_TYPES.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                  <option value="__custom__">Custom event…</option>
                </select>
              </FormField>
              <FormField label="Email template" htmlFor="trig-tpl">
                <select id="trig-tpl" className="form-select" value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
                  <option value="">No email (in-app only)</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </FormField>
              <FormField label="Entity type filter" htmlFor="trig-entity" hint="Optional — limit to specific entity type">
                <input id="trig-entity" className="form-input" value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })} placeholder="e.g. work_order (leave blank for all)" />
              </FormField>
              <FormField label="Condition expression" htmlFor="trig-cond" hint="Optional — SQL-like condition to filter events">
                <input id="trig-cond" className="form-input font-mono" value={form.conditionExpression} onChange={(e) => setForm({ ...form, conditionExpression: e.target.value })} placeholder=":priority = 'CRITICAL'" />
              </FormField>
              <FormField label="Notify roles" htmlFor="trig-roles" hint="Comma-separated role names">
                <input id="trig-roles" className="form-input" value={form.roles} onChange={(e) => setForm({ ...form, roles: e.target.value })} placeholder="maintenance_supervisor, planner" />
              </FormField>
              <FormField label="Additional email addresses" htmlFor="trig-emails" hint="Comma-separated, for external recipients">
                <input id="trig-emails" className="form-input" value={form.emails} onChange={(e) => setForm({ ...form, emails: e.target.value })} placeholder="ops@company.com, alerts@company.com" />
              </FormField>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                <input type="checkbox" checked={form.notifyAssignee} onChange={(e) => setForm({ ...form, notifyAssignee: e.target.checked })} className="rounded border-slate-300 text-accent" />
                Notify assignee
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                <input type="checkbox" checked={form.notifyRequester} onChange={(e) => setForm({ ...form, notifyRequester: e.target.checked })} className="rounded border-slate-300 text-accent" />
                Notify requester
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                <input type="checkbox" checked={form.isMandatory} onChange={(e) => setForm({ ...form, isMandatory: e.target.checked })} className="rounded border-slate-300 text-accent" />
                Mandatory (cannot be disabled by users)
              </label>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-outline" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
              <button type="button" className="btn-outline text-slate-500" onClick={() => { setShowCreate(false); setEditId(null); }}>Cancel</button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Event type</th>
                <th>Entity filter</th>
                <th>Template</th>
                <th>Recipients</th>
                <th>Condition</th>
                <th>Mandatory</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {triggers.length === 0 && (
                <tr><td colSpan={8} className="text-center text-slate-400 py-10">No triggers configured. Create one above.</td></tr>
              )}
              {triggers.map((t) => {
                const recipientParts: string[] = [];
                if (t.distributionConfig.notifyAssignee) recipientParts.push('assignee');
                if (t.distributionConfig.notifyRequester) recipientParts.push('requester');
                if (t.distributionConfig.roles?.length) recipientParts.push(...t.distributionConfig.roles);
                if (t.distributionConfig.emails?.length) recipientParts.push(...t.distributionConfig.emails);
                return (
                  <tr key={t.id}>
                    <td>
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{t.eventType}</code>
                    </td>
                    <td className="text-xs text-slate-500">{t.entityType ?? '—'}</td>
                    <td className="text-sm">{t.templateName ?? <span className="text-slate-400">In-app only</span>}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {recipientParts.slice(0, 3).map((r) => <span key={r} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{r}</span>)}
                        {recipientParts.length > 3 && <span className="text-xs text-slate-400">+{recipientParts.length - 3}</span>}
                      </div>
                    </td>
                    <td className="text-xs font-mono text-slate-500 max-w-[120px] truncate">{t.conditionExpression ?? '—'}</td>
                    <td>
                      {t.isMandatory && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">Mandatory</span>}
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={t.isMandatory}
                        onClick={() => toggleActive(t)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer disabled:cursor-not-allowed ${t.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                      >
                        {t.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <button type="button" className="btn-link text-xs" onClick={() => startEdit(t)}>Edit</button>
                        <button type="button" className="btn-danger text-xs" disabled={t.isMandatory} onClick={() => deleteTrigger(t)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </IdentityPageLayout>
  );
}
