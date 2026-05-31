import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface SR {
  id: string; srNum: string; description: string; status: string; priority: string;
  channel: string; createdAt: string; slaDueAt: string | null; slaBreached: boolean;
  assignedDisplayName: string | null; assetNum: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: 'bg-red-100 text-red-700', HIGH: 'bg-orange-100 text-orange-700',
  MEDIUM: 'bg-yellow-100 text-yellow-700', LOW: 'bg-slate-100 text-slate-500',
};
const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-100 text-blue-700', QUEUED: 'bg-purple-100 text-purple-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700', RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-slate-100 text-slate-500', CANCELLED: 'bg-red-100 text-red-500',
  CONVERTED: 'bg-teal-100 text-teal-700',
};

export function SRListPage() {
  const [srs, setSrs] = useState<SR[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setError('');
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (priority) params.set('priority', priority);
    api<{ data: SR[] } | SR[]>(`/service-requests?${params}`)
      .then((res) => setSrs(Array.isArray(res) ? res : (res as { data: SR[] }).data ?? []))
      .catch((e) => setError(String(e)));
  }, [status, priority]);

  return (
    <IdentityPageLayout title="Service Requests" subtitle="Fault reports and service calls">
      {error && <MessageBanner type="error" text={error} />}
      <div className="admin-section">
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <label className="block w-44">
            <span className="form-label">Status</span>
            <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {['NEW','QUEUED','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED','CONVERTED'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block w-44">
            <span className="form-label">Priority</span>
            <select className="form-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All</option>
              {['URGENT','HIGH','MEDIUM','LOW'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <button type="button" className="btn-primary !w-auto px-4"
            onClick={() => navigate('/service-requests/new')}>+ New SR</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">SR #</th>
                <th className="py-2 pr-4">Description</th>
                <th className="py-2 pr-4">Priority</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">SLA Due</th>
                <th className="py-2 pr-4">Asset</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {srs.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">No service requests found.</td></tr>
              ) : srs.map((sr) => (
                <tr key={sr.id} className={`border-b border-slate-100 hover:bg-slate-50 ${sr.slaBreached ? 'bg-red-50' : ''}`}>
                  <td className="py-2 pr-4 font-mono text-xs text-blue-600">
                    <Link to={`/service-requests/${sr.id}`}>{sr.srNum}</Link>
                  </td>
                  <td className="py-2 pr-4 max-w-xs truncate">{sr.description}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[sr.priority] ?? ''}`}>
                      {sr.priority}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[sr.status] ?? ''}`}>
                      {sr.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {sr.slaDueAt ? (
                      <span className={sr.slaBreached ? 'text-red-600 font-medium' : 'text-slate-500'}>
                        {new Date(sr.slaDueAt).toLocaleDateString()}
                        {sr.slaBreached && ' ⚠ Breached'}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-2 pr-4 text-slate-500 text-xs">{sr.assetNum ?? '—'}</td>
                  <td className="py-2">
                    <Link to={`/service-requests/${sr.id}`} className="btn-link text-xs">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </IdentityPageLayout>
  );
}
