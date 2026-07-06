/**
 * StoreroomList.tsx  — NEW file
 * Route: /inventory/storerooms
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, FormField, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { usePagination } from '../../hooks/usePagination.js';
import { Pagination } from '../../components/Pagination.js';

interface Storeroom {
  id: string; code: string; name: string; isActive: boolean; createdAt: string;
  siteName?: string | null;
}

export function StoreroomListPage() {
  const [storerooms, setStorerooms] = useState<Storeroom[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [saving, setSaving] = useState(false);
a
  const load = () => {
    setError('');
    api<Storeroom[]>('/storerooms')
      .then(setStorerooms)
      .catch((e) => setError(String(e)));
  };

  useEffect(load, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const created = await api<{ code: string }>('/storerooms', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setSuccess(`Storeroom ${created.code} created`);
      setForm({ code: '', name: '', description: '' });
      setShowNew(false);
      load();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  };

  const { page, setPage, paged, totalPages, totalItems } = usePagination(storerooms, 10);

  return (
    <IdentityPageLayout title="Storerooms" subtitle="Manage storeroom locations and inventory stores"
      backTo="/inventory" backLabel="Back to items">
      {error && <MessageBanner type="error" text={error} />}
      {success && <MessageBanner type="success" text={success} />}

      <div className="admin-section">
        <div className="flex justify-end mb-4">
          <button type="button" className="btn-primary !w-auto px-4"
            onClick={() => setShowNew(true)}>+ New storeroom</button>
        </div>

        {showNew && (
          <form onSubmit={handleCreate} className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 grid grid-cols-3 gap-3">
            <FormField label="Code" hint="Optional — auto-generated (e.g. STR-00001) if left blank" htmlFor="sCode">
              <input
                id="sCode" className="form-input" value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="e.g. STR-00001"
              />
            </FormField>
            <FormField label="Name *" htmlFor="sName">
              <input id="sName" className="form-input" required value={form.name} onChange={set('name')} placeholder="e.g. Main Storeroom" />
            </FormField>
            <FormField label="Description" htmlFor="sDesc">
              <input id="sDesc" className="form-input" value={form.description} onChange={set('description')} />
            </FormField>
            <div className="col-span-3 flex gap-2">
              <button type="submit" className="btn-primary !w-auto px-4" disabled={saving}>
                {saving ? 'Saving…' : 'Create'}
              </button>
              <button type="button" className="btn-outline-light !w-auto px-4" onClick={() => setShowNew(false)}>Cancel</button>
            </div>
          </form>
        )}

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">Code</th>
              <th className="py-2 pr-4">Name</th>
              <th className="py-2 pr-4">Site</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {storerooms.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-slate-400">No storerooms found. Create one above.</td></tr>
            ) : paged.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-4 font-mono text-xs">
                  <Link to={`/inventory/storerooms/${s.id}`} className="text-blue-600 hover:underline">{s.code}</Link>
                </td>
                <td className="py-2 pr-4 font-medium">{s.name}</td>
                <td className="py-2 pr-4 text-slate-500">{s.siteName ?? '—'}</td>
                <td className="py-2 pr-4">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {s.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="py-2 pr-4 text-slate-400 text-xs">
                  {new Date(s.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={10} onChange={setPage} />
    </IdentityPageLayout>
  );
}

