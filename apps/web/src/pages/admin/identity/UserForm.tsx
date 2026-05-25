import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api/client.js';

export function UserFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [form, setForm] = useState({
    email: '',
    username: '',
    displayName: '',
    password: '',
    phone: '',
  });
  const [perms, setPerms] = useState<{ roles: string[]; permissions: string[] } | null>(null);

  useEffect(() => {
    if (!isNew && id) {
      api<{
        email: string;
        username: string;
        displayName: string;
        phone?: string;
        roles: string[];
        permissions: string[];
      }>(`/admin/users/${id}`).then((u) => {
        setForm({
          email: u.email,
          username: u.username,
          displayName: u.displayName,
          password: '',
          phone: u.phone ?? '',
        });
        setPerms({ roles: u.roles, permissions: u.permissions });
      });
    }
  }, [id, isNew]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (isNew) {
      await api('/admin/users', { method: 'POST', body: JSON.stringify(form) });
    } else {
      await api(`/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          email: form.email,
          displayName: form.displayName,
          phone: form.phone,
        }),
      });
    }
    navigate('/admin/identity/users');
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-xl font-semibold mb-4">{isNew ? 'Create user' : 'Edit user'}</h1>
      <form onSubmit={save} className="space-y-3">
        <label className="block text-sm">
          Email
          <input
            className="border rounded w-full px-2 py-1 mt-1"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>
        {isNew && (
          <>
            <label className="block text-sm">
              Username
              <input
                className="border rounded w-full px-2 py-1 mt-1"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </label>
            <label className="block text-sm">
              Password
              <input
                type="password"
                className="border rounded w-full px-2 py-1 mt-1"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </label>
          </>
        )}
        <label className="block text-sm">
          Display name
          <input
            className="border rounded w-full px-2 py-1 mt-1"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            required
          />
        </label>
        <label className="block text-sm">
          Phone (SMS MFA)
          <input
            className="border rounded w-full px-2 py-1 mt-1"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded text-sm">
          Save
        </button>
      </form>
      {perms && (
        <div className="mt-6 text-sm text-slate-600">
          <p className="font-medium">Effective roles</p>
          <p>{perms.roles.join(', ') || '—'}</p>
          <p className="font-medium mt-2">Permissions</p>
          <p className="break-all">{perms.permissions.join(', ') || '—'}</p>
        </div>
      )}
    </div>
  );
}
