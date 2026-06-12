import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { usePagination } from '../../hooks/usePagination.js';
import { Pagination } from '../../components/Pagination.js';

interface LabourRecord {
  id: string;
  userId: string;
  craftId: string | null;
  craftCode: string | null;
  craftDescription: string | null;
  regularRate: string | null;
  overtimeRate: string | null;
  certifications: string[];
  shiftCode: string | null;
  calendarCode: string | null;
  isActive: boolean;
  userName: string | null;
  userEmail: string | null;
}
interface Crew {
  id: string;
  crewNum: string;
  name: string;
  siteId: string | null;
  leadUserId: string | null;
  isActive: boolean;
  members?: CrewMember[];
}
interface CrewMember {
  id: string;
  userId: string;
  role: string;
  isPrimary: boolean;
  userName: string | null;
  userEmail: string | null;
}
interface Craft { id: string; craftCode: string; description: string | null; }
interface User { id: string; displayName: string | null; email: string; }
interface UtilRow {
  userId: string;
  userName: string | null;
  craft: string;
  regularHours: string;
  overtimeHours: string;
  totalCost: string;
  workOrderCount: number;
}

type View = 'records' | 'crews' | 'utilisation';

// ── Combobox ──────────────────────────────────────────────────────────────────
function Combobox<T extends { id: string }>({
  items, value, onChange, getLabel, placeholder,
}: {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  getLabel: (item: T) => string;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = items.find((i) => i.id === value);
  const display = selected ? getLabel(selected) : '';
  const filtered = query.trim()
    ? items.filter((i) => getLabel(i).toLowerCase().includes(query.toLowerCase()))
    : items;
  const { paged } = usePagination(filtered, 10);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        className="form-input"
        placeholder={placeholder}
        value={open ? query : display}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && (
        <div style={{
          position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0,
          background: 'white', border: '1px solid #cbd5e1', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 13 }}>No results</div>
          ) : (
            paged.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                  background: item.id === value ? '#eff6ff' : 'white',
                  color: item.id === value ? '#1d4ed8' : '#1e293b',
                }}
                onMouseDown={() => { onChange(item.id); setOpen(false); setQuery(''); }}
              >
                {getLabel(item)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── CreatableCraftSelect ──────────────────────────────────────────────────────
function CreatableCraftSelect({
  crafts, value, onChange, onCraftCreated,
}: {
  crafts: Craft[];
  value: string;
  onChange: (id: string) => void;
  onCraftCreated: (craft: Craft) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = crafts.find((c) => c.id === value);
  const display = selected
    ? (selected.description ? `${selected.craftCode} – ${selected.description}` : selected.craftCode)
    : '';
  const filtered = query.trim()
    ? crafts.filter((c) =>
        c.craftCode.toLowerCase().includes(query.toLowerCase()) ||
        (c.description ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : crafts;
  const exactMatch = crafts.some(
    (c) =>
      c.craftCode.toLowerCase() === query.trim().toLowerCase() ||
      (c.description ?? '').toLowerCase() === query.trim().toLowerCase(),
  );
  const showCreate = query.trim().length > 0 && !exactMatch;
  const { paged } = usePagination(filtered, 10);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleCreate = async () => {
    const trimmed = query.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    const autoCode = trimmed.split(/\s+/)[0]!.toUpperCase().slice(0, 6);
    const tryInsert = async (code: string) =>
      api<Craft>('/labour-crafts', {
        method: 'POST',
        body: JSON.stringify({ craftCode: code, description: trimmed }),
      });
    try {
      let newCraft: Craft;
      try {
        newCraft = await tryInsert(autoCode);
      } catch {
        newCraft = await tryInsert(autoCode.slice(0, 4) + Date.now().toString().slice(-2));
      }
      onCraftCreated(newCraft);
      onChange(newCraft.id);
      setOpen(false);
      setQuery('');
    } catch (e) {
      console.error('Failed to create craft:', e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        className="form-input"
        placeholder="Select or type to add new craft…"
        value={open ? query : display}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && (
        <div style={{
          position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0,
          background: 'white', border: '1px solid #cbd5e1', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 240, overflowY: 'auto',
        }}>
          {filtered.length === 0 && !showCreate && (
            <div style={{ padding: '8px 12px', color: '#94a3b8', fontSize: 13 }}>No results</div>
          )}
          {paged.map((craft) => (
            <div
              key={craft.id}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                background: craft.id === value ? '#eff6ff' : 'white',
                color: craft.id === value ? '#1d4ed8' : '#1e293b',
              }}
              onMouseDown={() => { onChange(craft.id); setOpen(false); setQuery(''); }}
            >
              <span style={{ fontWeight: 600 }}>{craft.craftCode}</span>
              {craft.description && <span style={{ color: '#64748b' }}> – {craft.description}</span>}
            </div>
          ))}
          {showCreate && (
            <div
              style={{
                padding: '8px 12px', cursor: creating ? 'wait' : 'pointer', fontSize: 13,
                borderTop: filtered.length > 0 ? '1px solid #f1f5f9' : 'none',
                color: '#ea580c', display: 'flex', alignItems: 'center', gap: 6,
                background: '#fff7ed',
              }}
              onMouseDown={creating ? undefined : handleCreate}
            >
              <span style={{ fontSize: 15 }}>＋</span>
              {creating
                ? 'Creating…'
                : <span>Create <strong>"{query.trim()}"</strong> as new craft</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CertificationsInput ───────────────────────────────────────────────────────
function CertificationsInput({
  value, onChange,
}: { value: string[]; onChange: (certs: string[]) => void }) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input
          className="form-input"
          placeholder="e.g. First Aid, Forklift…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn-secondary !w-auto px-3 text-xs" onClick={add}>Add</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {value.map((cert) => (
          <span
            key={cert}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: '#eff6ff', color: '#1d4ed8', fontSize: 11,
              padding: '2px 8px', borderRadius: 12, border: '1px solid #bfdbfe',
            }}
          >
            {cert}
            <button
              type="button"
              onClick={() => onChange(value.filter((c) => c !== cert))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', fontSize: 13, lineHeight: 1 }}
            >×</button>
          </span>
        ))}
        {value.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>No certifications added</span>}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function LabourPage() {
  const [view, setView] = useState<View>('records');
  const [records, setRecords] = useState<LabourRecord[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [crafts, setCrafts] = useState<Craft[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [utilRows, setUtilRows] = useState<UtilRow[]>([]);
  const [utilFrom, setUtilFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
  });
  const [utilTo, setUtilTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Labour record form
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [editRecord, setEditRecord] = useState<LabourRecord | null>(null);
  const emptyRecordForm = { userId: '', craftId: '', regularRate: '', overtimeRate: '', certifications: [] as string[], shiftCode: '', calendarCode: '' };
  const [recordForm, setRecordForm] = useState(emptyRecordForm);
  const [savingRecord, setSavingRecord] = useState(false);

  // Crew form
  const [showNewCrew, setShowNewCrew] = useState(false);
  const [editCrew, setEditCrew] = useState<Crew | null>(null);
  const [crewForm, setCrewForm] = useState({ name: '', leadUserId: '' });
  const [savingCrew, setSavingCrew] = useState(false);

  // Crew members panel
  const [expandedCrewId, setExpandedCrewId] = useState<string | null>(null);
  const [crewDetail, setCrewDetail] = useState<Crew | null>(null);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [addMemberRole, setAddMemberRole] = useState('MEMBER');
  const [savingMember, setSavingMember] = useState(false);

  const { page: recPage, setPage: setRecPage, paged: pagedRecords, totalPages: recTotalPages, totalItems: recTotalItems } = usePagination(records, 10);
  const { page: crewPage, setPage: setCrewPage, paged: pagedCrews, totalPages: crewTotalPages, totalItems: crewTotalItems } = usePagination(crews, 10);

  const load = () => {
    api<LabourRecord[]>('/labour-records').then(setRecords).catch((e) => setError(String(e)));
    api<Crew[]>('/crews').then(setCrews).catch((e) => setError(String(e)));
    api<Craft[]>('/labour-crafts').then(setCrafts).catch(() => {});
    api<User[]>('/admin/users').then(setUsers).catch(() => {});
  };

  const loadUtil = () => {
    api<{ rows: UtilRow[] }>(`/labour-utilisation?from=${utilFrom}&to=${utilTo}`)
      .then((r) => setUtilRows(r.rows))
      .catch(() => {});
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (view === 'utilisation') loadUtil(); }, [view]);

  // ── Labour record CRUD ──
  const openNewRecord = () => {
    setEditRecord(null);
    setRecordForm(emptyRecordForm);
    setShowNewRecord(true);
    setError('');
  };

  const openEditRecord = (r: LabourRecord) => {
    setEditRecord(r);
    setRecordForm({
      userId: r.userId,
      craftId: r.craftId ?? '',
      regularRate: r.regularRate ?? '',
      overtimeRate: r.overtimeRate ?? '',
      certifications: r.certifications ?? [],
      shiftCode: r.shiftCode ?? '',
      calendarCode: r.calendarCode ?? '',
    });
    setShowNewRecord(true);
    setError('');
  };

  const handleSaveRecord = async () => {
    if (!recordForm.userId) { setError('User is required'); return; }
    setSavingRecord(true); setError(''); setSuccess('');
    const body = {
      userId: recordForm.userId,
      craftId: recordForm.craftId || undefined,
      regularRate: recordForm.regularRate || undefined,
      overtimeRate: recordForm.overtimeRate || undefined,
      certifications: recordForm.certifications,
      shiftCode: recordForm.shiftCode || undefined,
      calendarCode: recordForm.calendarCode || undefined,
    };
    try {
      if (editRecord) {
        await api(`/labour-records/${editRecord.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Labour record updated');
      } else {
        await api('/labour-records', { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Labour record created');
      }
      setRecordForm(emptyRecordForm);
      setShowNewRecord(false);
      setEditRecord(null);
      load();
    } catch (e) { setError(String(e)); }
    finally { setSavingRecord(false); }
  };

  // ── Crew CRUD ──
  const openNewCrew = () => {
    setEditCrew(null);
    setCrewForm({ name: '', leadUserId: '' });
    setShowNewCrew(true);
    setError('');
  };

  const openEditCrew = (c: Crew) => {
    setEditCrew(c);
    setCrewForm({ name: c.name, leadUserId: c.leadUserId ?? '' });
    setShowNewCrew(true);
    setError('');
  };

  const handleSaveCrew = async () => {
    if (!crewForm.name.trim()) { setError('Crew name is required'); return; }
    setSavingCrew(true); setError(''); setSuccess('');
    const body = { name: crewForm.name, leadUserId: crewForm.leadUserId || undefined };
    try {
      if (editCrew) {
        await api(`/crews/${editCrew.id}`, { method: 'PUT', body: JSON.stringify(body) });
        setSuccess('Crew updated');
      } else {
        await api('/crews', { method: 'POST', body: JSON.stringify(body) });
        setSuccess('Crew created');
      }
      setCrewForm({ name: '', leadUserId: '' });
      setShowNewCrew(false);
      setEditCrew(null);
      load();
    } catch (e) { setError(String(e)); }
    finally { setSavingCrew(false); }
  };

  // ── Crew members ──
  const toggleCrewDetail = async (crewId: string) => {
    if (expandedCrewId === crewId) { setExpandedCrewId(null); setCrewDetail(null); return; }
    setExpandedCrewId(crewId);
    const detail = await api<Crew>(`/crews/${crewId}`);
    setCrewDetail(detail);
  };

  const handleAddMember = async () => {
    if (!addMemberUserId || !expandedCrewId) return;
    setSavingMember(true);
    try {
      await api(`/crews/${expandedCrewId}/members`, {
        method: 'POST',
        body: JSON.stringify({ userId: addMemberUserId, role: addMemberRole }),
      });
      setAddMemberUserId('');
      setAddMemberRole('MEMBER');
      const detail = await api<Crew>(`/crews/${expandedCrewId}`);
      setCrewDetail(detail);
    } catch (e) { setError(String(e)); }
    finally { setSavingMember(false); }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!expandedCrewId) return;
    try {
      await api(`/crews/${expandedCrewId}/members/${memberId}`, { method: 'DELETE' });
      const detail = await api<Crew>(`/crews/${expandedCrewId}`);
      setCrewDetail(detail);
    } catch (e) { setError(String(e)); }
  };

  const tabBtn = (v: View, label: string, count?: number) => (
    <button type="button"
      className={`px-4 py-2 text-sm rounded ${view === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
      onClick={() => setView(v)}>
      {label}{count !== undefined ? ` (${count})` : ''}
    </button>
  );

  return (
    <IdentityPageLayout title="Labour & Crews" subtitle="Technicians, crafts, and crew management">
      {error && <MessageBanner type="error" text={error} />}
      {success && <MessageBanner type="success" text={success} />}

      <div className="flex gap-4 mb-4">
        {tabBtn('records', 'Labour Records', records.length)}
        {tabBtn('crews', 'Crews', crews.length)}
        {tabBtn('utilisation', 'Utilisation')}
      </div>

      {/* ── Labour Records ── */}
      {view === 'records' && (
        <div className="admin-section space-y-4">
          <div className="flex justify-end">
            <button type="button" className="btn-primary !w-auto px-4"
              onClick={openNewRecord}>
              + New labour record
            </button>
          </div>

          {showNewRecord && (
            <div className="border border-slate-200 rounded p-4 bg-slate-50 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">
                {editRecord ? 'Edit Labour Record' : 'New Labour Record'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">User *</label>
                  <Combobox
                    items={users}
                    value={recordForm.userId}
                    onChange={(id) => setRecordForm((f) => ({ ...f, userId: id }))}
                    getLabel={(u) => u.displayName ? `${u.displayName} (${u.email})` : u.email}
                    placeholder="Type to search users…"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Craft</label>
                  <CreatableCraftSelect
                    crafts={crafts}
                    value={recordForm.craftId}
                    onChange={(id) => setRecordForm((f) => ({ ...f, craftId: id }))}
                    onCraftCreated={(newCraft) => setCrafts((prev) => [...prev, newCraft])}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Regular rate / hr</label>
                  <input type="number" step="0.01" className="form-input" placeholder="0.00"
                    value={recordForm.regularRate}
                    onChange={(e) => setRecordForm((f) => ({ ...f, regularRate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Overtime rate / hr</label>
                  <input type="number" step="0.01" className="form-input" placeholder="0.00"
                    value={recordForm.overtimeRate}
                    onChange={(e) => setRecordForm((f) => ({ ...f, overtimeRate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Shift code</label>
                  <input className="form-input" placeholder="e.g. DAY, NIGHT, SWING"
                    value={recordForm.shiftCode}
                    onChange={(e) => setRecordForm((f) => ({ ...f, shiftCode: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Calendar code</label>
                  <input className="form-input" placeholder="e.g. STD-5DAY, 24x7"
                    value={recordForm.calendarCode}
                    onChange={(e) => setRecordForm((f) => ({ ...f, calendarCode: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Certifications / Qualifications</label>
                  <CertificationsInput
                    value={recordForm.certifications}
                    onChange={(certs) => setRecordForm((f) => ({ ...f, certifications: certs }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-primary !w-auto px-4" disabled={savingRecord}
                  onClick={handleSaveRecord}>
                  {savingRecord ? 'Saving…' : (editRecord ? 'Update' : 'Create')}
                </button>
                <button type="button" className="btn-secondary !w-auto px-4"
                  onClick={() => { setShowNewRecord(false); setEditRecord(null); }}>Cancel</button>
              </div>
            </div>
          )}

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Craft</th>
                <th className="py-2 pr-4">Regular</th>
                <th className="py-2 pr-4">Overtime</th>
                <th className="py-2 pr-4">Shift</th>
                <th className="py-2 pr-4">Certifications</th>
                <th className="py-2 pr-4">Active</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRecords.length === 0 ? (
                <tr><td colSpan={8} className="py-6 text-center text-slate-400">No labour records.</td></tr>
              ) : (
                pagedRecords.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{r.userName ?? '—'}</div>
                      <div className="text-xs text-slate-400">{r.userEmail ?? ''}</div>
                    </td>
                    <td className="py-2 pr-4">{r.craftDescription ?? r.craftCode ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{r.regularRate ? `$${parseFloat(r.regularRate).toFixed(2)}` : '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{r.overtimeRate ? `$${parseFloat(r.overtimeRate).toFixed(2)}` : '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">
                      {r.shiftCode ? <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded">{r.shiftCode}</span> : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      {r.certifications?.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {r.certifications.map((c) => (
                            <span key={c} style={{
                              fontSize: 10, background: '#eff6ff', color: '#1d4ed8',
                              padding: '1px 6px', borderRadius: 10, border: '1px solid #bfdbfe',
                            }}>{c}</span>
                          ))}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="py-2 pr-4">{r.isActive ? '✓' : '✗'}</td>
                    <td className="py-2">
                      <button type="button" className="text-xs text-blue-600 hover:underline"
                        onClick={() => openEditRecord(r)}>Edit</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={recPage} totalPages={recTotalPages} totalItems={recTotalItems} pageSize={10} onChange={setRecPage} />
        </div>
      )}

      {/* ── Crews ── */}
      {view === 'crews' && (
        <div className="admin-section space-y-4">
          <div className="flex justify-end">
            <button type="button" className="btn-primary !w-auto px-4"
              onClick={openNewCrew}>
              + New crew
            </button>
          </div>

          {showNewCrew && (
            <div className="border border-slate-200 rounded p-4 bg-slate-50 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">
                {editCrew ? 'Edit Crew' : 'New Crew'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Crew name *</label>
                  <input className="form-input" placeholder="e.g. Electrical Team A"
                    value={crewForm.name}
                    onChange={(e) => setCrewForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Crew lead</label>
                  <Combobox
                    items={users}
                    value={crewForm.leadUserId}
                    onChange={(id) => setCrewForm((f) => ({ ...f, leadUserId: id }))}
                    getLabel={(u) => u.displayName ? `${u.displayName} (${u.email})` : u.email}
                    placeholder="Select lead (optional)…"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-primary !w-auto px-4" disabled={savingCrew}
                  onClick={handleSaveCrew}>
                  {savingCrew ? 'Saving…' : (editCrew ? 'Update' : 'Create')}
                </button>
                <button type="button" className="btn-secondary !w-auto px-4"
                  onClick={() => { setShowNewCrew(false); setEditCrew(null); }}>Cancel</button>
              </div>
            </div>
          )}

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Crew #</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Members</th>
                <th className="py-2 pr-4">Active</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedCrews.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">No crews.</td></tr>
              ) : (
                pagedCrews.map((c) => (
                  <>
                    <tr key={c.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-mono text-xs text-blue-600">{c.crewNum}</td>
                      <td className="py-2 pr-4 font-medium">{c.name}</td>
                      <td className="py-2 pr-4">
                        <button type="button"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => toggleCrewDetail(c.id)}>
                          {expandedCrewId === c.id ? 'Hide members ▲' : 'Manage members ▼'}
                        </button>
                      </td>
                      <td className="py-2 pr-4">{c.isActive ? '✓' : '✗'}</td>
                      <td className="py-2">
                        <button type="button" className="text-xs text-blue-600 hover:underline"
                          onClick={() => openEditCrew(c)}>Edit</button>
                      </td>
                    </tr>
                    {expandedCrewId === c.id && crewDetail && (
                      <tr key={`${c.id}-members`}>
                        <td colSpan={5} style={{ padding: '0 0 12px 24px', background: '#f8fafc' }}>
                          <div style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: 16, paddingTop: 12 }}>
                            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Members</div>

                            {/* Add member row */}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                              <div style={{ flex: 2 }}>
                                <Combobox
                                  items={users.filter((u) => !crewDetail.members?.find((m) => m.userId === u.id))}
                                  value={addMemberUserId}
                                  onChange={setAddMemberUserId}
                                  getLabel={(u) => u.displayName ? `${u.displayName} (${u.email})` : u.email}
                                  placeholder="Add member…"
                                />
                              </div>
                              <select
                                className="form-input"
                                style={{ flex: 1 }}
                                value={addMemberRole}
                                onChange={(e) => setAddMemberRole(e.target.value)}
                              >
                                <option value="MEMBER">Member</option>
                                <option value="LEAD">Lead</option>
                                <option value="SUPERVISOR">Supervisor</option>
                              </select>
                              <button type="button" className="btn-primary !w-auto px-3 text-xs"
                                disabled={!addMemberUserId || savingMember}
                                onClick={handleAddMember}>
                                {savingMember ? '…' : 'Add'}
                              </button>
                            </div>

                            {crewDetail.members?.length === 0 ? (
                              <div className="text-xs text-slate-400 py-1">No members yet.</div>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-slate-400 uppercase tracking-wide border-b border-slate-200">
                                    <th className="py-1 pr-4 text-left">Name</th>
                                    <th className="py-1 pr-4 text-left">Role</th>
                                    <th className="py-1 text-left">Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {crewDetail.members?.map((m) => (
                                    <tr key={m.id} className="border-b border-slate-100">
                                      <td className="py-1.5 pr-4">
                                        {m.userName ?? m.userEmail ?? m.userId}
                                        {m.isPrimary && <span style={{ marginLeft: 6, fontSize: 10, background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: 8 }}>Primary</span>}
                                      </td>
                                      <td className="py-1.5 pr-4 text-slate-500">{m.role}</td>
                                      <td className="py-1.5">
                                        <button type="button" className="text-red-500 hover:underline text-xs"
                                          onClick={() => handleRemoveMember(m.id)}>Remove</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
          <Pagination page={crewPage} totalPages={crewTotalPages} totalItems={crewTotalItems} pageSize={10} onChange={setCrewPage} />
        </div>
      )}

      {/* ── Utilisation ── */}
      {view === 'utilisation' && (
        <div className="admin-section space-y-4">
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div>
              <label className="block text-xs text-slate-500 mb-1">From</label>
              <input type="date" className="form-input" value={utilFrom}
                onChange={(e) => setUtilFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">To</label>
              <input type="date" className="form-input" value={utilTo}
                onChange={(e) => setUtilTo(e.target.value)} />
            </div>
            <button type="button" className="btn-primary !w-auto px-4" onClick={loadUtil}>Apply</button>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Technician</th>
                <th className="py-2 pr-4">Craft</th>
                <th className="py-2 pr-4">Regular hrs</th>
                <th className="py-2 pr-4">OT hrs</th>
                <th className="py-2 pr-4">Total cost</th>
                <th className="py-2">WOs</th>
              </tr>
            </thead>
            <tbody>
              {utilRows.length === 0 ? (
                <tr><td colSpan={6} className="py-6 text-center text-slate-400">No labour recorded in this period.</td></tr>
              ) : (
                utilRows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{r.userName ?? r.userId}</td>
                    <td className="py-2 pr-4 text-slate-500">{r.craft}</td>
                    <td className="py-2 pr-4">{parseFloat(r.regularHours).toFixed(2)}</td>
                    <td className="py-2 pr-4">{parseFloat(r.overtimeHours).toFixed(2)}</td>
                    <td className="py-2 pr-4">{r.totalCost ? `$${parseFloat(r.totalCost).toFixed(2)}` : '—'}</td>
                    <td className="py-2">{r.workOrderCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {utilRows.length > 0 && (
            <div style={{ paddingTop: 8, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 24, fontSize: 13 }}>
              <span className="text-slate-500">Totals:</span>
              <span><strong>{utilRows.reduce((s, r) => s + parseFloat(r.regularHours), 0).toFixed(2)}</strong> regular hrs</span>
              <span><strong>{utilRows.reduce((s, r) => s + parseFloat(r.overtimeHours), 0).toFixed(2)}</strong> OT hrs</span>
              <span><strong>${utilRows.reduce((s, r) => s + (r.totalCost ? parseFloat(r.totalCost) : 0), 0).toFixed(2)}</strong> total cost</span>
            </div>
          )}
        </div>
      )}
    </IdentityPageLayout>
  );
}
