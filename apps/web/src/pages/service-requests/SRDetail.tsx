import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface SR {
  id: string; srNum: string; subject: string; description: string | null;
  status: string; priority: string; channel: string; category: string | null;
  createdAt: string; slaDueAt: string | null; slaBreached: boolean;
  closedAt: string | null; resolvedAt: string | null;
  assignedDisplayName: string | null; assetNum: string | null;
  locationName: string | null; convertedToWoId: string | null;
  convertedToWoNum: string | null; reporterName: string | null;
  reporterEmail: string | null; closureNotes: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700', HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700', LOW: 'bg-slate-100 text-slate-500',
};

export function SRDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sr, setSr] = useState<SR | null>(null);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertNotes, setConvertNotes] = useState('');
  const [showConvert, setShowConvert] = useState(false);

  const load = () => {
    if (!id) return;
    api<SR>(`/service-requests/${id}`).then(setSr).catch((e) => setError(String(e)));
  };

  useEffect(load, [id]);

  const transition = async (newStatus: string) => {
    setTransitioning(true);
    try {
      await api(`/service-requests/${id}/transition`, {
        method: 'POST', body: JSON.stringify({ status: newStatus }),
      });
      load();
    } catch (e) { setError(String(e)); }
    finally { setTransitioning(false); }
  };

  const convertToWo = async () => {
    setConverting(true);
    try {
      const result = await api<{ woId: string }>(`/service-requests/${id}/convert`, {
        method: 'POST', body: JSON.stringify({ notes: convertNotes }),
      });
      navigate(`/work-orders/${result.woId}`);
    } catch (e) { setError(String(e)); setConverting(false); }
  };

  if (!sr) return <div className="admin-page"><p className="text-slate-400">Loading…</p></div>;

  const nextStatuses: Record<string, string[]> = {
    NEW: ['QUEUED', 'IN_PROGRESS', 'CANCELLED'],
    QUEUED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['RESOLVED', 'CANCELLED'],
    RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  };
  const available = nextStatuses[sr.status] ?? [];

  return (
    <IdentityPageLayout title={sr.srNum} backTo="/service-requests" backLabel="Back to service requests">
      {error && <MessageBanner type="error" text={error} />}

      <div className="flex items-start gap-4 mb-4">
        <div className="flex-1">
          <p className="text-lg font-medium text-slate-800">{sr.subject}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-600">{sr.status}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[sr.priority] ?? ''}`}>{sr.priority}</span>
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-500">{sr.channel}</span>
            {sr.slaBreached && <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">SLA BREACHED</span>}
          </div>
        </div>
        <Link to={`/service-requests/${id}/edit`} className="btn-primary !w-auto px-4 text-sm">Edit</Link>
      </div>

      {/* Action buttons */}
      <div className="admin-section">
        <div className="flex flex-wrap gap-2 mb-2">
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
        {sr.convertedToWoId && (
          <p className="text-sm text-slate-600">
            Converted to <Link to={`/work-orders/${sr.convertedToWoId}`} className="text-blue-600 underline">{sr.convertedToWoNum ?? sr.convertedToWoId}</Link>
          </p>
        )}
      </div>

      {showConvert && (
        <div className="admin-section bg-indigo-50 border border-indigo-200">
          <p className="font-medium mb-2 text-indigo-800">Convert to Work Order</p>
          <label className="block mb-3">
            <span className="form-label">Notes for work order</span>
            <textarea className="form-input" rows={2} value={convertNotes} onChange={(e) => setConvertNotes(e.target.value)} />
          </label>
          <div className="flex gap-2">
            <button type="button" className="btn-primary !w-auto px-4" onClick={convertToWo} disabled={converting}>{converting ? 'Converting…' : 'Confirm'}</button>
            <button type="button" className="btn-link" onClick={() => setShowConvert(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="admin-section grid grid-cols-2 gap-4 text-sm">
        <div><span className="form-label">Category</span><p>{sr.category ?? '—'}</p></div>
        <div><span className="form-label">Asset</span><p>{sr.assetNum ?? '—'}</p></div>
        <div><span className="form-label">Location</span><p>{sr.locationName ?? '—'}</p></div>
        <div><span className="form-label">Assigned to</span><p>{sr.assignedDisplayName ?? '—'}</p></div>
        <div><span className="form-label">Reporter</span><p>{sr.reporterName ?? '—'}{sr.reporterEmail ? ` (${sr.reporterEmail})` : ''}</p></div>
        <div><span className="form-label">Created</span><p>{new Date(sr.createdAt).toLocaleString()}</p></div>
        <div><span className="form-label">SLA due</span><p className={sr.slaBreached ? 'text-red-600 font-medium' : ''}>{sr.slaDueAt ? new Date(sr.slaDueAt).toLocaleString() : '—'}</p></div>
        <div><span className="form-label">Resolved</span><p>{sr.resolvedAt ? new Date(sr.resolvedAt).toLocaleString() : '—'}</p></div>
        <div><span className="form-label">Closed</span><p>{sr.closedAt ? new Date(sr.closedAt).toLocaleString() : '—'}</p></div>
        {sr.description && (
          <div className="col-span-2"><span className="form-label">Description</span><p className="whitespace-pre-wrap">{sr.description}</p></div>
        )}
        {sr.closureNotes && (
          <div className="col-span-2"><span className="form-label">Closure notes</span><p className="whitespace-pre-wrap">{sr.closureNotes}</p></div>
        )}
      </div>
    </IdentityPageLayout>
  );
}
