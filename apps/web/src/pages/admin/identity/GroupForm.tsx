import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface Member {
  id: string;
  email: string;
  displayName: string;
}

interface RoleOption {
  id: string;
  name: string;
}

export function GroupFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [allRoles, setAllRoles] = useState<RoleOption[]>([]);
  const [memberUserId, setMemberUserId] = useState('');
  const [allUsers, setAllUsers] = useState<Member[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) {
      navigate('/admin/identity/groups', { replace: true });
      return;
    }
    api<RoleOption[]>('/admin/roles').then(setAllRoles).catch(() => undefined);
    api<Member[]>('/admin/users').then(setAllUsers).catch(() => undefined);
    if (id) {
      api<{
        name: string;
        description: string | null;
        members: Member[];
        roleIds: string[];
      }>(`/admin/groups/${id}`).then((g) => {
        setName(g.name);
        setDescription(g.description ?? '');
        setMembers(g.members ?? []);
        setRoleIds(g.roleIds ?? []);
      });
    }
  }, [id, isNew, navigate]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError('');
    setSaving(true);
    try {
      await api(`/admin/groups/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, roleIds }),
      });
      setMsg('Group saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function saveRoles() {
    if (!id) return;
    setError('');
    setSaving(true);
    try {
      await api(`/admin/groups/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, roleIds }),
      });
      setMsg('Roles saved. Users must sign in again for changes to apply.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function addMember() {
    if (!id || !memberUserId) return;
    setMsg('');
    try {
      await api(`/admin/groups/${id}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: memberUserId }),
      });
      const g = await api<{ members: Member[] }>(`/admin/groups/${id}`);
      setMembers(g.members);
      setMemberUserId('');
      setMsg('Member added. They must sign in again for permissions to apply.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add member');
    }
  }

  async function removeMember(userId: string) {
    if (!id) return;
    setMsg(''); setError('');
    try {
      await api(`/admin/groups/${id}/members/${userId}`, { method: 'DELETE' });
      setMembers((prev) => prev.filter((m) => m.id !== userId));
      setMsg('Member removed. They must sign in again for changes to apply.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member');
    }
  }

  function toggleRole(roleId: string) {
    setRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId],
    );
  }

  return (
    <IdentityPageLayout
      title="Edit group"
      subtitle="Update group details, roles, and members"
      backTo="/admin/identity/groups"
      backLabel="Back to groups"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <form onSubmit={save} className="admin-section">
        <h2 className="admin-section-title">Group details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Group name" htmlFor="group-name-edit">
            <input
              id="group-name-edit"
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </FormField>
          <FormField label="Description" htmlFor="group-desc-edit">
            <input
              id="group-desc-edit"
              type="text"
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
        </div>
        <FormActions>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </FormActions>
      </form>

      <div className="admin-section">
        <h2 className="admin-section-title">Roles assigned to this group</h2>
        {allRoles.length === 0 ? (
          <p className="text-sm text-slate-500">No roles available. Create a role first.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {allRoles.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer p-2 rounded hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-accent focus:ring-accent"
                  checked={roleIds.includes(r.id)}
                  onChange={() => toggleRole(r.id)}
                />
                {r.name}
              </label>
            ))}
          </div>
        )}
        <div className="mt-4">
          <button type="button" className="btn-primary !w-auto px-6" onClick={saveRoles} disabled={saving}>
            {saving ? 'Saving…' : 'Save roles'}
          </button>
          <p className="text-xs text-slate-500 mt-2">Users must sign in again for role changes to apply.</p>
        </div>
      </div>

      <div className="admin-section">
        <h2 className="admin-section-title">Members</h2>
        {members.length === 0 ? (
          <p className="text-sm text-slate-500 mb-4">No members yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg mb-4">
            {members.map((m) => (
              <li key={m.id} className="px-4 py-3 text-sm text-slate-800 flex items-center justify-between">
                <span>
                  <span className="font-medium">{m.displayName}</span>
                  <span className="text-slate-500"> · {m.email}</span>
                </span>
                <button
                  type="button"
                  className="text-red-500 hover:text-red-700 text-xs font-medium ml-4"
                  onClick={() => removeMember(m.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-3 items-end">
          <FormField label="Add member" htmlFor="add-member">
            <select
              id="add-member"
              className="form-select min-w-[16rem]"
              value={memberUserId}
              onChange={(e) => setMemberUserId(e.target.value)}
            >
              <option value="">Select a user…</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.email})
                </option>
              ))}
            </select>
          </FormField>
          <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={addMember}>
            Add member
          </button>
        </div>
      </div>
    </IdentityPageLayout>
  );
}
