import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { AttachmentPanel } from '../../components/AttachmentPanel.js';

type Tab = 'overview' | 'tasks' | 'labour' | 'materials' | 'tools' | 'safety' | 'costs' | 'permits' | 'attachments';

interface WO {
  id: string; woNum: string; description: string; status: string;
  type: string; priority: string; assetNum: string | null;
  locationName: string | null; siteName: string | null;
  targetStartDate: string | null; targetFinishDate: string | null;
  actualStartDate: string | null; actualFinishDate: string | null;
  longDescription: string | null; laborCost: string | null;
  materialCost: string | null; serviceCost: string | null; toolCost: string | null;
  pmNum: string | null; srNum: string | null; closureNotes: string | null;
  jobPlanDescription: string | null;
  customData: Record<string, unknown> | null;
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['WAPPR', 'CAN'],
  WAPPR: ['APPR', 'DRAFT', 'CAN'],
  APPR: ['INPRG', 'WAPPR', 'HOLD'],
  INPRG: ['COMP', 'HOLD'],
  HOLD: ['APPR', 'INPRG', 'CAN'],
  COMP: ['CLOSE', 'INPRG'],
};

// Safe fetch — returns empty array on any error (missing columns, 500, etc.)
async function safeFetch(url: string): Promise<Record<string, unknown>[]> {
  try {
    const result = await api<Record<string, unknown>[]>(url);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

export function WODetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const [wo, setWo] = useState<WO | null>(null);
  const [tasks, setTasks] = useState<Record<string, unknown>[]>([]);
  const [labour, setLabour] = useState<Record<string, unknown>[]>([]);
  const [materials, setMaterials] = useState<Record<string, unknown>[]>([]);
  const [tools, setTools] = useState<Record<string, unknown>[]>([]);
  const [safety, setSafety] = useState<Record<string, unknown>[]>([]);
  const [costs, setCosts] = useState<{ laborCost: string; materialCost: string; serviceCost: string; toolCost: string; totalCost: string } | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [applyingJP, setApplyingJP] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [closeForm, setCloseForm] = useState({ downtimeHours: '', closureNotes: '' });
  const [closing, setClosing] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  const load = async () => {
    if (!id) return;
    setLoadError('');
    try {
      const wo = await api<WO>(`/work-orders/${id}`);
      setWo(wo);
      setCustomData((wo.customData as Record<string, unknown>) ?? {});
    } catch (e) {
      setLoadError(String(e));
      return;
    }
    // Load child tabs independently — errors in any won't block the page
    const [t, l, m, tl, s] = await Promise.all([
      safeFetch(`/work-orders/${id}/tasks`),
      safeFetch(`/work-orders/${id}/labour`),
      safeFetch(`/work-orders/${id}/materials`),
      safeFetch(`/work-orders/${id}/tools`),
      safeFetch(`/work-orders/${id}/safety`),
    ]);
    setTasks(t); setLabour(l); setMaterials(m); setTools(tl); setSafety(s);
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (tab === 'costs' && id) {
      api<{ summary: typeof costs }>(`/work-orders/${id}/costs`).then((r) => setCosts(r.summary)).catch(() => {});
    }
  }, [tab, id]);

  const transition = async (newStatus: string) => {
    setTransitioning(true);
    try {
      await api(`/work-orders/${id}/transition`, { method: 'POST', body: JSON.stringify({ toStatus: newStatus }) });
      await load();
    } catch (e) { setError(String(e)); }
    finally { setTransitioning(false); }
  };

  const applyJobPlan = async () => {
    setApplyingJP(true);
    try {
      await api(`/work-orders/${id}/apply-job-plan`, { method: 'POST' });
      await load();
    } catch (e) { setError(String(e)); }
    finally { setApplyingJP(false); }
  };

  const closeWo = async () => {
    setClosing(true);
    try {
      await api(`/work-orders/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({ downtimeHours: parseFloat(closeForm.downtimeHours) || 0, closureNotes: closeForm.closureNotes }),
      });
      setShowClose(false);
      await load();
    } catch (e) { setError(String(e)); }
    finally { setClosing(false); }
  };

  // Helper to safely read any field from a row
  const str = (row: Record<string, unknown>, key: string): string =>
    row[key] != null ? String(row[key]) : '—';
  const bool = (row: Record<string, unknown>, key: string): boolean =>
    Boolean(row[key]);

  if (loadError) return (
    <div className="admin-page">
      <p className="text-red-500 text-sm">Failed to load work order: {loadError}</p>
      <button className="btn-link mt-2" onClick={load}>Retry</button>
    </div>
  );

  if (!wo) return <div className="admin-page"><p className="text-slate-400">Loading…</p></div>;

  const nextStatuses = STATUS_TRANSITIONS[wo.status] ?? [];
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: `Tasks (${tasks.length})` },
    { id: 'labour', label: `Labour (${labour.length})` },
    { id: 'materials', label: `Materials (${materials.length})` },
    { id: 'tools', label: `Tools (${tools.length})` },
    { id: 'safety', label: `Safety (${safety.length})` },
    { id: 'costs', label: 'Costs' },
    { id: 'permits', label: 'Permits' },
    { id: 'attachments', label: 'Attachments' },
  ];

  const totalCost = [wo.laborCost, wo.materialCost, wo.serviceCost, wo.toolCost]
    .reduce((s, v) => s + parseFloat(v ?? '0'), 0);

  return (
    <IdentityPageLayout title={wo.woNum} backTo="/work-orders" backLabel="Back to work orders">
      {error && <MessageBanner type="error" text={error} />}

      <div className="flex items-start gap-4 mb-4">
        <div className="flex-1">
          <p className="text-lg font-medium text-slate-800">{wo.description}</p>
          <div className="flex gap-2 mt-1 flex-wrap text-xs">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">{wo.status}</span>
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">{wo.type}</span>
            <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700">{wo.priority}</span>
            {wo.assetNum && <span className="text-slate-500">Asset: {wo.assetNum}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/chat?context=WorkOrder&contextId=${id}&contextLabel=${encodeURIComponent(`WO: ${wo.woNum}`)}`} className="btn-outline !w-auto px-4 text-sm">💬 Chat</Link>
          <Link to={`/work-orders/${id}/edit`} className="btn-primary !w-auto px-4 text-sm">Edit</Link>
          {wo.jobPlanDescription && wo.status !== 'CLOSE' && (
            <button type="button" className="btn-primary !w-auto px-4 text-sm bg-indigo-600" onClick={applyJobPlan} disabled={applyingJP}>
              {applyingJP ? 'Applying…' : 'Apply Job Plan'}
            </button>
          )}
        </div>
      </div>

      {/* Status transitions */}
      {nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {nextStatuses.map((s) => (
            <button key={s} type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => transition(s)} disabled={transitioning}>
              → {s}
            </button>
          ))}
          {wo.status === 'COMP' && (
            <button type="button" className="btn-primary !w-auto px-4 text-sm bg-gray-700" onClick={() => setShowClose(true)}>
              Close WO
            </button>
          )}
        </div>
      )}

      {showClose && (
        <div className="admin-section bg-gray-50 border border-gray-200 mb-4">
          <p className="font-medium mb-2">Close Work Order</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="form-label">Downtime hours</span>
              <input type="number" step="0.5" className="form-input" value={closeForm.downtimeHours} onChange={(e) => setCloseForm({ ...closeForm, downtimeHours: e.target.value })} />
            </label>
            <div />
            <div className="col-span-2">
              <label className="block">
                <span className="form-label">Closure notes</span>
                <textarea className="form-input" rows={2} value={closeForm.closureNotes} onChange={(e) => setCloseForm({ ...closeForm, closureNotes: e.target.value })} />
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" className="btn-primary !w-auto px-4" onClick={closeWo} disabled={closing}>{closing ? 'Closing…' : 'Confirm close'}</button>
            <button type="button" className="btn-link" onClick={() => setShowClose(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="admin-section grid grid-cols-2 gap-4 text-sm">
          <div><span className="form-label">Asset</span><p>{wo.assetNum ?? '—'}</p></div>
          <div><span className="form-label">Location</span><p>{wo.locationName ?? '—'}</p></div>
          <div><span className="form-label">Site</span><p>{wo.siteName ?? '—'}</p></div>
          <div><span className="form-label">Job plan</span><p>{wo.jobPlanDescription ?? '—'}</p></div>
          <div><span className="form-label">Target start</span><p>{wo.targetStartDate ? new Date(wo.targetStartDate).toLocaleDateString() : '—'}</p></div>
          <div><span className="form-label">Target finish</span><p>{wo.targetFinishDate ? new Date(wo.targetFinishDate).toLocaleDateString() : '—'}</p></div>
          <div><span className="form-label">Actual start</span><p>{wo.actualStartDate ? new Date(wo.actualStartDate).toLocaleDateString() : '—'}</p></div>
          <div><span className="form-label">Actual finish</span><p>{wo.actualFinishDate ? new Date(wo.actualFinishDate).toLocaleDateString() : '—'}</p></div>
          {wo.srNum && <div><span className="form-label">From SR</span><p>{wo.srNum}</p></div>}
          {wo.pmNum && <div><span className="form-label">PM</span><p>{wo.pmNum}</p></div>}
          <div><span className="form-label">Total cost</span><p>${totalCost.toLocaleString()}</p></div>
          {wo.longDescription && <div className="col-span-2"><span className="form-label">Details</span><p className="whitespace-pre-wrap">{wo.longDescription}</p></div>}
          {wo.closureNotes && <div className="col-span-2"><span className="form-label">Closure notes</span><p className="whitespace-pre-wrap">{wo.closureNotes}</p></div>}
        </div>
      )}
      {tab === 'overview' && (
        <DynamicFormRenderer
          entityName="WorkOrder"
          record={wo as unknown as Record<string, unknown>}
          values={customData}
          onChange={(key, val) => setCustomData((prev) => ({ ...prev, [key]: val }))}
          readOnly
        />
      )}

      {/* Tasks */}
      {tab === 'tasks' && (
        <div className="admin-section">
          <h2 className="admin-section-title mb-3">Tasks</h2>
          {tasks.length === 0 ? <p className="text-slate-400 text-sm">No tasks. Apply a job plan to populate.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Seq</th><th className="pb-2 pr-4">Description</th><th className="pb-2">Status</th>
              </tr></thead>
              <tbody>
                {tasks.map((t, i) => (
                  <tr key={str(t, 'id') || i} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-400">{str(t, 'sequence')}</td>
                    <td className="py-2 pr-4">{str(t, 'description')}</td>
                    <td className="py-2 text-slate-500">{str(t, 'status')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Labour */}
      {tab === 'labour' && (
        <div className="admin-section">
          <h2 className="admin-section-title mb-3">Labour</h2>
          {labour.length === 0 ? <p className="text-slate-400 text-sm">No labour entries.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Craft</th><th className="pb-2 pr-4">Date</th><th className="pb-2 pr-4">Reg hrs</th><th className="pb-2 pr-4">OT hrs</th><th className="pb-2 pr-4">Cost</th><th className="pb-2">Approved</th>
              </tr></thead>
              <tbody>
                {labour.map((l, i) => (
                  <tr key={str(l, 'id') || i} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{str(l, 'craft')}</td>
                    <td className="py-2 pr-4 text-slate-500">{l['work_date'] || l['workDate'] ? new Date(String(l['work_date'] ?? l['workDate'])).toLocaleDateString() : '—'}</td>
                    <td className="py-2 pr-4">{str(l, 'regular_hours') !== '—' ? str(l, 'regular_hours') : str(l, 'regularHours')}</td>
                    <td className="py-2 pr-4">{str(l, 'overtime_hours') !== '—' ? str(l, 'overtime_hours') : str(l, 'overtimeHours')}</td>
                    <td className="py-2 pr-4">{l['total_cost'] || l['totalCost'] ? `$${parseFloat(String(l['total_cost'] ?? l['totalCost'])).toLocaleString()}` : '—'}</td>
                    <td className="py-2">{bool(l, 'approved') ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Materials */}
      {tab === 'materials' && (
        <div className="admin-section">
          <h2 className="admin-section-title mb-3">Materials</h2>
          {materials.length === 0 ? <p className="text-slate-400 text-sm">No materials.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Item #</th><th className="pb-2 pr-4">Description</th><th className="pb-2 pr-4">Qty planned</th><th className="pb-2 pr-4">Unit cost</th><th className="pb-2">Total</th>
              </tr></thead>
              <tbody>
                {materials.map((m, i) => (
                  <tr key={str(m, 'id') || i} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-500">{str(m, 'item_num') !== '—' ? str(m, 'item_num') : str(m, 'itemNum')}</td>
                    <td className="py-2 pr-4">{str(m, 'description')}</td>
                    <td className="py-2 pr-4">{str(m, 'qty_planned') !== '—' ? str(m, 'qty_planned') : str(m, 'qtyPlanned')}</td>
                    <td className="py-2 pr-4">{m['unit_cost'] || m['unitCost'] ? `$${parseFloat(String(m['unit_cost'] ?? m['unitCost'])).toFixed(2)}` : '—'}</td>
                    <td className="py-2">{m['total_cost'] || m['totalCost'] ? `$${parseFloat(String(m['total_cost'] ?? m['totalCost'])).toLocaleString()}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tools */}
      {tab === 'tools' && (
        <div className="admin-section">
          <h2 className="admin-section-title mb-3">Tools</h2>
          {tools.length === 0 ? <p className="text-slate-400 text-sm">No tools.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Description</th><th className="pb-2 pr-4">Qty planned</th><th className="pb-2">Cost</th>
              </tr></thead>
              <tbody>
                {tools.map((t, i) => (
                  <tr key={str(t, 'id') || i} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{str(t, 'description')}</td>
                    <td className="py-2 pr-4">{str(t, 'qty_planned') !== '—' ? str(t, 'qty_planned') : str(t, 'qtyPlanned')}</td>
                    <td className="py-2">{t['total_cost'] || t['totalCost'] ? `$${parseFloat(String(t['total_cost'] ?? t['totalCost'])).toLocaleString()}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Safety */}
      {tab === 'safety' && (
        <div className="admin-section">
          <h2 className="admin-section-title mb-3">Safety & Hazards</h2>
          {safety.length === 0 ? <p className="text-slate-400 text-sm">No safety items.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Hazard</th><th className="pb-2">Control measure</th>
              </tr></thead>
              <tbody>
                {safety.map((s, i) => (
                  <tr key={str(s, 'id') || i} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{str(s, 'hazard') !== '—' ? str(s, 'hazard') : str(s, 'hazardDescription')}</td>
                    <td className="py-2">{str(s, 'control') !== '—' ? str(s, 'control') : str(s, 'controlMeasure')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Costs */}
      {tab === 'costs' && (
        <div className="admin-section grid grid-cols-2 gap-4">
          {costs ? [
            { label: 'Labour cost', value: costs.laborCost },
            { label: 'Material cost', value: costs.materialCost },
            { label: 'Service cost', value: costs.serviceCost },
            { label: 'Tool cost', value: costs.toolCost },
            { label: 'Total cost', value: costs.totalCost },
          ].map((c) => (
            <div key={c.label} className="bg-slate-50 rounded p-4">
              <p className="text-xs text-slate-500 mb-1">{c.label}</p>
              <p className="text-xl font-bold text-slate-800">${parseFloat(c.value ?? '0').toLocaleString()}</p>
            </div>
          )) : <p className="text-slate-400 text-sm">No cost data yet.</p>}
        </div>
      )}

      {/* Permits */}
      {tab === 'permits' && (
        <div className="admin-section">
          <div className="flex justify-between items-center mb-3">
            <h2 className="admin-section-title">Permits to Work</h2>
            <Link to={`/permits/new?woId=${id}`} className="btn-primary !w-auto px-4 text-sm">+ Request permit</Link>
          </div>
          <p className="text-slate-400 text-sm">View permits linked to this work order in the <Link to="/permits" className="text-blue-600">Permits</Link> module.</p>
        </div>
      )}

      {/* Attachments */}
      {tab === 'attachments' && wo && (
        <div className="admin-section">
          <AttachmentPanel entityType="WorkOrder" entityId={wo.id} />
        </div>
      )}
    </IdentityPageLayout>
  );
}
