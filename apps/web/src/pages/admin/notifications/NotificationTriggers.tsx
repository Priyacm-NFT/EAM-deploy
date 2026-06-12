import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';
import { usePagination } from '../../../hooks/usePagination.js';
import { Pagination } from '../../../components/Pagination.js';

interface NotificationTemplate { id: string; name: string; }

interface DistributionRule { type: string; value: string; }

interface NotificationTrigger {
  id: string;
  eventType: string;
  entityType: string | null;
  conditionExpression: string | null;
  templateId: string | null;
  templateName: string | null;
  distributionConfig: Record<string, unknown>;
  isMandatory: boolean;
  isActive: boolean;
  createdAt: string;
}

const EVENT_TYPES = [
  'WO_CREATED', 'WO_ASSIGNED', 'WO_STATUS_CHANGED',
  'SR_CREATED', 'SR_STATUS_CHANGED',
  'WF_TASK_ASSIGNED', 'WF_TASK_APPROVED', 'WF_TASK_ESCALATED', 'WF_NOTIFICATION',
  'ATTACHMENT_VIRUS_FOUND', 'REPORT_READY', 'PERMIT_EXPIRING',
];

const RULE_TYPES = [
  { value: 'ROLE',         label: 'EAM Role',          placeholder: 'e.g. maintenance_supervisor' },
  { value: 'GROUP',        label: 'EAM Group',          placeholder: 'e.g. Maintenance Team' },
  { value: 'AD_GROUP',     label: 'AD / LDAP Group',    placeholder: 'e.g. AD:Maintenance-Supervisors' },
  { value: 'STATIC_EMAIL', label: 'Static email (To)',  placeholder: 'e.g. manager@company.com' },
  { value: 'CC',           label: 'CC email',           placeholder: 'e.g. supervisor@company.com' },
  { value: 'BCC',          label: 'BCC email',          placeholder: 'e.g. audit@company.com' },
  { value: 'FIELD',        label: 'Event field (user)', placeholder: 'e.g. assignedToUserId' },
];

const EMPTY_FORM = {
  eventType: 'WO_CREATED',
  entityType: '',
  conditionExpression: '',
  templateId: '',
  notifyRequester: false,
  notifyAssignee: true,
  isMandatory: false,
};

const EMPTY_RULE: DistributionRule = { type: 'STATIC_EMAIL', value: '' };

function rulesFromConfig(cfg: Record<string, unknown>): DistributionRule[] {
  // If already in rules format
  if (Array.isArray(cfg.rules) && cfg.rules.length > 0) {
    return cfg.rules as DistributionRule[];
  }
  // Convert legacy format
  const rules: DistributionRule[] = [];
  if (cfg.notifyAssignee) rules.push({ type: 'FIELD', value: 'assignedToUserId' });
  if (cfg.notifyRequester) rules.push({ type: 'FIELD', value: 'requestedByUserId' });
  if (Array.isArray(cfg.roles)) (cfg.roles as string[]).forEach((r) => rules.push({ type: 'ROLE', value: r }));
  if (Array.isArray(cfg.emails)) (cfg.emails as string[]).forEach((e) => rules.push({ type: 'STATIC_EMAIL', value: e }));
  return rules.length > 0 ? rules : [{ ...EMPTY_RULE }];
}

export function NotificationTriggersPage() {
  const [triggers, setTriggers] = useState<NotificationTrigger[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [rules, setRules] = useState<DistributionRule[]>([{ ...EMPTY_RULE }]);
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

  function addRule() {
    setRules((prev) => [...prev, { ...EMPTY_RULE }]);
  }

  function removeRule(i: number) {
    setRules((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateRule(i: number, field: keyof DistributionRule, value: string) {
    setRules((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMsg('');
    try {
      const validRules = rules.filter((r) => r.value.trim());
      if (validRules.length === 0 && !form.notifyAssignee && !form.notifyRequester) {
        setError('Add at least one distribution rule or enable Notify assignee/requester.');
        setSaving(false);
        return;
      }

      // Merge notifyAssignee/Requester into rules
      const allRules = [...validRules];
      if (form.notifyAssignee && !allRules.find((r) => r.type === 'FIELD' && r.value === 'assignedToUserId')) {
        allRules.push({ type: 'FIELD', value: 'assignedToUserId' });
      }
      if (form.notifyRequester && !allRules.find((r) => r.type === 'FIELD' && r.value === 'requestedByUserId')) {
        allRules.push({ type: 'FIELD', value: 'requestedByUserId' });
      }

      const payload = {
        eventType: form.eventType,
        entityType: form.entityType || null,
        conditionExpression: form.conditionExpression || null,
        templateId: form.templateId || null,
        distributionConfig: { rules: allRules },
        isMandatory: form.isMandatory,
      };

      if (editId) {
        await api(`/admin/notifications/triggers/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) });
        setMsg('Trigger updated.');
      } else {
        await api('/admin/notifications/triggers', { method: 'POST', body: JSON.stringify(payload) });
        setMsg('Trigger created.');
      }
      setShowCreate(false); setEditId(null); setForm(EMPTY_FORM); setRules([{ ...EMPTY_RULE }]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
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
      setMsg('Trigger deleted.'); load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Delete failed'); }
  }

  function startEdit(t: NotificationTrigger) {
    const cfg = t.distributionConfig as Record<string, unknown>;
    const parsedRules = rulesFromConfig(cfg);
    setForm({
      eventType: t.eventType,
      entityType: t.entityType ?? '',
      conditionExpression: t.conditionExpression ?? '',
      templateId: t.templateId ?? '',
      notifyRequester: Boolean(cfg.notifyRequester) || parsedRules.some((r) => r.type === 'FIELD' && r.value === 'requestedByUserId'),
      notifyAssignee: Boolean(cfg.notifyAssignee) || parsedRules.some((r) => r.type === 'FIELD' && r.value === 'assignedToUserId'),
      isMandatory: t.isMandatory,
    });
    setRules(parsedRules.filter((r) => !(r.type === 'FIELD')));
    setEditId(t.id);
    setShowCreate(true);
  }

  function cancelForm() { setShowCreate(false); setEditId(null); setForm(EMPTY_FORM); setRules([{ ...EMPTY_RULE }]); }

  const ruleTypeInfo = (type: string) => RULE_TYPES.find((r) => r.value === type);

  const { page, setPage, paged, totalPages, totalItems } = usePagination(templates, 10);

  return (
    <IdentityPageLayout
      title="Notification triggers"
      subtitle="Define which EAM events send notifications, who receives them, and via which channel"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="admin-section-title !border-0 !pb-0 !mb-0">Triggers</h2>
          <button type="button" className="btn-primary !w-auto px-4"
            onClick={() => { setShowCreate((v) => !v); setEditId(null); setForm(EMPTY_FORM); setRules([{ ...EMPTY_RULE }]); }}>
            {showCreate && !editId ? 'Cancel' : '+ New trigger'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={submit} className="border border-slate-200 rounded-lg p-5 space-y-4 bg-slate-50 mb-6">
            <h3 className="font-semibold text-sm text-slate-800">{editId ? 'Edit trigger' : 'New notification trigger'}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Event type" htmlFor="trig-event">
                <select id="trig-event" className="form-select" required value={form.eventType}
                  onChange={(e) => setForm({ ...form, eventType: e.target.value })}>
                  {EVENT_TYPES.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
                </select>
              </FormField>

              <FormField label="Email template" htmlFor="trig-tpl">
                <select id="trig-tpl" className="form-select" value={form.templateId}
                  onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
                  <option value="">No email (in-app only)</option>
                  {paged.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </FormField>

              <FormField label="Entity type filter" htmlFor="trig-entity" hint="Optional — leave blank for all">
                <input id="trig-entity" className="form-input" value={form.entityType}
                  onChange={(e) => setForm({ ...form, entityType: e.target.value })}
                  placeholder="e.g. WorkOrder" />
              </FormField>

              <FormField label="Condition expression" htmlFor="trig-cond" hint="Optional SQL-like filter">
                <input id="trig-cond" className="form-input font-mono text-sm" value={form.conditionExpression}
                  onChange={(e) => setForm({ ...form, conditionExpression: e.target.value })}
                  placeholder=":priority = 'CRITICAL'" />
              </FormField>
            </div>

            {/* Distribution rules builder */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="form-label !mb-0">Distribution rules</span>
                <button type="button" onClick={addRule}
                  className="text-xs text-accent hover:underline font-medium">
                  + Add another rule
                </button>
              </div>
              <p className="text-xs text-slate-500 mb-3">
                Define who receives this notification. Use CC/BCC for copy recipients, AD_GROUP for Active Directory groups.
              </p>

              <div className="space-y-2">
                {rules.map((rule, i) => (
                  <div key={i} className="flex gap-2 items-center bg-white border border-slate-200 rounded-lg px-3 py-2">
                    <select
                      className="form-select text-sm w-48 shrink-0"
                      value={rule.type}
                      onChange={(e) => updateRule(i, 'type', e.target.value)}
                    >
                      {RULE_TYPES.map((rt) => (
                        <option key={rt.value} value={rt.value}>{rt.label}</option>
                      ))}
                    </select>
                    <input
                      className="form-input text-sm flex-1"
                      value={rule.value}
                      onChange={(e) => updateRule(i, 'value', e.target.value)}
                      placeholder={ruleTypeInfo(rule.type)?.placeholder ?? ''}
                    />
                    <button type="button" onClick={() => removeRule(i)}
                      className="text-slate-400 hover:text-red-500 text-lg font-bold px-1 shrink-0"
                      title="Remove rule">
                      ✕
                    </button>
                  </div>
                ))}

                {rules.length === 0 && (
                  <p className="text-xs text-slate-400 italic">
                    No rules yet. Click "+ Add another rule" or enable assignee/requester below.
                  </p>
                )}
              </div>

              {/* Quick toggles */}
              <div className="flex flex-wrap gap-4 mt-3">
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                  <input type="checkbox" checked={form.notifyAssignee}
                    onChange={(e) => setForm({ ...form, notifyAssignee: e.target.checked })}
                    className="rounded border-slate-300 text-accent" />
                  Notify assignee
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                  <input type="checkbox" checked={form.notifyRequester}
                    onChange={(e) => setForm({ ...form, notifyRequester: e.target.checked })}
                    className="rounded border-slate-300 text-accent" />
                  Notify requester
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                  <input type="checkbox" checked={form.isMandatory}
                    onChange={(e) => setForm({ ...form, isMandatory: e.target.checked })}
                    className="rounded border-slate-300 text-accent" />
                  Mandatory (cannot be disabled by users)
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
                {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn-outline text-slate-500" onClick={cancelForm}>Cancel</button>
            </div>
          </form>
        )}

        {/* Triggers table */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Event type</th>
                <th>Entity</th>
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
                <tr><td colSpan={8} className="text-center text-slate-400 py-10">No triggers yet. Create one above.</td></tr>
              )}
              {triggers.map((t) => {
                const cfg = t.distributionConfig as Record<string, unknown>;
                const ruleList = rulesFromConfig(cfg);
                const recipientLabels = ruleList.map((r) => {
                  if (r.type === 'CC') return `CC: ${r.value}`;
                  if (r.type === 'BCC') return `BCC: ${r.value}`;
                  if (r.type === 'FIELD') return r.value === 'assignedToUserId' ? 'assignee' : 'requester';
                  return r.value;
                });
                return (
                  <tr key={t.id}>
                    <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{t.eventType}</code></td>
                    <td className="text-xs text-slate-500">{t.entityType ?? '—'}</td>
                    <td className="text-sm">{t.templateName ?? <span className="text-slate-400 italic">In-app only</span>}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {recipientLabels.slice(0, 3).map((r, i) => (
                          <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${r.startsWith('CC:') ? 'bg-blue-100 text-blue-700' : r.startsWith('BCC:') ? 'bg-purple-100 text-purple-700' : 'bg-accent/10 text-accent-dark'}`}>
                            {r}
                          </span>
                        ))}
                        {recipientLabels.length > 3 && <span className="text-xs text-slate-400">+{recipientLabels.length - 3}</span>}
                      </div>
                    </td>
                    <td className="text-xs font-mono text-slate-500 max-w-[120px] truncate">{t.conditionExpression ?? '—'}</td>
                    <td>{t.isMandatory && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">Mandatory</span>}</td>
                    <td>
                      <button type="button" disabled={t.isMandatory} onClick={() => toggleActive(t)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${t.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
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
    
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={10} onChange={setPage} />
    </IdentityPageLayout>
  );
}
