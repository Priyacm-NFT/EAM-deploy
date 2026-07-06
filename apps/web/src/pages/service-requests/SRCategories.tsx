import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

// FIX (P1-2 gap — UI for admin CRUD): "category.routing_role drives the
// P0-3 workflow assignment for triage." The API (/admin/sr-categories)
// existed with nothing in the browser to call it — this is that screen.

interface SRCategory {
  id: string;
  name: string;
  defaultPriority: string | null;
  slaHours: number | null;
  routingRole: string | null;
  isActive: boolean;
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const EMPTY_FORM = { name: '', defaultPriority: 'MEDIUM', slaHours: '24', routingRole: '' };

export function SRCategoriesPage() {
  const [categories, setCategories] = useState<SRCategory[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function load() {
    api<SRCategory[]>('/sr-categories').then(setCategories).catch((e) => setError(String(e)));
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setError(''); setSuccess('');
    const payload = {
      name: form.name.trim(),
      defaultPriority: form.defaultPriority,
      slaHours: form.slaHours ? Number(form.slaHours) : undefined,
      routingRole: form.routingRole.trim() || undefined,
    };
    try {
      if (editingId) {
        await api(`/admin/sr-categories/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setSuccess('Category updated.');
      } else {
        await api('/admin/sr-categories', { method: 'POST', body: JSON.stringify(payload) });
        setSuccess('Category created.');
      }
      setShowForm(false); setEditingId(null); setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(c: SRCategory) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      defaultPriority: c.defaultPriority ?? 'MEDIUM',
      slaHours: c.slaHours ? String(c.slaHours) : '',
      routingRole: c.routingRole ?? '',
    });
    setShowForm(true);
  }

  async function deactivate(id: string) {
    if (!window.confirm('Deactivate this category? Existing SRs keep it, but it will stop showing up for new ones.')) return;
    try {
      await api(`/admin/sr-categories/${id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <IdentityPageLayout
      title="Service Request Categories"
      subtitle="Each category can set a default priority, SLA target, and the role it should route to for triage"
      backTo="/service-requests"
      backLabel="Back to service requests"
    >
      {error && <MessageBanner type="error" text={error} />}
      {success && <MessageBanner type="success" text={success} />}

      <div className="admin-section">
        <div className="flex justify-between items-center mb-3">
          <h2 className="admin-section-title">Categories</h2>
          <button
            type="button" className="btn-primary !w-auto px-4"
            onClick={() => { setShowForm((v) => !v); setEditingId(null); setForm(EMPTY_FORM); }}
          >
            {showForm ? 'Cancel' : '+ Add category'}
          </button>
        </div>

        {showForm && (
          <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="form-label">Name</span>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Electrical" />
            </label>
            <label className="block">
              <span className="form-label">Default priority</span>
              <select className="form-input" value={form.defaultPriority} onChange={(e) => setForm({ ...form, defaultPriority: e.target.value })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="form-label">SLA target (hours)</span>
              <input type="number" min="1" className="form-input" value={form.slaHours} onChange={(e) => setForm({ ...form, slaHours: e.target.value })} />
            </label>
            <label className="block">
              <span className="form-label">Routing role</span>
              <input className="form-input" value={form.routingRole} onChange={(e) => setForm({ ...form, routingRole: e.target.value })} placeholder="electrician" />
            </label>
            <div className="col-span-2 flex gap-2">
              <button type="button" className="btn-primary !w-auto px-4" disabled={saving || !form.name.trim()} onClick={save}>
                {saving ? 'Saving…' : editingId ? 'Update' : 'Save'}
              </button>
              <button type="button" className="btn-link" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</button>
            </div>
          </div>
        )}

        {categories.length === 0 ? (
          <p className="text-slate-400 text-sm">No categories configured yet — SRs created with a free-text category won't get SLA/routing defaults until one's added here.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Default priority</th><th>SLA (hrs)</th><th>Routing role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td>{c.defaultPriority ?? '—'}</td>
                  <td>{c.slaHours ?? '—'}</td>
                  <td>{c.routingRole ? <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{c.routingRole}</code> : '—'}</td>
                  <td>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${c.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">
                    <button type="button" className="btn-link text-xs" onClick={() => startEdit(c)}>Edit</button>
                    {c.isActive && (
                      <button type="button" className="btn-link text-xs text-red-600 ml-2" onClick={() => deactivate(c.id)}>Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </IdentityPageLayout>
  );
}
