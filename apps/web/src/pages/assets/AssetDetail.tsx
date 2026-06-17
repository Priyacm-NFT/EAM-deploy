import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { AttachmentPanel } from '../../components/AttachmentPanel.js';

type Tab = 'overview' | 'meters' | 'workorders' | 'kpis' | 'history' | 'attachments';

interface Asset {
  id: string; assetNum: string; description: string; status: string;
  criticality: string | null; manufacturer: string | null; model: string | null;
  serialNum: string | null; locationName: string | null; siteName: string | null;
  classDescription: string | null; installDate: string | null;
  warrantyExpiry: string | null; purchaseCost: string | null;
  replacementCost: string | null; notes: string | null;
  customData: Record<string, unknown> | null;
}

interface Meter { id: string; meterName: string; meterType: string; uom: string; currentReading: string | null }
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
interface MoveHistory { id: string; fromLocation: string | null; toLocation: string | null; movedAt: string; notes: string | null }

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
  const [meters, setMeters] = useState<Meter[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [history, setHistory] = useState<MoveHistory[]>([]);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [qrData, setQrData] = useState('');
  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  // Meter reading dialog
  const [readingMeter, setReadingMeter] = useState<Meter | null>(null);
  const [readingValue, setReadingValue] = useState('');
  const [readingDate, setReadingDate] = useState(new Date().toISOString().slice(0, 10));
  const [savingReading, setSavingReading] = useState(false);
  const [showMeterForm, setShowMeterForm] = useState(false);
  const [meterForm, setMeterForm] = useState({ meterName: '', meterType: 'CONTINUOUS', uom: '' });

  useEffect(() => {
    if (!id) return;
    api<Asset>(`/assets/${id}`)
      .then((a) => { setAsset(a); setCustomData((a.customData as Record<string, unknown>) ?? {}); })
      .catch((e) => { setError(String(e)); setLoadFailed(true); });
    api<Meter[]>(`/assets/${id}/meters`).then(setMeters).catch(() => {});
    api<{ data: WorkOrder[] } | WorkOrder[]>(`/work-orders?assetId=${id}`)
      .then((r) => setWorkOrders(Array.isArray(r) ? r : r.data ?? []))
      .catch(() => {});
    api<Kpis>(`/assets/${id}/kpis`).then(setKpis).catch(() => {});
    api<MoveHistory[]>(`/assets/${id}/move-history`).then(setHistory).catch(() => {});
    api<{ dataUrl: string }>(`/assets/${id}/qrcode`).then((r) => setQrData(r.dataUrl)).catch(() => {});
  }, [id]);

  const submitReading = async () => {
    if (!readingMeter) return;
    setSavingReading(true);
    try {
      await api(`/assets/${id}/meters/${readingMeter.id}/readings`, {
        method: 'POST',
        body: JSON.stringify({ reading: readingValue, readingDate }),
      });
      const updated = await api<Meter[]>(`/assets/${id}/meters`);
      setMeters(updated);
      setReadingMeter(null);
      setReadingValue('');
    } catch (e) {
      setError(String(e));
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
    { id: 'meters', label: `Meters (${meters.length})` },
    { id: 'workorders', label: `Work Orders (${workOrders.length})` },
    { id: 'kpis', label: 'KPIs' },
    { id: 'history', label: 'Move History' },
    { id: 'attachments', label: 'Attachments' },
  ];

  return (
    <IdentityPageLayout title={asset.assetNum} backTo="/assets" backLabel="Back to assets">
      <div style={{ marginTop: '-12px' }}>
      {error && <MessageBanner type="error" text={error} />}

      <div className="flex items-start gap-4 mb-4">
        <div className="flex-1">
          <p className="text-lg font-medium text-slate-800">{asset.description}</p>
          <div className="flex gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[asset.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {asset.status}
            </span>
            {asset.criticality && (
              <span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">{asset.criticality}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/chat?context=Asset&contextId=${id}&contextLabel=${encodeURIComponent(`Asset: ${asset.assetNum}`)}`} className="btn-outline !w-auto px-4 text-sm">💬 Chat</Link>
          <Link to={`/assets/${id}/edit`} className="btn-primary !w-auto px-4 text-sm">Edit</Link>
          {qrData && (
            <a href={qrData} download={`${asset.assetNum}-qr.png`} className="btn-link text-sm">QR Code</a>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-4" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="admin-section grid grid-cols-2 gap-4 text-sm" style={{ marginBottom: '20px' }}>
          <div><span className="form-label">Class</span><p>{asset.classDescription ?? '—'}</p></div>
          <div><span className="form-label">Location</span><p>{asset.locationName ?? '—'}</p></div>
          <div><span className="form-label">Site</span><p>{asset.siteName ?? '—'}</p></div>
          <div><span className="form-label">Manufacturer / Model</span><p>{[asset.manufacturer, asset.model].filter(Boolean).join(' / ') || '—'}</p></div>
          <div><span className="form-label">Serial number</span><p>{asset.serialNum ?? '—'}</p></div>
          <div><span className="form-label">Install date</span><p>{asset.installDate ? new Date(asset.installDate).toLocaleDateString() : '—'}</p></div>
          <div><span className="form-label">Warranty expiry</span><p>{asset.warrantyExpiry ? new Date(asset.warrantyExpiry).toLocaleDateString() : '—'}</p></div>
          <div><span className="form-label">Purchase cost</span><p>{asset.purchaseCost ? `$${parseFloat(asset.purchaseCost).toLocaleString()}` : '—'}</p></div>
          <div><span className="form-label">Replacement cost</span><p>{asset.replacementCost ? `$${parseFloat(asset.replacementCost).toLocaleString()}` : '—'}</p></div>
          {asset.notes && <div className="col-span-2"><span className="form-label">Notes</span><p className="whitespace-pre-wrap">{asset.notes}</p></div>}
        </div>
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
                    <option value="CONTINUOUS">Continuous</option><option value="GAUGE">Gauge</option></select></div>
                <div><label className="form-label text-xs">UOM</label>
                  <input className="form-input text-sm" value={meterForm.uom} onChange={(e) => setMeterForm({...meterForm, uom: e.target.value})} placeholder="hours" /></div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={async () => {
                  try { await api(`/assets/${id}/meters`, {method:'POST',body:JSON.stringify(meterForm)});
                    api<Meter[]>(`/assets/${id}/meters`).then(setMeters); setShowMeterForm(false); } catch(e){setError(String(e));} }}>Save</button>
                <button type="button" className="btn-outline text-sm" onClick={() => setShowMeterForm(false)}>Cancel</button>
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
                    <td className="py-2 pr-4 font-medium">{m.meterName}</td>
                    <td className="py-2 pr-4 text-slate-500">{m.meterType}</td>
                    <td className="py-2 pr-4 text-slate-500">{m.uom}</td>
                    <td className="py-2 pr-4">{m.currentReading ?? '—'}</td>
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

          {/* Reading dialog */}
          {readingMeter && (
            <div className="mt-4 bg-slate-50 border border-slate-200 rounded p-4">
              <p className="font-medium mb-2">Enter reading for {readingMeter.meterName}</p>
              <div className="flex gap-3 items-end">
                <label className="block">
                  <span className="form-label">Value ({readingMeter.uom})</span>
                  <input type="number" step="any" className="form-input w-36" value={readingValue} onChange={(e) => setReadingValue(e.target.value)} />
                </label>
                <label className="block">
                  <span className="form-label">Date</span>
                  <input type="date" className="form-input" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} />
                </label>
                <button type="button" className="btn-primary !w-auto px-4" onClick={submitReading} disabled={savingReading}>
                  {savingReading ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className="btn-link" onClick={() => setReadingMeter(null)}>Cancel</button>
              </div>
            </div>
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
          {!kpis ? (
            <p className="text-slate-400 text-sm">No KPI data yet — calculated from closed Work Orders on this asset.</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
            {[
            { label: 'MTBF', value: kpis.mtbfHours != null ? `${kpis.mtbfHours.toFixed(0)} hrs` : '—', hint: 'Mean time between failures' },
            { label: 'MTTR', value: kpis.mttrHours != null ? `${kpis.mttrHours.toFixed(1)} hrs` : '—', hint: 'Mean time to repair' },
            { label: 'Availability', value: kpis.availabilityPct != null ? `${kpis.availabilityPct.toFixed(1)}%` : '—' },
            { label: 'Total downtime', value: `${kpis.totalDowntimeHours.toFixed(0)} hrs` },
            { label: 'Total maintenance cost', value: `$${kpis.totalMaintenanceCost.toLocaleString()}` },
            { label: 'Asset age', value: kpis.ageDays != null ? `${(kpis.ageDays / 365).toFixed(1)} yrs` : '—' },
            { label: 'CM work orders', value: `${kpis.cmCount}` },
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
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-500">{h.fromLocation ?? '—'}</td>
                    <td className="py-2 pr-4">{h.toLocation ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{new Date(h.movedAt).toLocaleDateString()}</td>
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
