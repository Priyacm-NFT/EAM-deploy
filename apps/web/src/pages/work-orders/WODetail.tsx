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

interface LabourRow {
  id: string; craft: string; workDate: string;
  regularHours: string; overtimeHours: string;
  totalCost: string | null; approved: boolean; notes: string | null;
}

interface MaterialRow {
  id: string; description: string; itemNum: string | null;
  qtyPlanned: string; unitCost: string | null; totalCost: string | null;
}

interface ToolRow {
  id: string; description: string; qtyPlanned: number; totalCost: string | null;
}

interface TaskRow {
  id: string; sequence: number; description: string; status: string;
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['WAPPR', 'CAN'],
  WAPPR: ['APPR', 'DRAFT', 'CAN'],
  APPR: ['INPRG', 'WAPPR', 'HOLD'],
  INPRG: ['COMP', 'HOLD'],
  HOLD: ['APPR', 'INPRG', 'CAN'],
  COMP: ['CLOSE', 'INPRG'],
};

async function safeFetch<T>(url: string): Promise<T[]> {
  try {
    const result = await api<T[]>(url);
    return Array.isArray(result) ? result : [];
  } catch { return []; }
}

export function WODetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const [wo, setWo] = useState<WO | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [labour, setLabour] = useState<LabourRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [safety, setSafety] = useState<Record<string, unknown>[]>([]);
  const [costs, setCosts] = useState<{ laborCost: string; materialCost: string; serviceCost: string; toolCost: string; totalCost: string } | null>(null);
  const [woPermits, setWoPermits] = useState<Array<{ id: string; permitNum: string; type: string; status: string; validFrom: string | null; validTo: string | null }>>([]);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [applyingJP, setApplyingJP] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [closeForm, setCloseForm] = useState({ downtimeHours: '', closureNotes: '' });
  const [closing, setClosing] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  const [showAddLabour, setShowAddLabour] = useState(false);
  const [labourForm, setLabourForm] = useState({ craft: '', workDate: '', regularHours: '', overtimeHours: '0', regularRate: '', notes: '' });
  const [savingLabour, setSavingLabour] = useState(false);

  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [materialForm, setMaterialForm] = useState({ description: '', itemNum: '', qtyPlanned: '1', qtyActual: '1', unitCost: '' });
  const [savingMaterial, setSavingMaterial] = useState(false);

  const [showAddTool, setShowAddTool] = useState(false);
  const [toolForm, setToolForm] = useState({ description: '', qtyPlanned: '1', qtyActual: '1', chargeRate: '' });
  const [savingTool, setSavingTool] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoadError('');
    try {
      const w = await api<WO>(`/work-orders/${id}`);
      setWo(w);
      setCustomData((w.customData as Record<string, unknown>) ?? {});
    } catch (e) { setLoadError(String(e)); return; }
    const [t, l, m, tl, s] = await Promise.all([
      safeFetch<TaskRow>(`/work-orders/${id}/tasks`),
      safeFetch<LabourRow>(`/work-orders/${id}/labour`),
      safeFetch<MaterialRow>(`/work-orders/${id}/materials`),
      safeFetch<ToolRow>(`/work-orders/${id}/tools`),
      safeFetch<Record<string, unknown>>(`/work-orders/${id}/safety`),
    ]);
    setTasks(t); setLabour(l); setMaterials(m); setTools(tl); setSafety(s);
  };

  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (tab === 'costs' && id) {
      api<{ summary: typeof costs }>(`/work-orders/${id}/costs`)
        .then((r) => setCosts(r.summary)).catch(() => {});
    }
    if (tab === 'permits' && id) {
      safeFetch<{ id: string; permitNum: string; type: string; status: string; validFrom: string | null; validTo: string | null }>(`/permits?woId=${id}`)
        .then(setWoPermits).catch(() => {});
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
    try { await api(`/work-orders/${id}/apply-job-plan`, { method: 'POST' }); await load(); }
    catch (e) { setError(String(e)); }
    finally { setApplyingJP(false); }
  };

  const closeWo = async () => {
    setClosing(true);
    try {
      await api(`/work-orders/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({ downtimeHours: parseFloat(closeForm.downtimeHours) || 0, closureNotes: closeForm.closureNotes }),
      });
      setShowClose(false); await load();
    } catch (e) { setError(String(e)); }
    finally { setClosing(false); }
  };

  const addLabour = async () => {
    if (!labourForm.craft || !labourForm.workDate || !labourForm.regularHours) {
      setError('Craft, Work date and Regular hours are required'); return;
    }
    setSavingLabour(true); setError('');
    try {
      await api(`/work-orders/${id}/labour`, {
        method: 'POST',
        body: JSON.stringify({
          craft: labourForm.craft,
          workDate: new Date(labourForm.workDate).toISOString(),
          regularHours: parseFloat(labourForm.regularHours),
          overtimeHours: parseFloat(labourForm.overtimeHours) || 0,
          regularRate: labourForm.regularRate ? parseFloat(labourForm.regularRate) : undefined,
          notes: labourForm.notes || undefined,
        }),
      });
      setShowAddLabour(false);
      setLabourForm({ craft: '', workDate: '', regularHours: '', overtimeHours: '0', regularRate: '', notes: '' });
      await load();
    } catch (e) { setError(String(e)); }
    finally { setSavingLabour(false); }
  };

  const addMaterial = async () => {
    if (!materialForm.description) { setError('Description is required'); return; }
    setSavingMaterial(true); setError('');
    try {
      await api(`/work-orders/${id}/materials`, {
        method: 'POST',
        body: JSON.stringify({
          description: materialForm.description,
          itemNum: materialForm.itemNum || undefined,
          qtyPlanned: parseFloat(materialForm.qtyPlanned),
          qtyActual: parseFloat(materialForm.qtyActual),
          unitCost: materialForm.unitCost ? parseFloat(materialForm.unitCost) : undefined,
        }),
      });
      setShowAddMaterial(false);
      setMaterialForm({ description: '', itemNum: '', qtyPlanned: '1', qtyActual: '1', unitCost: '' });
      await load();
    } catch (e) { setError(String(e)); }
    finally { setSavingMaterial(false); }
  };

  const addTool = async () => {
    if (!toolForm.description) { setError('Description is required'); return; }
    setSavingTool(true); setError('');
    try {
      await api(`/work-orders/${id}/tools`, {
        method: 'POST',
        body: JSON.stringify({
          description: toolForm.description,
          qtyPlanned: parseInt(toolForm.qtyPlanned),
          qtyActual: parseInt(toolForm.qtyActual),
          chargeRate: toolForm.chargeRate ? parseFloat(toolForm.chargeRate) : undefined,
        }),
      });
      setShowAddTool(false);
      setToolForm({ description: '', qtyPlanned: '1', qtyActual: '1', chargeRate: '' });
      await load();
    } catch (e) { setError(String(e)); }
    finally { setSavingTool(false); }
  };

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

  const fmt = (v: string | null | undefined) => v ? `$${parseFloat(v).toLocaleString()}` : '—';

  return (
    <IdentityPageLayout title={wo.woNum} backTo="/work-orders" backLabel="Back to work orders">
      <div style={{ marginTop: '0px' }}>
      {error && <MessageBanner type="error" text={error} />}

      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          {wo.description && <p className="text-lg font-medium text-slate-800 mb-2">{wo.description}</p>}
          <div className="flex gap-2 flex-wrap text-xs">
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">{wo.status}</span>
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">{wo.type}</span>
            <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700">{wo.priority}</span>
            {wo.assetNum && <span className="text-slate-500">Asset: {wo.assetNum}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link to={`/chat?context=WorkOrder&contextId=${id}&contextLabel=${encodeURIComponent(`WO: ${wo.woNum}`)}`} className="btn-outline !w-auto px-4 text-sm">💬 Chat</Link>
          <Link to={`/work-orders/${id}/edit`} className="btn-primary !w-auto px-4 text-sm">Edit</Link>
          {wo.jobPlanDescription && wo.status !== 'CLOSE' && (
            <button type="button" className="btn-primary !w-auto px-4 text-sm bg-indigo-600" onClick={applyJobPlan} disabled={applyingJP}>
              {applyingJP ? 'Applying…' : 'Apply Job Plan'}
            </button>
          )}
        </div>
      </div>

      {nextStatuses.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 pt-1">
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
              <input type="number" step="0.5" className="form-input" value={closeForm.downtimeHours}
                onChange={(e) => setCloseForm({ ...closeForm, downtimeHours: e.target.value })} />
            </label>
            <div />
            <div className="col-span-2">
              <label className="block">
                <span className="form-label">Closure notes</span>
                <textarea className="form-input" rows={2} value={closeForm.closureNotes}
                  onChange={(e) => setCloseForm({ ...closeForm, closureNotes: e.target.value })} />
              </label>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button type="button" className="btn-primary !w-auto px-4" onClick={closeWo} disabled={closing}>{closing ? 'Closing…' : 'Confirm close'}</button>
            <button type="button" className="btn-link" onClick={() => setShowClose(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 mb-4 overflow-x-auto" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            onClick={() => setTab(t.id)}>{t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <>
          <div className="admin-section grid grid-cols-2 gap-4 text-sm" style={{ marginBottom: '20px' }}>
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
          <div className="dynamic-form-spaced">
            <DynamicFormRenderer entityName="WorkOrder" record={wo as unknown as Record<string, unknown>}
              values={customData} onChange={(key, val) => setCustomData((prev) => ({ ...prev, [key]: val }))} readOnly />
          </div>
          <style>{`
            .dynamic-form-spaced > * + * { margin-top: 20px !important; }
            .dynamic-form-spaced .admin-section { margin-bottom: 0 !important; }
          `}</style>
        </>
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
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-400">{t.sequence}</td>
                    <td className="py-2 pr-4">{t.description}</td>
                    <td className="py-2 text-slate-500">{t.status}</td>
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
          <div className="flex justify-between items-center mb-3">
            <h2 className="admin-section-title">Labour</h2>
            <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => setShowAddLabour((v) => !v)}>
              {showAddLabour ? 'Cancel' : '+ Add Labour'}
            </button>
          </div>

          {showAddLabour && (
            <div className="mb-4 p-4 border border-slate-200 rounded-lg bg-slate-50 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="form-label">Craft *</span>
                <input className="form-input" placeholder="e.g. HVAC_TECH" value={labourForm.craft}
                  onChange={(e) => setLabourForm({ ...labourForm, craft: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Work date *</span>
                <input type="date" className="form-input" value={labourForm.workDate}
                  onChange={(e) => setLabourForm({ ...labourForm, workDate: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Regular hours *</span>
                <input type="number" step="0.5" className="form-input" placeholder="e.g. 3.5" value={labourForm.regularHours}
                  onChange={(e) => setLabourForm({ ...labourForm, regularHours: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Overtime hours</span>
                <input type="number" step="0.5" className="form-input" value={labourForm.overtimeHours}
                  onChange={(e) => setLabourForm({ ...labourForm, overtimeHours: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Rate per hour</span>
                <input type="number" className="form-input" placeholder="e.g. 450" value={labourForm.regularRate}
                  onChange={(e) => setLabourForm({ ...labourForm, regularRate: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Notes</span>
                <input className="form-input" placeholder="Optional" value={labourForm.notes}
                  onChange={(e) => setLabourForm({ ...labourForm, notes: e.target.value })} />
              </label>
              <div className="col-span-2">
                <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={addLabour} disabled={savingLabour}>
                  {savingLabour ? 'Saving…' : 'Save Labour'}
                </button>
              </div>
            </div>
          )}

          {labour.length === 0 ? <p className="text-slate-400 text-sm">No labour entries yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Craft</th><th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Reg hrs</th><th className="pb-2 pr-4">OT hrs</th>
                <th className="pb-2 pr-4">Cost</th><th className="pb-2">Approved</th>
              </tr></thead>
              <tbody>
                {labour.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{l.craft ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{l.workDate ? new Date(l.workDate).toLocaleDateString() : '—'}</td>
                    <td className="py-2 pr-4">{l.regularHours ?? '—'}</td>
                    <td className="py-2 pr-4">{l.overtimeHours ?? '—'}</td>
                    <td className="py-2 pr-4">{fmt(l.totalCost)}</td>
                    <td className="py-2">{l.approved ? '✓' : '—'}</td>
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
          <div className="flex justify-between items-center mb-3">
            <h2 className="admin-section-title">Materials</h2>
            <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => setShowAddMaterial((v) => !v)}>
              {showAddMaterial ? 'Cancel' : '+ Add Material'}
            </button>
          </div>

          {showAddMaterial && (
            <div className="mb-4 p-4 border border-slate-200 rounded-lg bg-slate-50 grid grid-cols-2 gap-3">
              <label className="block col-span-2">
                <span className="form-label">Description *</span>
                <input className="form-input" placeholder="e.g. Capacitor 45uF 440V" value={materialForm.description}
                  onChange={(e) => setMaterialForm({ ...materialForm, description: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Item number</span>
                <input className="form-input" placeholder="e.g. CAP-45UF" value={materialForm.itemNum}
                  onChange={(e) => setMaterialForm({ ...materialForm, itemNum: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Unit cost</span>
                <input type="number" className="form-input" placeholder="e.g. 850" value={materialForm.unitCost}
                  onChange={(e) => setMaterialForm({ ...materialForm, unitCost: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Qty planned</span>
                <input type="number" className="form-input" value={materialForm.qtyPlanned}
                  onChange={(e) => setMaterialForm({ ...materialForm, qtyPlanned: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Qty actual</span>
                <input type="number" className="form-input" value={materialForm.qtyActual}
                  onChange={(e) => setMaterialForm({ ...materialForm, qtyActual: e.target.value })} />
              </label>
              <div className="col-span-2">
                <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={addMaterial} disabled={savingMaterial}>
                  {savingMaterial ? 'Saving…' : 'Save Material'}
                </button>
              </div>
            </div>
          )}

          {materials.length === 0 ? <p className="text-slate-400 text-sm">No materials yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Item #</th><th className="pb-2 pr-4">Description</th>
                <th className="pb-2 pr-4">Qty</th><th className="pb-2 pr-4">Unit cost</th><th className="pb-2">Total</th>
              </tr></thead>
              <tbody>
                {materials.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-500">{m.itemNum ?? '—'}</td>
                    <td className="py-2 pr-4">{m.description}</td>
                    <td className="py-2 pr-4">{m.qtyPlanned ?? '—'}</td>
                    <td className="py-2 pr-4">{fmt(m.unitCost)}</td>
                    <td className="py-2">{fmt(m.totalCost)}</td>
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
          <div className="flex justify-between items-center mb-3">
            <h2 className="admin-section-title">Tools</h2>
            <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => setShowAddTool((v) => !v)}>
              {showAddTool ? 'Cancel' : '+ Add Tool'}
            </button>
          </div>

          {showAddTool && (
            <div className="mb-4 p-4 border border-slate-200 rounded-lg bg-slate-50 grid grid-cols-2 gap-3">
              <label className="block col-span-2">
                <span className="form-label">Description *</span>
                <input className="form-input" placeholder="e.g. Multimeter" value={toolForm.description}
                  onChange={(e) => setToolForm({ ...toolForm, description: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Qty planned</span>
                <input type="number" className="form-input" value={toolForm.qtyPlanned}
                  onChange={(e) => setToolForm({ ...toolForm, qtyPlanned: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Charge rate</span>
                <input type="number" className="form-input" placeholder="e.g. 100" value={toolForm.chargeRate}
                  onChange={(e) => setToolForm({ ...toolForm, chargeRate: e.target.value })} />
              </label>
              <div className="col-span-2">
                <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={addTool} disabled={savingTool}>
                  {savingTool ? 'Saving…' : 'Save Tool'}
                </button>
              </div>
            </div>
          )}

          {tools.length === 0 ? <p className="text-slate-400 text-sm">No tools yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Description</th><th className="pb-2 pr-4">Qty</th><th className="pb-2">Cost</th>
              </tr></thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{t.description}</td>
                    <td className="py-2 pr-4">{t.qtyPlanned ?? '—'}</td>
                    <td className="py-2">{fmt(t.totalCost)}</td>
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
                  <tr key={String(s['id']) || i} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{String(s['hazardDescription'] ?? s['hazard'] ?? '—')}</td>
                    <td className="py-2">{String(s['controlMeasure'] ?? s['control'] ?? '—')}</td>
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
            <Link to={`/permits/new?woId=${id}`}
              style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#ffffff', borderRadius: '10px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}>
              + Request permit
            </Link>
          </div>
          {woPermits.length === 0 ? (
            <p className="text-slate-400 text-sm">No permits linked to this work order.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">PTW #</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Valid from</th>
                <th className="pb-2">Valid to</th>
              </tr></thead>
              <tbody>
                {woPermits.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4"><Link to={`/permits/${p.id}`} className="text-blue-600 hover:underline">{p.permitNum}</Link></td>
                    <td className="py-2 pr-4">{p.type.replace(/_/g, ' ')}</td>
                    <td className="py-2 pr-4"><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100">{p.status}</span></td>
                    <td className="py-2 pr-4">{p.validFrom ? new Date(p.validFrom).toLocaleDateString() : '—'}</td>
                    <td className="py-2">{p.validTo ? new Date(p.validTo).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Attachments */}
      {tab === 'attachments' && wo && (
        <div className="admin-section">
          <AttachmentPanel entityType="WorkOrder" entityId={wo.id} />
        </div>
      )}
      </div>
    </IdentityPageLayout>
  );
}
