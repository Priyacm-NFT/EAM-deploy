import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface StatusSet {
  id: string;
  name: string;
  label: string;
  entityType: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  transitionCount: number;
}

interface Transition {
  id: string;
  statusSetId: string;
  fromStatus: string;
  toStatus: string;
  label: string | null;
  requiresComment: boolean;
  requiredRole: string | null;
  notifyRoles: string[];
  conditionExpression: string | null;
}

const EMPTY_SET = { name: '', label: '', entityType: '', description: '' };
const EMPTY_TRANS = { fromStatus: '', toStatus: '', label: '', requiresComment: false, requiredRole: '', notifyRoles: '', conditionExpression: '' };

const ENTITY_TYPES = ['work_order', 'purchase_requisition', 'asset', 'service_request', 'inventory', 'contract'];

export function StatusModelPage() {
  const [sets, setSets] = useState<StatusSet[]>([]);
  const [selected, setSelected] = useState<StatusSet | null>(null);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [showSetForm, setShowSetForm] = useState(false);
  const [showTransForm, setShowTransForm] = useState(false);
  const [setForm, setSetForm] = useState(EMPTY_SET);
  const [transForm, setTransForm] = useState(EMPTY_TRANS);
  const [editTransId, setEditTransId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function loadSets() {
    api<StatusSet[]>('/admin/org/status-sets').then(setSets).catch(() => setSets([]));
  }

  function loadTransitions(setId: string) {
    api<Transition[]>(`/admin/org/status-sets/${setId}/transitions`)
      .then(setTransitions)
      .catch(() => setTransitions([]));
  }

  useEffect(() => { loadSets(); }, []);
  useEffect(() => {
    if (selected) loadTransitions(selected.id);
    else setTransitions([]);
  }, [selected]);

  async function createSet(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await api<StatusSet>('/admin/org/status-sets', { method: 'POST', body: JSON.stringify(setForm) });
      setMsg(`Status set "${result.name}" created.`);
      setShowSetForm(false);
      setSetForm(EMPTY_SET);
      loadSets();
      setSelected({ ...result, transitionCount: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSet(ss: StatusSet) {
    if (ss.isSystem) { setError('System status sets cannot be deleted.'); return; }
    if (!window.confirm(`Delete status set "${ss.name}"?`)) return;
    try {
      await api(`/admin/org/status-sets/${ss.id}`, { method: 'DELETE' });
      setMsg('Status set deleted.');
      if (selected?.id === ss.id) setSelected(null);
      loadSets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function saveTrans(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        fromStatus: transForm.fromStatus,
        toStatus: transForm.toStatus,
        label: transForm.label || undefined,
        requiresComment: transForm.requiresComment,
        requiredRole: transForm.requiredRole || undefined,
        notifyRoles: transForm.notifyRoles.split(',').map((r) => r.trim()).filter(Boolean),
        conditionExpression: transForm.conditionExpression || undefined,
      };

      if (editTransId) {
        await api(`/admin/org/status-sets/${selected.id}/transitions/${editTransId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMsg('Transition updated.');
      } else {
        await api(`/admin/org/status-sets/${selected.id}/transitions`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMsg('Transition added.');
      }
      setShowTransForm(false);
      setEditTransId(null);
      setTransForm(EMPTY_TRANS);
      loadTransitions(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTrans(t: Transition) {
    if (!selected) return;
    try {
      await api(`/admin/org/status-sets/${selected.id}/transitions/${t.id}`, { method: 'DELETE' });
      setMsg('Transition deleted.');
      loadTransitions(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function startEditTrans(t: Transition) {
    setTransForm({
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      label: t.label ?? '',
      requiresComment: t.requiresComment,
      requiredRole: t.requiredRole ?? '',
      notifyRoles: t.notifyRoles.join(', '),
      conditionExpression: t.conditionExpression ?? '',
    });
    setEditTransId(t.id);
    setShowTransForm(true);
  }

  return (
    <IdentityPageLayout
      title="Status model"
      subtitle="Define status sets and valid transitions for each entity type — transitions control what status changes are permitted"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — status set list */}
        <div className="admin-section">
          <div className="flex justify-between items-center">
            <h2 className="admin-section-title">Status sets</h2>
            <button type="button" className="btn-primary !w-auto px-3 text-xs" onClick={() => setShowSetForm((v) => !v)}>
              {showSetForm ? 'Cancel' : '+ New'}
            </button>
          </div>

          {showSetForm && (
            <form onSubmit={createSet} className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
              <FormField label="Name" htmlFor="ss-name">
                <input id="ss-name" className="form-input text-sm" required value={setForm.name} onChange={(e) => setSetForm({ ...setForm, name: e.target.value })} placeholder="e.g. work_order_statuses" />
              </FormField>
              <FormField label="Label" htmlFor="ss-label">
                <input id="ss-label" className="form-input text-sm" required value={setForm.label} onChange={(e) => setSetForm({ ...setForm, label: e.target.value })} placeholder="e.g. Work Order Statuses" />
              </FormField>
              <FormField label="Entity type" htmlFor="ss-entity">
                <select id="ss-entity" className="form-select text-sm" required value={setForm.entityType} onChange={(e) => setSetForm({ ...setForm, entityType: e.target.value })}>
                  <option value="">Select entity…</option>
                  {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Description" htmlFor="ss-desc">
                <input id="ss-desc" className="form-input text-sm" value={setForm.description} onChange={(e) => setSetForm({ ...setForm, description: e.target.value })} />
              </FormField>
              <button type="submit" className="btn-primary !w-auto px-4 text-xs" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
            </form>
          )}

          <div className="space-y-1">
            {sets.map((ss) => (
              <div
                key={ss.id}
                onClick={() => setSelected(ss)}
                className={`flex items-start justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                  selected?.id === ss.id
                    ? 'bg-accent/10 text-accent-dark font-semibold'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <div>
                  <div className="font-medium">{ss.label}</div>
                  <div className="text-xs text-slate-400">{ss.entityType} · {ss.transitionCount} transitions</div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {ss.isSystem && <span className="text-xs bg-blue-100 text-blue-600 px-1 rounded">Sys</span>}
                  {!ss.isSystem && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteSet(ss); }}
                      className="text-red-400 hover:text-red-600 text-xs"
                    >✕</button>
                  )}
                </div>
              </div>
            ))}
            {sets.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No status sets.</p>}
          </div>
        </div>

        {/* Right — transitions */}
        <div className="lg:col-span-2 admin-section">
          {!selected ? (
            <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
              Select a status set to manage its transitions
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="admin-section-title">Transitions — {selected.label}</h2>
                  <p className="text-xs text-slate-400">Entity type: {selected.entityType}</p>
                </div>
                <button
                  type="button"
                  className="btn-primary !w-auto px-3 text-xs"
                  onClick={() => { setShowTransForm((v) => !v); setEditTransId(null); setTransForm(EMPTY_TRANS); }}
                >
                  {showTransForm && !editTransId ? 'Cancel' : '+ Add transition'}
                </button>
              </div>

              {showTransForm && (
                <form onSubmit={saveTrans} className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="From status" htmlFor="tr-from">
                      <input id="tr-from" className="form-input text-sm font-mono" required value={transForm.fromStatus} onChange={(e) => setTransForm({ ...transForm, fromStatus: e.target.value })} placeholder="WAPPR" />
                    </FormField>
                    <FormField label="To status" htmlFor="tr-to">
                      <input id="tr-to" className="form-input text-sm font-mono" required value={transForm.toStatus} onChange={(e) => setTransForm({ ...transForm, toStatus: e.target.value })} placeholder="APPR" />
                    </FormField>
                    <FormField label="Label" htmlFor="tr-lbl">
                      <input id="tr-lbl" className="form-input text-sm" value={transForm.label} onChange={(e) => setTransForm({ ...transForm, label: e.target.value })} placeholder="Approve" />
                    </FormField>
                    <FormField label="Required role" htmlFor="tr-role">
                      <input id="tr-role" className="form-input text-sm" value={transForm.requiredRole} onChange={(e) => setTransForm({ ...transForm, requiredRole: e.target.value })} placeholder="supervisor" />
                    </FormField>
                    <FormField label="Notify roles (comma-separated)" htmlFor="tr-notify">
                      <input id="tr-notify" className="form-input text-sm" value={transForm.notifyRoles} onChange={(e) => setTransForm({ ...transForm, notifyRoles: e.target.value })} placeholder="planner, scheduler" />
                    </FormField>
                    <FormField label="Condition (optional)" htmlFor="tr-cond">
                      <input id="tr-cond" className="form-input text-sm font-mono" value={transForm.conditionExpression} onChange={(e) => setTransForm({ ...transForm, conditionExpression: e.target.value })} placeholder=":priority = 'HIGH'" />
                    </FormField>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" className="rounded border-slate-300 text-accent" checked={transForm.requiresComment} onChange={(e) => setTransForm({ ...transForm, requiresComment: e.target.checked })} />
                    Requires comment
                  </label>
                  <div className="flex gap-2 pt-1">
                    <button type="submit" className="btn-primary !w-auto px-4 text-xs" disabled={saving}>{saving ? 'Saving…' : editTransId ? 'Update' : 'Add'}</button>
                    <button type="button" className="btn-outline text-slate-500 text-xs" onClick={() => { setShowTransForm(false); setEditTransId(null); }}>Cancel</button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>From</th>
                      <th>To</th>
                      <th>Label</th>
                      <th>Comment</th>
                      <th>Required role</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transitions.length === 0 && (
                      <tr><td colSpan={6} className="text-center text-slate-400 py-8">No transitions defined.</td></tr>
                    )}
                    {transitions.map((t) => (
                      <tr key={t.id}>
                        <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{t.fromStatus}</code></td>
                        <td>
                          <span className="text-slate-400 mr-1">→</span>
                          <code className="text-xs bg-accent/10 text-accent-dark px-1.5 py-0.5 rounded">{t.toStatus}</code>
                        </td>
                        <td className="text-sm">{t.label || '—'}</td>
                        <td>
                          {t.requiresComment && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">Required</span>}
                        </td>
                        <td className="text-xs text-slate-500">{t.requiredRole || '—'}</td>
                        <td>
                          <div className="flex gap-2">
                            <button type="button" className="btn-link text-xs" onClick={() => startEditTrans(t)}>Edit</button>
                            <button type="button" className="btn-danger text-xs" onClick={() => deleteTrans(t)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </IdentityPageLayout>
  );
}
