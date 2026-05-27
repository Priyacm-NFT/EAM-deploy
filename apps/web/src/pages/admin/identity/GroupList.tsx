import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface Group {
  id: string;
  name: string;
  description: string | null;
  source: string;
}

const emptyCreateForm = { name: '', description: '' };

export function GroupListPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  function loadGroups() {
    api<Group[]>('/admin/groups')
      .then(setGroups)
      .catch((e) => setError(String(e)));
  }

  useEffect(() => {
    loadGroups();
  }, []);

  const filtered = groups.filter(
    (g) =>
      g.name.toLowerCase().includes(filter.toLowerCase()) ||
      (g.description ?? '').toLowerCase().includes(filter.toLowerCase()),
  );

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setCreating(true);
    try {
      await api('/admin/groups', { method: 'POST', body: JSON.stringify(createForm) });
      setCreateForm(emptyCreateForm);
      setMsg('Group created successfully.');
      loadGroups();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  return (
    <IdentityPageLayout title="Groups" subtitle="Organize users and assign roles through groups">
      <form onSubmit={createGroup} className="admin-section">
        <h2 className="admin-section-title">Create group</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Group name" htmlFor="group-name">
            <input
              id="group-name"
              type="text"
              className="form-input"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Description" htmlFor="group-desc">
            <input
              id="group-desc"
              type="text"
              className="form-input"
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            />
          </FormField>
        </div>
        <FormActions>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={creating}>
            {creating ? 'Creating…' : 'Create group'}
          </button>
        </FormActions>
      </form>

      <div className="admin-section">
        <h2 className="admin-section-title">All groups</h2>
        {msg && <MessageBanner type="success" text={msg} />}
        {error && <MessageBanner type="error" text={error} />}
        <FormField label="Search" htmlFor="group-search">
          <input
            id="group-search"
            type="search"
            className="form-input max-w-md"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </FormField>
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
          {filtered.length === 0 && (
            <li className="p-8 text-center text-slate-500">No groups found. Create one using the form above.</li>
          )}
          {filtered.map((g) => (
            <li key={g.id} className="p-4 flex justify-between items-start gap-4 bg-white hover:bg-slate-50">
              <div>
                <p className="font-medium text-slate-900">{g.name}</p>
                <p className="text-sm text-slate-500 mt-0.5">{g.description || 'No description'}</p>
                <span className="text-xs text-slate-400 mt-1 inline-block">Source: {g.source}</span>
              </div>
              <Link to={`/admin/identity/groups/${g.id}`} className="btn-link shrink-0">
                Edit
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </IdentityPageLayout>
  );
}
