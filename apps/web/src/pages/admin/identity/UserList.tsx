import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

export function AdminIdentityPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<UserRow[]>('/admin/users')
      .then(setUsers)
      .catch((e) => setError(String(e)));
  }, []);

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(filter.toLowerCase()) ||
      u.displayName.toLowerCase().includes(filter.toLowerCase()),
  );

  async function deactivate(id: string) {
    await api(`/admin/users/${id}`, { method: 'DELETE' });
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, isActive: false } : u)));
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-semibold">Users</h1>
        <Link to="/admin/identity/users/new" className="text-blue-600 text-sm">
          Create user
        </Link>
      </div>
      <input
        className="border rounded px-3 py-2 mb-4 w-full max-w-md"
        placeholder="Search name or email"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {error && <p className="text-red-600 mb-2">{error}</p>}
      <table className="w-full text-sm border-collapse bg-white border">
        <thead>
          <tr className="bg-slate-100 text-left">
            <th className="p-2">Name</th>
            <th className="p-2">Email</th>
            <th className="p-2">Status</th>
            <th className="p-2">Last login</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => (
            <tr key={u.id} className="border-t">
              <td className="p-2">{u.displayName}</td>
              <td className="p-2">{u.email}</td>
              <td className="p-2">{u.isActive ? 'Active' : 'Inactive'}</td>
              <td className="p-2">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}</td>
              <td className="p-2 space-x-2">
                <Link to={`/admin/identity/users/${u.id}`} className="text-blue-600">
                  Edit
                </Link>
                {u.isActive && (
                  <button type="button" className="text-red-600" onClick={() => deactivate(u.id)}>
                    Deactivate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
