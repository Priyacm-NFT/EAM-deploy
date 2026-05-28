import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import { AdminAccessBanner } from '../../../components/AdminAccessBanner.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

const emptyCreateForm = {
  email: '',
  username: '',
  displayName: '',
  password: '',
};

export function AdminIdentityPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filter, setFilter] = useState('');
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [creating, setCreating] = useState(false);

  function loadUsers() {
    api<UserRow[]>('/admin/users')
      .then(setUsers)
      .catch((e) => setError(String(e)));
  }

  useEffect(() => {
    loadUsers();
  }, []);

  if (error.toLowerCase().includes('forbidden')) {
    return (
      <IdentityPageLayout title="Users" subtitle="Manage user accounts and access">
        <AdminAccessBanner />
      </IdentityPageLayout>
    );
  }

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(filter.toLowerCase()) ||
      u.displayName.toLowerCase().includes(filter.toLowerCase()),
  );

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setCreating(true);
    try {
      await api('/admin/users', { method: 'POST', body: JSON.stringify(createForm) });
      setCreateForm(emptyCreateForm);
      setMsg('User created successfully.');
      loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function deactivate(id: string) {
    if (!window.confirm('Deactivate this user?')) return;
    await api(`/admin/users/${id}`, { method: 'DELETE' });
    loadUsers();
  }

  async function resetPassword(id: string, email: string) {
    const res = await api<{ ok: boolean; resetUrl?: string }>(
      `/admin/users/${id}/force-password-reset`,
      { method: 'POST' },
    );
    const hint = res.resetUrl ? ` Dev link: ${res.resetUrl}` : '';
    setMsg(`Password reset email sent to ${email}.${hint}`);
  }

  return (
    <IdentityPageLayout title="Users" subtitle="Create accounts and manage existing users">
      <form onSubmit={createUser} className="admin-section">
        <h2 className="admin-section-title">Create user</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Email address" htmlFor="user-email">
            <input
              id="user-email"
              type="email"
              className="form-input"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              required
              autoComplete="off"
            />
          </FormField>
          <FormField label="Username" htmlFor="user-username">
            <input
              id="user-username"
              type="text"
              className="form-input"
              value={createForm.username}
              onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
              required
              autoComplete="off"
            />
          </FormField>
          <FormField label="Display name" htmlFor="user-display">
            <input
              id="user-display"
              type="text"
              className="form-input"
              value={createForm.displayName}
              onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
              required
              autoComplete="off"
            />
          </FormField>
          <FormField label="Password" htmlFor="user-password" hint="Min 10 chars, uppercase, number, special">
            <input
              id="user-password"
              type="password"
              className="form-input"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              required
              autoComplete="new-password"
            />
          </FormField>
        </div>
        <FormActions>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={creating}>
            {creating ? 'Creating…' : 'Create user'}
          </button>
        </FormActions>
      </form>

      <div className="admin-section">
        <h2 className="admin-section-title">All users</h2>
        {msg && <MessageBanner type="success" text={msg} />}
        {error && !error.toLowerCase().includes('forbidden') && (
          <MessageBanner type="error" text={error} />
        )}
        <FormField label="Search" htmlFor="user-search">
          <input
            id="user-search"
            type="search"
            className="form-input max-w-md"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </FormField>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Last login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-slate-500 py-8">
                    No users found. Create one using the form above.
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.displayName}</td>
                  <td>{u.email}</td>
                  <td>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        u.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
                  <td className="space-x-3 whitespace-nowrap">
                    <Link to={`/admin/identity/users/${u.id}`} className="btn-link">
                      Edit
                    </Link>
                    {u.isActive && (
                      <>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => resetPassword(u.id, u.email)}
                        >
                          Reset password
                        </button>
                        <button type="button" className="btn-danger" onClick={() => deactivate(u.id)}>
                          Deactivate
                        </button>
                      </>
                    )}
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