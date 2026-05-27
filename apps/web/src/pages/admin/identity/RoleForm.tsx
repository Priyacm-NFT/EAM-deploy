import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api/client.js';
import { AdminAccessBanner } from '../../../components/AdminAccessBanner.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

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
  const [forbidden, setForbidden] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) {
      navigate('/admin/identity/roles', { replace: true });
      return;
    }
    api<Permission[]>('/admin/permissions')
      .then(setAllPerms)
      .catch((e) => {
        if (String(e).toLowerCase().includes('forbidden')) setForbidden(true);
      });
    if (id) {
      api<Role>(`/admin/roles/${id}`).then((role) => {
        setName(role.name);
        setDescription(role.description ?? '');
        setRequireMfa(role.requireMfa);
      });
      api<{ id: string }[]>(`/admin/roles/${id}/permissions`).then((p) =>
        setSelected(new Set(p.map((x) => x.id))),
      );
    }
  }, [id, isNew, navigate]);

  if (forbidden) {
    return (
      <IdentityPageLayout title="Edit role" backTo="/admin/identity/roles" backLabel="Back to roles">
        <AdminAccessBanner />
      </IdentityPageLayout>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError('');
    setSaving(true);
    try {
      await api(`/admin/roles/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, requireMfa }),
      });
      await api(`/admin/roles/${id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissionIds: [...selected] }),
      });
      setMsg('Role saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
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
    <IdentityPageLayout
      title="Edit role"
      subtitle="Update role details and assign permissions"
      backTo="/admin/identity/roles"
      backLabel="Back to roles"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <form onSubmit={save} className="admin-section space-y-4">
        <h2 className="admin-section-title">Role details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Role name" htmlFor="role-name-edit">
            <input
              id="role-name-edit"
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Description" htmlFor="role-desc-edit">
            <input
              id="role-desc-edit"
              type="text"
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-accent focus:ring-accent"
            checked={requireMfa}
            onChange={(e) => setRequireMfa(e.target.checked)}
          />
          Require MFA for users with this role
        </label>

        <div>
          <p className="form-label">Permissions</p>
          {allPerms.length === 0 ? (
            <p className="text-sm text-slate-500">Loading permissions…</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-auto border border-slate-200 rounded-lg p-3 bg-slate-50 mt-1">
              {allPerms.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer p-1.5 rounded hover:bg-white"
                >
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-accent focus:ring-accent"
                    checked={selected.has(p.id)}
                    onChange={() => togglePerm(p.id)}
                  />
                  <span>
                    <span className="font-medium">{p.resource}</span>
                    <span className="text-slate-500">:{p.action}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <FormActions>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
            {saving ? 'Saving…' : 'Save role'}
          </button>
        </FormActions>
      </form>
    </IdentityPageLayout>
  );
}
