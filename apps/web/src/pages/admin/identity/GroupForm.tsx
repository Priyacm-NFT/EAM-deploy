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

interface Permission {
  id: string;
  resource: string;
  action: string;
}

interface SiteOption { id: string; name: string; code: string }
interface OrgOption { id: string; name: string }
interface LocationOption { id: string; name: string; code: string }

export function GroupFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  // FIX: roleIds is now purely descriptive — "what job titles do this
  // group's members typically hold" — and is NOT consulted for
  // permissions anywhere. Kept for display/reporting only, matching
  // Maximo treating role as informational person data.
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [allRoles, setAllRoles] = useState<RoleOption[]>([]);
  const [memberUserId, setMemberUserId] = useState('');
  const [allUsers, setAllUsers] = useState<Member[]>([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // FIX: real authorization controls — this is where access actually
  // lives now (IBM Maximo's Security Group model: "A security group
  // grants access to members of the group to ... applications ... The
  // access options can be read, insert, save, and delete," plus the
  // group's Sites tab for site authorization).
  const [requireMfa, setRequireMfa] = useState(false);
  // FIX: real Maximo Security Groups screen — "Display Side Navigation
  // Menu?" checkbox. Defaults true to match the column's own DB default.
  const [displaySideNav, setDisplaySideNav] = useState(true);
  const [scopeType, setScopeType] = useState<'ALL' | 'ORGANISATION' | 'SITE' | 'LOCATION'>('ALL');
  const [scopeIds, setScopeIds] = useState<Set<string>>(new Set());
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [scopeLocations, setScopeLocations] = useState<LocationOption[]>([]);
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isNew) {
      navigate('/admin/identity/groups', { replace: true });
      return;
    }
    api<RoleOption[]>('/admin/roles').then(setAllRoles).catch(() => undefined);
    api<Member[]>('/admin/users').then(setAllUsers).catch(() => undefined);
    api<Permission[]>('/admin/permissions').then(setAllPerms).catch(() => undefined);
    if (id) {
      api<{
        name: string;
        description: string | null;
        members: Member[];
        roleIds: string[];
        requireMfa: boolean;
        displaySideNav?: boolean;
        scopeType?: 'ALL' | 'ORGANISATION' | 'SITE' | 'LOCATION';
        scopeIds?: string[];
      }>(`/admin/groups/${id}`).then((g) => {
        setName(g.name);
        setDescription(g.description ?? '');
        setMembers(g.members ?? []);
        setRoleIds(g.roleIds ?? []);
        setRequireMfa(g.requireMfa ?? false);
        setDisplaySideNav(g.displaySideNav ?? true);
        setScopeType(g.scopeType ?? 'ALL');
        setScopeIds(new Set(g.scopeIds ?? []));
      });
      api<{ id: string }[]>(`/admin/groups/${id}/permissions`).then((p) =>
        setSelectedPerms(new Set(p.map((x) => x.id))),
      ).catch(() => undefined);
    }
  }, [id, isNew, navigate]);

  // FIX: lazily fetch the relevant scope-option list only once the admin
  // switches to that scope type.
  useEffect(() => {
    if (scopeType === 'SITE' && sites.length === 0) {
      api<SiteOption[]>('/admin/org/sites').then(setSites).catch(() => setSites([]));
    } else if (scopeType === 'ORGANISATION' && orgs.length === 0) {
      api<OrgOption[]>('/admin/org/organisations').then(setOrgs).catch(() => setOrgs([]));
    } else if (scopeType === 'LOCATION' && scopeLocations.length === 0) {
      api<LocationOption[]>('/locations').then(setScopeLocations).catch(() => setScopeLocations([]));
    }
  }, [scopeType, sites.length, orgs.length, scopeLocations.length]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setError('');
    setSaving(true);
    try {
      await api(`/admin/groups/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name, description, roleIds,
          requireMfa,
          displaySideNav,
          scopeType,
          scopeIds: scopeType !== 'ALL' ? [...scopeIds] : [],
        }),
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
      setMsg('Job-title labels saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // FIX: saves this group's direct permission grants — the actual
  // authorization editing action, equivalent to checking read/insert/
  // save/delete boxes in Maximo's Security Group application.
  async function savePermissions() {
    if (!id) return;
    setError('');
    setSaving(true);
    try {
      await api(`/admin/groups/${id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissionIds: [...selectedPerms] }),
      });
      setMsg('Permissions saved. Members must sign in again for changes to apply.');
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

  function togglePerm(permId: string) {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  }

  function toggleScopeId(scopeId: string) {
    setScopeIds((prev) => {
      const next = new Set(prev);
      if (next.has(scopeId)) next.delete(scopeId);
      else next.add(scopeId);
      return next;
    });
  }

  return (
    <IdentityPageLayout
      title="Edit group"
      subtitle="Update group details, permissions, data scope, and members — IBM Maximo-style: this Security Group is the unit that grants access"
      backTo="/admin/identity/groups"
      backLabel="Back to groups"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <form onSubmit={save} className="admin-section space-y-4">
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

        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-accent focus:ring-accent"
            checked={requireMfa}
            onChange={(e) => setRequireMfa(e.target.checked)}
          />
          Require MFA for members of this group
        </label>

        {/* FIX: real Maximo Security Groups screen — "Display Side
            Navigation Menu?" checkbox. If a user belongs to multiple
            groups, any one group having this on makes the sidebar show
            for that user (see auth.ts effectiveSideNav resolution) — a
            user's own Default Information choice still overrides this. */}
        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-accent focus:ring-accent"
            checked={displaySideNav}
            onChange={(e) => setDisplaySideNav(e.target.checked)}
          />
          Display Side Navigation Menu for members of this group
        </label>

        {/* FIX: Data scope — PRD §8.1 "Roles scoped to organisation, site,
            or location," now expressed at the GROUP level to match
            Maximo's Security Groups → Sites tab ("Authorize Group for All
            Sites?" vs specific sites). */}
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/60 space-y-3">
          <p className="form-label mb-0">Data scope</p>
          <p className="text-xs text-slate-500">
            Restrict which records members of this group can see. Leave as "All" for no restriction (the default for every group today).
          </p>
          <div className="flex gap-3 flex-wrap">
            {(['ALL', 'ORGANISATION', 'SITE', 'LOCATION'] as const).map((opt) => (
              <label key={opt} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="scopeType"
                  className="text-accent focus:ring-accent"
                  checked={scopeType === opt}
                  onChange={() => { setScopeType(opt); setScopeIds(new Set()); }}
                />
                {opt === 'ALL' ? 'All (unrestricted)' : opt.charAt(0) + opt.slice(1).toLowerCase()}
              </label>
            ))}
          </div>

          {scopeType === 'SITE' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-auto border border-slate-200 rounded-lg p-3 bg-white">
              {sites.length === 0 ? (
                <p className="text-sm text-slate-400 col-span-full">Loading sites…</p>
              ) : sites.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300 text-accent focus:ring-accent"
                    checked={scopeIds.has(s.id)} onChange={() => toggleScopeId(s.id)} />
                  <span>{s.code} – {s.name}</span>
                </label>
              ))}
            </div>
          )}

          {scopeType === 'ORGANISATION' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-auto border border-slate-200 rounded-lg p-3 bg-white">
              {orgs.length === 0 ? (
                <p className="text-sm text-slate-400 col-span-full">Loading organisations…</p>
              ) : orgs.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300 text-accent focus:ring-accent"
                    checked={scopeIds.has(o.id)} onChange={() => toggleScopeId(o.id)} />
                  <span>{o.name}</span>
                </label>
              ))}
            </div>
          )}

          {scopeType === 'LOCATION' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-auto border border-slate-200 rounded-lg p-3 bg-white">
              {scopeLocations.length === 0 ? (
                <p className="text-sm text-slate-400 col-span-full">Loading locations…</p>
              ) : scopeLocations.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300 text-accent focus:ring-accent"
                    checked={scopeIds.has(l.id)} onChange={() => toggleScopeId(l.id)} />
                  <span>{l.code} – {l.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <FormActions>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </FormActions>
      </form>

      {/* FIX: real authorization editing — equivalent to Maximo's
          Applications tab on a Security Group, where read/insert/save/
          delete access options are checked per application. */}
      <div className="admin-section">
        <h2 className="admin-section-title">Permissions (access granted to this group)</h2>
        <p className="text-xs text-slate-500 mb-3">
          This is the group's actual authorization — what members can read, create, edit, or delete. Matches IBM Maximo's Security Group access model.
        </p>
        {allPerms.length === 0 ? (
          <p className="text-sm text-slate-500">Loading permissions…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-auto border border-slate-200 rounded-lg p-3 bg-slate-50">
            {allPerms.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer p-1.5 rounded hover:bg-white"
              >
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-accent focus:ring-accent"
                  checked={selectedPerms.has(p.id)}
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
        <div className="mt-4">
          <button type="button" className="btn-primary !w-auto px-6" onClick={savePermissions} disabled={saving}>
            {saving ? 'Saving…' : 'Save permissions'}
          </button>
          <p className="text-xs text-slate-500 mt-2">Members must sign in again for permission changes to apply.</p>
        </div>
      </div>

      {/* FIX: relabeled — this is now explicitly display-only metadata,
          not a permission control. Kept so admins can still tag "this
          group is mostly Technicians" for reporting/filtering elsewhere. */}
      <div className="admin-section">
        <h2 className="admin-section-title">Job-title labels for this group <span className="text-xs font-normal text-slate-400">(display only — does not affect access)</span></h2>
        {allRoles.length === 0 ? (
          <p className="text-sm text-slate-500">No role labels available. Create one first.</p>
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
            {saving ? 'Saving…' : 'Save labels'}
          </button>
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
