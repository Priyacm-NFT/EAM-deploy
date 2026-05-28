import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface GroupOption {
  id: string;
  name: string;
}

interface SessionRow {
  id: string;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  revokedAt: string | null;
}

export function UserFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', displayName: '' });
  const [perms, setPerms] = useState<{ roles: string[]; permissions: string[]; groups: GroupOption[] } | null>(
    null,
  );
  const [allGroups, setAllGroups] = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id || id === 'new') {
      navigate('/admin/identity/users', { replace: true });
      return;
    }
    api<GroupOption[]>('/admin/groups').then(setAllGroups).catch(() => undefined);
    api<{
      email: string;
      username: string;
      displayName: string;
      roles: string[];
      permissions: string[];
      groups: GroupOption[];
    }>(`/admin/users/${id}`).then((u) => {
      setForm({ email: u.email, username: u.username, displayName: u.displayName });
      setPerms({ roles: u.roles, permissions: u.permissions, groups: u.groups });
    });
    api<SessionRow[]>(`/admin/users/${id}/sessions`).then(setSessions).catch(() => undefined);
  }, [id, navigate]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError('');
    setSaving(true);
    try {
      await api(`/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ email: form.email, displayName: form.displayName }),
      });
      setMsg('User updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function addToGroup() {
    if (!id || !selectedGroupId) return;
    setMsg('');
    try {
      await api(`/admin/users/${id}/groups`, {
        method: 'POST',
        body: JSON.stringify({ groupId: selectedGroupId }),
      });
      setMsg('User added to group. They must sign in again for permissions to apply.');
      const u = await api<{ roles: string[]; permissions: string[]; groups: GroupOption[] }>(
        `/admin/users/${id}`,
      );
      setPerms({ roles: u.roles, permissions: u.permissions, groups: u.groups });
      setSelectedGroupId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add group');
    }
  }

  async function forcePasswordReset() {
    if (!id) return;
    setMsg('');
    try {
      const res = await api<{ ok: boolean; resetUrl?: string }>(
        `/admin/users/${id}/force-password-reset`,
        { method: 'POST' },
      );
      setMsg(
        res.resetUrl
          ? `Password reset email sent. Dev link: ${res.resetUrl}`
          : 'Password reset email sent. All sessions revoked.',
      );
      setSessions([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    }
  }

  async function forceLogout() {
    if (!id) return;
    await api(`/admin/users/${id}/sessions`, { method: 'DELETE' });
    setMsg('All sessions revoked.');
    setSessions([]);
  }

  async function impersonate() {
    if (!id) return;
    const res = await api<{ accessToken: string }>(`/admin/users/${id}/impersonate`, { method: 'POST' });
    localStorage.setItem('eam_access_token', res.accessToken);
    window.location.href = '/dashboard';
  }

  return (
    <IdentityPageLayout
      title="Edit user"
      subtitle="Update profile, groups, and session controls"
      backTo="/admin/identity/users"
      backLabel="Back to users"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <form onSubmit={save} className="admin-section">
        <h2 className="admin-section-title">Profile</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Email address" htmlFor="edit-email">
            <input
              id="edit-email"
              type="email"
              className="form-input"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Username" htmlFor="edit-username">
            <input id="edit-username" type="text" className="form-input bg-slate-50" value={form.username} readOnly />
          </FormField>
          <FormField label="Display name" htmlFor="edit-display">
            <input
              id="edit-display"
              type="text"
              className="form-input"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              required
            />
          </FormField>
        </div>
        <FormActions>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </FormActions>
      </form>

      {perms && (
        <>
          <div className="admin-section">
            <h2 className="admin-section-title">Access</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="form-label">Groups</p>
                <p className="text-slate-800">{perms.groups.map((g) => g.name).join(', ') || 'None'}</p>
              </div>
              <div>
                <p className="form-label">Roles</p>
                <p className="text-slate-800">{perms.roles.join(', ') || 'None'}</p>
              </div>
              <div>
                <p className="form-label">Permissions</p>
                <p className="text-slate-800 break-all">{perms.permissions.join(', ') || 'None'}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 items-end pt-4 border-t border-slate-200 mt-4">
              <FormField label="Add to group" htmlFor="add-group">
                <select
                  id="add-group"
                  className="form-select min-w-[14rem]"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                >
                  <option value="">Select a group…</option>
                  {allGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={addToGroup}>
                Add to group
              </button>
            </div>
          </div>

          <div className="admin-section">
            <h2 className="admin-section-title">Admin actions</h2>
            <FormActions>
              <button type="button" className="btn-primary !w-auto px-4" onClick={forcePasswordReset}>
                Force password reset
              </button>
              <button type="button" className="btn-primary !w-auto px-4" onClick={forceLogout}>
                Force logout all sessions
              </button>
              <button type="button" className="btn-primary !w-auto px-4" onClick={impersonate}>
                Impersonate user
              </button>
            </FormActions>
            {sessions.filter((s) => !s.revokedAt).length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <p className="form-label">Active sessions</p>
                <ul className="text-sm text-slate-700 space-y-1 mt-2">
                  {sessions
                    .filter((s) => !s.revokedAt)
                    .map((s) => (
                      <li key={s.id}>
                        {s.ipAddress ?? 'Unknown IP'} · started {new Date(s.createdAt).toLocaleString()}
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </IdentityPageLayout>
  );
}
