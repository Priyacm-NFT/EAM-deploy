import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

// FIX (P1-6 gap — UI for AC-P1-6.6): "Admin can configure a new permit
// type with custom checklist and approver roles." The API
// (/admin/permit-types) existed with no screen to actually do this from.

interface ChecklistItem { category: string; description: string; isRequired: boolean }

interface PermitType {
  id: string;
  type: string;
  label: string;
  checklistTemplate: ChecklistItem[];
  requiredApproverRoles: string[];
  maxValidityHours: number | null;
  isActive: boolean;
}

const CHECKLIST_CATEGORIES = ['PPE', 'GENERAL', 'GAS_TEST', 'ISOLATION', 'LOTO', 'JSA'];
const EMPTY_ITEM: ChecklistItem = { category: 'GENERAL', description: '', isRequired: true };

export function PermitTypesPage() {
  const [types, setTypes] = useState<PermitType[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: '', label: '', maxValidityHours: '', requiredApproverRoles: 'supervisor' });
  const [saving, setSaving] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState<Record<string, ChecklistItem[]>>({});
  const [rolesDraft, setRolesDraft] = useState<Record<string, string>>({});
  const [savingChecklist, setSavingChecklist] = useState<string | null>(null);

  function load() {
    api<PermitType[]>('/admin/permit-types').then(setTypes).catch((e) => setError(String(e)));
  }
  useEffect(() => { load(); }, []);

  async function createType() {
    setSaving(true); setError(''); setSuccess('');
    try {
      await api('/admin/permit-types', {
        method: 'POST',
        body: JSON.stringify({
          type: form.type.trim(),
          label: form.label.trim() || form.type.trim(),
          maxValidityHours: form.maxValidityHours ? Number(form.maxValidityHours) : undefined,
          requiredApproverRoles: form.requiredApproverRoles.split(',').map((r) => r.trim()).filter(Boolean),
        }),
      });
      setSuccess(`Permit type created — it'll show up in the permit type dropdown immediately.`);
      setShowForm(false);
      setForm({ type: '', label: '', maxValidityHours: '', requiredApproverRoles: 'supervisor' });
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function expand(t: PermitType) {
    if (expandedId === t.id) { setExpandedId(null); return; }
    setExpandedId(t.id);
    setChecklistDraft((d) => ({ ...d, [t.id]: d[t.id] ?? [...t.checklistTemplate] }));
    setRolesDraft((d) => ({ ...d, [t.id]: d[t.id] ?? t.requiredApproverRoles.join(', ') }));
  }

  async function saveChecklist(t: PermitType) {
    setSavingChecklist(t.id); setError(''); setSuccess('');
    try {
      await api(`/admin/permit-types/${t.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          checklistTemplate: checklistDraft[t.id] ?? t.checklistTemplate,
          requiredApproverRoles: (rolesDraft[t.id] ?? '').split(',').map((r) => r.trim()).filter(Boolean),
        }),
      });
      setSuccess(`"${t.label}" updated. New permits of this type will use the updated checklist and approvers.`);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingChecklist(null);
    }
  }

  async function deactivate(t: PermitType) {
    if (!window.confirm(`Deactivate "${t.label}"? Existing permits keep it, but it won't be offered for new ones.`)) return;
    try {
      await api(`/admin/permit-types/${t.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(String(e));
    }
  }

  function updateItem(typeId: string, idx: number, patch: Partial<ChecklistItem>) {
    setChecklistDraft((d) => ({
      ...d,
      [typeId]: (d[typeId] ?? []).map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  }
  function addItem(typeId: string) {
    setChecklistDraft((d) => ({ ...d, [typeId]: [...(d[typeId] ?? []), { ...EMPTY_ITEM }] }));
  }
  function removeItem(typeId: string, idx: number) {
    setChecklistDraft((d) => ({ ...d, [typeId]: (d[typeId] ?? []).filter((_, i) => i !== idx) }));
  }

  return (
    <IdentityPageLayout
      title="Permit Types"
      subtitle="Each type's checklist and required approver roles are configurable here — no code change or deploy needed to add a new one"
      backTo="/permits"
      backLabel="Back to permits"
    >
      {error && <MessageBanner type="error" text={error} />}
      {success && <MessageBanner type="success" text={success} />}

      <div className="admin-section">
        <div className="flex justify-between items-center mb-3">
          <h2 className="admin-section-title">Types</h2>
          <button type="button" className="btn-primary !w-auto px-4" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ New permit type'}
          </button>
        </div>

        {showForm && (
          <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="form-label">Type key</span>
              <input className="form-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="RADIATION" />
              <p className="text-xs text-slate-400 mt-1">Normalized to UPPER_SNAKE automatically.</p>
            </label>
            <label className="block">
              <span className="form-label">Display label</span>
              <input className="form-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Radiation Work" />
            </label>
            <label className="block">
              <span className="form-label">Max validity (hours, optional)</span>
              <input type="number" min="1" className="form-input" value={form.maxValidityHours} onChange={(e) => setForm({ ...form, maxValidityHours: e.target.value })} />
            </label>
            <label className="block">
              <span className="form-label">Required approver roles (comma-separated)</span>
              <input className="form-input" value={form.requiredApproverRoles} onChange={(e) => setForm({ ...form, requiredApproverRoles: e.target.value })} placeholder="supervisor, safety_officer" />
            </label>
            <div className="col-span-2 flex gap-2">
              <button type="button" className="btn-primary !w-auto px-4" disabled={saving || !form.type.trim()} onClick={createType}>
                {saving ? 'Creating…' : 'Create'}
              </button>
              <button type="button" className="btn-link" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {types.length === 0 ? (
          <p className="text-slate-400 text-sm">No permit types loaded — run the seed migration or create one above.</p>
        ) : (
          <div className="space-y-2">
            {types.map((t) => (
              <div key={t.id} className="border border-slate-200 rounded">
                <div className="flex justify-between items-center p-3">
                  <div>
                    <span className="font-medium">{t.label}</span>{' '}
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded ml-1">{t.type}</code>
                    {!t.isActive && <span className="text-xs text-slate-400 ml-2">(inactive)</span>}
                    <p className="text-xs text-slate-500 mt-0.5">
                      {t.checklistTemplate.length} checklist item{t.checklistTemplate.length === 1 ? '' : 's'} · approvers: {t.requiredApproverRoles.join(', ') || '—'}
                      {t.maxValidityHours ? ` · max ${t.maxValidityHours}h` : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className="btn-link text-xs" onClick={() => expand(t)}>
                      {expandedId === t.id ? 'Collapse' : 'Edit checklist & approvers'}
                    </button>
                    {t.isActive && <button type="button" className="btn-link text-xs text-red-600" onClick={() => deactivate(t)}>Deactivate</button>}
                  </div>
                </div>

                {expandedId === t.id && (
                  <div className="border-t border-slate-200 p-3 bg-slate-50">
                    <label className="block mb-3">
                      <span className="form-label">Required approver roles (comma-separated, in order)</span>
                      <input
                        className="form-input"
                        value={rolesDraft[t.id] ?? ''}
                        onChange={(e) => setRolesDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                      />
                    </label>

                    <span className="form-label">Checklist items</span>
                    <div className="space-y-2 mt-1">
                      {(checklistDraft[t.id] ?? []).map((item, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <select
                            className="form-input w-32 text-sm"
                            value={item.category}
                            onChange={(e) => updateItem(t.id, idx, { category: e.target.value })}
                          >
                            {CHECKLIST_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <input
                            className="form-input flex-1 text-sm"
                            value={item.description}
                            onChange={(e) => updateItem(t.id, idx, { description: e.target.value })}
                          />
                          <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                            <input type="checkbox" checked={item.isRequired} onChange={(e) => updateItem(t.id, idx, { isRequired: e.target.checked })} />
                            Required
                          </label>
                          <button type="button" className="btn-link text-xs text-red-600" onClick={() => removeItem(t.id, idx)}>Remove</button>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="btn-link text-xs mt-2" onClick={() => addItem(t.id)}>+ Add checklist item</button>

                    <div className="mt-3">
                      <button
                        type="button" className="btn-primary !w-auto px-4 text-sm"
                        disabled={savingChecklist === t.id}
                        onClick={() => saveChecklist(t)}
                      >
                        {savingChecklist === t.id ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </IdentityPageLayout>
  );
}
