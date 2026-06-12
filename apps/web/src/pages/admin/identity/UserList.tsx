import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import { AdminAccessBanner } from '../../../components/AdminAccessBanner.js';
import { IdentityPageLayout, MessageBanner } from '../../../components/identity/IdentityLayout.js';

interface UserRow {
  id: string; email: string; displayName: string;
  isActive: boolean; lastLoginAt: string | null; createdAt: string;
  deactivateAt?: string | null; deletedAt?: string | null;
  roles?: string[]; groups?: { id: string; name: string }[];
}
interface RoleRow  { id: string; name: string }
interface GroupRow { id: string; name: string }
interface ImportResult { imported: number; skipped: number; errors: string[]; skippedEmails: string[] }

const emptyCreate = { email: '', username: '', displayName: '', password: '' };
const CSV_TPL = `email,username,displayName,password,groupName\njohn@co.com,john,John Doe,Welcome@1,Team A\n`;
const PAGE_SIZE = 10;

const S = {
  heading: { fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.3px' },
  count: { fontSize: '12px', color: '#fb923c', marginLeft: '6px', fontWeight: 600, background: 'rgba(249,115,22,0.15)', padding: '2px 8px', borderRadius: '20px', border: '1px solid rgba(249,115,22,0.3)' },
  btnPrimary: { background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' },
  btnOutline: { background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  btnGhost: { background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' },
  filterBar: { display: 'flex', gap: '10px', flexWrap: 'wrap' as const, background: '#ffffff', border: '1px solid #e5e7eb', boxShadow: '0 1px 8px rgba(249,115,22,0.08)', borderRadius: '14px', padding: '14px 18px', marginBottom: '16px', alignItems: 'center' },
  input: { background: '#fff8f1', border: '1px solid #e5e7eb', borderRadius: '9px', padding: '9px 13px', fontSize: '13px', color: '#1e293b', outline: 'none', width: '210px' },
  select: { background: '#fff8f1', border: '1px solid #e5e7eb', borderRadius: '9px', padding: '9px 13px', fontSize: '13px', color: '#1e293b', outline: 'none', cursor: 'pointer', minWidth: '155px' },
  table: { width: '100%', borderCollapse: 'collapse' as const, background: 'transparent' },
  th: { padding: '13px 16px', fontSize: '11px', fontWeight: 700, color: '#111827', textTransform: 'uppercase' as const, letterSpacing: '0.1em', background: '#ffffff', borderBottom: '1px solid #e5e7eb', textAlign: 'left' as const },
  td: { padding: '15px 16px', fontSize: '13px', color: '#1a1a1a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' as const },
  tdName: { padding: '15px 16px', fontSize: '14px', fontWeight: 600, color: '#000000', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' as const },
  badgeActive: { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 600 },
  badgeInactive: { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 600 },
  badgeDeleted: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: 600 },
  badgeScheduled: { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: '20px', padding: '2px 8px', fontSize: '10px', fontWeight: 500, marginTop: '4px' },
  dotsBtn: { background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '20px', padding: '4px 8px', borderRadius: '6px', lineHeight: 1 },
  menu: { position: 'fixed' as const, width: '210px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 9999, padding: '6px' },
  menuItem: { display: 'block', width: '100%', textAlign: 'left' as const, padding: '9px 14px', fontSize: '13px', color: '#374151', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '8px' },
  menuItemRed: { display: 'block', width: '100%', textAlign: 'left' as const, padding: '9px 14px', fontSize: '13px', color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '8px' },
  menuItemGreen: { display: 'block', width: '100%', textAlign: 'left' as const, padding: '9px 14px', fontSize: '13px', color: '#16a34a', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '8px' },
  menuDivider: { height: '1px', background: '#f1f5f9', margin: '4px 0' },
  modal: { position: 'fixed' as const, inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' },
  modalBox: { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '18px', padding: '28px 28px 24px', width: '100%', maxWidth: '500px', margin: '0 16px', boxShadow: '0 24px 64px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' as const, maxHeight: '85vh', overflowY: 'auto' as const },
  modalTitle: { fontSize: '17px', fontWeight: 700, color: '#111827', marginBottom: '6px' },
  modalSub: { fontSize: '13px', color: '#6b7280', marginBottom: '20px' },
  label: { fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' },
  modalInput: { width: '100%', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#111827', outline: 'none', boxSizing: 'border-box' as const },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' },
  bulkBtn: { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(249,115,22,0.1)', color: '#ea580c', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' },
  checkbox: { accentColor: '#f97316', width: '15px', height: '15px', cursor: 'pointer' },
  rowSelected: { background: '#fff7ed' },
  emptyRow: { textAlign: 'center' as const, color: '#9ca3af', padding: '48px', fontSize: '14px' },
  pageBtn: { padding: '6px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '8px', cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151' },
  pageBtnActive: { padding: '6px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '8px', cursor: 'pointer', border: '1.5px solid #f97316', background: '#fff7ed', color: '#f97316' },
};

export function AdminIdentityPage() {
  const [users,  setUsers]  = useState<UserRow[]>([]);
  const [roles,  setRoles]  = useState<RoleRow[]>([]);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]  = useState('');
  const [msg,     setMsg]    = useState('');

  const [search,       setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRole,   setFilterRole]   = useState('');
  const [filterGroup,  setFilterGroup]  = useState('');
  const [page,         setPage]         = useState(1);

  const [selected,    setSelected]    = useState<Set<string>>(new Set());
  const [showCreate,  setShowCreate]  = useState(false);
  const [showImport,  setShowImport]  = useState(false);
  const [createForm,  setCreateForm]  = useState(emptyCreate);
  const [creating,    setCreating]    = useState(false);
  const [importResult,setImportResult]= useState<ImportResult | null>(null);
  const [importing,   setImporting]   = useState(false);

  const [menuOpenId,   setMenuOpenId]  = useState<string | null>(null);
  const [menuPos,      setMenuPos]      = useState({ top: 0, right: 0 });
  const [bulkMenuOpen, setBulkMenuOpen]= useState(false);

  // Modals
  const [scheduleUserId,   setScheduleUserId]   = useState<string | null>(null);
  const [scheduleDate,     setScheduleDate]     = useState('');
  const [scheduling,       setScheduling]       = useState(false);
  const [deleteUserId,     setDeleteUserId]     = useState<string | null>(null);
  const [deleteConfirm,    setDeleteConfirm]    = useState('');
  const [deleting,         setDeleting]         = useState(false);

  // Bulk assign modal
  const [showBulkAssign,   setShowBulkAssign]   = useState(false);
  const [showAdminSessions, setShowAdminSessions] = useState(false);
  const [sessionMenuId,    setSessionMenuId]    = useState<string | null>(null);
  const [sessionMenuPos,   setSessionMenuPos]   = useState({ top: 0, right: 0 });
  const [adminSessions,     setAdminSessions]     = useState<{userId:string;displayName:string;email:string;isActive:boolean;sessionCount:number;deactivateAt?:string|null}[]>([]);
  const [assignType,       setAssignType]       = useState<'role'|'group'>('role');
  const [assignTargetId,   setAssignTargetId]   = useState('');
  const [assigning,        setAssigning]        = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [u, r, g] = await Promise.all([
        api<UserRow[]>('/admin/users'),
        api<RoleRow[]>('/admin/roles'),
        api<GroupRow[]>('/admin/groups'),
      ]);
      // Filter out GDPR deleted users from display
      const visible = u.filter(usr => !usr.deletedAt);
      setRoles(r); setGroups(g);
      setUsers(visible);
      // Enrich with roles+groups in background
      const enriched = await Promise.all(
        visible.map(async (usr) => {
          try {
            const d = await api<{ roles: string[]; groups: { id: string; name: string }[] }>(`/admin/users/${usr.id}`);
            return { ...usr, roles: d.roles, groups: d.groups };
          } catch { return usr; }
        })
      );
      setUsers(enriched);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  // Check if current user is admin
  const isCurrentUserAdmin = () => {
    const u = users.find(u => u.email && u.roles?.includes('System Administrator'));
    return true; // shown only to admin via permission guard
  };

  async function loadAdminSessions() {
    try {
      const all = await api<UserRow[]>('/admin/users');
      const withSessions = await Promise.all(
        all.filter(u => !u.deletedAt).map(async (u) => {
          try {
            const sessions = await api<{id:string;revokedAt:string|null}[]>(`/admin/users/${u.id}/sessions`);
            const active = sessions.filter(s => !s.revokedAt).length;
            return { userId: u.id, displayName: u.displayName, email: u.email, isActive: u.isActive, sessionCount: active, deactivateAt: u.deactivateAt };
          } catch { return { userId: u.id, displayName: u.displayName, email: u.email, isActive: u.isActive, sessionCount: 0, deactivateAt: null }; }
        })
      );
      setAdminSessions(withSessions as any);
    } catch { }
  }

  useEffect(() => { loadAll(); }, []);

  if (!loading && error.toLowerCase().includes('forbidden')) {
    return <IdentityPageLayout title="Users" subtitle=""><AdminAccessBanner /></IdentityPageLayout>;
  }

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    if (q && !u.email.toLowerCase().includes(q) && !u.displayName.toLowerCase().includes(q)) return false;
    if (filterStatus === 'active'   && !u.isActive) return false;
    if (filterStatus === 'inactive' &&  u.isActive) return false;
    if (filterRole  && !u.roles?.includes(roles.find(r => r.id === filterRole)?.name ?? '_')) return false;
    if (filterGroup && !u.groups?.some(g => g.id === filterGroup)) return false;
    return true;
  });

  // ── Pagination ───────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleOne(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(s => s.size === paged.length ? new Set() : new Set(paged.map(u => u.id)));
  }

  // ── Create user ──────────────────────────────────────────────────────────────
  async function createUser(e: React.FormEvent) {
    e.preventDefault(); setCreating(true); setError(''); setMsg('');
    try {
      await api('/admin/users', { method: 'POST', body: JSON.stringify(createForm) });
      setCreateForm(emptyCreate); setMsg('User created.'); setShowCreate(false); loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : 'Create failed'); }
    finally { setCreating(false); }
  }

  // ── Import ───────────────────────────────────────────────────────────────────
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); setError(''); setMsg(''); setImportResult(null);
    try {
      const csv = await file.text();
      const r = await api<ImportResult>('/admin/users/import-csv', { method: 'POST', body: JSON.stringify({ csv }) });
      setImportResult(r); loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed'); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  function downloadTemplate() {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([CSV_TPL], { type: 'text/csv' }));
    a.download = 'user-import-template.csv'; a.click();
  }

  // ── Single actions ───────────────────────────────────────────────────────────
  async function deactivate(id: string) {
    if (!confirm('Deactivate this user?')) return;
    await api(`/admin/users/${id}`, { method: 'DELETE' });
    setMsg('User deactivated.'); loadAll();
  }
  async function reactivate(id: string, name: string) {
    await api(`/admin/users/${id}/reactivate`, { method: 'POST' });
    setMsg(`${name} reactivated.`); loadAll();
  }
  async function resetPassword(id: string, email: string) {
    const r = await api<{ ok: boolean; resetUrl?: string }>(`/admin/users/${id}/force-password-reset`, { method: 'POST' });
    setMsg(`Reset email sent to ${email}.${r.resetUrl ? ' Dev: ' + r.resetUrl : ''}`);
  }
  async function forceLogout(id: string, name: string) {
    await api(`/admin/users/${id}/force-logout`, { method: 'POST' });
    setMsg(`Sessions revoked for ${name}.`);
  }
  async function confirmSchedule(e: React.FormEvent) {
    e.preventDefault(); if (!scheduleUserId || !scheduleDate) return;
    setScheduling(true); setError('');
    try {
      const r = await api<{ message: string }>(`/admin/users/${scheduleUserId}/schedule-deactivation`, {
        method: 'POST', body: JSON.stringify({ deactivateAt: new Date(scheduleDate).toISOString() }),
      });
      setMsg(r.message); setScheduleUserId(null); setScheduleDate(''); loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setScheduling(false); }
  }
  async function cancelSchedule(id: string) {
    await api(`/admin/users/${id}/schedule-deactivation`, { method: 'DELETE' });
    setMsg('Schedule cancelled.'); loadAll();
  }
  async function confirmDelete(e: React.FormEvent) {
    e.preventDefault(); if (!deleteUserId || deleteConfirm !== 'DELETE') return;
    setDeleting(true); setError('');
    try {
      const r = await api<{ message: string }>(`/admin/users/${deleteUserId}/gdpr-delete`, { method: 'POST' });
      setMsg(r.message); setDeleteUserId(null); setDeleteConfirm(''); loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : 'Delete failed'); }
    finally { setDeleting(false); }
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────────
  async function bulkDeactivate() {
    setBulkMenuOpen(false);
    if (!confirm(`Deactivate ${selected.size} user(s)?`)) return;
    await Promise.all([...selected].map(id => api(`/admin/users/${id}`, { method: 'DELETE' }).catch(() => {})));
    setMsg(`${selected.size} deactivated.`); setSelected(new Set()); loadAll();
  }
  async function bulkForceLogout() {
    setBulkMenuOpen(false);
    await Promise.all([...selected].map(id => api(`/admin/users/${id}/force-logout`, { method: 'POST' }).catch(() => {})));
    setMsg(`Sessions revoked for ${selected.size}.`); setSelected(new Set());
  }
  async function bulkReactivate() {
    setBulkMenuOpen(false);
    await Promise.all([...selected].map(id => api(`/admin/users/${id}/reactivate`, { method: 'POST' }).catch(() => {})));
    setMsg(`${selected.size} reactivated.`); setSelected(new Set()); loadAll();
  }

  // ── Bulk assign role / group ──────────────────────────────────────────────────
  async function confirmBulkAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignTargetId || selected.size === 0) return;
    setAssigning(true); setError('');
    try {
      if (assignType === 'group') {
        await Promise.all([...selected].map(userId =>
          api(`/admin/groups/${assignTargetId}/members`, { method: 'POST', body: JSON.stringify({ userId }) }).catch(() => {})
        ));
        const gname = groups.find(g => g.id === assignTargetId)?.name ?? '';
        setMsg(`${selected.size} user(s) added to group "${gname}". Their sessions will refresh on next login.`);
      } else {
        await Promise.all([...selected].map(userId =>
          api(`/admin/users/${userId}/roles`, { method: 'POST', body: JSON.stringify({ roleId: assignTargetId }) }).catch(() => {})
        ));
        const rname = roles.find(r => r.id === assignTargetId)?.name ?? '';
        setMsg(`Role "${rname}" assigned to ${selected.size} user(s). Sessions updated.`);
      }
      setShowBulkAssign(false); setAssignTargetId(''); setSelected(new Set()); loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : 'Assign failed'); }
    finally { setAssigning(false); }
  }

  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  // ── Pagination controls ───────────────────────────────────────────────────────
  function PaginationBar() {
    if (totalPages <= 1) return null;
    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - safePage) <= 2) pages.push(i);
    }
    const withEllipsis: (number|'…')[] = [];
    let prev = 0;
    for (const p of pages) {
      if (prev && p - prev > 1) withEllipsis.push('…');
      withEllipsis.push(p); prev = p;
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderTop: '1px solid #f1f5f9', background: '#fff' }}>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>
          Showing {(safePage-1)*PAGE_SIZE+1}–{Math.min(safePage*PAGE_SIZE, filtered.length)} of {filtered.length} users
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button style={S.pageBtn} disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p-1))}>← Prev</button>
          {withEllipsis.map((p, i) =>
            p === '…'
              ? <span key={`e${i}`} style={{ color: '#9ca3af', padding: '0 4px' }}>…</span>
              : <button key={p} style={safePage === p ? S.pageBtnActive : S.pageBtn} onClick={() => setPage(p as number)}>{p}</button>
          )}
          <button style={S.pageBtn} disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p+1))}>Next →</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {msg   && <MessageBanner type="success" text={msg} />}
      {error && <MessageBanner type="error"   text={error} />}

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <span style={S.heading}>Users</span>
          <span style={S.count}>{filtered.length}</span>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={S.btnOutline} onClick={() => { setShowImport(true); setShowCreate(false); }}>↑ Bulk import</button>
          <button style={{ ...S.btnOutline, background: '#fff', color: '#111827', borderColor: '#e5e7eb' }} onClick={() => { loadAdminSessions(); setShowAdminSessions(true); }}>🔐 Admin sessions</button>
          <button style={S.btnPrimary} onClick={() => { setShowCreate(true); setShowImport(false); }}>+ Create user</button>
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={S.filterBar}>
        <input style={S.input} type="search" placeholder="Search name or email…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        <select style={S.select} value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <select style={S.select} value={filterRole} onChange={e => { setFilterRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select style={S.select} value={filterGroup} onChange={e => { setFilterGroup(e.target.value); setPage(1); }}>
          <option value="">All groups</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>

        {selected.size > 0 && (
          <div style={{ position: 'relative', marginLeft: 'auto' }}>
            <button style={S.bulkBtn} onClick={() => setBulkMenuOpen(v => !v)}>
              <span>{selected.size} selected</span><span style={{ fontSize: '20px', lineHeight: 1 }}>···</span>
            </button>
            {bulkMenuOpen && (
              <div style={S.menu}>
                <button style={{ ...S.menuItem, color: '#f97316', fontWeight: 600 }} onClick={() => { setBulkMenuOpen(false); setAssignType('role'); setAssignTargetId(''); setShowBulkAssign(true); }}>
                  👤 Assign role
                </button>
                <button style={{ ...S.menuItem, color: '#7c3aed', fontWeight: 600 }} onClick={() => { setBulkMenuOpen(false); setAssignType('group'); setAssignTargetId(''); setShowBulkAssign(true); }}>
                  🗂 Add to group
                </button>
                <div style={S.menuDivider} />
                <button style={S.menuItemGreen} onClick={bulkReactivate}>↑ Reactivate</button>
                <button style={S.menuItem} onClick={bulkForceLogout}>⊘ Force logout</button>
                <div style={S.menuDivider} />
                <button style={S.menuItemRed} onClick={bulkDeactivate}>✕ Deactivate</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Table card ── */}
      <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #e5e7eb', background: '#ffffff', boxShadow: '0 4px 24px rgba(249,115,22,0.08)' }}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={{ ...S.th, width: '44px' }}>
                <input type="checkbox" style={S.checkbox}
                  checked={paged.length > 0 && selected.size === paged.length}
                  onChange={toggleAll} />
              </th>
              <th style={S.th}>Name</th>
              <th style={S.th}>Email</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Last login</th>
              <th style={{ ...S.th, width: '48px' }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={S.emptyRow}>Loading users…</td></tr>}
            {!loading && paged.length === 0 && <tr><td colSpan={6} style={S.emptyRow}>No users found.</td></tr>}
            {paged.map(u => (
              <tr key={u.id} style={selected.has(u.id) ? S.rowSelected : {}}>
                <td style={{ ...S.td, width: '44px' }}>
                  <input type="checkbox" style={S.checkbox} checked={selected.has(u.id)} onChange={() => toggleOne(u.id)} />
                </td>
                <td style={S.tdName}>{u.displayName}</td>
                <td style={S.td}>{u.email}</td>
                <td style={S.td}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                    <span style={u.isActive ? S.badgeActive : S.badgeInactive}>{u.isActive ? 'Active' : 'Inactive'}</span>
                    {u.deactivateAt && u.isActive && (
                      <span style={S.badgeScheduled}>Deactivates {new Date(u.deactivateAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </td>
                <td style={{ ...S.td, color: '#6b7280', fontSize: '12px' }}>
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'}
                </td>
                <td style={{ ...S.td, position: 'relative' }}>
                  <div style={{ position: 'relative' }}>
                    <button style={S.dotsBtn} onClick={(e) => {
                        const rect = (e.target as HTMLElement).getBoundingClientRect();
                        const menuH = 280;
                        const spaceBelow = window.innerHeight - rect.bottom;
                        const top = spaceBelow < menuH ? rect.top - menuH : rect.bottom + 4;
                        setMenuPos({ top, right: window.innerWidth - rect.right });
                        setMenuOpenId(menuOpenId === u.id ? null : u.id);
                      }}>···</button>
                    {menuOpenId === u.id && (
                      <div style={{ ...S.menu, top: menuPos.top, right: menuPos.right }}>
                        <Link to={`/admin/identity/users/${u.id}`} style={{ ...S.menuItem, display: 'block', textDecoration: 'none' }}>✎ Edit</Link>
                        {u.isActive ? (
                          <>
                            <button style={S.menuItem} onClick={() => { setMenuOpenId(null); resetPassword(u.id, u.email); }}>↺ Reset password</button>
                            <button style={S.menuItem} onClick={() => { setMenuOpenId(null); forceLogout(u.id, u.displayName); }}>⊘ Force logout</button>
                            {u.deactivateAt
                              ? <button style={{ ...S.menuItem, color: '#f59e0b' }} onClick={() => { setMenuOpenId(null); cancelSchedule(u.id); }}>✕ Cancel schedule</button>
                              : <button style={S.menuItem} onClick={() => { setMenuOpenId(null); setScheduleUserId(u.id); setScheduleDate(''); }}>⏱ Schedule deactivation</button>
                            }
                            <div style={S.menuDivider} />
                            <button style={S.menuItemRed} onClick={() => { setMenuOpenId(null); deactivate(u.id); }}>✕ Deactivate now</button>
                          </>
                        ) : (
                          <>
                            <button style={S.menuItemGreen} onClick={() => { setMenuOpenId(null); reactivate(u.id, u.displayName); }}>↑ Reactivate</button>
                            <div style={S.menuDivider} />
                            <button style={S.menuItemRed} onClick={() => { setMenuOpenId(null); setDeleteUserId(u.id); setDeleteConfirm(''); }}>🗑 Delete user</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationBar />
      </div>

      {/* ── Create modal ── */}
      {showCreate && (
        <div style={S.modal} onClick={() => setShowCreate(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <p style={S.modalTitle}>Create new user</p>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <form onSubmit={createUser}>
              <div style={S.grid2}>
                {([['Email address','email','email'],['Username','username','text'],['Display name','displayName','text'],['Password','password','password']] as [string,string,string][]).map(([lbl,key,type]) => (
                  <div key={key}>
                    <label style={S.label}>{lbl}</label>
                    <input type={type} style={S.modalInput} required autoComplete="off"
                      value={(createForm as any)[key]}
                      onChange={e => setCreateForm({ ...createForm, [key]: e.target.value })} />
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px' }}>Min 10 chars · uppercase · number · special char</p>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" style={S.btnPrimary} disabled={creating}>{creating ? 'Creating…' : 'Create user'}</button>
                <button type="button" style={S.btnOutline} onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Import modal ── */}
      {showImport && (
        <div style={S.modal} onClick={() => setShowImport(false)}>
          <div style={{ ...S.modalBox, maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <p style={S.modalTitle}>Bulk import users</p>
              <button onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ background: '#fff8f1', borderRadius: '10px', border: '1px solid #fed7aa', padding: '14px', marginBottom: '16px' }}>
              <p style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>Format: email, username, displayName, password, groupName</p>
              <p style={{ fontSize: '12px', color: '#6b7280' }}>Existing emails are skipped. groupName is optional.</p>
              <button type="button" onClick={downloadTemplate} style={{ fontSize: '12px', color: '#ea580c', background: 'none', border: 'none', cursor: 'pointer', marginTop: '8px', padding: 0 }}>↓ Download CSV template</button>
            </div>
            <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} disabled={importing} style={{ fontSize: '13px', color: '#374151', display: 'block', marginBottom: '12px' }} />
            {importing && <p style={{ color: '#6b7280', fontSize: '13px' }}>Importing…</p>}
            {importResult && (
              <div style={{ background: importResult.errors.length > 0 ? '#fef9c3' : '#f0fdf4', borderRadius: '10px', border: `1px solid ${importResult.errors.length > 0 ? '#fde68a' : '#bbf7d0'}`, padding: '12px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginBottom: '6px' }}>✓ Imported: {importResult.imported} · Skipped: {importResult.skipped}</p>
                {importResult.skippedEmails?.map((e,i) => <p key={i} style={{ fontSize: '12px', color: '#92400e' }}>• {e} (exists)</p>)}
                {importResult.errors.map((e,i) => <p key={i} style={{ fontSize: '12px', color: '#dc2626' }}>• {e}</p>)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bulk assign role / group modal ── */}
      {showBulkAssign && (
        <div style={S.modal}>
          <div style={{ ...S.modalBox, maxWidth: '420px' }}>
            <p style={S.modalTitle}>{assignType === 'role' ? '👤 Assign role to users' : '🗂 Add users to group'}</p>
            <p style={S.modalSub}>
              {selected.size} user(s) selected. After assigning, their sessions will be refreshed automatically.
            </p>
            <form onSubmit={confirmBulkAssign}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <button type="button"
                  style={{ ...S.btnOutline, flex: 1, background: assignType === 'role' ? '#fff7ed' : '#fff', borderColor: assignType === 'role' ? '#f97316' : '#e5e7eb', color: assignType === 'role' ? '#f97316' : '#374151', fontWeight: assignType === 'role' ? 700 : 500 }}
                  onClick={() => { setAssignType('role'); setAssignTargetId(''); }}>
                  Role
                </button>
                <button type="button"
                  style={{ ...S.btnOutline, flex: 1, background: assignType === 'group' ? '#f5f3ff' : '#fff', borderColor: assignType === 'group' ? '#7c3aed' : '#e5e7eb', color: assignType === 'group' ? '#7c3aed' : '#374151', fontWeight: assignType === 'group' ? 700 : 500 }}
                  onClick={() => { setAssignType('group'); setAssignTargetId(''); }}>
                  Group
                </button>
              </div>
              <label style={S.label}>{assignType === 'role' ? 'Select role' : 'Select group'}</label>
              <select style={{ ...S.modalInput, cursor: 'pointer' }} value={assignTargetId} onChange={e => setAssignTargetId(e.target.value)} required>
                <option value="">— choose —</option>
                {assignType === 'role'
                  ? roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)
                  : groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)
                }
              </select>

              {/* Selected users preview */}
              <div style={{ marginTop: '14px', maxHeight: '100px', overflowY: 'auto', background: '#f9fafb', borderRadius: '8px', padding: '8px 12px' }}>
                {[...selected].map(id => {
                  const u = users.find(u => u.id === id);
                  return u ? <p key={id} style={{ fontSize: '12px', color: '#374151', padding: '2px 0' }}>• {u.displayName} ({u.email})</p> : null;
                })}
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" style={S.btnPrimary} disabled={assigning || !assignTargetId}>
                  {assigning ? 'Assigning…' : `Assign to ${selected.size} user(s)`}
                </button>
                <button type="button" style={S.btnOutline} onClick={() => setShowBulkAssign(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Schedule modal ── */}
      {scheduleUserId && (
        <div style={S.modal}>
          <div style={{ ...S.modalBox, maxWidth: '380px' }}>
            <p style={S.modalTitle}>Schedule deactivation</p>
            <p style={S.modalSub}>User will be auto-deactivated and all sessions revoked on this date.</p>
            <form onSubmit={confirmSchedule}>
              <label style={S.label}>Deactivation date</label>
              <input type="date" style={S.modalInput} value={scheduleDate} min={minDate} onChange={e => setScheduleDate(e.target.value)} required />
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" style={S.btnPrimary} disabled={scheduling}>{scheduling ? 'Saving…' : 'Confirm'}</button>
                <button type="button" style={S.btnOutline} onClick={() => setScheduleUserId(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── GDPR Delete modal ── */}
      {deleteUserId && (
        <div style={S.modal}>
          <div style={{ ...S.modalBox, maxWidth: '380px' }}>
            <p style={{ ...S.modalTitle, color: '#dc2626' }}>Delete user</p>
            <p style={{ ...S.modalSub, marginBottom: '4px' }}>Permanently anonymises all personal data.</p>
            <p style={{ fontSize: '13px', color: '#dc2626', fontWeight: 600, marginBottom: '20px' }}>This cannot be undone.</p>
            <form onSubmit={confirmDelete}>
              <label style={S.label}>Type DELETE to confirm</label>
              <input type="text" style={S.modalInput} value={deleteConfirm} placeholder="DELETE"
                onChange={e => setDeleteConfirm(e.target.value.toUpperCase())} required />
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button type="submit" disabled={deleting || deleteConfirm !== 'DELETE'}
                  style={{ ...S.btnPrimary, background: deleteConfirm === 'DELETE' ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'rgba(239,68,68,0.3)', boxShadow: 'none' }}>
                  {deleting ? 'Deleting…' : 'Delete permanently'}
                </button>
                <button type="button" style={S.btnOutline} onClick={() => setDeleteUserId(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sessionMenuId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setSessionMenuId(null)} />
      )}
      {(menuOpenId || bulkMenuOpen) && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          onClick={() => { setMenuOpenId(null); setBulkMenuOpen(false); }} />
      )}

      {/* ── Admin sessions modal ── */}
      {showAdminSessions && (
        <div style={S.modal}>
          <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '18px', width: '100%', maxWidth: '600px', margin: '0 16px', boxShadow: '0 24px 64px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
            {/* Sticky header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
              <div>
                <p style={{ fontSize: '17px', fontWeight: 700, color: '#111827', marginBottom: '2px' }}>🔐 All user sessions</p>
                <p style={{ fontSize: '12px', color: '#6b7280' }}>All users · status · active session count</p>
              </div>
              <button onClick={() => setShowAdminSessions(false)}
                style={{ background: '#f1f5f9', border: 'none', color: '#374151', fontSize: '18px', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                ×
              </button>
            </div>
            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px' }}>
              {adminSessions.length === 0
                ? <p style={{ color: '#9ca3af', textAlign: 'center', padding: '24px' }}>No sessions found.</p>
                : (
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ ...S.th, fontSize: '11px' }}>User</th>
                          <th style={{ ...S.th, fontSize: '11px' }}>Email</th>
                          <th style={{ ...S.th, fontSize: '11px', textAlign: 'center' as const }}>Status</th>
                          <th style={{ ...S.th, fontSize: '11px', textAlign: 'center' as const }}>Sessions</th>
                          <th style={{ ...S.th, fontSize: '11px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminSessions.map(a => (
                          <tr key={a.userId}>
                            <td style={{ ...S.td, fontWeight: 600, color: '#000000' }}>{a.displayName}</td>
                            <td style={{ ...S.td, fontSize: '12px', color: '#374151' }}>{a.email}</td>
                            <td style={{ ...S.td, textAlign: 'center' as const }}>
                              <span style={{ background: a.isActive ? '#dcfce7' : '#f1f5f9', color: a.isActive ? '#166534' : '#64748b', borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: 600 }}>
                                {a.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td style={{ ...S.td, textAlign: 'center' as const }}>
                              <span style={{ background: a.sessionCount > 0 ? '#dcfce7' : '#f1f5f9', color: a.sessionCount > 0 ? '#166534' : '#64748b', borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>
                                {a.sessionCount}
                              </span>
                            </td>
                            <td style={{ ...S.td, position: 'relative' }}>
                              <button style={{ ...S.dotsBtn, fontSize: '18px' }} onClick={(e) => {
                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                const menuH = 240;
                                const spaceBelow = window.innerHeight - rect.bottom;
                                const top = spaceBelow < menuH ? rect.top - menuH : rect.bottom + 4;
                                setSessionMenuPos({ top, right: window.innerWidth - rect.right });
                                setSessionMenuId(sessionMenuId === a.userId ? null : a.userId);
                              }}>···</button>
                              {sessionMenuId === a.userId && (
                                <div style={{ ...S.menu, top: sessionMenuPos.top, right: sessionMenuPos.right }}>
                                  <button style={S.menuItem} onClick={() => { setSessionMenuId(null); resetPassword(a.userId, a.email); }}>↺ Reset password</button>
                                  {a.sessionCount > 0 && (
                                    <button style={S.menuItem} onClick={async () => {
                                      setSessionMenuId(null);
                                      await api(`/admin/users/${a.userId}/force-logout`, { method: 'POST' });
                                      setMsg(`Sessions revoked for ${a.displayName}.`);
                                      loadAdminSessions();
                                    }}>⊘ Force logout</button>
                                  )}
                                  {a.deactivateAt && a.isActive && (
                                    <button style={{ ...S.menuItem, color: '#f59e0b' }} onClick={() => { setSessionMenuId(null); cancelSchedule(a.userId); }}>✕ Cancel schedule</button>
                                  )}
                                  {!a.deactivateAt && a.isActive && (
                                    <button style={S.menuItem} onClick={() => { setSessionMenuId(null); setScheduleUserId(a.userId); setScheduleDate(''); }}>⏱ Schedule deactivation</button>
                                  )}
                                  <div style={S.menuDivider} />
                                  {a.isActive
                                    ? <button style={S.menuItemRed} onClick={() => { setSessionMenuId(null); deactivate(a.userId); }}>✕ Deactivate</button>
                                    : <button style={S.menuItemGreen} onClick={() => { setSessionMenuId(null); reactivate(a.userId, a.displayName); loadAdminSessions(); }}>↑ Reactivate</button>
                                  }
                                  {!a.isActive && (
                                    <>
                                      <div style={S.menuDivider} />
                                      <button style={S.menuItemRed} onClick={() => { setSessionMenuId(null); setDeleteUserId(a.userId); setDeleteConfirm(''); }}>🗑 Delete user</button>
                                    </>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
            {/* Sticky footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid #f1f5f9', flexShrink: 0 }}>
              <button style={S.btnOutline} onClick={() => setShowAdminSessions(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
