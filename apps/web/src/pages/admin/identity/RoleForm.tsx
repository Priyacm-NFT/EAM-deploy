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

interface Role {
  id: string;
  name: string;
  description: string | null;
}

// FIX: reverted to pure metadata editing — IBM Maximo treats "role" as
// descriptive job-title data only, never a permission container. All
// security behaviour (permissions, MFA requirement, data scope) now lives
// on the Security Group instead — see GroupForm.tsx, which gained a
// "Permissions" section and a "Data scope" section that used to live
// here. This form is intentionally simple: just a name and description.
export function RoleFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) {
      navigate('/admin/identity/roles', { replace: true });
      return;
    }
    if (id) {
      api<Role>(`/admin/roles/${id}`)
        .then((role) => {
          setName(role.name);
          setDescription(role.description ?? '');
        })
        .catch((e) => {
          if (String(e).toLowerCase().includes('forbidden')) setForbidden(true);
        });
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
        body: JSON.stringify({ name, description }),
      });
      setMsg('Role saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <IdentityPageLayout
      title="Edit role"
      subtitle="Role is a job-title label only — it does not grant any access. Manage permissions, MFA, and data scope on the group instead."
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

        <FormActions>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
            {saving ? 'Saving…' : 'Save role'}
          </button>
        </FormActions>
      </form>
    </IdentityPageLayout>
  );
}
