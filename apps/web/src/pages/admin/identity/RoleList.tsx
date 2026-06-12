import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../api/client.js';
import { MessageBanner } from '../../../components/identity/IdentityLayout.js';

interface Role { id: string; name: string; description: string | null; requireMfa: boolean }

const PAGE_SIZE = 8;
const emptyForm = { name: '', description: '', requireMfa: false };

const S = {
  heading: { fontSize: '22px', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.3px' },
  count: { fontSize: '12px', color: '#fb923c', marginLeft: '6px', fontWeight: 600, background: 'rgba(249,115,22,0.15)', padding: '2px 8px', borderRadius: '20px', border: '1px solid rgba(249,115,22,0.3)' },
  btnPrimary: { background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', border: 'none', borderRadius: '10px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' },
  btnOutline: { background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '9px 20px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' },
  card: { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', boxShadow: '0 4px 24px rgba(249,115,22,0.08)', overflow: 'hidden' },
  filterBar: { display: 'flex', gap: '10px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '14px 18px', marginBottom: '16px', alignItems: 'center' },
  input: { background: '#fff8f1', border: '1px solid #e5e7eb', borderRadius: '9px', padding: '9px 13px', fontSize: '13px', color: '#1e293b', outline: 'none', flex: 1, minWidth: '200px' },
  modal: { position: 'fixed' as const, inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' },
  modalBox: { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '18px', padding: '28px', width: '100%', maxWidth: '460px', margin: '0 16px', boxShadow: '0 24px 64px rgba(0,0,0,0.15)' },
  label: { fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' },
  modalInput: { width: '100%', background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#111827', outline: 'none', boxSizing: 'border-box' as const },
  menu: { position: 'fixed' as const, width: '180px', background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)', zIndex: 9999, padding: '6px' },
  menuItem: { display: 'block', width: '100%', textAlign: 'left' as const, padding: '9px 14px', fontSize: '13px', color: '#1a1a1a', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '8px' },
  menuItemRed: { display: 'block', width: '100%', textAlign: 'left' as const, padding: '9px 14px', fontSize: '13px', color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '8px' },
  menuDivider: { height: '1px', background: '#f1f5f9', margin: '4px 0' },
  dotsBtn: { background: 'transparent', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '20px', padding: '4px 8px', borderRadius: '6px', lineHeight: 1 },
  th: { padding: '13px 16px', fontSize: '11px', fontWeight: 700, color: '#111827', textTransform: 'uppercase' as const, letterSpacing: '0.1em', background: '#ffffff', borderBottom: '1px solid #e5e7eb', textAlign: 'left' as const },
  td: { padding: '15px 16px', fontSize: '13px', color: '#1a1a1a', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' as const },
  pageBtn: { padding: '6px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '8px', cursor: 'pointer', border: '1px solid #e5e7eb', background: '#fff', color: '#374151' },
  pageBtnActive: { padding: '6px 12px', fontSize: '12px', fontWeight: 700, borderRadius: '8px', cursor: 'pointer', border: '1.5px solid #f97316', background: '#fff7ed', color: '#f97316' },
};

export function RoleListPage() {
  const navigate = useNavigate();
  const [roles,    setRoles]    = useState<Role[]>([]);
  const [filter,   setFilter]   = useState('');
  const [msg,      setMsg]      = useState('');
  const [error,    setError]    = useState('');
  const [page,     setPage]     = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [form,     setForm]     = useState(emptyForm);
  const [creating,   setCreating]   = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [menuPos,    setMenuPos]    = useState({ top: 0, right: 0 });

  function load() { api<Role[]>('/admin/roles').then(setRoles).catch(e => setError(String(e))); }
  useEffect(() => { load(); }, []);

  const filtered = roles.filter(r =>
    r.name.toLowerCase().includes(filter.toLowerCase()) ||
    (r.description ?? '').toLowerCase().includes(filter.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function createRole(e: React.FormEvent) {
    e.preventDefault(); setCreating(true); setError(''); setMsg('');
    try {
      const created = await api<{ id: string }>('/admin/roles', { method: 'POST', body: JSON.stringify(form) });
      setMsg('Role created. Assign permissions on the edit screen.');
      setForm(emptyForm); setShowCreate(false); load();
      navigate(`/admin/identity/roles/${created.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Create failed'); }
    finally { setCreating(false); }
  }

  async function deleteRole(id: string, name: string) {
    if (!confirm(`Delete role "${name}"?`)) return;
    try { await api(`/admin/roles/${id}`, { method: 'DELETE' }); setMsg(`Role "${name}" deleted.`); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Delete failed'); }
  }

  function PaginationBar() {
    if (totalPages <= 1) return null;
    const pages: number[] = [];
    for (let i = 1; i <= totalPages; i++) if (i === 1 || i === totalPages || Math.abs(i - safePage) <= 1) pages.push(i);
    const out: (number | '…')[] = []; let prev = 0;
    for (const p of pages) { if (prev && p - prev > 1) out.push('…'); out.push(p); prev = p; }
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderTop: '1px solid #f1f5f9', background: '#fff' }}>
        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button style={S.pageBtn} disabled={safePage === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          {out.map((p, i) => p === '…' ? <span key={`e${i}`} style={{ color: '#9ca3af', padding: '0 4px' }}>…</span> : <button key={p} style={safePage === p ? S.pageBtnActive : S.pageBtn} onClick={() => setPage(p as number)}>{p}</button>)}
          <button style={S.pageBtn} disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {msg   && <MessageBanner type="success" text={msg} />}
      {error && <MessageBanner type="error" text={error} />}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div><span style={S.heading}>Roles</span><span style={S.count}>{filtered.length}</span></div>
        <button style={S.btnPrimary} onClick={() => setShowCreate(true)}>+ Create role</button>
      </div>

      <div style={S.filterBar}>
        <input style={S.input} type="search" placeholder="Search roles…" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }} />
      </div>

      <div style={S.card}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={S.th}>Name</th>
              <th style={S.th}>Description</th>
              <th style={S.th}>MFA</th>
              <th style={{ ...S.th, width: '60px' }}></th>
            </tr>
          </thead>
          <tbody>
            {paged.length === 0 && <tr><td colSpan={4} style={{ ...S.td, textAlign: 'center', color: '#9ca3af', padding: '48px' }}>No roles found.</td></tr>}
            {paged.map(r => (
              <tr key={r.id}>
                <td style={{ ...S.td, fontWeight: 600, color: '#111827' }}>{r.name}</td>
                <td style={S.td}>{r.description || <span style={{ color: '#9ca3af' }}>—</span>}</td>
                <td style={S.td}>
                  {r.requireMfa
                    ? <span style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: 600 }}>Required</span>
                    : <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>
                  }
                </td>
                <td style={S.td}>
                  <div style={{ position: 'relative' }}>
                    <button style={S.dotsBtn} onClick={(e) => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      const menuH = 160;
                      const spaceBelow = window.innerHeight - rect.bottom;
                      const top = spaceBelow < menuH ? rect.top - menuH : rect.bottom + 4;
                      setMenuPos({ top, right: window.innerWidth - rect.right });
                      setMenuOpenId(menuOpenId === r.id ? null : r.id);
                    }}>···</button>
                    {menuOpenId === r.id && (
                      <div style={{ ...S.menu, top: menuPos.top, right: menuPos.right }}>
                        <Link to={`/admin/identity/roles/${r.id}`} style={{ ...S.menuItem, display: 'block', textDecoration: 'none' }}>✎ Edit permissions</Link>
                        <div style={S.menuDivider} />
                        <button style={S.menuItemRed} onClick={() => { setMenuOpenId(null); deleteRole(r.id, r.name); }}>🗑 Delete</button>
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

      {showCreate && (
        <div style={S.modal} onClick={() => setShowCreate(false)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <p style={{ fontSize: '17px', fontWeight: 700, color: '#111827' }}>Create role</p>
              <button onClick={() => setShowCreate(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '22px', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <form onSubmit={createRole} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={S.label}>Role name</label>
                <input type="text" style={S.modalInput} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoComplete="off" />
              </div>
              <div>
                <label style={S.label}>Description (optional)</label>
                <input type="text" style={S.modalInput} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} autoComplete="off" />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.requireMfa} onChange={e => setForm({ ...form, requireMfa: e.target.checked })}
                  style={{ accentColor: '#f97316', width: '15px', height: '15px' }} />
                Require MFA for users with this role
              </label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="submit" style={S.btnPrimary} disabled={creating}>{creating ? 'Creating…' : 'Create role'}</button>
                <button type="button" style={S.btnOutline} onClick={() => setShowCreate(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {menuOpenId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setMenuOpenId(null)} />
      )}
    </div>
  );
}
