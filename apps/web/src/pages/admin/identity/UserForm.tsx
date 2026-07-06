import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface GroupOption  { id: string; name: string }
interface SessionRow   { id: string; createdAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null; revokedAt: string | null; lastActivityAt: string | null }
interface LoginHistory { id: string; action: string; createdAt: string; ipAddress: string | null; metadata: Record<string, unknown> }

type Tab = 'profile' | 'access' | 'sessions' | 'history';

const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: 'profile',  label: 'Profile'        },
  { key: 'access',   label: 'Access'         },
  { key: 'sessions', label: 'Sessions'       },
  { key: 'history',  label: 'Login history'  },
];

const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  LOGIN_SUCCESS:  { label: 'Login',         color: '#166534', bg: '#dcfce7' },
  LOGIN_FAILED:   { label: 'Failed login',  color: '#991b1b', bg: '#fee2e2' },
  LOGOUT:         { label: 'Logout',        color: '#374151', bg: '#f1f5f9' },
  FORCE_LOGOUT:   { label: 'Force logout',  color: '#92400e', bg: '#fef3c7' },
  MFA_SUCCESS:    { label: 'MFA verified',  color: '#1e3a5f', bg: '#dbeafe' },
  MFA_FAILED:     { label: 'MFA failed',    color: '#991b1b', bg: '#fee2e2' },
};

export function UserFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [tab,             setTab]           = useState<Tab>('profile');
  const [form,            setForm]          = useState({ email: '', username: '', displayName: '' });
  const [perms,           setPerms]         = useState<{ roles: string[]; permissions: string[]; groups: GroupOption[] } | null>(null);
  // FIX: the Access tab's own panel is gated on `perms` being truthy —
  // previously the fetch that sets it had no .catch() at all, so if that
  // one request ever failed (independent of the Profile fields loading
  // fine, since those two things share the same response but Profile
  // renders unconditionally while Access requires `perms`), the tab
  // rendered completely blank with zero indication anything went wrong.
  // This makes that failure visible instead of silent.
  const [permsError,      setPermsError]     = useState('');
  const [allGroups,       setAllGroups]     = useState<GroupOption[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [sessions,        setSessions]      = useState<SessionRow[]>([]);
  const [history,         setHistory]       = useState<LoginHistory[]>([]);
  const [historyLoaded,   setHistoryLoaded] = useState(false);
  const [msg,             setMsg]           = useState('');
  const [error,           setError]         = useState('');
  const [saving,          setSaving]        = useState(false);

  useEffect(() => {
    if (!id || id === 'new') { navigate('/admin/identity/users', { replace: true }); return; }
    api<GroupOption[]>('/admin/groups').then(setAllGroups).catch(() => undefined);
    api<{ email: string; username: string; displayName: string; roles: string[]; permissions: string[]; groups: GroupOption[] }>(
      `/admin/users/${id}`
    ).then((u) => {
      setForm({ email: u.email, username: u.username, displayName: u.displayName });
      // FIX: defensive fallback to [] — if the backend ever returns this
      // response with roles/permissions/groups missing entirely (rather
      // than empty arrays), `perms` would still end up truthy (it's an
      // object either way) and the panel would render, but then
      // `perms.groups.map(...)` etc. below would throw at render time
      // since undefined has no .map. Coercing to [] here means an
      // incomplete response shows "None" instead of crashing the tab.
      setPerms({ roles: u.roles ?? [], permissions: u.permissions ?? [], groups: u.groups ?? [] });
    }).catch((e) => setPermsError(e instanceof Error ? e.message : 'Failed to load access info'));
    api<SessionRow[]>(`/admin/users/${id}/sessions`).then(setSessions).catch(() => undefined);
  }, [id, navigate]);

  // Lazy load history only when tab is clicked
  useEffect(() => {
    if (tab === 'history' && !historyLoaded && id) {
      api<LoginHistory[]>(`/admin/users/${id}/login-history?limit=100`)
        .then((h) => { setHistory(h); setHistoryLoaded(true); })
        .catch(() => setHistoryLoaded(true));
    }
  }, [tab, historyLoaded, id]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!id) return;
    setError(''); setSaving(true);
    try {
      await api(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify({ email: form.email, displayName: form.displayName }) });
      setMsg('User updated.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function addToGroup() {
    if (!id || !selectedGroupId) return;
    setMsg('');
    try {
      await api(`/admin/users/${id}/groups`, { method: 'POST', body: JSON.stringify({ groupId: selectedGroupId }) });
      setMsg('User added to group. They must sign in again for permissions to apply.');
      const u = await api<{ roles: string[]; permissions: string[]; groups: GroupOption[] }>(`/admin/users/${id}`);
      setPerms({ roles: u.roles, permissions: u.permissions, groups: u.groups });
      setSelectedGroupId('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to add group'); }
  }

  async function forceLogout() {
    if (!id) return;
    await api(`/admin/users/${id}/sessions`, { method: 'DELETE' });
    setMsg('All sessions revoked.'); setSessions([]);
  }

  async function revokeSession(sid: string) {
    await api(`/admin/users/${id}/sessions`, { method: 'DELETE' });
    setSessions(s => s.map(x => x.id === sid ? { ...x, revokedAt: new Date().toISOString() } : x));
    setMsg('Session revoked.');
  }

  const activeSessions  = sessions.filter(s => !s.revokedAt);
  const revokedSessions = sessions.filter(s => s.revokedAt);

  return (
    <IdentityPageLayout title="Edit user" subtitle="Profile, access, sessions and login history" backTo="/admin/identity/users" backLabel="Back to users">
      {error && <MessageBanner type="error"   text={error} />}
      {msg   && <MessageBanner type="success" text={msg}   />}

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #f1f5f9', marginBottom: '24px' }}>
        {TAB_LABELS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', fontSize: '13px', fontWeight: tab === t.key ? 700 : 500,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: tab === t.key ? '#f97316' : '#6b7280',
            borderBottom: tab === t.key ? '2px solid #f97316' : '2px solid transparent',
            marginBottom: '-2px', transition: 'all .12s',
          }}>{t.label}
            {t.key === 'sessions' && activeSessions.length > 0 && (
              <span style={{ marginLeft: '6px', background: '#dcfce7', color: '#166534', borderRadius: '20px', padding: '1px 7px', fontSize: '11px', fontWeight: 700 }}>
                {activeSessions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Profile tab ── */}
      {tab === 'profile' && (
        <form onSubmit={save} className="admin-section">
          <h2 className="admin-section-title">Profile</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Email address" htmlFor="edit-email">
              <input id="edit-email" type="email" className="form-input" value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })} required />
            </FormField>
            <FormField label="Username" htmlFor="edit-username">
              <input id="edit-username" type="text" className="form-input bg-slate-50" value={form.username} readOnly />
            </FormField>
            <FormField label="Display name" htmlFor="edit-display">
              <input id="edit-display" type="text" className="form-input" value={form.displayName}
                onChange={e => setForm({ ...form, displayName: e.target.value })} required />
            </FormField>
          </div>
          <FormActions>
            <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </FormActions>
        </form>
      )}

      {/* ── Access tab ── */}
      {tab === 'access' && (
        <div className="admin-section">
          <h2 className="admin-section-title">Access</h2>
          {/* FIX: three distinct states, all previously collapsed into
              "render nothing" — a slow/failed request and a genuinely
              empty-but-loaded result (a brand-new user with no groups/
              roles yet) used to look identical: a blank panel with no
              explanation either way. */}
          {permsError ? (
            <p className="text-red-600 text-sm">Failed to load access info: {permsError}</p>
          ) : !perms ? (
            <p className="text-slate-400 text-sm">Loading access info…</p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div><p className="form-label">Groups</p><p className="text-slate-800">{perms.groups.map(g => g.name).join(', ') || 'None assigned yet'}</p></div>
                <div><p className="form-label">Roles</p><p className="text-slate-800">{perms.roles.join(', ') || 'None assigned yet'}</p></div>
                <div><p className="form-label">Permissions</p><p className="text-slate-800 break-all">{perms.permissions.join(', ') || 'None — usually inherited from Groups/Roles above'}</p></div>
              </div>
              <div className="flex flex-wrap gap-3 items-end pt-4 border-t border-slate-200 mt-4">
                <FormField label="Add to group" htmlFor="add-group">
                  <select id="add-group" className="form-select min-w-[14rem]" value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}>
                    <option value="">Select a group…</option>
                    {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </FormField>
                <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={addToGroup}>Add to group</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Sessions tab ── */}
      {tab === 'sessions' && (
        <div className="admin-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="admin-section-title" style={{ margin: 0 }}>
              Active sessions <span style={{ fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>({activeSessions.length})</span>
            </h2>
            {activeSessions.length > 0 && (
              <button type="button" onClick={forceLogout}
                style={{ fontSize: '13px', color: '#dc2626', background: 'none', border: '1px solid #fecaca', borderRadius: '8px', padding: '5px 14px', cursor: 'pointer', fontWeight: 600 }}>
                Revoke all
              </button>
            )}
          </div>

          {activeSessions.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '14px', padding: '24px 0' }}>No active sessions.</p>
          ) : (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['IP Address', 'Device / Browser', 'Started', 'Last active', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeSessions.map(s => (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', fontSize: '13px', color: '#374151', fontFamily: 'monospace' }}>{s.ipAddress ?? '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.userAgent ? parseUA(s.userAgent) : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>{new Date(s.createdAt).toLocaleString()}</td>
                      <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>{s.lastActivityAt ? new Date(s.lastActivityAt).toLocaleString() : '—'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <button onClick={() => revokeSession(s.id)}
                          style={{ fontSize: '12px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {revokedSessions.length > 0 && (
            <details style={{ marginTop: '16px' }}>
              <summary style={{ fontSize: '13px', color: '#9ca3af', cursor: 'pointer', marginBottom: '8px' }}>
                {revokedSessions.length} revoked / expired sessions
              </summary>
              <div style={{ border: '1px solid #f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {revokedSessions.slice(0, 10).map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f9fafb', opacity: 0.6 }}>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>{s.ipAddress ?? '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: '#9ca3af' }}>{new Date(s.createdAt).toLocaleString()}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#9ca3af', borderRadius: '20px', padding: '2px 8px' }}>
                            {s.revokedAt ? 'Revoked' : 'Expired'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {/* ── Login history tab ── */}
      {tab === 'history' && (
        <div className="admin-section">
          <h2 className="admin-section-title">Login history <span style={{ fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>(last 100 events)</span></h2>

          {!historyLoaded ? (
            <p style={{ color: '#9ca3af', padding: '24px 0' }}>Loading…</p>
          ) : history.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: '14px', padding: '24px 0' }}>No login history found.</p>
          ) : (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    {['Event', 'Date & time', 'IP address', 'Details'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => {
                    const ev = ACTION_LABELS[h.action] ?? { label: h.action, color: '#374151', bg: '#f1f5f9' };
                    return (
                      <tr key={h.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ background: ev.bg, color: ev.color, borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {ev.label}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' }}>
                          {new Date(h.createdAt).toLocaleString()}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>
                          {h.ipAddress ?? '—'}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '12px', color: '#9ca3af' }}>
                          {Object.keys(h.metadata ?? {}).length > 0
                            ? JSON.stringify(h.metadata).slice(0, 80)
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </IdentityPageLayout>
  );
}

/** Parse user agent string into readable browser/OS */
function parseUA(ua: string): string {
  if (!ua) return '—';
  if (ua.includes('Chrome'))  return 'Chrome' + (ua.includes('Windows') ? ' · Windows' : ua.includes('Mac') ? ' · Mac' : '');
  if (ua.includes('Firefox')) return 'Firefox' + (ua.includes('Windows') ? ' · Windows' : '');
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari · Mac/iOS';
  if (ua.includes('Edge'))    return 'Edge';
  return ua.slice(0, 40);
}
