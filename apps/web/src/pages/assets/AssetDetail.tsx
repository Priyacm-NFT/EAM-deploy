import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { AttachmentPanel } from '../../components/AttachmentPanel.js';

// FIX: added 'subassemblies' tab — the Maximo-equivalent "Subassemblies"
// table window that lists the immediate children of this asset.
type Tab = 'overview' | 'subassemblies' | 'meters' | 'spares' | 'workorders' | 'kpis' | 'downtime' | 'classification' | 'history' | 'statusHistory' | 'attachments';

interface Asset {
  id: string; assetNum: string; description: string; status: string;
  criticality: string | null; manufacturer: string | null; model: string | null;
  serialNum: string | null; locationCode: string | null; locationName: string | null;
  siteNum: string | null; siteName: string | null;
  siteId: string | null;
  classDescription: string | null; installDate: string | null;
  warrantyExpiry: string | null; purchaseCost: string | null;
  replacementCost: string | null; notes: string | null;
  parentAssetId: string | null;
  parentAssetNum: string | null;
  parentAssetDescription: string | null;
  // FIX: rotating-asset flag — when true, the "Move" action below also
  // rolls the asset's Site/Org forward to match the destination location,
  // mirroring IBM Maximo's rotating-asset behaviour.
  isRotating: boolean;
  // FIX (Sheet row 2): position copied from the Location at install
  // time, retained on uninstall — see /assets/:id/move in assets.ts.
  position: string | null;
  // FIX (Sheet row 12 — Classification attribute inheritance from Item,
  // with per-attribute override lock): itemId is the linked Rotating
  // Item; classAttributes holds the asset's current spec values;
  // classAttributeOverrides marks which of those values are manually
  // locked (false) vs still inheriting from the Item (true/absent).
  itemId: string | null;
  itemNum: string | null;
  itemDescription: string | null;
  // FIX: assetType (Sheet row 7) and the Sheet row 13 Linear Asset
  // fields were both missing from this interface — neither had anywhere
  // to display on the Overview tab even though the backend now returns
  // them (see the GET /assets/:id select fix in assets.ts).
  assetType?: 'NORMAL' | 'STRUCTURAL';
  isLinear?: boolean;
  lengthUnit: string | null;
  totalLength: string | null;
  // FIX: "created by / created date" for master-data records — see the
  // GET /assets/:id select fix in assets.ts.
  createdByUserId?: string | null;
  createdByName?: string | null;
  createdAt?: string;
  classAttributes: Record<string, unknown> | null;
  classAttributeOverrides: Record<string, boolean> | null;
  customData: Record<string, unknown> | null;
}

// FIX: minimal location shape for the "Move asset" dialog's destination
// picker.
interface LocationOption { id: string; name: string; code: string }

interface ChildAsset {
  id: string; assetNum: string; description: string;
  status: string; criticality: string | null;
}

// FIX: previously this interface used meterName/uom/currentReading —
// none of which the backend's GET /assets/:id/meters route (a plain
// `select()` over the assetMeters table) actually returns. The real
// columns are name/unit/lastReading/rolldown/meterType. This mismatch
// is also what caused the meter-creation 500 error (see the Save
// handler below) — the form's local state used the wrong key names and
// silently sent `name: undefined` to a NOT NULL column.
// FIX (Maximo rolldown parity): `rolldown` (boolean, lived on the source
// meter) is replaced by `acceptRolldownFrom` — Maximo puts this control
// on the *receiving* meter: does this asset meter accept a rolled-down
// reading from its parent asset's meter of the same name, from its
// location's meter of the same name, or neither (NONE).
interface Meter { id: string; name: string; meterType: string; unit: string | null; lastReading: string | null; acceptRolldownFrom: 'NONE' | 'PARENT_ASSET' | 'LOCATION' }

// FIX (P1-1 gap — asset_spares / BOM tab): matches the shape returned by
// GET /assets/:id/spares (a join against items for itemNum/description/
// unitOfIssue, alongside quantity/notes from asset_spares itself).
interface Spare { id: string; itemId: string; quantity: number; notes: string | null; itemNum: string; itemDescription: string; unitOfIssue: string | null }
interface ItemOption { id: string; itemNum: string; description: string; }
interface DowntimeLog { id: string; startTime: string; endTime: string | null; reasonCode: string | null; notes: string | null }
interface Availability { availabilityPct: number; totalMs: number; downtimeMs: number; windowStart: string; windowEnd: string }
interface WorkOrder { id: string; woNum: string; description: string; status: string; priority: string; targetFinishDate: string | null }
interface Kpis {
  mtbfHours: number | null;
  mttrHours: number | null;
  availabilityPct: number | null;
  totalDowntimeHours: number;
  totalMaintenanceCost: number;
  ageDays: number | null;
  cmCount: number;
}
interface MoveHistory { id: string; fromLocation: string | null; toLocation: string | null; movedAt: string; notes: string | null; movedByName: string | null }
// FIX: "we should maintain the status history for all the application" —
// frontend shape matching GET /assets/:id/status-history.
interface StatusHistoryEntry { id: string; fromStatus: string | null; toStatus: string; changedAt: string; notes: string | null; changedByName: string | null }

function formatLocationLabel(code: string | null | undefined, name: string | null | undefined): string {
  if (code && name) return `${code} - ${name}`;
  return name ?? code ?? '—';
}

const STATUS_PILL: Record<string, string> = {
  OPERATING: 'bg-green-100 text-green-800',
  IDLE: 'bg-slate-100 text-slate-600',
  UNDER_MAINTENANCE: 'bg-yellow-100 text-yellow-800',
  DECOMMISSIONED: 'bg-red-100 text-red-800',
};

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [asset, setAsset] = useState<Asset | null>(null);
  const [children, setChildren] = useState<ChildAsset[]>([]);
  const [meters, setMeters] = useState<Meter[]>([]);
  // FIX (Sheet row 11 — Downtime tracking directly on Asset record): the
  // backend already had GET/POST /assets/:id/downtime and
  // GET /assets/:id/availability built (Rows 5-13 batch) — this is the
  // missing UI piece so it's actually usable from the website.
  const [downtimeLogs, setDowntimeLogs] = useState<DowntimeLog[]>([]);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [showDowntimeForm, setShowDowntimeForm] = useState(false);
  const [downtimeForm, setDowntimeForm] = useState({ startTime: '', endTime: '', reasonCode: '', notes: '' });
  const [savingDowntime, setSavingDowntime] = useState(false);
  // FIX (Sheet row 12): local editable copy of classAttributes — keeping
  // a separate draft from `asset.classAttributes` so the user can edit a
  // value and see immediately (before saving) which attribute that edit
  // is about to lock, without needing a round-trip to the server first.
  const [classAttrDraft, setClassAttrDraft] = useState<Record<string, string>>({});
  const [savingClassAttr, setSavingClassAttr] = useState(false);
  const [syncingFromItem, setSyncingFromItem] = useState(false);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState('');
  const [history, setHistory] = useState<MoveHistory[]>([]);
  const [statusHistoryLog, setStatusHistoryLog] = useState<StatusHistoryEntry[]>([]);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [qrData, setQrData] = useState('');
  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  const [readingMeter, setReadingMeter] = useState<Meter | null>(null);
  const [readingValue, setReadingValue] = useState('');
  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingReading, setSavingReading] = useState(false);
  // FIX (P1-1 gap — CONTINUOUS meter rollback validation UI): the
  // backend now rejects a reading lower than the meter's last reading
  // for a CONTINUOUS meter unless isRollover:true is sent. This holds
  // the structured 400 response (currentReading/submittedReading) so a
  // "confirm this is a rollover" checkbox can be revealed instead of
  // just showing a dead-end error banner.
  const [rolloverPrompt, setRolloverPrompt] = useState<{ currentReading: number; submittedReading: number } | null>(null);
  const [confirmRollover, setConfirmRollover] = useState(false);
  const [showMeterForm, setShowMeterForm] = useState(false);
  const [meterForm, setMeterForm] = useState({ meterName: '', meterType: 'CONTINUOUS', uom: '', acceptRolldownFrom: 'NONE' as 'NONE' | 'PARENT_ASSET' | 'LOCATION' });
  const [savingMeter, setSavingMeter] = useState(false);

  // FIX (P1-1 gap — asset_spares / BOM tab)
  const [spares, setSpares] = useState<Spare[]>([]);
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [showSpareForm, setShowSpareForm] = useState(false);
  const [spareForm, setSpareForm] = useState({ itemId: '', quantity: '1', notes: '' });
  const [savingSpare, setSavingSpare] = useState(false);
  const [editingSpareId, setEditingSpareId] = useState<string | null>(null);

  async function submitSpare() {
    if (!id || !spareForm.itemId) return;
    setSavingSpare(true); setError('');
    try {
      await api(`/assets/${id}/spares`, {
        method: 'POST',
        body: JSON.stringify({ itemId: spareForm.itemId, quantity: Number(spareForm.quantity) || 1, notes: spareForm.notes || undefined }),
      });
      const updated = await api<Spare[]>(`/assets/${id}/spares`);
      setSpares(updated);
      setShowSpareForm(false);
      setSpareForm({ itemId: '', quantity: '1', notes: '' });
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingSpare(false);
    }
  }

  async function updateSpareQuantity(spareId: string, quantity: number, notes: string | null) {
    if (!id) return;
    try {
      await api(`/assets/${id}/spares/${spareId}`, { method: 'PUT', body: JSON.stringify({ quantity, notes }) });
      const updated = await api<Spare[]>(`/assets/${id}/spares`);
      setSpares(updated);
      setEditingSpareId(null);
    } catch (e) {
      setError(String(e));
    }
  }

  async function deleteSpare(spareId: string) {
    if (!id) return;
    if (!window.confirm('Remove this spare part from the list?')) return;
    try {
      await api(`/assets/${id}/spares/${spareId}`, { method: 'DELETE' });
      setSpares((prev) => prev.filter((s) => s.id !== spareId));
    } catch (e) {
      setError(String(e));
    }
  }

  // FIX: "Move asset" dialog state — this is the action that actually
  // triggers a rotating asset's move, calling POST /assets/:id/move,
  // which rolls the Site/Org forward automatically when the asset is
  // flagged as rotating.
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveToLocationId, setMoveToLocationId] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!id) return;
    setKpis(null);
    setKpisLoading(true);
    setKpisError('');
    api<Asset>(`/assets/${id}`)
      .then((a) => {
        setAsset(a);
        setCustomData((a.customData as Record<string, unknown>) ?? {});
        // FIX (Sheet row 12): seed the editable draft from whatever the
        // asset already has, stringified for plain text inputs — values
        // could be numbers, booleans, etc. in the underlying JSONB.
        const attrs = (a.classAttributes as Record<string, unknown>) ?? {};
        setClassAttrDraft(Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)])));
      })
      .catch((e) => { setError(String(e)); setLoadFailed(true); });
    api<Meter[]>(`/assets/${id}/meters`).then(setMeters).catch(() => {});
    api<Spare[]>(`/assets/${id}/spares`).then(setSpares).catch(() => {});
    api<{ data: ItemOption[] } | ItemOption[]>('/items?pageSize=200')
      .then((r) => setItemOptions(Array.isArray(r) ? r : (r as { data: ItemOption[] }).data ?? []))
      .catch(() => setItemOptions([]));
    api<{ data: WorkOrder[] } | WorkOrder[]>(`/work-orders?assetId=${id}`)
      .then((r) => setWorkOrders(Array.isArray(r) ? r : r.data ?? []))
      .catch(() => {});
    api<Kpis>(`/assets/${id}/kpis`)
      .then((data) => { setKpis(data); setKpisError(''); })
      .catch((e) => { setKpis(null); setKpisError(String(e)); })
      .finally(() => setKpisLoading(false));
    api<DowntimeLog[]>(`/assets/${id}/downtime`).then(setDowntimeLogs).catch(() => {});
    api<Availability>(`/assets/${id}/availability`).then(setAvailability).catch(() => {});
    api<MoveHistory[]>(`/assets/${id}/move-history`).then(setHistory).catch(() => {});
    api<StatusHistoryEntry[]>(`/assets/${id}/status-history`).then(setStatusHistoryLog).catch(() => {});
    api<{ dataUrl: string }>(`/assets/${id}/qrcode`).then((r) => setQrData(r.dataUrl)).catch(() => {});
    api<ChildAsset[]>(`/assets/${id}/children`).then(setChildren).catch(() => setChildren([]));
  }, [id]);

  // Load locations for the Move dialog — scoped to the asset's current Site only.
  useEffect(() => {
    if (!showMoveDialog) {
      setLocations([]);
      return;
    }
    const siteId = asset?.siteId;
    if (!siteId) {
      setLocations([]);
      return;
    }
    api<LocationOption[]>(`/locations?flat=true&siteId=${encodeURIComponent(siteId)}`)
      .then(setLocations)
      .catch(() => setLocations([]));
  }, [showMoveDialog, asset?.siteId]);

  // FIX: submits the move — calls the existing POST /assets/:id/move
  // endpoint, which (server-side) rolls Site/Org forward automatically
  // when the asset is flagged isRotating. After the move, we refetch the
  // asset and its move history so the page reflects the new
  // location/site/org and the new history row immediately.
  const submitMove = async () => {
    if (!moveToLocationId) return;
    setMoving(true);
    setError('');
    try {
      await api(`/assets/${id}/move`, {
        method: 'POST',
        body: JSON.stringify({ toLocationId: moveToLocationId, reason: moveReason || undefined }),
      });
      const [updatedAsset, updatedHistory] = await Promise.all([
        api<Asset>(`/assets/${id}`),
        api<MoveHistory[]>(`/assets/${id}/move-history`),
      ]);
      setAsset(updatedAsset);
      setHistory(updatedHistory);
      setShowMoveDialog(false);
      setMoveToLocationId('');
      setMoveReason('');
    } catch (e) {
      setError(String(e));
    } finally {
      setMoving(false);
    }
  };

  const submitReading = async () => {
    if (!readingMeter) return;
    setSavingReading(true);
    try {
      // FIX: same field-mismatch bug as meter creation above — the
      // backend's POST .../readings route expects { value, readingDate },
      // not { reading, readingDate }. Sending the wrong key meant
      // body.value was undefined server-side, so `parseFloat(undefined)`
      // produced NaN for every reading saved this way — which would have
      // silently broken the meter-rolldown cascade (Sheet row 8) even
      // for requests that didn't 500, since a NaN delta still gets
      // written rather than rejected.
      await api(`/assets/${id}/meters/${readingMeter.id}/readings`, {
        method: 'POST',
        body: JSON.stringify({ value: readingValue, readingDate, isRollover: confirmRollover || undefined }),
      });
      const updated = await api<Meter[]>(`/assets/${id}/meters`);
      setMeters(updated);
      setReadingMeter(null);
      setReadingValue('');
      setRolloverPrompt(null);
      setConfirmRollover(false);
    } catch (e) {
      // FIX (P1-1 gap — CONTINUOUS meter rollback validation UI): the
      // backend's 400 for this specific case carries currentReading and
      // submittedReading alongside the message (see the api() client fix
      // that now attaches the full error payload). When present, show a
      // rollover-confirmation checkbox instead of a dead-end error.
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

  if (!asset) return (
    <div className="admin-page flex flex-col items-center justify-center min-h-[300px] gap-4">
      {loadFailed ? (
        <>
          <p className="text-red-500 font-medium">Failed to load asset.</p>
          <p className="text-slate-400 text-sm">{error}</p>
          <button className="btn-outline !w-auto px-4" onClick={() => window.history.back()}>
            ← Go back
          </button>
        </>
      ) : (
        <div className="flex items-center gap-3 text-slate-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
          </svg>
          Loading asset…
        </div>
      )}
    </div>
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'subassemblies', label: `Subassemblies (${children.length})` },
    { id: 'meters', label: `Meters (${meters.length})` },
    { id: 'spares', label: `Spares (${spares.length})` },
    { id: 'workorders', label: `Work Orders (${workOrders.length})` },
    { id: 'kpis', label: 'KPIs' },
    { id: 'downtime', label: `Downtime (${downtimeLogs.length})` },
    { id: 'classification', label: `Classification (${Object.keys(classAttrDraft).length})` },
    { id: 'history', label: `Move History (${history.length})` },
    { id: 'statusHistory', label: `Status History (${statusHistoryLog.length})` },
    { id: 'attachments', label: 'Attachments' },
  ];

  return (
    <IdentityPageLayout title={asset.assetNum} backTo="/assets" backLabel="Back to assets">
      <div>
      {error && <MessageBanner type="error" text={error} />}

      <div className="flex items-start gap-4 mb-4">
        <div className="flex-1">
          <p className="text-lg font-medium text-white/95">{asset.description}</p>
          <div className="flex gap-2 mt-1 items-center flex-wrap">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[asset.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {asset.status}
            </span>
            {asset.criticality && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">{asset.criticality}</span>
            )}
            {/* FIX: rotating-asset badge — visible at a glance, just like
                Maximo flags a rotating item differently from a fixed one. */}
            {asset.isRotating && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-cyan-100 text-cyan-700" title="This is a rotating asset — moving it updates its Site/Org automatically">
                🔄 Rotating
              </span>
            )}
            {asset.parentAssetId && (
              <Link
                to={`/assets/${asset.parentAssetId}`}
                className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                title="Go to parent asset"
              >
                ⬆ Parent: {asset.parentAssetNum} — {asset.parentAssetDescription}
              </Link>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/chat?context=Asset&contextId=${id}&contextLabel=${encodeURIComponent(`Asset: ${asset.assetNum}`)}`} className="btn-outline !w-auto px-4 text-sm">💬 Chat</Link>
          {/* FIX: "Move" action — the trigger for rotating-asset behaviour.
              Always available (a non-rotating asset can still be
              relocated the old way), but only rotating assets get the
              automatic Site/Org roll-forward server-side. */}
          <button type="button" className="btn-outline !w-auto px-4 text-sm" onClick={() => setShowMoveDialog(true)}>
            ⇄ Move
          </button>
          <Link to={`/assets/${id}/edit`} className="btn-primary !w-auto px-4 text-sm">Edit</Link>
          {qrData && (
            <a href={qrData} download={`${asset.assetNum}-qr.png`} className="btn-link text-sm">QR Code</a>
          )}
        </div>
      </div>

      {/* FIX: Move asset dialog — destination location picker. For a
          rotating asset, submitting this rolls the Site/Org forward to
          match the new location automatically (handled server-side in
          POST /assets/:id/move); for a non-rotating asset, only the
          location changes, Site/Org stay as they were. */}
      {showMoveDialog && (
        <div className="admin-section bg-cyan-50 border border-cyan-200 mb-4">
          <p className="font-medium mb-2 text-cyan-900">
            Move {asset.assetNum}
            {asset.isRotating && <span className="text-xs font-normal text-cyan-700 ml-2">(rotating — Site/Org will update to match the new location)</span>}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="form-label">Destination location</span>
              <select className="form-input" value={moveToLocationId} onChange={(e) => setMoveToLocationId(e.target.value)} disabled={!asset.siteId || locations.length === 0}>
                <option value="">{!asset.siteId ? '— Asset has no Site —' : locations.length === 0 ? '— No locations in this Site —' : '— Select location —'}</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.code} – {l.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="form-label">Reason (optional)</span>
              <input className="form-input" value={moveReason} onChange={(e) => setMoveReason(e.target.value)} placeholder="e.g. Installed on Pump-07 after repair" />
            </label>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" className="btn-primary !w-auto px-4" onClick={submitMove} disabled={moving || !moveToLocationId}>
              {moving ? 'Moving…' : 'Confirm move'}
            </button>
            <button type="button" className="btn-link" onClick={() => setShowMoveDialog(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-4 mt-2 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <>
          {/* FIX: Asset + Description header block — Maximo always shows
              the Description and Asset Number prominently at the top of
              the asset record (the page title shows the asset number too,
              but it's easy to miss when scrolling — this row makes it
              unmissable directly above the field grid). */}
          <div className="admin-section grid grid-cols-2 gap-4 text-sm" style={{ marginBottom: '12px' }}>
            <div>
              <span className="form-label">Asset</span>
              <p className="font-mono font-semibold text-slate-900">{asset.assetNum}</p>
            </div>
            <div>
              <span className="form-label">Description</span>
              <p className="font-medium text-slate-900">{asset.description}</p>
            </div>
          </div>
          <div className="admin-section grid grid-cols-2 gap-4 text-sm" style={{ marginBottom: '20px' }}>
          <div>
            <span className="form-label">
              {asset.isRotating ? 'Currently in use at (Location)' : 'Location'}
            </span>
            <p>{formatLocationLabel(asset.locationCode, asset.locationName)}</p>
          </div>
          <div>
            <span className="form-label">
              {asset.isRotating ? 'Currently in use at (Site)' : 'Site'}
            </span>
            <p>{asset.siteNum ?? '—'}</p>
          </div>
          <div><span className="form-label">Asset Type</span><p>{asset.assetType === 'STRUCTURAL' ? 'Structural — fixed infrastructure' : 'Normal — installable/removable'}</p></div>
          <div>
            <span className="form-label">Parent asset</span>
            <p>
              {asset.parentAssetId ? (
                <Link to={`/assets/${asset.parentAssetId}`} className="text-blue-600 hover:underline">
                  {asset.parentAssetNum} — {asset.parentAssetDescription}
                </Link>
              ) : '— (top-level asset)'}
            </p>
          </div>
          {/* FIX: master-data audit trail — createdAt already displayed
              nowhere on this page either; both are new here. */}
          <div><span className="form-label">Created by</span><p>{asset.createdByName ?? '—'}</p></div>
          <div><span className="form-label">Created date</span><p>{asset.createdAt ? new Date(asset.createdAt).toLocaleString() : '—'}</p></div>
          {/* FIX (Sheet row 2): copied from the Location at install, kept
              even after an uninstall — shown whenever it's set, since an
              empty value just means this asset was never installed into
              a position-bearing slot. */}
          {asset.position && (
            <div><span className="form-label">Position</span><p>{asset.position}</p></div>
          )}
          {asset.isLinear && (
            <div>
              <span className="form-label">Linear length</span>
              <p>{asset.totalLength ? `${asset.totalLength} ${asset.lengthUnit ?? ''}`.trim() : '— (length not set)'}</p>
            </div>
          )}
          <div><span className="form-label">Manufacturer / Model</span><p>{[asset.manufacturer, asset.model].filter(Boolean).join(' / ') || '—'}</p></div>
          <div><span className="form-label">Serial number</span><p>{asset.serialNum ?? '—'}</p></div>
          <div><span className="form-label">Install date</span><p>{asset.installDate ? new Date(asset.installDate).toLocaleDateString() : '—'}</p></div>
          <div><span className="form-label">Warranty expiry</span><p>{asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString() : '—'}</p></div>
          <div><span className="form-label">Purchase cost</span><p>{asset.purchaseCost ? `$${parseFloat(asset.purchaseCost).toLocaleString()}` : '—'}</p></div>
          <div><span className="form-label">Replacement cost</span><p>{asset.replacementCost ? `$${parseFloat(asset.replacementCost).toLocaleString()}` : '—'}</p></div>
          {asset.notes && <div className="col-span-2"><span className="form-label">Notes</span><p className="whitespace-pre-wrap">{asset.notes}</p></div>}
        </div>
        </>
      )}
      {tab === 'overview' && (
        <DynamicFormRenderer
          entityName="Asset"
          record={asset as unknown as Record<string, unknown>}
          values={customData}
          onChange={(key, val) => setCustomData((prev) => ({ ...prev, [key]: val }))}
          readOnly
        />
      )}

      {tab === 'subassemblies' && (
        <div className="admin-section">
          <div className="flex justify-between items-center mb-3">
            <h2 className="admin-section-title">Subassemblies</h2>
            <Link to={`/assets/new?parentAssetId=${id}`} className="btn-primary !w-auto px-4 text-sm">+ New sub-asset</Link>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Immediate child assets of {asset.assetNum}. To see a child's own subassemblies, open it and check its Subassemblies tab.
          </p>
          {children.length === 0 ? (
            <p className="text-slate-400 text-sm">No subassemblies. Use "Edit" on another asset and set its Parent asset to this one, or click "+ New sub-asset" above.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="pb-2 pr-4">Asset</th>
                  <th className="pb-2 pr-4">Description</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2">Criticality</th>
                </tr>
              </thead>
              <tbody>
                {children.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs">
                      <Link to={`/assets/${c.id}`} className="text-blue-600 hover:underline" title="Move to this asset">
                        {c.assetNum}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{c.description}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[c.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2 text-slate-500">{c.criticality ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Meters tab */}
      {tab === 'meters' && (
        <div className="admin-section">
          <div className="flex justify-between items-center mb-3">
            <h2 className="admin-section-title">Meters</h2>
            <button
              type="button"
              className="btn-primary !w-auto px-4 text-sm"
              onClick={() => setShowMeterForm((v) => !v)}
            >
              + Add meter
            </button>
          </div>

          {showMeterForm && (
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3 mb-4">
              <h3 className="text-sm font-semibold">New meter</h3>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="form-label text-xs">Name</label>
                  <input className="form-input text-sm" value={meterForm.meterName} onChange={(e) => setMeterForm({...meterForm, meterName: e.target.value})} placeholder="Running Hours" /></div>
                <div><label className="form-label text-xs">Type</label>
                  <select className="form-select text-sm" value={meterForm.meterType} onChange={(e) => setMeterForm({...meterForm, meterType: e.target.value})}>
                    <option value="CONTINUOUS">Continuous</option><option value="GAUGE">Gauge</option><option value="CHARACTERISTIC">Characteristic</option></select></div>
                <div><label className="form-label text-xs">UOM</label>
                  <input className="form-input text-sm" value={meterForm.uom} onChange={(e) => setMeterForm({...meterForm, uom: e.target.value})} placeholder="hours" /></div>
              </div>
              {/* FIX (Maximo rolldown parity): only meaningful for
                  CONTINUOUS meters (a cumulative reading makes sense to
                  cascade); a GAUGE or CHARACTERISTIC meter represents a
                  point-in-time state that shouldn't blindly propagate,
                  so this only shows for CONTINUOUS. Three-way choice
                  matching Maximo's own "Accept Rolldown From" field —
                  this meter can pull from its parent asset's meter of
                  the same name, from its location's meter of the same
                  name, or accept no rolldown at all. */}
              {meterForm.meterType === 'CONTINUOUS' && (
                <div>
                  <label className="form-label text-xs">Accept Rolldown From</label>
                  <select
                    className="form-select text-sm"
                    value={meterForm.acceptRolldownFrom}
                    onChange={(e) => setMeterForm({ ...meterForm, acceptRolldownFrom: e.target.value as 'NONE' | 'PARENT_ASSET' | 'LOCATION' })}
                  >
                    <option value="NONE">None</option>
                    <option value="PARENT_ASSET">Parent asset (same-named meter)</option>
                    <option value="LOCATION">Location (same-named meter)</option>
                  </select>
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary !w-auto px-4 text-sm"
                  disabled={savingMeter || !meterForm.meterName.trim()}
                  onClick={async () => {
                    // FIX: real bug found during Meter Rolldown testing —
                    // an accidental double-click on Save created two
                    // identically-named meters on the same asset, which
                    // silently broke the rolldown cascade (the lookup in
                    // assets.ts matches by name, and two same-named
                    // parent meters make that ambiguous). Disabling the
                    // button for the duration of the request — not just
                    // a debounce — is what actually closes this, since a
                    // fast double-click can fire before any debounce
                    // window would even start.
                    if (savingMeter) return;
                    setSavingMeter(true);
                    try {
                      // FIX: previously sent the raw meterForm object
                      // ({ meterName, meterType, uom, ... }) directly as
                      // the request body — but the backend's POST
                      // /assets/:id/meters route expects { name, unit,
                      // meterType, acceptRolldownFrom }. The mismatched
                      // key names (meterName vs name, uom vs unit) meant
                      // `name` arrived as undefined → JSON.stringify
                      // drops undefined keys entirely → Postgres saw a
                      // literal NULL for a NOT NULL column and threw a
                      // 500. Map the field names explicitly here instead
                      // of trusting the local state shape to match the
                      // API.
                      await api(`/assets/${id}/meters`, {
                        method: 'POST',
                        body: JSON.stringify({
                          name: meterForm.meterName,
                          unit: meterForm.uom,
                          meterType: meterForm.meterType,
                          acceptRolldownFrom: meterForm.meterType === 'CONTINUOUS' ? meterForm.acceptRolldownFrom : 'NONE',
                        }),
                      });
                      api<Meter[]>(`/assets/${id}/meters`).then(setMeters);
                      setShowMeterForm(false);
                      setMeterForm({ meterName: '', meterType: 'CONTINUOUS', uom: '', acceptRolldownFrom: 'NONE' });
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
                  <th className="pb-2 pr-4">Accept Rolldown From</th>
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
                    {/* FIX (Maximo rolldown parity): editable in place —
                        matches Maximo's own list-view editable field for
                        this setting, and is the only way to change it
                        after creation now that the PUT route exists. */}
                    <td className="py-2 pr-4">
                      {m.meterType === 'CONTINUOUS' ? (
                        <select
                          className="form-select text-xs"
                          value={m.acceptRolldownFrom}
                          onChange={async (e) => {
                            const acceptRolldownFrom = e.target.value as 'NONE' | 'PARENT_ASSET' | 'LOCATION';
                            try {
                              await api(`/assets/${id}/meters/${m.id}`, { method: 'PUT', body: JSON.stringify({ acceptRolldownFrom }) });
                              api<Meter[]>(`/assets/${id}/meters`).then(setMeters);
                            } catch (e2) {
                              setError(String(e2));
                            }
                          }}
                        >
                          <option value="NONE">None</option>
                          <option value="PARENT_ASSET">Parent asset</option>
                          <option value="LOCATION">Location</option>
                        </select>
                      ) : '—'}
                    </td>
                    <td className="py-2">
                      <button
                        type="button"
                        className="btn-link text-xs"
                        onClick={() => { setReadingMeter(m); setReadingValue(''); }}
                      >
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

              {/* FIX (P1-1 gap — CONTINUOUS meter rollback validation UI):
                  previously a lower reading on a CONTINUOUS meter either
                  saved silently (the bug) or, after the backend fix, just
                  showed a dead-end error banner with no way to actually
                  submit a genuine rollover from the browser. This makes
                  that the deliberate second step it's meant to be. */}
              {rolloverPrompt && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                  <p className="text-amber-800">
                    This meter's current reading is <strong>{rolloverPrompt.currentReading}</strong>, and you entered{' '}
                    <strong>{rolloverPrompt.submittedReading}</strong> — lower than the current value. For a CONTINUOUS
                    meter that usually means a mistake, but if this genuinely rolled over (e.g. an odometer wrapping
                    back to 0), confirm below and save again.
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
      )}

      {/* Spares (BOM) tab — FIX (P1-1 gap — asset_spares) */}
      {tab === 'spares' && (
        <div className="admin-section">
          <div className="flex justify-between items-center mb-3">
            <h2 className="admin-section-title">Spares / BOM</h2>
            <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => setShowSpareForm((v) => !v)}>
              {showSpareForm ? 'Cancel' : '+ Add spare'}
            </button>
          </div>

          {showSpareForm && (
            <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 flex gap-3 items-end flex-wrap">
              <label className="block flex-1 min-w-[220px]">
                <span className="form-label">Item</span>
                <select className="form-input" value={spareForm.itemId} onChange={(e) => setSpareForm({ ...spareForm, itemId: e.target.value })}>
                  <option value="">— Select an item —</option>
                  {itemOptions.map((i) => <option key={i.id} value={i.id}>{i.itemNum} — {i.description}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="form-label">Quantity</span>
                <input type="number" min="1" className="form-input w-24" value={spareForm.quantity} onChange={(e) => setSpareForm({ ...spareForm, quantity: e.target.value })} />
              </label>
              <label className="block flex-1 min-w-[220px]">
                <span className="form-label">Notes</span>
                <input className="form-input" value={spareForm.notes} onChange={(e) => setSpareForm({ ...spareForm, notes: e.target.value })} placeholder="e.g. Reorder from Vendor X" />
              </label>
              <button type="button" className="btn-primary !w-auto px-4" disabled={savingSpare || !spareForm.itemId} onClick={submitSpare}>
                {savingSpare ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          {spares.length === 0 ? (
            <p className="text-slate-400 text-sm mt-2">No spare parts listed for this asset yet.</p>
          ) : (
            <table className="admin-table mt-2">
              <thead><tr><th>Item #</th><th>Description</th><th>Qty</th><th>Unit</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {spares.map((s) => (
                  <tr key={s.id}>
                    <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{s.itemNum}</code></td>
                    <td>{s.itemDescription}</td>
                    <td>
                      {editingSpareId === s.id ? (
                        <input
                          type="number" min="1" className="form-input w-20 text-sm"
                          defaultValue={s.quantity}
                          onBlur={(e) => updateSpareQuantity(s.id, Number(e.target.value) || s.quantity, s.notes)}
                        />
                      ) : (
                        <button type="button" className="btn-link text-sm" onClick={() => setEditingSpareId(s.id)}>{s.quantity}</button>
                      )}
                    </td>
                    <td>{s.unitOfIssue ?? 'EA'}</td>
                    <td className="text-slate-500 text-sm">{s.notes ?? '—'}</td>
                    <td><button type="button" className="btn-link text-xs text-red-600" onClick={() => deleteSpare(s.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Work Orders tab */}
      {tab === 'workorders' && (
        <div className="admin-section">
          <div className="flex justify-between items-center mb-3">
            <h2 className="admin-section-title">Work Orders</h2>
            <Link to={`/work-orders/new?assetId=${id}`} className="btn-primary !w-auto px-4 text-sm">+ New WO</Link>
          </div>
          {workOrders.length === 0 ? (
            <p className="text-slate-400 text-sm">No work orders for this asset.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="pb-2 pr-4">WO #</th>
                  <th className="pb-2 pr-4">Description</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Priority</th>
                  <th className="pb-2">Target finish</th>
                </tr>
              </thead>
              <tbody>
                {workOrders.map((wo) => (
                  <tr key={wo.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs"><Link to={`/work-orders/${wo.id}`} className="text-blue-600">{wo.woNum}</Link></td>
                    <td className="py-2 pr-4">{wo.description}</td>
                    <td className="py-2 pr-4 text-slate-500">{wo.status}</td>
                    <td className="py-2 pr-4 text-slate-500">{wo.priority}</td>
                    <td className="py-2 text-slate-500">{wo.targetFinishDate ? new Date(wo.targetFinishDate).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* KPIs tab */}
      {tab === 'kpis' && (
        <div className="admin-section">
          <h2 className="admin-section-title mb-3">KPIs</h2>
          {kpisLoading ? (
            <p className="text-slate-400 text-sm">Loading KPIs…</p>
          ) : kpisError ? (
            <p className="text-red-600 text-sm">Could not load KPIs: {kpisError}</p>
          ) : !kpis ? (
            <p className="text-slate-400 text-sm">No KPI data available for this asset.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
            {[
            { label: 'MTBF', value: kpis.mtbfHours != null ? `${Number(kpis.mtbfHours).toFixed(0)} hrs` : '—', hint: 'Mean time between failures' },
            { label: 'MTTR', value: kpis.mttrHours != null ? `${Number(kpis.mttrHours).toFixed(1)} hrs` : '—', hint: 'Mean time to repair' },
            { label: 'Availability', value: kpis.availabilityPct != null ? `${Number(kpis.availabilityPct).toFixed(1)}%` : '—', hint: 'From Work Order downtime hours' },
            { label: 'Total downtime', value: `${Number(kpis.totalDowntimeHours ?? 0).toFixed(0)} hrs`, hint: 'From Work Order downtime hours' },
            { label: 'Total maintenance cost', value: `$${Number(kpis.totalMaintenanceCost ?? 0).toLocaleString()}` },
            { label: 'Asset age', value: kpis.ageDays != null ? `${(Number(kpis.ageDays) / 365).toFixed(1)} yrs` : '—' },
            { label: 'CM work orders', value: `${kpis.cmCount ?? 0}` },
          ].map((k) => (
            <div key={k.label} className="bg-slate-50 rounded p-4">
              <p className="text-xs text-slate-500 mb-1">{k.label}</p>
              <p className="text-2xl font-bold text-slate-800">{k.value}</p>
              {k.hint && <p className="text-xs text-slate-400 mt-1">{k.hint}</p>}
            </div>
          ))}
            </div>
          )}
        </div>
      )}

      {/* FIX (Sheet row 11 — Downtime tracking directly on Asset record):
          a separate, dedicated downtime log — distinct from the KPIs
          tab's Availability figure above, which derives from Work Order
          downtimeHours. This tab's Availability % comes from explicit
          downtime PERIODS logged directly against the asset (start/end
          timestamps, with or without a linked Work Order), matching real
          Maximo's confirmed approach of tracking downtime as its own
          record rather than only inferring it from WO fields. */}
      {tab === 'downtime' && (
        <div className="admin-section">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h2 className="admin-section-title !mb-0 !border-0 !pb-0">Downtime log</h2>
              {availability && (
                <p className="text-xs text-slate-500 mt-1">
                  Availability: <span className="font-semibold text-slate-700">{availability.availabilityPct.toFixed(1)}%</span>
                  {' '}— based on {(availability.downtimeMs / 3_600_000).toFixed(1)} downtime hours logged below
                </p>
              )}
            </div>
            <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => setShowDowntimeForm((v) => !v)}>
              {showDowntimeForm ? 'Cancel' : '+ Log downtime'}
            </button>
          </div>

          {showDowntimeForm && (
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label">Start time *</label>
                  <input type="datetime-local" className="form-input text-sm" value={downtimeForm.startTime}
                    onChange={(e) => setDowntimeForm({ ...downtimeForm, startTime: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">End time (leave blank if still down)</label>
                  <input type="datetime-local" className="form-input text-sm" value={downtimeForm.endTime}
                    onChange={(e) => setDowntimeForm({ ...downtimeForm, endTime: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Reason code</label>
                  <input className="form-input text-sm" placeholder="e.g. BREAKDOWN" value={downtimeForm.reasonCode}
                    onChange={(e) => setDowntimeForm({ ...downtimeForm, reasonCode: e.target.value })} />
                </div>
                <div>
                  <label className="form-label">Notes</label>
                  <input className="form-input text-sm" value={downtimeForm.notes}
                    onChange={(e) => setDowntimeForm({ ...downtimeForm, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary !w-auto px-4 text-sm"
                  disabled={savingDowntime || !downtimeForm.startTime}
                  onClick={async () => {
                    setSavingDowntime(true);
                    try {
                      await api(`/assets/${id}/downtime`, {
                        method: 'POST',
                        body: JSON.stringify({
                          startTime: new Date(downtimeForm.startTime).toISOString(),
                          endTime: downtimeForm.endTime ? new Date(downtimeForm.endTime).toISOString() : undefined,
                          reasonCode: downtimeForm.reasonCode || undefined,
                          notes: downtimeForm.notes || undefined,
                        }),
                      });
                      const [logs, avail] = await Promise.all([
                        api<DowntimeLog[]>(`/assets/${id}/downtime`),
                        api<Availability>(`/assets/${id}/availability`),
                      ]);
                      setDowntimeLogs(logs);
                      setAvailability(avail);
                      setShowDowntimeForm(false);
                      setDowntimeForm({ startTime: '', endTime: '', reasonCode: '', notes: '' });
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setSavingDowntime(false);
                    }
                  }}
                >
                  {savingDowntime ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn-outline-light text-sm" disabled={savingDowntime} onClick={() => setShowDowntimeForm(false)}>Cancel</button>
              </div>
            </div>
          )}

          {downtimeLogs.length === 0 ? (
            <p className="text-slate-400 text-sm">No downtime logged yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="pb-2 pr-4">Start</th>
                  <th className="pb-2 pr-4">End</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2 pr-4">Reason</th>
                  <th className="pb-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {downtimeLogs.map((log) => {
                  const start = new Date(log.startTime);
                  const end = log.endTime ? new Date(log.endTime) : null;
                  const durationHrs = end ? ((end.getTime() - start.getTime()) / 3_600_000).toFixed(1) : null;
                  return (
                    <tr key={log.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4">{start.toLocaleString()}</td>
                      <td className="py-2 pr-4">{end ? end.toLocaleString() : <span className="text-amber-600">Ongoing</span>}</td>
                      <td className="py-2 pr-4 text-slate-500">{durationHrs ? `${durationHrs} hrs` : '—'}</td>
                      <td className="py-2 pr-4 text-slate-500">{log.reasonCode ?? '—'}</td>
                      <td className="py-2 text-slate-500">{log.notes ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* FIX (Sheet row 12 — Classification attribute inheritance from
          Item, with per-attribute override lock): real Maximo's
          inheritance model — values normally come from the asset's
          linked Rotating Item; editing one directly on the asset locks
          just that attribute so a later Item spec change won't silently
          overwrite a deliberate override. "Sync from Item" re-pulls
          every attribute that ISN'T locked. */}
      {tab === 'classification' && (
        <div className="admin-section">
          {!asset.itemId ? (
            <p className="text-slate-400 text-sm">
              This asset has no linked Item — classification attributes inherit only when an asset is linked to a Rotating Item.
            </p>
          ) : (
            <>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="admin-section-title !mb-0 !border-0 !pb-0">Classification attributes</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Linked Item: <span className="font-medium text-slate-700">{asset.itemNum} — {asset.itemDescription}</span>
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-outline-light !w-auto px-4 text-sm"
                  disabled={syncingFromItem}
                  onClick={async () => {
                    setSyncingFromItem(true); setError('');
                    try {
                      const updated = await api<Asset>(`/assets/${id}/sync-classification-from-item`, { method: 'POST' });
                      setAsset(updated);
                      const attrs = (updated.classAttributes as Record<string, unknown>) ?? {};
                      setClassAttrDraft(Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, String(v)])));
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setSyncingFromItem(false);
                    }
                  }}
                >
                  {syncingFromItem ? 'Syncing…' : 'Sync from Item'}
                </button>
              </div>

              {Object.keys(classAttrDraft).length === 0 ? (
                <p className="text-slate-400 text-sm">
                  No classification attributes yet. Click "Sync from Item" to pull this asset's specs from {asset.itemNum}.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                      <th className="pb-2 pr-4">Attribute</th>
                      <th className="pb-2 pr-4">Value</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(classAttrDraft).map(([attrName, value]) => {
                      // FIX: an attribute is "locked" only when its entry
                      // in classAttributeOverrides is explicitly false —
                      // missing-from-the-map or true both mean "still
                      // inheriting", matching the backend's own check in
                      // PUT /assets/:id and sync-classification-from-item.
                      const isLocked = asset.classAttributeOverrides?.[attrName] === false;
                      return (
                        <tr key={attrName} className="border-b border-slate-100">
                          <td className="py-2 pr-4 font-medium text-slate-700">{attrName}</td>
                          <td className="py-2 pr-4">
                            <input
                              className="form-input text-sm"
                              value={value}
                              onChange={(e) => setClassAttrDraft((prev) => ({ ...prev, [attrName]: e.target.value }))}
                            />
                          </td>
                          <td className="py-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${isLocked ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-green-100 text-green-800 border-green-200'}`}>
                              {isLocked ? 'Locked (overridden)' : 'Inherited'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {Object.keys(classAttrDraft).length > 0 && (
                <div className="mt-4">
                  <button
                    type="button"
                    className="btn-primary !w-auto px-4 text-sm"
                    disabled={savingClassAttr}
                    onClick={async () => {
                      setSavingClassAttr(true); setError('');
                      try {
                        // FIX: send only the attributes the user actually
                        // changed — the backend's PUT route compares the
                        // submitted value against what's currently
                        // stored and locks exactly those that differ
                        // (see assets.ts). Sending every attribute back
                        // unchanged would still be harmless (no value
                        // differs, nothing new locks), but only sending
                        // real edits keeps the request and the "what did
                        // I just lock" mental model honest.
                        await api(`/assets/${id}`, {
                          method: 'PUT',
                          body: JSON.stringify({ classAttributes: classAttrDraft }),
                        });
                        const updated = await api<Asset>(`/assets/${id}`);
                        setAsset(updated);
                      } catch (e) {
                        setError(String(e));
                      } finally {
                        setSavingClassAttr(false);
                      }
                    }}
                  >
                    {savingClassAttr ? 'Saving…' : 'Save changes'}
                  </button>
                  <p className="text-xs text-slate-400 mt-2">
                    Changing a value here locks that attribute — it will no longer update automatically when you click "Sync from Item."
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Move History tab */}
      {tab === 'history' && (
        <div className="admin-section">
          <h2 className="admin-section-title mb-3">Move history</h2>
          {history.length === 0 ? (
            <p className="text-slate-400 text-sm">No move history.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="pb-2 pr-4">From</th>
                  <th className="pb-2 pr-4">To</th>
                  <th className="pb-2 pr-4">Moved by</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-500">{h.fromLocation ?? '—'}</td>
                    <td className="py-2 pr-4">{h.toLocation ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{h.movedByName ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{new Date(h.movedAt).toLocaleString()}</td>
                    <td className="py-2 text-slate-500">{h.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Status History tab */}
      {tab === 'statusHistory' && (
        <div className="admin-section">
          <h2 className="admin-section-title mb-3">Status history</h2>
          {statusHistoryLog.length === 0 ? (
            <p className="text-slate-400 text-sm">No status history yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="pb-2 pr-4">From</th>
                  <th className="pb-2 pr-4">To</th>
                  <th className="pb-2 pr-4">Changed by</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {statusHistoryLog.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-500">{h.fromStatus ?? '— (created)'}</td>
                    <td className="py-2 pr-4 font-medium text-slate-700">{h.toStatus}</td>
                    <td className="py-2 pr-4 text-slate-500">{h.changedByName ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{new Date(h.changedAt).toLocaleString()}</td>
                    <td className="py-2 text-slate-500">{h.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    
      {/* Attachments */}
      {tab === 'attachments' && asset && (
        <div className="admin-section">
          <AttachmentPanel entityType="Asset" entityId={asset.id} />
        </div>
      )}
      </div>
    </IdentityPageLayout>
  );
}
