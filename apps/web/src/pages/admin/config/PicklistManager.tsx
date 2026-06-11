import { useEffect, useRef, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface Picklist {
  id: string;
  name: string;
  label: string;
  isSystem: boolean;
}

interface PicklistValue {
  id: string;
  picklistId: string;
  value: string;
  label: string;
  displayOrder: number;
  isActive: boolean;
  parentValue: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export function PicklistManagerPage() {
  const [picklists, setPicklists] = useState<Picklist[]>([]);
  const [selected, setSelected] = useState<Picklist | null>(null);
  const [values, setValues] = useState<PicklistValue[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showValueForm, setShowValueForm] = useState(false);
  const [plForm, setPlForm] = useState({ name: '', label: '' });
  const [valForm, setValForm] = useState({ value: '', label: '', displayOrder: 0, parentValue: '', effectiveFrom: '', effectiveTo: '' });
  const csvFileRef = useRef<HTMLInputElement>(null);

  async function importCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    const text = await file.text();
    const lines = text.trim().split('\n').slice(1); // skip header
    let imported = 0;
    for (const line of lines) {
      const [value, label, displayOrder, parentValue, effectiveFrom, effectiveTo] = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      if (!value || !label) continue;
      try {
        await api(`/admin/config/picklists/${selected.id}/values`, {
          method: 'POST',
          body: JSON.stringify({
            value, label,
            displayOrder: Number(displayOrder ?? 0),
            parentValue: parentValue || undefined,
            effectiveFrom: effectiveFrom || undefined,
            effectiveTo: effectiveTo || undefined,
          }),
        });
        imported++;
      } catch { /* skip duplicates */ }
    }
    loadValues(selected.id);
    if (csvFileRef.current) csvFileRef.current.value = '';
    alert(`Imported ${imported} value(s).`);
  }
  const [editValId, setEditValId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function loadPicklists() {
    api<Picklist[]>('/admin/config/picklists').then(setPicklists).catch(() => setPicklists([]));
  }

  function loadValues(id: string) {
    api<PicklistValue[]>(`/admin/config/picklists/${id}/values`).then(setValues).catch(() => setValues([]));
  }

  useEffect(() => { loadPicklists(); }, []);

  useEffect(() => {
    if (selected) loadValues(selected.id);
    else setValues([]);
  }, [selected]);

  async function createPicklist(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await api<Picklist>('/admin/config/picklists', { method: 'POST', body: JSON.stringify(plForm) });
      setMsg(`Picklist "${result.name}" created.`);
      setShowCreate(false);
      setPlForm({ name: '', label: '' });
      loadPicklists();
      setSelected(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function deletePicklist(pl: Picklist) {
    if (pl.isSystem) { setError('System picklists cannot be deleted.'); return; }
    if (!window.confirm(`Delete picklist "${pl.name}"?`)) return;
    try {
      await api(`/admin/config/picklists/${pl.id}`, { method: 'DELETE' });
      setMsg(`"${pl.name}" deleted.`);
      if (selected?.id === pl.id) setSelected(null);
      loadPicklists();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function saveValue(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const payload = { ...valForm, parentValue: valForm.parentValue || undefined, effectiveFrom: valForm.effectiveFrom || undefined, effectiveTo: valForm.effectiveTo || undefined };
      if (editValId) {
        await api(`/admin/config/picklists/${selected.id}/values/${editValId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMsg('Value updated.');
      } else {
        await api(`/admin/config/picklists/${selected.id}/values`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setMsg('Value added.');
      }
      setShowValueForm(false);
      setEditValId(null);
      setValForm({ value: '', label: '', displayOrder: 0, parentValue: '', effectiveFrom: '', effectiveTo: '' });
      loadValues(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteValue(v: PicklistValue) {
    if (!selected) return;
    if (!window.confirm(`Delete value "${v.label}"?`)) return;
    try {
      await api(`/admin/config/picklists/${selected.id}/values/${v.id}`, { method: 'DELETE' });
      setMsg('Value deleted.');
      loadValues(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function startEditValue(v: PicklistValue) {
    setValForm({ value: v.value, label: v.label, displayOrder: v.displayOrder, parentValue: v.parentValue ?? '', effectiveFrom: v.effectiveFrom ?? '', effectiveTo: v.effectiveTo ?? '' });
    setEditValId(v.id);
    setShowValueForm(true);
  }

  return (
    <IdentityPageLayout
      title="Picklist manager"
      subtitle="Define and manage system-wide picklist values used in forms, filters, and validation rules"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left panel — picklist list */}
        <div className="admin-section">
          <div className="flex justify-between items-center">
            <h2 className="admin-section-title">Picklists</h2>
            <button type="button" className="btn-primary !w-auto px-3 text-xs" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Cancel' : '+ New'}
            </button>
          </div>

          {showCreate && (
            <form onSubmit={createPicklist} className="space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50">
              <FormField label="Name" htmlFor="pl-name">
                <input id="pl-name" className="form-input text-sm" required value={plForm.name} onChange={(e) => setPlForm({ ...plForm, name: e.target.value })} placeholder="e.g. priority" />
              </FormField>
              <FormField label="Label" htmlFor="pl-label">
                <input id="pl-label" className="form-input text-sm" required value={plForm.label} onChange={(e) => setPlForm({ ...plForm, label: e.target.value })} placeholder="e.g. Priority" />
              </FormField>
              <button type="submit" className="btn-primary !w-auto px-4 text-xs" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
            </form>
          )}

          <div className="space-y-1">
            {picklists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => setSelected(pl)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                  selected?.id === pl.id
                    ? 'bg-accent/10 text-accent-dark font-semibold'
                    : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <span className="truncate">
                  {pl.label}
                  {pl.isSystem && <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1 rounded">System</span>}
                </span>
                {!pl.isSystem && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deletePicklist(pl); }}
                    className="text-red-400 hover:text-red-600 text-xs ml-2 shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {picklists.length === 0 && <p className="text-sm text-slate-400 py-4 text-center">No picklists yet.</p>}
          </div>
        </div>

        {/* Right panel — values */}
        <div className="lg:col-span-2 admin-section">
          {!selected ? (
            <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
              Select a picklist on the left to manage its values
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h2 className="admin-section-title">Values — {selected.label}</h2>
                <div className="flex gap-2">
                  <button type="button" className="btn-outline text-xs" onClick={() => {
                    const csv = ['value,label,displayOrder,parentValue,effectiveFrom,effectiveTo,isActive',
                      ...values.map((v) => [v.value, v.label, v.displayOrder, v.parentValue ?? '', v.effectiveFrom ?? '', v.effectiveTo ?? '', v.isActive].join(','))
                    ].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
                    a.download = `${selected.name}-values.csv`; a.click();
                  }}>↓ CSV</button>
                  <label className="btn-outline text-xs cursor-pointer">
                    ↑ Import CSV
                    <input
                      ref={csvFileRef}
                      type="file"
                      accept=".csv"
                      className="hidden"
                      onChange={importCSV}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-primary !w-auto px-3 text-xs"
                    onClick={() => { setShowValueForm((v) => !v); setEditValId(null); setValForm({ value: '', label: '', displayOrder: 0, parentValue: '', effectiveFrom: '', effectiveTo: '' }); }}
                  >
                    {showValueForm && !editValId ? 'Cancel' : '+ Add value'}
                  </button>
                </div>
              </div>

              {showValueForm && (
                <form onSubmit={saveValue} className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Value (key)" htmlFor="val-val">
                      <input id="val-val" className="form-input text-sm font-mono" required value={valForm.value} onChange={(e) => setValForm({ ...valForm, value: e.target.value })} placeholder="HIGH" />
                    </FormField>
                    <FormField label="Label (display)" htmlFor="val-lbl">
                      <input id="val-lbl" className="form-input text-sm" required value={valForm.label} onChange={(e) => setValForm({ ...valForm, label: e.target.value })} placeholder="High" />
                    </FormField>
                    <FormField label="Display order" htmlFor="val-ord">
                      <input id="val-ord" className="form-input text-sm" type="number" value={valForm.displayOrder} onChange={(e) => setValForm({ ...valForm, displayOrder: Number(e.target.value) })} />
                    </FormField>
                    <FormField label="Parent value (dependent picklists)" htmlFor="val-parent">
                      <input id="val-parent" className="form-input text-sm font-mono" value={valForm.parentValue} onChange={(e) => setValForm({ ...valForm, parentValue: e.target.value })} placeholder="Optional" />
                    </FormField>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="form-label text-xs">Effective from</label>
                        <input type="date" className="form-input text-sm" value={valForm.effectiveFrom} onChange={(e) => setValForm({ ...valForm, effectiveFrom: e.target.value })} />
                      </div>
                      <div>
                        <label className="form-label text-xs">Effective to</label>
                        <input type="date" className="form-input text-sm" value={valForm.effectiveTo} onChange={(e) => setValForm({ ...valForm, effectiveTo: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary !w-auto px-4 text-xs" disabled={saving}>{saving ? 'Saving…' : editValId ? 'Update' : 'Add'}</button>
                    <button type="button" className="btn-outline text-slate-500 text-xs" onClick={() => { setShowValueForm(false); setEditValId(null); }}>Cancel</button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Value</th>
                      <th>Label</th>
                      <th>Parent</th>
                      <th>Effective from</th>
                      <th>Effective to</th>
                      <th>Active</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {values.length === 0 && (
                      <tr><td colSpan={8} className="text-center text-slate-400 py-8">No values. Add one above.</td></tr>
                    )}
                    {values.map((v) => (
                      <tr key={v.id}>
                        <td className="text-xs text-slate-400 w-12">{v.displayOrder}</td>
                        <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{v.value}</code></td>
                        <td className="text-sm">{v.label}</td>
                        <td className="text-xs text-slate-500">{v.parentValue ?? '—'}</td>
                        <td className="text-xs text-slate-500">{v.effectiveFrom ? new Date(v.effectiveFrom).toLocaleDateString() : '—'}</td>
                        <td className="text-xs text-slate-500">{v.effectiveTo ? new Date(v.effectiveTo).toLocaleDateString() : '—'}</td>
                        <td>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${v.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {v.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <button type="button" className="btn-link text-xs" onClick={() => startEditValue(v)}>Edit</button>
                            <button type="button" className="btn-danger text-xs" onClick={() => deleteValue(v)}>Delete</button>
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

