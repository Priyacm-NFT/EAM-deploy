import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface Permit {
  id: string; permitNum: string; type: string; status: string;
  description: string;
  validFrom: string | null; validTo: string | null; notes: string | null;
  checklist: Array<{ id: string; category: string; description: string; isRequired: boolean; checked: boolean; checkedAt: string | null }>;
  approvals: Array<{ id: string; step: number; role: string; status: string; comments: string | null; decidedAt: string | null }>;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600', PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
  ACTIVE: 'bg-green-100 text-green-800', EXPIRED: 'bg-orange-100 text-orange-700',
  CLOSED: 'bg-gray-100 text-gray-500', REJECTED: 'bg-red-100 text-red-700',
};

export function PermitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [permit, setPermit] = useState<Permit | null>(null);
  const [error, setError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [approvalComments, setApprovalComments] = useState('');

  const load = () => {
    if (!id) return;
    api<Permit>(`/permits/${id}`).then(setPermit).catch((e) => setError(String(e)));
  };
  useEffect(load, [id]);

  const action = async (endpoint: string, body: object = {}) => {
    setActionBusy(true);
    try {
      await api(`/permits/${id}/${endpoint}`, { method: 'POST', body: JSON.stringify(body) });
      load();
    } catch (e) { setError(String(e)); }
    finally { setActionBusy(false); }
  };

  const toggleChecklist = async (itemId: string, checked: boolean) => {
    try {
      await api(`/permits/${id}/checklist/${itemId}`, { method: 'PUT', body: JSON.stringify({ checked }) });
      load();
    } catch (e) { setError(String(e)); }
  };

  if (!permit) return <div className="admin-page"><p className="text-slate-400">Loading…</p></div>;

  return (
    <IdentityPageLayout title={permit.permitNum} backTo="/permits" backLabel="Back to permits">
      {error && <MessageBanner type="error" text={error} />}

      <div className="flex items-start gap-4 mb-4">
        <div className="flex-1">
          <p className="text-lg font-medium">{permit.type.replace('_', ' ')}</p>
          <p className="text-sm text-slate-600 mt-1">{permit.description}</p>
          <div className="flex gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[permit.status] ?? ''}`}>{permit.status}</span>
            {permit.validFrom && <span className="text-xs text-slate-500">Valid: {new Date(permit.validFrom).toLocaleDateString()} – {permit.validTo ? new Date(permit.validTo).toLocaleDateString() : '∞'}</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {permit.status === 'DRAFT' && (
            <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => action('submit')} disabled={actionBusy}>Submit for approval</button>
          )}
          {permit.status === 'PENDING_APPROVAL' && (
            <>
              <button type="button" className="btn-primary !w-auto px-4 text-sm bg-green-600" onClick={() => action('approve', { comments: approvalComments })} disabled={actionBusy}>Approve</button>
              <button type="button" className="btn-primary !w-auto px-4 text-sm bg-red-600" onClick={() => action('reject', { comments: approvalComments })} disabled={actionBusy}>Reject</button>
            </>
          )}
          {permit.status === 'ACTIVE' && (
            <button type="button" className="btn-primary !w-auto px-4 text-sm bg-gray-600" onClick={() => action('close')} disabled={actionBusy}>Close permit</button>
          )}
        </div>
      </div>

      {['PENDING_APPROVAL'].includes(permit.status) && (
        <div className="admin-section">
          <label className="block">
            <span className="form-label">Approval comments</span>
            <textarea className="form-input" rows={2} value={approvalComments} onChange={(e) => setApprovalComments(e.target.value)} />
          </label>
        </div>
      )}

      {/* Checklist */}
      <div className="admin-section">
        <h2 className="admin-section-title mb-3">Safety Checklist</h2>
        <div className="space-y-2">
          {permit.checklist.map((item) => (
            <label key={item.id} className={`flex items-start gap-3 p-3 rounded border ${item.checked ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={item.checked}
                disabled={['ACTIVE', 'CLOSED', 'REJECTED'].includes(permit.status)}
                onChange={(e) => toggleChecklist(item.id, e.target.checked)}
                aria-label={item.description}
              />
              <div className="flex-1">
                <p className="text-sm">{item.description}</p>
                <p className="text-xs text-slate-400">{item.category}{item.isRequired ? ' · Required' : ''}</p>
              </div>
              {item.checkedAt && <span className="text-xs text-slate-400">{new Date(item.checkedAt).toLocaleDateString()}</span>}
            </label>
          ))}
        </div>
      </div>

      {/* Approval steps */}
      <div className="admin-section">
        <h2 className="admin-section-title mb-3">Approval steps</h2>
        <div className="space-y-2">
          {permit.approvals.map((a) => (
            <div key={a.id} className={`flex items-center gap-4 p-3 rounded border text-sm ${a.status === 'APPROVED' ? 'border-green-200 bg-green-50' : a.status === 'REJECTED' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
              <span className="font-mono text-xs w-12">Step {a.step}</span>
              <span className="flex-1">{a.role}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${a.status === 'APPROVED' ? 'bg-green-100 text-green-700' : a.status === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>{a.status}</span>
              {a.decidedAt && <span className="text-xs text-slate-400">{new Date(a.decidedAt).toLocaleDateString()}</span>}
              {a.comments && <span className="text-xs text-slate-500 italic">{a.comments}</span>}
            </div>
          ))}
        </div>
      </div>

      {permit.notes && (
        <div className="admin-section">
          <span className="form-label">Notes</span>
          <p className="text-sm whitespace-pre-wrap">{permit.notes}</p>
        </div>
      )}
    </IdentityPageLayout>
  );
}
