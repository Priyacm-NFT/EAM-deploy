import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api/client.js';

interface Permission {
  id: string;
  resource: string;
  action: string;
}

interface Role {
  id: string;
  name: string;
  description: string | null;
  requireMfa: boolean;
}

export function RoleFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requireMfa, setRequireMfa] = useState(false);
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    api<Permission[]>('/admin/permissions').then(setAllPerms);
    if (!isNew && id) {
      api<Role>(`/admin/roles/${id}`).then((role) => {
        setName(role.name);
        setDescription(role.description ?? '');
        setRequireMfa(role.requireMfa);
      });
      api<{ id: string }[]>(`/admin/roles/${id}/permissions`).then((p) =>
        setSelected(new Set(p.map((x) => x.id))),
      );
    }
  }, [id, isNew]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    let roleId = id;
    if (isNew) {
      const created = await api<{ id: string }>('/admin/roles', {
        method: 'POST',
        body: JSON.stringify({ name, description, requireMfa }),
      });
      roleId = created.id;
    } else {
      await api(`/admin/roles/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, requireMfa }),
      });
    }
    await api(`/admin/roles/${roleId}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissionIds: [...selected] }),
    });
    navigate('/admin/identity/roles');
  }

  function togglePerm(pid: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid);
      else next.add(pid);
      return next;
    });
  }

  return (
    <form onSubmit={save} className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">{isNew ? 'New role' : 'Edit role'}</h1>
      <input
        className="border rounded w-full px-2 py-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Role name"
        required
      />
      <textarea
        className="border rounded w-full px-2 py-1"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={requireMfa} onChange={(e) => setRequireMfa(e.target.checked)} />
        Require MFA
      </label>
      <div>
        <p className="font-medium text-sm mb-2">Permissions</p>
        <div className="grid grid-cols-2 gap-2 text-sm max-h-64 overflow-auto border p-2 rounded bg-white">
          {allPerms.map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => togglePerm(p.id)}
              />
              {p.resource}:{p.action}
            </label>
          ))}
        </div>
      </div>
      <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded text-sm">
        Save
      </button>
    </form>
  );
}
