import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { AttachmentPanel } from '../../components/AttachmentPanel.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';

interface SR {
  id: string; srNum: string; subject: string; description: string | null;
  status: string; priority: string; channel: string; category: string | null;
  routedRole: string | null;
  createdAt: string; slaDueAt: string | null; slaBreached: boolean;
  closedAt: string | null; resolvedAt: string | null;
  assignedToUserId: string | null;
  assignedDisplayName: string | null; assetNum: string | null;
  locationName: string | null; convertedToWoId: string | null;
  convertedToWoNum: string | null; reporterName: string | null;
  reporterEmail: string | null; closureNotes: string | null;
  customData: Record<string, unknown> | null;
  // FIX: real Maximo "Reported By" / "Report Date" — see the schema
  // comment on service_requests.reported_by_user_id for why these are
  // distinct from the existing requester/reporterName above (a helpdesk
  // agent can log an SR on a requester's behalf).
  reportedByName: string | null;
  reportedDate: string | null;
  slaPausedAt: string | null;
  // FIX (SR create/detail form parity): requested service window.
  startDate: string | null;
  endDate: string | null;
}

// FIX: "we should maintain the status history for all the application"
// — frontend shape matching GET /service-requests/:id/status-history.
interface StatusHistoryEntry { id: string; fromStatus: string | null; toStatus: string; changedAt: string; notes: string | null; changedByName: string | null }

interface AssignUser { id: string; displayName: string; email: string }

function SRAssignPanel({
  srId, currentAssigneeId, currentAssigneeName, onAssigned,
}: {
  srId: string; currentAssigneeId: string | null;
  currentAssigneeName: string | null; onAssigned: () => void;
}) {
  const [users, setUsers] = useState<AssignUser[]>([]);
  const [selected, setSelected] = useState<string>(currentAssigneeId ?? '');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<AssignUser[]>('/service-requests/assignable-users')
      .then(setUsers).catch(() => setError('Could not load users'));
  }, [open]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      await api(`/service-requests/${srId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assignedToUserId: selected || null, comment: comment.trim() || undefined }),
      });
      setOpen(false); setComment(''); onAssigned();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-slate-600 text-sm">{currentAssigneeName ?? '—'}</span>
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="text-xs px-2 py-0.5 border border-slate-300 rounded hover:bg-slate-100">
          {open ? 'Cancel' : 'Reassign'}
        </button>
      </div>
      {open && (
        <div className="mt-3 p-3 border border-slate-200 rounded-lg bg-slate-50">
          {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
          <label className="block mb-2">
            <span className="form-label">Assign to</span>
            <select className="form-input" value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">— Unassign —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.displayName} ({u.email})</option>)}
            </select>
          </label>
          <label className="block mb-3">
            <span className="form-label">Note (optional)</span>
            <input className="form-input" placeholder="e.g. Closest technician on site"
              value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
          <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : selected ? 'Confirm assignment' : 'Unassign'}
          </button>
        </div>
      )}
    </div>
  );
}

export function SRDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sr, setSr] = useState<SR | null>(null);
  const [tab, setTab] = useState<'overview' | 'statusHistory' | 'workHistory' | 'attachments'>('overview');
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertNotes, setConvertNotes] = useState('');
  const [showConvert, setShowConvert] = useState(false);
  const [statusHistoryLog, setStatusHistoryLog] = useState<StatusHistoryEntry[]>([]);
  // FIX: "Work History" — the related Work Order's own status history
  // (same statusHistory table/shape as Status History above, just scoped
  // to entityType='WorkOrder' via the existing /work-orders/:id/status-history
  // route), not a duplicate of this SR's own status log.
  const [workHistoryLog, setWorkHistoryLog] = useState<StatusHistoryEntry[]>([]);

  const load = () => {
    if (!id) return;
    api<SR>(`/service-requests/${id}`)
      .then((s) => {
        setSr(s);
        setCustomData(s.customData ?? {});
        if (s.convertedToWoId) {
          api<StatusHistoryEntry[]>(`/work-orders/${s.convertedToWoId}/status-history`)
            .then(setWorkHistoryLog).catch(() => setWorkHistoryLog([]));
        } else {
          setWorkHistoryLog([]);
        }
      })
      .catch((e) => setError(String(e)));
    api<StatusHistoryEntry[]>(`/service-requests/${id}/status-history`)
      .then(setStatusHistoryLog).catch(() => setStatusHistoryLog([]));
  };

  useEffect(load, [id]);

  const transition = async (newStatus: string) => {
    setTransitioning(true);
    try {
      await api(`/service-requests/${id}/transition`, { method: 'POST', body: JSON.stringify({ toStatus: newStatus }) });
      load();
    } catch (e) { setError(String(e)); }
    finally { setTransitioning(false); }
  };

  const convertToWo = async () => {
    setConverting(true);
    try {
      // API returns the full WO object — read .id directly
      const wo = await api<{ id: string }>(`/service-requests/${id}/convert`, {
        method: 'POST', body: JSON.stringify({ notes: convertNotes }),
      });
      if (!wo?.id) throw new Error('No WO id returned from server');
      navigate(`/work-orders/${wo.id}`);
    } catch (e) { setError(String(e)); setConverting(false); }
  };

  if (!sr) return <div className="admin-page"><p className="text-slate-400">Loading…</p></div>;

  const nextStatuses: Record<string, string[]> = {
    NEW: ['QUEUED', 'IN_PROGRESS', 'CANCELLED'],
    QUEUED: ['IN_PROGRESS', 'CANCELLED'],
    // FIX (PRD 9.2 gap — SLA clock pause): "Waiting on Requester" — the
    // backend pauses the SLA due date the moment this transition fires,
    // and un-pauses (extending slaDueAt by however long it was paused)
    // the moment it leaves this status again. See the transition route
    // in service-requests.ts for the actual pause/resume math.
    IN_PROGRESS: ['WAITING_ON_REQUESTER', 'RESOLVED', 'CANCELLED'],
    WAITING_ON_REQUESTER: ['IN_PROGRESS', 'CANCELLED'],
    RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  };
  const available = nextStatuses[sr.status] ?? [];

  return (
    <IdentityPageLayout title={sr.srNum} backTo="/service-requests" backLabel="Back to service requests">
      <div style={{ marginTop: '4px' }}>
      {error && <MessageBanner type="error" text={error} />}

      <div className="flex items-start gap-4 mb-3">
        <div className="flex-1">
          <div className="flex gap-2 flex-wrap">
            {sr.slaBreached && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">SLA BREACHED</span>}
            {sr.slaPausedAt && <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-medium">SLA CLOCK PAUSED</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Link to={`/chat?context=ServiceRequest&contextId=${id}&contextLabel=${encodeURIComponent(`SR: ${sr.srNum}`)}`} className="btn-outline !w-auto px-4 text-sm">💬 Chat</Link>
          <Link to={`/service-requests/${id}/edit`} className="btn-primary !w-auto px-4 text-sm">Edit</Link>
        </div>
      </div>

      {(available.length > 0 || (sr.status === 'IN_PROGRESS' && !sr.convertedToWoId) || sr.convertedToWoId) && (
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-slate-100">
          {sr.convertedToWoId && (
            <Link to={`/work-orders/${sr.convertedToWoId}`}
              style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#ffffff', borderRadius: '10px', padding: '8px 18px', fontSize: '13px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}>
              View Work Order
            </Link>
          )}
          {available.map((s) => (
            <button key={s} type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => transition(s)} disabled={transitioning}>
              → {s}
            </button>
          ))}
          {sr.status === 'IN_PROGRESS' && !sr.convertedToWoId && (
            <button type="button" className="btn-primary !w-auto px-4 text-sm bg-indigo-600 hover:bg-indigo-700" onClick={() => setShowConvert(true)}>
              Convert to WO
            </button>
          )}
        </div>
      )}

      {showConvert && (
        <div className="admin-section bg-indigo-50 border border-indigo-200">
          <p className="font-medium mb-2 text-indigo-800">Convert to Work Order</p>
          <label className="block mb-3">
            <span className="form-label">Notes for work order</span>
            <textarea className="form-input" rows={2} value={convertNotes} onChange={(e) => setConvertNotes(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-primary !w-auto px-4" onClick={convertToWo} disabled={converting}>
              {converting ? 'Converting…' : 'Confirm'}
            </button>
            <button type="button" className="btn-link" onClick={() => setShowConvert(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200 mt-2 mb-4" role="tablist">
        {(['overview', 'statusHistory', 'workHistory', 'attachments'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${t === 'overview' || t === 'attachments' ? 'capitalize' : ''} ${tab === t ? 'border-accent text-accent-dark' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {t === 'statusHistory' ? `Status History (${statusHistoryLog.length})` : t === 'workHistory' ? `Work History (${workHistoryLog.length})` : t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="admin-section grid grid-cols-2 gap-4 text-sm">
            <div className="col-span-2">
              <span className="form-label">Summary</span>
              <p className="whitespace-pre-wrap text-slate-900">{sr.description || '—'}</p>
            </div>
            <div><span className="form-label">Service Request</span><p className="font-mono font-semibold text-slate-900">{sr.srNum}</p></div>
            <div><span className="form-label">Description</span><p>{sr.description ?? '—'}</p></div>
            <div><span className="form-label">Asset</span><p>{sr.assetNum ?? '—'}</p></div>
            <div><span className="form-label">Location</span><p>{sr.locationName ?? '—'}</p></div>
            <div><span className="form-label">Start Date</span><p>{sr.startDate ? new Date(sr.startDate).toLocaleDateString() : '—'}</p></div>
            <div><span className="form-label">End Date</span><p>{sr.endDate ? new Date(sr.endDate).toLocaleDateString() : '—'}</p></div>
            <div><span className="form-label">Priority</span><p>{sr.priority}</p></div>
            <div><span className="form-label">Status</span><p>{sr.status}</p></div>
            <div><span className="form-label">Reported by</span><p>{sr.reportedByName ?? '—'}</p></div>
            <div><span className="form-label">Reported at</span><p>{sr.reportedDate ? new Date(sr.reportedDate).toLocaleString() : '—'}</p></div>
            <div>
              <span className="form-label">Assigned to</span>
              <SRAssignPanel srId={sr.id} currentAssigneeId={sr.assignedToUserId}
                currentAssigneeName={sr.assignedDisplayName} onAssigned={load} />
            </div>
            <div><span className="form-label">Category</span><p>{sr.category ?? '—'}</p></div>

            {/* FIX: remaining fields, unchanged in content — just moved
                after the requested Summary block above. */}
            <div><span className="form-label">Channel</span><p>{sr.channel}</p></div>
            <div><span className="form-label">Routed to role</span><p>{sr.routedRole ? <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{sr.routedRole}</code> : '—'}</p></div>
            <div><span className="form-label">Created</span><p>{new Date(sr.createdAt).toLocaleString()}</p></div>
            <div><span className="form-label">SLA due</span>
              <p className={sr.slaBreached ? 'text-red-600 font-medium' : ''}>{sr.slaDueAt ? new Date(sr.slaDueAt).toLocaleString() : '—'}</p>
            </div>
            <div><span className="form-label">Resolved</span><p>{sr.resolvedAt ? new Date(sr.resolvedAt).toLocaleString() : '—'}</p></div>
            <div><span className="form-label">Closed</span><p>{sr.closedAt ? new Date(sr.closedAt).toLocaleString() : '—'}</p></div>
            {sr.closureNotes && <div className="col-span-2"><span className="form-label">Closure notes</span><p className="whitespace-pre-wrap">{sr.closureNotes}</p></div>}
          </div>
          <DynamicFormRenderer entityName="ServiceRequest" record={sr as unknown as Record<string, unknown>}
            values={customData} onChange={(key, val) => setCustomData((prev) => ({ ...prev, [key]: val }))} readOnly />
        </>
      )}

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

      {/* FIX: "Work History" — the status history of the Work Order this
          SR was converted to (same From/To/Changed by/Date/Notes shape as
          Status History above, and as Asset's own Status History tab),
          not this SR's own transitions. Empty until the SR is converted. */}
      {tab === 'workHistory' && (
        <div className="admin-section">
          <h2 className="admin-section-title mb-3">Work history</h2>
          {!sr.convertedToWoId ? (
            <p className="text-slate-400 text-sm">No related work order yet — convert this SR to a Work Order to see its history here.</p>
          ) : workHistoryLog.length === 0 ? (
            <p className="text-slate-400 text-sm">No work order history yet.</p>
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
                {workHistoryLog.map((h) => (
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

      {tab === 'attachments' && (
        <div className="admin-section">
          <AttachmentPanel entityType="ServiceRequest" entityId={sr.id} />
        </div>
      )}
      </div>
    </IdentityPageLayout>
  );
}
