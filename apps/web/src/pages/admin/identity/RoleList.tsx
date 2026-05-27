import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface Role {
  id: string;
  name: string;
  description: string | null;
  requireMfa: boolean;
}

const emptyCreateForm = { name: '', description: '', requireMfa: false };

export function RoleListPage() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState<Role[]>([]);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [filter, setFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  function loadRoles() {
    api<Role[]>('/admin/roles')
      .then(setRoles)
      .catch((e) => setError(String(e)));
  }

  useEffect(() => {
    loadRoles();
  }, []);

  const filtered = roles.filter(
    (r) =>
      r.name.toLowerCase().includes(filter.toLowerCase()) ||
      (r.description ?? '').toLowerCase().includes(filter.toLowerCase()),
  );

  async function createRole(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setCreating(true);
    try {
      const created = await api<{ id: string }>('/admin/roles', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setCreateForm(emptyCreateForm);
      setMsg('Role created. Assign permissions on the edit screen.');
      loadRoles();
      navigate(`/admin/identity/roles/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  return (
    <IdentityPageLayout title="Roles" subtitle="Define roles and assign permissions">
      <form onSubmit={createRole} className="admin-section">
        <h2 className="admin-section-title">Create role</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Role name" htmlFor="role-name">
            <input
              id="role-name"
              type="text"
              className="form-input"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Description" htmlFor="role-desc">
            <input
              id="role-desc"
              type="text"
              className="form-input"
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
            />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-accent focus:ring-accent"
            checked={createForm.requireMfa}
            onChange={(e) => setCreateForm({ ...createForm, requireMfa: e.target.checked })}
          />
          Require MFA for users with this role
        </label>
        <FormActions>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={creating}>
            {creating ? 'Creating…' : 'Create role'}
          </button>
        </FormActions>
      </form>

      <div className="admin-section">
        <h2 className="admin-section-title">All roles</h2>
        {msg && <MessageBanner type="success" text={msg} />}
        {error && <MessageBanner type="error" text={error} />}
        <FormField label="Search" htmlFor="role-search">
          <input
            id="role-search"
            type="search"
            className="form-input max-w-md"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </FormField>
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
          {filtered.length === 0 && (
            <li className="p-8 text-center text-slate-500">No roles found. Create one using the form above.</li>
          )}
          {filtered.map((r) => (
            <li key={r.id} className="p-4 flex justify-between items-center gap-4 bg-white hover:bg-slate-50">
              <div>
                <p className="font-medium text-slate-900">{r.name}</p>
                {r.description && <p className="text-sm text-slate-500 mt-0.5">{r.description}</p>}
                {r.requireMfa && (
                  <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded mt-1 inline-block">
                    MFA required
                  </span>
                )}
              </div>
              <Link to={`/admin/identity/roles/${r.id}`} className="btn-link shrink-0">
                Edit permissions
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </IdentityPageLayout>
  );
}
