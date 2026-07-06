import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

// FIX: LocationTree.tsx has always linked each location's name to
// `/locations/:id`, but neither a matching route nor a GET /locations/:id
// API endpoint ever existed — clicking any location went to a blank
// page. This page (plus the new GET route in assets.ts) fixes that, and
// doubles as the way to actually see Sheet rows 2-5's effects in the
// browser: position, CM Location flags, and which asset(s) are currently
// installed here.

interface LocationDetailData {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: string | null;
  position: string | null;
  glAccount: string | null;
  costCenter: string | null;
  isActive: boolean;
  parentId: string | null;
  parentName: string | null;
  parentCode: string | null;
  siteId: string | null;
  siteName: string | null;
  orgId: string | null;
  orgName: string | null;
  // FIX (Sheet row 14): needed for the new Edit form below — these were
  // removed from the read-only display section per an earlier request,
  // but the only way to ever SET them was raw SQL. This is that missing
  // editor.
  isCmLocation: boolean;
  cmItemId: string | null;
  assetRequired: boolean;
  // FIX (P1-1 gap — materialized path): now returned by GET
  // /locations/:id so the Move UI below can both display it and exclude
  // this location's own descendants from the "new parent" picker
  // client-side (the backend also rejects it server-side; this just
  // avoids offering an invalid choice in the first place).
  path: string;
  createdAt?: string;
  createdByName?: string | null;
  installedAssets: { id: string; assetNum: string; description: string; parentAssetId: string | null }[];
  childLocations: { id: string; code: string; name: string; isCmLocation: boolean }[];
}

interface ItemOption { id: string; itemNum: string; description: string; }

// FIX (P1-1 gap — location move UI): flat list used to populate the
// "New parent location" dropdown in the Move section below. `path` is
// used purely client-side to filter out this location's own descendants
// (moving a node under itself or a descendant is what the backend's
// cycle guard exists to reject — filtering it out here just means the
// admin never sees an option that would fail anyway).
interface LocationOption {
  id: string;
  code: string;
  name: string;
  path: string | null;
  children?: LocationOption[];
}

function flattenLocationTree(nodes: LocationOption[], depth = 0): (LocationOption & { depth: number })[] {
  return nodes.flatMap((n) => [
    { ...n, depth },
    ...(n.children ? flattenLocationTree(n.children, depth + 1) : []),
  ]);
}

// FIX (Maximo location-meter parity): Locations get their own meters,
// same as Assets — same three types, same reading history — via the new
// /locations/:id/meters routes. Unlike an Asset meter, a Location meter
// has no "Accept Rolldown From" field at all: real Maximo confirms there
// is no rolldown of meter readings between locations in the hierarchy,
// so a Location meter can only ever be a rolldown *source* for an Asset
// meter set to accept from 'LOCATION' (that cascade already happens
// server-side the moment a reading is posted here — nothing extra to do
// from this UI). Self-contained section component, same pattern as
// SRAssignPanel in SRDetail.tsx, so it doesn't clutter the main page's
// state.
interface LocationMeter { id: string; name: string; meterType: string; unit: string | null; lastReading: string | null }

function LocationMetersSection({ locationId }: { locationId: string }) {
  const [meters, setMeters] = useState<LocationMeter[]>([]);
  const [error, setError] = useState('');
  const [showMeterForm, setShowMeterForm] = useState(false);
  const [meterForm, setMeterForm] = useState({ meterName: '', meterType: 'CONTINUOUS', uom: '' });
  const [savingMeter, setSavingMeter] = useState(false);

  const [readingMeter, setReadingMeter] = useState<LocationMeter | null>(null);
  const [readingValue, setReadingValue] = useState('');
  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingReading, setSavingReading] = useState(false);
  const [rolloverPrompt, setRolloverPrompt] = useState<{ currentReading: number; submittedReading: number } | null>(null);
  const [confirmRollover, setConfirmRollover] = useState(false);

  const loadMeters = () => {
    api<LocationMeter[]>(`/locations/${locationId}/meters`).then(setMeters).catch(() => setMeters([]));
  };

  useEffect(loadMeters, [locationId]);

  const submitReading = async () => {
    if (!readingMeter) return;
    setSavingReading(true);
    try {
      await api(`/locations/${locationId}/meters/${readingMeter.id}/readings`, {
        method: 'POST',
        body: JSON.stringify({ value: readingValue, readingDate, isRollover: confirmRollover || undefined }),
      });
      loadMeters();
      setReadingMeter(null);
      setReadingValue('');
      setRolloverPrompt(null);
      setConfirmRollover(false);
    } catch (e) {
      const payload = e as { currentReading?: number; submittedReading?: number };
      if (typeof payload.currentReading === 'number' && typeof payload.submittedReading === 'number') {
        setRolloverPrompt({ currentReading: payload.currentReading, submittedReading: payload.submittedReading });
      } else {
        setError(String(e));
      }
    } finally {
      setSavingReading(false);
    }
  };

  return (
    <div className="admin-section" style={{ marginBottom: '20px' }}>
      <div className="flex justify-between items-center mb-3">
        <h2 className="admin-section-title">Meters</h2>
        <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => setShowMeterForm((v) => !v)}>
          + Add meter
        </button>
      </div>
      {error && <MessageBanner type="error" text={error} />}

      {showMeterForm && (
        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3 mb-4">
          <h3 className="text-sm font-semibold">New meter</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="form-label text-xs">Name</label>
              <input className="form-input text-sm" value={meterForm.meterName} onChange={(e) => setMeterForm({ ...meterForm, meterName: e.target.value })} placeholder="Running Hours" /></div>
            <div><label className="form-label text-xs">Type</label>
              <select className="form-select text-sm" value={meterForm.meterType} onChange={(e) => setMeterForm({ ...meterForm, meterType: e.target.value })}>
                <option value="CONTINUOUS">Continuous</option><option value="GAUGE">Gauge</option><option value="CHARACTERISTIC">Characteristic</option></select></div>
            <div><label className="form-label text-xs">UOM</label>
              <input className="form-input text-sm" value={meterForm.uom} onChange={(e) => setMeterForm({ ...meterForm, uom: e.target.value })} placeholder="hours" /></div>
          </div>
          <p className="text-xs text-slate-400">
            An asset at this location can pull its own same-named meter's reading from here by setting that
            asset meter's "Accept Rolldown From" to Location.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary !w-auto px-4 text-sm"
              disabled={savingMeter || !meterForm.meterName.trim()}
              onClick={async () => {
                if (savingMeter) return;
                setSavingMeter(true);
                try {
                  await api(`/locations/${locationId}/meters`, {
                    method: 'POST',
                    body: JSON.stringify({ name: meterForm.meterName, unit: meterForm.uom, meterType: meterForm.meterType }),
                  });
                  loadMeters();
                  setShowMeterForm(false);
                  setMeterForm({ meterName: '', meterType: 'CONTINUOUS', uom: '' });
                } catch (e) {
                  setError(String(e));
                } finally {
                  setSavingMeter(false);
                }
              }}
            >
              {savingMeter ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn-outline-light text-sm" disabled={savingMeter} onClick={() => setShowMeterForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {meters.length === 0 ? (
        <p className="text-slate-400 text-sm">No meters defined.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">UOM</th>
              <th className="pb-2 pr-4">Current reading</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {meters.map((m) => (
              <tr key={m.id} className="border-b border-slate-100">
                <td className="py-2 pr-4 font-medium">{m.name}</td>
                <td className="py-2 pr-4 text-slate-500">{m.meterType}</td>
                <td className="py-2 pr-4 text-slate-500">{m.unit ?? '—'}</td>
                <td className="py-2 pr-4">{m.lastReading ?? '—'}</td>
                <td className="py-2">
                  <button type="button" className="btn-link text-xs" onClick={() => { setReadingMeter(m); setReadingValue(''); }}>
                    Enter reading
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {readingMeter && (
        <div className="mt-4 bg-slate-50 border border-slate-200 rounded p-4">
          <p className="font-medium mb-2">Enter reading for {readingMeter.name}</p>
          <div className="flex gap-3 items-end">
            <label className="block">
              <span className="form-label">Value ({readingMeter.unit ?? 'units'})</span>
              <input
                type="number" step="any" className="form-input w-36" value={readingValue}
                onChange={(e) => { setReadingValue(e.target.value); setRolloverPrompt(null); setConfirmRollover(false); }}
              />
            </label>
            <label className="block">
              <span className="form-label">Date</span>
              <input type="date" className="form-input" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} />
            </label>
            <button type="button" className="btn-primary !w-auto px-4" onClick={submitReading} disabled={savingReading}>
              {savingReading ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn-link" onClick={() => { setReadingMeter(null); setRolloverPrompt(null); setConfirmRollover(false); }}>Cancel</button>
          </div>

          {rolloverPrompt && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-3 text-sm">
              <p className="text-amber-800">
                This meter's current reading is <strong>{rolloverPrompt.currentReading}</strong>, and you entered{' '}
                <strong>{rolloverPrompt.submittedReading}</strong> — lower than the current value. For a CONTINUOUS
                meter that usually means a mistake, but if this genuinely rolled over, confirm below and save again.
              </p>
              <label className="flex items-center gap-2 mt-2">
                <input type="checkbox" checked={confirmRollover} onChange={(e) => setConfirmRollover(e.target.checked)} />
                Yes, this is a genuine rollover — save it anyway
              </label>
              <button
                type="button"
                className="btn-primary !w-auto px-4 mt-2"
                disabled={!confirmRollover || savingReading}
                onClick={submitReading}
              >
                {savingReading ? 'Saving…' : 'Confirm and save'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function LocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [location, setLocation] = useState<LocationDetailData | null>(null);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    isCmLocation: false, cmItemId: '', assetRequired: false, position: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  // FIX: this page had a Status badge (isActive → Active/Inactive) but
  // no way to actually change it — no Deactivate button anywhere, and
  // the backend route it would call was, until now, a genuine hard
  // delete rather than the soft-delete every other master-data entity
  // (Organisations, Sites, Items) uses. Same "Deactivate" pattern as
  // those, now that the backend matches too.
  const [togglingActive, setTogglingActive] = useState(false);

  // FIX (P1-1 gap — location move UI): this is the piece that was
  // entirely missing — the create form lets you set a parent once at
  // creation, but there was never a way to change an existing location's
  // parent from the browser (only the raw PUT /locations/:id API call
  // could do it, which is what actually exercises the materialized-path
  // recompute-on-move logic).
  const [showMove, setShowMove] = useState(false);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);
  const [moveTargetParentId, setMoveTargetParentId] = useState('');
  const [moving, setMoving] = useState(false);

  // FIX (P1-1 gap — GET /locations/:id/subtree): quick way to confirm
  // the new endpoint returns this location's full descendant tree via
  // the materialized-path prefix query, without needing devtools.
  const [subtree, setSubtree] = useState<null | { id: string; code: string; name: string; children: unknown[] }>(null);
  const [loadingSubtree, setLoadingSubtree] = useState(false);

  function loadSubtree() {
    if (!id) return;
    setLoadingSubtree(true);
    api<{ id: string; code: string; name: string; children: unknown[] }>(`/locations/${id}/subtree`)
      .then(setSubtree)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load subtree'))
      .finally(() => setLoadingSubtree(false));
  }

  function renderSubtreeNode(node: { code: string; name: string; children?: unknown[] }, depth = 0) {
    return (
      <div style={{ paddingLeft: `${depth * 20}px` }} key={`${node.code}-${depth}`}>
        <span className="text-sm">{'— '.repeat(depth)}<code className="text-xs bg-slate-100 px-1 rounded">{node.code}</code> {node.name}</span>
        {(node.children as typeof node[] | undefined)?.map((c) => renderSubtreeNode(c, depth + 1))}
      </div>
    );
  }

  useEffect(() => {
    if (!showMove) return;
    api<LocationOption[]>('/locations?tree=true').then(setLocationOptions).catch(() => setLocationOptions([]));
  }, [showMove]);

  async function submitMove() {
    if (!id || !location) return;
    setMoving(true); setError(''); setSuccess('');
    try {
      await api(`/locations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ parentId: moveTargetParentId || null }),
      });
      setSuccess(
        moveTargetParentId
          ? 'Location moved. Its materialized path — and every descendant\'s path — has been recomputed.'
          : 'Location moved to top-level (no parent). Its materialized path has been recomputed.',
      );
      setShowMove(false);
      setMoveTargetParentId('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Move failed');
    } finally {
      setMoving(false);
    }
  }

  async function toggleActive() {
    if (!id || !location) return;
    const willDeactivate = location.isActive;
    if (willDeactivate && !window.confirm(`Deactivate location "${location.name}"? It will be hidden from lists but its historical data is preserved. It can be reactivated later.`)) {
      return;
    }
    setTogglingActive(true); setError('');
    try {
      await api(`/locations/${id}${willDeactivate ? '' : '/reactivate'}`, {
        method: willDeactivate ? 'DELETE' : 'POST',
      });
      setSuccess(willDeactivate ? `Location "${location.name}" deactivated.` : `Location "${location.name}" reactivated.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update location status');
    } finally {
      setTogglingActive(false);
    }
  }

  function load() {
    if (!id) return;
    setLoading(true);
    api<LocationDetailData>(`/locations/${id}`)
      .then((data) => {
        setLocation(data);
        setEditForm({
          isCmLocation: data.isCmLocation,
          cmItemId: data.cmItemId ?? '',
          assetRequired: data.assetRequired,
          position: data.position ?? '',
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load location'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    api<{ data: ItemOption[] } | ItemOption[]>('/items?pageSize=200')
      .then((r) => setItems(Array.isArray(r) ? r : (r as { data: ItemOption[] }).data ?? []))
      .catch(() => setItems([]));
  }, []);

  async function saveEdit() {
    if (!id) return;
    setSavingEdit(true); setError('');
    try {
      await api(`/locations/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          isCmLocation: editForm.isCmLocation,
          cmItemId: editForm.isCmLocation ? (editForm.cmItemId || null) : null,
          assetRequired: editForm.isCmLocation ? editForm.assetRequired : false,
          position: editForm.position || null,
        }),
      });
      setSuccess('Location updated.');
      setShowEdit(false);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <IdentityPageLayout title="Location" subtitle="Loading…">
        <p className="text-slate-400">Loading location…</p>
      </IdentityPageLayout>
    );
  }

  if (error || !location) {
    return (
      <IdentityPageLayout title="Location" subtitle="">
        <MessageBanner type="error" text={error || 'Location not found'} />
        <Link to="/locations" className="btn-link text-sm">← Back to Locations</Link>
      </IdentityPageLayout>
    );
  }

  return (
    <IdentityPageLayout title={location.name} subtitle={`Location code: ${location.code}`}>
      <div className="flex justify-between items-center mb-2">
        <Link to="/locations" className="btn-link text-sm inline-block">← Back to Locations</Link>
        <div className="flex gap-2">
          <button
            type="button"
            className={`!w-auto px-4 text-sm ${location.isActive ? 'btn-outline-light text-red-600' : 'btn-outline-light text-green-700'}`}
            disabled={togglingActive}
            onClick={toggleActive}
          >
            {togglingActive ? 'Saving…' : location.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
          <button
            type="button"
            className="btn-outline-light !w-auto px-4 text-sm"
            onClick={() => { setShowMove((v) => !v); setShowEdit(false); }}
          >
            {showMove ? 'Cancel move' : 'Move'}
          </button>
          <button type="button" className="btn-outline-light !w-auto px-4 text-sm" onClick={() => { setShowEdit((v) => !v); setShowMove(false); }}>
            {showEdit ? 'Cancel' : 'Edit CM settings'}
          </button>
        </div>
      </div>
      {success && <MessageBanner type="success" text={success} />}

      {/* FIX (P1-1 gap — location move UI): the "New parent location"
          list excludes this location itself and anything under it
          (matched by path prefix) — those are exactly the moves the
          backend's cycle guard would reject, so there's no point
          offering them. Leaving the dropdown on "No parent (top-level)"
          and submitting moves this location to root. */}
      {showMove && (
        <div className="admin-section" style={{ marginBottom: '20px' }}>
          <h2 className="admin-section-title">Move location</h2>
          <p className="text-sm text-slate-500 mt-1 mb-3">
            Moving recomputes this location&apos;s materialized path, and every
            descendant location&apos;s path, in a single transaction.
          </p>
          <label className="block max-w-md">
            <span className="form-label">New parent location</span>
            <select className="form-input" value={moveTargetParentId} onChange={(e) => setMoveTargetParentId(e.target.value)}>
              <option value="">No parent (top-level)</option>
              {flattenLocationTree(locationOptions)
                .filter((l) => l.id !== location.id && !(l.path ?? '').startsWith(`${location.path}.`))
                .map((l) => (
                  <option key={l.id} value={l.id}>{'— '.repeat(l.depth)}{l.code} – {l.name}</option>
                ))}
            </select>
          </label>
          <div className="flex gap-2 mt-4">
            <button type="button" className="btn-primary !w-auto px-6" disabled={moving} onClick={submitMove}>
              {moving ? 'Moving…' : 'Confirm move'}
            </button>
          </div>
        </div>
      )}

      {/* FIX (Sheet row 14 — CM Location flag): previously the only way
          to set is_cm_location/cm_item_id/asset_required on an EXISTING
          location was direct SQL — this is the missing editor. */}
      {showEdit && (
        <div className="admin-section" style={{ marginBottom: '20px' }}>
          <h2 className="admin-section-title">Edit Configuration Management settings</h2>
          <div className="grid grid-cols-2 gap-4 text-sm mt-2">
            <label className="block">
              <span className="form-label">Position</span>
              <input className="form-input" value={editForm.position} onChange={(e) => setEditForm({ ...editForm, position: e.target.value })} placeholder="e.g. SLOT_1" />
            </label>
            <div />
            <label className="flex items-center gap-2 text-sm text-slate-700 col-span-2">
              <input
                type="checkbox"
                checked={editForm.isCmLocation}
                onChange={(e) => setEditForm({ ...editForm, isCmLocation: e.target.checked })}
              />
              CM Location — this location requires a specific Item
            </label>
            {editForm.isCmLocation && (
              <>
                <label className="block">
                  <span className="form-label">Required Item</span>
                  <select className="form-input" value={editForm.cmItemId} onChange={(e) => setEditForm({ ...editForm, cmItemId: e.target.value })}>
                    <option value="">— None configured —</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.itemNum} — {i.description}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editForm.assetRequired}
                    onChange={(e) => setEditForm({ ...editForm, assetRequired: e.target.checked })}
                  />
                  Asset Required (flag as a gap if empty)
                </label>
              </>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button type="button" className="btn-primary !w-auto px-6" disabled={savingEdit} onClick={saveEdit}>
              {savingEdit ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="admin-section grid grid-cols-2 gap-4 text-sm" style={{ marginBottom: '20px' }}>
        <div><span className="form-label">Type</span><p>{location.type ?? '—'}</p></div>
        <div>
          <span className="form-label">Status</span>
          <p>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${location.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
              {location.isActive ? 'Active' : 'Inactive'}
            </span>
          </p>
        </div>
        <div><span className="form-label">Description</span><p>{location.description ?? '—'}</p></div>
        <div><span className="form-label">Created by</span><p>{location.createdByName ?? '—'}</p></div>
        <div><span className="form-label">Created date</span><p>{location.createdAt ? new Date(location.createdAt).toLocaleString() : '—'}</p></div>
        <div>
          <span className="form-label">Parent location</span>
          <p>
            {location.parentId ? (
              <Link to={`/locations/${location.parentId}`} className="text-accent hover:underline">
                {location.parentCode} — {location.parentName}
              </Link>
            ) : '—'}
          </p>
        </div>
        <div><span className="form-label">Site</span><p>{location.siteName ?? '—'}</p></div>
        <div><span className="form-label">Organisation</span><p>{location.orgName ?? '—'}</p></div>
        {/* FIX (P1-1 gap — materialized path): shown raw (dot-separated
            ancestor ids, root-first, ending in this location's own id)
            rather than translated into a code/name breadcrumb — the
            point of surfacing it here is to make the underlying stored
            value directly checkable, e.g. after a Move below, this
            should visibly change to start with the new parent's id. */}
        <div className="col-span-2">
          <span className="form-label">Materialized path (internal)</span>
          <p className="font-mono text-xs text-slate-500 break-all">{location.path}</p>
        </div>
        {/* FIX (Sheet row 2): only shown when set — a blank position just
            means this location was never assigned a slot identifier. */}
        {location.position && (
          <div><span className="form-label">Position</span><p>{location.position}</p></div>
        )}
        <div><span className="form-label">GL Account</span><p>{location.glAccount ?? '—'}</p></div>
        <div><span className="form-label">Cost Center</span><p>{location.costCenter ?? '—'}</p></div>
      </div>

      {/* FIX (Sheet rows 4/5 testability): what's actually installed
          here right now — the same data the Move route's parent-link
          logic reads internally, made visible in the UI. */}
      <div className="admin-section" style={{ marginBottom: '20px' }}>
        <h2 className="admin-section-title">Assets installed here</h2>
        {location.installedAssets.length === 0 ? (
          <p className="text-slate-400 text-sm mt-2">No assets currently installed at this location.</p>
        ) : (
          <table className="admin-table mt-2">
            <thead><tr><th>Asset #</th><th>Description</th><th>Parent asset</th></tr></thead>
            <tbody>
              {location.installedAssets.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/assets/${a.id}`} className="text-accent hover:underline">{a.assetNum}</Link></td>
                  <td>{a.description}</td>
                  <td>{a.parentAssetId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <LocationMetersSection locationId={location.id} />

      <div className="admin-section">
        <h2 className="admin-section-title">Child locations</h2>
        {location.childLocations.length === 0 ? (
          <p className="text-slate-400 text-sm mt-2">No child locations.</p>
        ) : (
          <table className="admin-table mt-2">
            <thead><tr><th>Code</th><th>Name</th><th>CM Location?</th></tr></thead>
            <tbody>
              {location.childLocations.map((c) => (
                <tr key={c.id}>
                  <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{c.code}</code></td>
                  <td><Link to={`/locations/${c.id}`} className="text-accent hover:underline">{c.name}</Link></td>
                  <td>{c.isCmLocation ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-section" style={{ marginTop: '20px' }}>
        <div className="flex justify-between items-center">
          <h2 className="admin-section-title">Subtree (via materialized path)</h2>
          <button type="button" className="btn-outline-light !w-auto px-4 text-sm" disabled={loadingSubtree} onClick={loadSubtree}>
            {loadingSubtree ? 'Loading…' : subtree ? 'Reload subtree' : 'Load subtree'}
          </button>
        </div>
        {subtree && (
          <div className="mt-3">
            {renderSubtreeNode(subtree)}
          </div>
        )}
      </div>
    </IdentityPageLayout>
  );
}
