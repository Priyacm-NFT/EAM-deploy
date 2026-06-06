import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface LabourRecord {
  id: string; userId: string; craftCode: string | null; craftDescription: string | null;
  regularRate: string | null; isActive: boolean; userName: string | null; userEmail: string | null;
}
interface Crew { id: string; crewNum: string; name: string; isActive: boolean; }
interface Craft { id: string; craftCode: string; description: string | null; }
interface User { id: string; displayName: string | null; email: string; }

type View = 'records' | 'crews';

// ── Combobox: type to filter, click to select, shows dropdown ──────────────
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
            filtered.map((item) => (
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

// ── CreatableCraftSelect: pick existing craft or type to create a new one ──
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
    // Derive a craft code from the first word (max 6 chars, uppercase)
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
        // code conflict — append 2-digit suffix
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
          {filtered.map((craft) => (
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

export function LabourPage() {
  const [view, setView] = useState<View>('records');
  const [records, setRecords] = useState<LabourRecord[]>([]);
  const [crews, setCrews] = useState<Crew[]>([]);
  const [crafts, setCrafts] = useState<Craft[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showNewRecord, setShowNewRecord] = useState(false);
  const [recordForm, setRecordForm] = useState({ userId: '', craftId: '', regularRate: '', overtimeRate: '' });
  const [savingRecord, setSavingRecord] = useState(false);

  const [showNewCrew, setShowNewCrew] = useState(false);
  const [crewForm, setCrewForm] = useState({ name: '' });
  const [savingCrew, setSavingCrew] = useState(false);

  const load = () => {
    api<LabourRecord[]>('/labour-records').then(setRecords).catch((e) => setError(String(e)));
    api<Crew[]>('/crews').then(setCrews).catch((e) => setError(String(e)));
    api<Craft[]>('/labour-crafts').then(setCrafts).catch(() => {});
    api<User[]>('/admin/users').then(setUsers).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleCreateRecord = async () => {
    if (!recordForm.userId) { setError('User is required'); return; }
    setSavingRecord(true); setError(''); setSuccess('');
    try {
      await api('/labour-records', {
        method: 'POST',
        body: JSON.stringify({
          userId: recordForm.userId,
          craftId: recordForm.craftId || undefined,
          regularRate: recordForm.regularRate || undefined,
          overtimeRate: recordForm.overtimeRate || undefined,
        }),
      });
      setSuccess('Labour record created');
      setRecordForm({ userId: '', craftId: '', regularRate: '', overtimeRate: '' });
      setShowNewRecord(false);
      load();
    } catch (e) { setError(String(e)); }
    finally { setSavingRecord(false); }
  };

  const handleCreateCrew = async () => {
    if (!crewForm.name.trim()) { setError('Crew name is required'); return; }
    setSavingCrew(true); setError(''); setSuccess('');
    try {
      await api('/crews', {
        method: 'POST',
        body: JSON.stringify({ name: crewForm.name }),
      });
      setSuccess('Crew created');
      setCrewForm({ name: '' });
      setShowNewCrew(false);
      load();
    } catch (e) { setError(String(e)); }
    finally { setSavingCrew(false); }
  };

  return (
    <IdentityPageLayout title="Labour & Crews" subtitle="Technicians, crafts, and crew management">
      {error && <MessageBanner type="error" text={error} />}
      {success && <MessageBanner type="success" text={success} />}

      <div className="flex gap-4 mb-4">
        <button type="button"
          className={`px-4 py-2 text-sm rounded ${view === 'records' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => setView('records')}>
          Labour records ({records.length})
        </button>
        <button type="button"
          className={`px-4 py-2 text-sm rounded ${view === 'crews' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}
          onClick={() => setView('crews')}>
          Crews ({crews.length})
        </button>
      </div>

      {/* ── Labour Records ── */}
      {view === 'records' && (
        <div className="admin-section space-y-4">
          <div className="flex justify-end">
            <button type="button" className="btn-primary !w-auto px-4"
              onClick={() => { setShowNewRecord((v) => !v); setError(''); }}>
              + New labour record
            </button>
          </div>

          {showNewRecord && (
            <div className="border border-slate-200 rounded p-4 bg-slate-50 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">New Labour Record</h3>
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
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-primary !w-auto px-4" disabled={savingRecord}
                  onClick={handleCreateRecord}>
                  {savingRecord ? 'Creating…' : 'Create'}
                </button>
                <button type="button" className="btn-secondary !w-auto px-4"
                  onClick={() => setShowNewRecord(false)}>Cancel</button>
              </div>
            </div>
          )}

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Craft</th>
                <th className="py-2 pr-4">Rate / hr</th>
                <th className="py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">No labour records.</td></tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{r.userName ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{r.userEmail ?? '—'}</td>
                    <td className="py-2 pr-4">{r.craftDescription ?? r.craftCode ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{r.regularRate ? `$${parseFloat(r.regularRate).toFixed(2)}` : '—'}</td>
                    <td className="py-2">{r.isActive ? '✓' : '✗'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Crews ── */}
      {view === 'crews' && (
        <div className="admin-section space-y-4">
          <div className="flex justify-end">
            <button type="button" className="btn-primary !w-auto px-4"
              onClick={() => { setShowNewCrew((v) => !v); setError(''); }}>
              + New crew
            </button>
          </div>

          {showNewCrew && (
            <div className="border border-slate-200 rounded p-4 bg-slate-50 space-y-3">
              <h3 className="text-sm font-semibold text-slate-700">New Crew</h3>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Crew name *</label>
                <input className="form-input max-w-xs" placeholder="e.g. Electrical Team A"
                  value={crewForm.name}
                  onChange={(e) => setCrewForm({ name: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-primary !w-auto px-4" disabled={savingCrew}
                  onClick={handleCreateCrew}>
                  {savingCrew ? 'Creating…' : 'Create'}
                </button>
                <button type="button" className="btn-secondary !w-auto px-4"
                  onClick={() => setShowNewCrew(false)}>Cancel</button>
              </div>
            </div>
          )}

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Crew #</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {crews.length === 0 ? (
                <tr><td colSpan={3} className="py-6 text-center text-slate-400">No crews.</td></tr>
              ) : (
                crews.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs text-blue-600">{c.crewNum}</td>
                    <td className="py-2 pr-4">{c.name}</td>
                    <td className="py-2">{c.isActive ? '✓' : '✗'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </IdentityPageLayout>
  );
}



