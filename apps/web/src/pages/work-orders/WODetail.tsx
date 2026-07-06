import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { AttachmentPanel } from '../../components/AttachmentPanel.js';
import { enqueueAction, looksLikeOfflineFailure, subscribeQueueChanges } from '../../lib/offlineQueue.js';
import { OfflineQueueBanner } from '../../hooks/useOfflineQueue.js';

type Tab = 'overview' | 'tasks' | 'labour' | 'materials' | 'tools' | 'safety' | 'costs' | 'permits' | 'statusHistory' | 'attachments';

interface WO {
  id: string; woNum: string; description: string; status: string;
  type: string; priority: string; assetNum: string | null;
  locationCode: string | null; locationName: string | null;
  siteNum: string | null; siteName: string | null;
  targetStartDate: string | null; targetFinishDate: string | null;
  actualStartDate: string | null; actualFinishDate: string | null;
  longDescription: string | null; laborCost: string | null;
  materialCost: string | null; serviceCost: string | null; toolCost: string | null;
  pmNum: string | null; srNum: string | null; closureNotes: string | null;
  jobPlanDescription: string | null;
  customData: Record<string, unknown> | null;
  // FIX: real Maximo "Reported By" / "Report Date" — see the schema
  // comment on work_orders.reported_by_user_id.
  reportedByName: string | null;
  reportedDate: string | null;
  createdAt?: string;
}

// FIX: "we should maintain the status history for all the application"
// — frontend shape matching GET /work-orders/:id/status-history.
interface StatusHistoryEntry { id: string; fromStatus: string | null; toStatus: string; changedAt: string; notes: string | null; changedByName: string | null }

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
interface FailureCode { id: string; code: string; description: string }

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
  // FIX: "+ Request permit" only ever created a brand-new permit — a
  // permit already created standalone (e.g. from Safety → Permits to
  // Work directly, with no WO picked at creation) had no way to be
  // retroactively attached to a Work Order. PUT /permits/:id already
  // accepts any field generically including woId, so linking is just a
  // matter of picking one of this tenant's currently-unlinked permits
  // and setting its woId to this WO.
  const [linkablePermits, setLinkablePermits] = useState<Array<{ id: string; permitNum: string; type: string }>>([]);
  const [selectedPermitToLink, setSelectedPermitToLink] = useState('');
  const [linkingPermit, setLinkingPermit] = useState(false);
  const [statusHistoryLog, setStatusHistoryLog] = useState<StatusHistoryEntry[]>([]);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [applyingJP, setApplyingJP] = useState(false);
  const [showClose, setShowClose] = useState(false);
  // FIX (PRD 9.3/9.4.2 gap — "Failure reporting at closure — problem /
  // cause / remedy codes"): the Close dialog collected downtime hours
  // and notes but never actually let anyone pick failure codes at all,
  // even though the backend route has always accepted them. Without
  // this, the Repeat Failure Detection feature (also new) could never
  // fire in practice through this UI — there was nothing to detect a
  // repeat OF.
  const [closeForm, setCloseForm] = useState({ downtimeHours: '', closureNotes: '', failureProblemId: '', failureCauseId: '', failureRemedyId: '' });
  const [failureCodes, setFailureCodes] = useState<{ problems: FailureCode[]; causes: FailureCode[]; remedies: FailureCode[] }>({ problems: [], causes: [], remedies: [] });
  const [closing, setClosing] = useState(false);
  // FIX (PRD 9.4.2 gap — Repeat failure detection): surfaced right after
  // closing, using the `repeatFailure` field the close endpoint now
  // returns.
  const [repeatFailureAlert, setRepeatFailureAlert] = useState<{ occurrencesInWindow: number; windowDays: number } | null>(null);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  const [showAddLabour, setShowAddLabour] = useState(false);
  // FIX (Maximo parity — Labor Code lookup): previously Craft was a
  // free-typed text box with a manually re-typed rate every single
  // time, completely disconnected from the Labour Records master data
  // (People → Labour & Crews). That's why the Utilisation report shows
  // "hvac", "HVAC_TECH", "hvac1" as three different rows for the same
  // person — nothing enforced picking a registered technician or pulled
  // their actual rate. Maximo's own WO Labor tab works via a Labor Code
  // lookup: select a person, Craft and Rate auto-fill from their record,
  // but the rate stays editable for legitimate per-WO overrides (shift
  // differential, contractor rate, etc.).
  const [labourRecords, setLabourRecordsList] = useState<Array<{ id: string; userId: string; userName: string | null; craftCode: string | null; regularRate: string | null; overtimeRate: string | null }>>([]);
  const [labourForm, setLabourForm] = useState({ labourRecordId: '', userId: '', craft: '', workDate: '', regularHours: '', overtimeHours: '0', regularRate: '', overtimeRate: '', notes: '' });

  // FIX: manual task add — the backend (POST/DELETE
  // /work-orders/:id/tasks) already supported this, but the Tasks tab
  // only ever showed a list with no way to add one without going through
  // "Apply Job Plan". Useful when a WO needs one or two ad-hoc steps
  // that don't warrant a whole Job Plan.
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskDescription, setTaskDescription] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  // FIX: Maximo lets a Work Order's Safety Plan come from either the
  // Job Plan (already worked — applyJobPlanToWo copies jobPlanSafety
  // into wo_safety) OR be added directly on the WO itself. Only the
  // first path existed here; the backend
  // (POST/DELETE /work-orders/:id/safety) was already there with
  // nothing in the UI to call it.
  const [showAddSafety, setShowAddSafety] = useState(false);
  const [safetyForm, setSafetyForm] = useState({ hazard: '', control: '', ppe: '' });
  const [savingSafety, setSavingSafety] = useState(false);
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
    safeFetch<StatusHistoryEntry>(`/work-orders/${id}/status-history`).then(setStatusHistoryLog);
    Promise.all([
      safeFetch<FailureCode>('/failure-codes?type=PROBLEM'),
      safeFetch<FailureCode>('/failure-codes?type=CAUSE'),
      safeFetch<FailureCode>('/failure-codes?type=REMEDY'),
    ]).then(([problems, causes, remedies]) => setFailureCodes({ problems, causes, remedies }));
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    api<Array<{ id: string; userId: string; userName: string | null; craftCode: string | null; regularRate: string | null; overtimeRate: string | null }>>('/labour-records?isActive=true')
      .then(setLabourRecordsList)
      .catch(() => setLabourRecordsList([]));
  }, []);

  // FIX: a background sync (queue flushing on reconnect, or "Sync now")
  // happens completely outside this page's own data-loading cycle —
  // nothing here previously knew it happened, so a labour entry (or
  // status change etc.) that synced successfully in the background
  // stayed invisible on screen until a manual full page refresh.
  // Subscribing to queue changes means any successful sync (or a
  // discarded failed item) quietly re-fetches this page's data so what's
  // on screen catches up automatically.
  useEffect(() => {
    const unsub = subscribeQueueChanges(() => { load(); });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (tab === 'costs' && id) {
      api<{ summary: typeof costs }>(`/work-orders/${id}/costs`)
        .then((r) => setCosts(r.summary)).catch(() => {});
    }
    if (tab === 'permits' && id) {
      safeFetch<{ id: string; permitNum: string; type: string; status: string; validFrom: string | null; validTo: string | null }>(`/permits?woId=${id}`)
        .then(setWoPermits).catch(() => {});
      safeFetch<{ id: string; permitNum: string; type: string; woId: string | null }>('/permits')
        .then((all) => setLinkablePermits(all.filter((p) => !p.woId).map((p) => ({ id: p.id, permitNum: p.permitNum, type: p.type }))))
        .catch(() => setLinkablePermits([]));
    }
  }, [tab, id]);

  const transition = async (newStatus: string) => {
    setTransitioning(true);
    try {
      await api(`/work-orders/${id}/transition`, { method: 'POST', body: JSON.stringify({ toStatus: newStatus }) });
      await load();
    } catch (e) {
      // FIX (P1-8 gap — AC-P1-8.5): status update is one of the three
      // actions the PRD names explicitly for offline queueing. Only
      // network-looking failures get queued — a real validation error
      // (e.g. a permit gate rejecting INPRG) still surfaces normally so
      // the technician isn't left thinking a rejected change is "queued".
      if (looksLikeOfflineFailure(e)) {
        await enqueueAction({
          kind: 'api',
          description: `WO ${wo?.woNum ?? id}: status → ${newStatus}`,
          url: `/work-orders/${id}/transition`,
          method: 'POST',
          body: { toStatus: newStatus },
        });
        if (wo) setWo({ ...wo, status: newStatus }); // optimistic
      } else {
        setError(String(e));
      }
    }
    finally { setTransitioning(false); }
  };

  const applyJobPlan = async () => {
    setApplyingJP(true);
    // FIX: this call was sending no body at all — the backend now
    // falls back to the WO's own jobPlanId when none is passed, and
    // returns a clear error either way (no job plan set, or already
    // applied) instead of the old silent duplicate-on-every-click
    // behavior.
    try { await api(`/work-orders/${id}/apply-job-plan`, { method: 'POST', body: JSON.stringify({}) }); await load(); }
    catch (e) { setError(String(e)); }
    finally { setApplyingJP(false); }
  };

  const closeWo = async () => {
    setClosing(true);
    try {
      const result = await api<{ repeatFailure: { isRepeat: boolean; occurrencesInWindow: number; windowDays: number } | null }>(`/work-orders/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          downtimeHours: parseFloat(closeForm.downtimeHours) || 0,
          closureNotes: closeForm.closureNotes,
          failureProblemId: closeForm.failureProblemId || undefined,
          failureCauseId: closeForm.failureCauseId || undefined,
          failureRemedyId: closeForm.failureRemedyId || undefined,
        }),
      });
      setShowClose(false);
      setRepeatFailureAlert(result.repeatFailure?.isRepeat ? result.repeatFailure : null);
      await load();
    } catch (e) { setError(String(e)); }
    finally { setClosing(false); }
  };

  const addTask = async () => {
    if (!taskDescription.trim()) { setError('Task description is required'); return; }
    setSavingTask(true); setError('');
    try {
      await api(`/work-orders/${id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({ description: taskDescription.trim(), sequence: tasks.length + 1 }),
      });
      setTaskDescription('');
      setShowAddTask(false);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingTask(false);
    }
  };

  const removeTask = async (taskId: string) => {
    if (!window.confirm('Remove this task?')) return;
    try {
      await api(`/work-orders/${id}/tasks/${taskId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const addSafety = async () => {
    if (!safetyForm.hazard.trim() || !safetyForm.control.trim()) {
      setError('Hazard and control measure are both required'); return;
    }
    setSavingSafety(true); setError('');
    try {
      await api(`/work-orders/${id}/safety`, {
        method: 'POST',
        body: JSON.stringify({
          hazard: safetyForm.hazard.trim(),
          control: safetyForm.control.trim(),
          ppe: safetyForm.ppe.trim() || undefined,
        }),
      });
      setSafetyForm({ hazard: '', control: '', ppe: '' });
      setShowAddSafety(false);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingSafety(false);
    }
  };

  const removeSafety = async (safetyId: string) => {
    if (!window.confirm('Remove this safety item?')) return;
    try {
      await api(`/work-orders/${id}/safety/${safetyId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const linkPermit = async () => {
    if (!selectedPermitToLink) return;
    setLinkingPermit(true); setError('');
    try {
      await api(`/permits/${selectedPermitToLink}`, { method: 'PUT', body: JSON.stringify({ woId: id }) });
      setSelectedPermitToLink('');
      const [linked, all] = await Promise.all([
        api<Array<{ id: string; permitNum: string; type: string; status: string; validFrom: string | null; validTo: string | null }>>(`/permits?woId=${id}`),
        api<Array<{ id: string; permitNum: string; type: string; woId: string | null }>>('/permits'),
      ]);
      setWoPermits(linked);
      setLinkablePermits(all.filter((p) => !p.woId).map((p) => ({ id: p.id, permitNum: p.permitNum, type: p.type })));
    } catch (e) {
      setError(String(e));
    } finally {
      setLinkingPermit(false);
    }
  };

  const addLabour = async () => {
    if (!labourForm.craft || !labourForm.workDate || !labourForm.regularHours) {
      setError('Craft, Work date and Regular hours are required'); return;
    }
    setSavingLabour(true); setError('');
    const labourBody = {
      userId: labourForm.userId || undefined,
      craft: labourForm.craft,
      workDate: new Date(labourForm.workDate).toISOString(),
      regularHours: parseFloat(labourForm.regularHours),
      overtimeHours: parseFloat(labourForm.overtimeHours) || 0,
      regularRate: labourForm.regularRate ? parseFloat(labourForm.regularRate) : undefined,
      overtimeRate: labourForm.overtimeRate ? parseFloat(labourForm.overtimeRate) : undefined,
      notes: labourForm.notes || undefined,
    };
    try {
      await api(`/work-orders/${id}/labour`, { method: 'POST', body: JSON.stringify(labourBody) });
      setShowAddLabour(false);
      setLabourForm({ labourRecordId: '', userId: '', craft: '', workDate: '', regularHours: '', overtimeHours: '0', regularRate: '', overtimeRate: '', notes: '' });
      await load();
    } catch (e) {
      // FIX (P1-8 gap — AC-P1-8.5): labour entry offline queueing.
      if (looksLikeOfflineFailure(e)) {
        await enqueueAction({
          kind: 'api',
          description: `WO ${wo?.woNum ?? id}: ${labourForm.regularHours}h labour (${labourForm.craft})`,
          url: `/work-orders/${id}/labour`,
          method: 'POST',
          body: labourBody,
        });
        setShowAddLabour(false);
        setLabourForm({ labourRecordId: '', userId: '', craft: '', workDate: '', regularHours: '', overtimeHours: '0', regularRate: '', overtimeRate: '', notes: '' });
      } else {
        setError(String(e));
      }
    }
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
    { id: 'permits', label: `Permits (${woPermits.length})` },
    { id: 'statusHistory', label: `Status History (${statusHistoryLog.length})` },
    { id: 'attachments', label: 'Attachments' },
  ];

  const totalCost = [wo.laborCost, wo.materialCost, wo.serviceCost, wo.toolCost]
    .reduce((s, v) => s + parseFloat(v ?? '0'), 0);

  const fmt = (v: string | null | undefined) => v ? `$${parseFloat(v).toLocaleString()}` : '—';

  return (
    <IdentityPageLayout title={wo.woNum} backTo="/work-orders" backLabel="Back to work orders">
      <div style={{ marginTop: '0px' }}>
      <OfflineQueueBanner />
      {error && <MessageBanner type="error" text={error} />}

      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          {wo.description && <p className="text-lg font-medium text-white/95 mb-2">{wo.description}</p>}
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
          {/* FIX: backend's POST /work-orders/:id/close already accepts
              INPRG directly, not just COMP — but this button only ever
              showed up once status was COMP. That's a dead end for a
              CM/HIGH-criticality WO specifically: the → COMP transition
              button is correctly blocked without a failure report, but
              nothing else on this page would show the Close form (the
              one place that actually accepts failure report fields)
              until COMP was somehow reached. Showing Close from INPRG
              too closes that gap. */}
          {(wo.status === 'COMP' || wo.status === 'INPRG') && (
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
            {/* FIX (PRD 9.3/9.4.2 gap): Problem/Cause/Remedy codes at
                closure — feeds MTBF/MTTR reporting and the new Repeat
                Failure Detection check, neither of which had anything to
                work with before since this dialog never collected them. */}
            <label className="block">
              <span className="form-label">Failure — Problem</span>
              <select className="form-input" value={closeForm.failureProblemId} onChange={(e) => setCloseForm({ ...closeForm, failureProblemId: e.target.value })}>
                <option value="">— None —</option>
                {failureCodes.problems.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.description}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="form-label">Failure — Cause</span>
              <select className="form-input" value={closeForm.failureCauseId} onChange={(e) => setCloseForm({ ...closeForm, failureCauseId: e.target.value })}>
                <option value="">— None —</option>
                {failureCodes.causes.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.description}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="form-label">Failure — Remedy</span>
              <select className="form-input" value={closeForm.failureRemedyId} onChange={(e) => setCloseForm({ ...closeForm, failureRemedyId: e.target.value })}>
                <option value="">— None —</option>
                {failureCodes.remedies.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.description}</option>)}
              </select>
            </label>
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

      {repeatFailureAlert && (
        <div className="admin-section bg-amber-50 border border-amber-300 mb-4">
          <p className="font-medium text-amber-900">⚠ Repeat failure detected</p>
          <p className="text-sm text-amber-800 mt-1">
            This same failure Problem code has now occurred <strong>{repeatFailureAlert.occurrencesInWindow} times</strong> on this Asset within the last {repeatFailureAlert.windowDays} days. Consider investigating the root cause rather than treating this as a one-off.
          </p>
          <button type="button" className="btn-link text-sm mt-1" onClick={() => setRepeatFailureAlert(null)}>Dismiss</button>
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
            <div><span className="form-label">Location</span><p>{wo.locationCode && wo.locationName ? `${wo.locationCode} - ${wo.locationName}` : (wo.locationName ?? '—')}</p></div>
            <div><span className="form-label">Site</span><p>{wo.siteNum ?? '—'}</p></div>
            <div><span className="form-label">Job plan</span><p>{wo.jobPlanDescription ?? '—'}</p></div>
            <div><span className="form-label">Target start</span><p>{wo.targetStartDate ? new Date(wo.targetStartDate).toLocaleDateString() : '—'}</p></div>
            <div><span className="form-label">Target finish</span><p>{wo.targetFinishDate ? new Date(wo.targetFinishDate).toLocaleDateString() : '—'}</p></div>
            <div><span className="form-label">Actual start</span><p>{wo.actualStartDate ? new Date(wo.actualStartDate).toLocaleDateString() : '—'}</p></div>
            <div><span className="form-label">Actual finish</span><p>{wo.actualFinishDate ? new Date(wo.actualFinishDate).toLocaleDateString() : '—'}</p></div>
            {wo.srNum && <div><span className="form-label">From SR</span><p>{wo.srNum}</p></div>}
            {wo.pmNum && <div><span className="form-label">PM</span><p>{wo.pmNum}</p></div>}
            <div><span className="form-label">Total cost</span><p>${totalCost.toLocaleString()}</p></div>
            {/* FIX: real Maximo "Reported By" / "Report Date" fields —
                see the schema comment on work_orders.reported_by_user_id
                for why these are distinct from createdAt/createdBy. */}
            <div><span className="form-label">Reported by</span><p>{wo.reportedByName ?? '—'}</p></div>
            <div><span className="form-label">Report date</span><p>{wo.reportedDate ? new Date(wo.reportedDate).toLocaleString() : '—'}</p></div>
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
          <div className="flex justify-between items-center mb-3">
            <h2 className="admin-section-title">Tasks</h2>
            <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => setShowAddTask((v) => !v)}>
              {showAddTask ? 'Cancel' : '+ Add task'}
            </button>
          </div>

          {showAddTask && (
            <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 flex gap-3 items-end">
              <label className="block flex-1">
                <span className="form-label">Description</span>
                <input
                  className="form-input" value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="e.g. Check oil level"
                />
              </label>
              <button type="button" className="btn-primary !w-auto px-4" disabled={savingTask || !taskDescription.trim()} onClick={addTask}>
                {savingTask ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          {tasks.length === 0 ? <p className="text-slate-400 text-sm">No tasks. Apply a job plan, or add one manually above.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Seq</th><th className="pb-2 pr-4">Description</th><th className="pb-2 pr-4">Status</th><th className="pb-2"></th>
              </tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-400">{t.sequence}</td>
                    <td className="py-2 pr-4">{t.description}</td>
                    <td className="py-2 pr-4 text-slate-500">{t.status}</td>
                    <td className="py-2"><button type="button" className="btn-link text-xs text-red-600" onClick={() => removeTask(t.id)}>Remove</button></td>
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
              {/* FIX (Maximo parity — Labor Code lookup): pick a
                  registered technician from Labour Records instead of
                  free-typing a craft. Selecting one auto-fills Craft and
                  both rates from their record; all three stay editable
                  afterward for legitimate per-WO overrides, same as
                  Maximo's own Labor tab. */}
              <label className="block col-span-2">
                <span className="form-label">Labor Code (technician) *</span>
                <select
                  className="form-input"
                  value={labourForm.labourRecordId}
                  onChange={(e) => {
                    const rec = labourRecords.find((r) => r.id === e.target.value);
                    setLabourForm({
                      ...labourForm,
                      labourRecordId: e.target.value,
                      userId: rec?.userId ?? '',
                      craft: rec?.craftCode ?? labourForm.craft,
                      regularRate: rec?.regularRate ?? labourForm.regularRate,
                      overtimeRate: rec?.overtimeRate ?? labourForm.overtimeRate,
                    });
                  }}
                >
                  <option value="">— Select a technician —</option>
                  {labourRecords.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.userName ?? 'Unnamed'} — {r.craftCode ?? 'No craft'}{r.regularRate ? ` ($${r.regularRate}/hr)` : ''}
                    </option>
                  ))}
                </select>
                {labourRecords.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    No technicians registered yet — <a href="/labour" className="text-accent hover:underline">add one under People → Labour & Crews</a>, or type a craft manually below.
                  </p>
                )}
              </label>
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
                <span className="form-label">Regular rate / hr</span>
                <input type="number" className="form-input" placeholder="e.g. 450" value={labourForm.regularRate}
                  onChange={(e) => setLabourForm({ ...labourForm, regularRate: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Overtime rate / hr</span>
                <input type="number" className="form-input" placeholder="defaults to regular rate" value={labourForm.overtimeRate}
                  onChange={(e) => setLabourForm({ ...labourForm, overtimeRate: e.target.value })} />
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
          <div className="flex justify-between items-center mb-3">
            <h2 className="admin-section-title">Safety & Hazards</h2>
            <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => setShowAddSafety((v) => !v)}>
              {showAddSafety ? 'Cancel' : '+ Add safety item'}
            </button>
          </div>

          {showAddSafety && (
            <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 flex gap-3 items-end flex-wrap">
              <label className="block flex-1 min-w-[200px]">
                <span className="form-label">Hazard</span>
                <input
                  className="form-input" value={safetyForm.hazard}
                  onChange={(e) => setSafetyForm({ ...safetyForm, hazard: e.target.value })}
                  placeholder="e.g. Electrical shock risk"
                />
              </label>
              <label className="block flex-1 min-w-[200px]">
                <span className="form-label">Control measure</span>
                <input
                  className="form-input" value={safetyForm.control}
                  onChange={(e) => setSafetyForm({ ...safetyForm, control: e.target.value })}
                  placeholder="e.g. Isolate and lock out"
                />
              </label>
              <label className="block min-w-[160px]">
                <span className="form-label">PPE (optional)</span>
                <input
                  className="form-input" value={safetyForm.ppe}
                  onChange={(e) => setSafetyForm({ ...safetyForm, ppe: e.target.value })}
                  placeholder="e.g. Insulated gloves"
                />
              </label>
              <button type="button" className="btn-primary !w-auto px-4" disabled={savingSafety} onClick={addSafety}>
                {savingSafety ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}

          {safety.length === 0 ? <p className="text-slate-400 text-sm">No safety items.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Hazard</th><th className="pb-2 pr-4">Control measure</th><th className="pb-2 pr-4">PPE</th><th className="pb-2"></th>
              </tr></thead>
              <tbody>
                {safety.map((s, i) => (
                  <tr key={String(s['id']) || i} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{String(s['hazardDescription'] ?? s['hazard'] ?? '—')}</td>
                    <td className="py-2 pr-4">{String(s['controlMeasure'] ?? s['control'] ?? '—')}</td>
                    <td className="py-2 pr-4 text-slate-500">{String(s['ppe'] ?? '—')}</td>
                    <td className="py-2">
                      {Boolean(s['id']) && (
                        <button type="button" className="btn-link text-xs text-red-600" onClick={() => removeSafety(String(s['id']))}>Remove</button>
                      )}
                    </td>
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

          {/* FIX: this section is what was missing — a permit created
              standalone (not via the "+ Request permit" flow above,
              which always creates a fresh one) had no way back to being
              attached to a WO. Only permits with no woId set yet show up
              here, so an already-linked permit can't accidentally be
              re-pointed at a different WO by mistake. */}
          {linkablePermits.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded p-3 mb-4 flex gap-3 items-end">
              <label className="block flex-1">
                <span className="form-label">Link an existing permit</span>
                <select className="form-input" value={selectedPermitToLink} onChange={(e) => setSelectedPermitToLink(e.target.value)}>
                  <option value="">— Select a permit —</option>
                  {linkablePermits.map((p) => <option key={p.id} value={p.id}>{p.permitNum} — {p.type}</option>)}
                </select>
              </label>
              <button type="button" className="btn-primary !w-auto px-4" disabled={linkingPermit || !selectedPermitToLink} onClick={linkPermit}>
                {linkingPermit ? 'Linking…' : 'Link to this WO'}
              </button>
            </div>
          )}

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

      {/* Status History */}
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
      {tab === 'attachments' && wo && (
        <div className="admin-section">
          <AttachmentPanel entityType="WorkOrder" entityId={wo.id} />
        </div>
      )}
      </div>
    </IdentityPageLayout>
  );
}
