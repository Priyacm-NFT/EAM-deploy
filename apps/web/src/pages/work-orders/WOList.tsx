import { useTableView } from '../../hooks/useTableView.js';
import { TableViewBar } from '../../components/TableViewBar.js';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface WO {
  id: string; woNum: string; description: string; status: string;
  type: string; priority: string; assetNum: string | null;
  siteName: string | null; targetFinishDate: string | null;
  assignedDisplayName: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  WAPPR: 'bg-slate-100 text-slate-600', APPR: 'bg-blue-100 text-blue-700',
  INPRG: 'bg-yellow-100 text-yellow-700', COMP: 'bg-green-100 text-green-800',
  CLOSE: 'bg-gray-100 text-gray-500', HOLD: 'bg-orange-100 text-orange-700', CAN: 'bg-red-100 text-red-700',
};
const PRIORITY_COLORS: Record<string, string> = {
  EMERGENCY: 'bg-red-600 text-white', URGENT: 'bg-red-100 text-red-700',
  HIGH: 'bg-orange-100 text-orange-700', MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-slate-100 text-slate-500',
};

const DEFAULT_COLUMNS = [
  { fieldKey: 'woNum', label: 'WO #' },
  { fieldKey: 'description', label: 'Description' },
  { fieldKey: 'status', label: 'Status' },
  { fieldKey: 'type', label: 'Type' },
  { fieldKey: 'priority', label: 'Priority' },
  { fieldKey: 'assetNum', label: 'Asset' },
  { fieldKey: 'targetFinishDate', label: 'Target finish' },
];

export function WOListPage() {
  const [wos, setWos] = useState<WO[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');

  const { views, activeView, setActiveView } = useTableView('WorkOrder');
  const columns = activeView?.columnConfig?.length ? activeView.columnConfig : DEFAULT_COLUMNS;

  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    if (priority) params.set('priority', priority);
    api<{ data: WO[] }>(`/work-orders?${params}`)
  .then((res) => setWos(res.data ?? []))
  .catch((e) => setError(String(e)));
  }, [status, type, priority]);

  return (
    <IdentityPageLayout title="Work Orders" subtitle="Corrective and preventive maintenance work">
      {error && <MessageBanner type="error" text={error} />}

      <div className="admin-section">
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <label className="block w-36">
            <span className="form-label">Status</span>
            <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {['WAPPR', 'APPR', 'INPRG', 'COMP', 'CLOSE', 'HOLD', 'CAN'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="block w-36">
            <span className="form-label">Type</span>
            <select className="form-input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All</option>
              {['CM', 'PM', 'PROJECT', 'INSPECTION', 'CALIBRATION'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="block w-36">
            <span className="form-label">Priority</span>
            <select className="form-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">All</option>
              {['EMERGENCY', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <button type="button" className="btn-primary !w-auto px-4" onClick={() => navigate('/work-orders/new')}>+ New WO</button>
        </div>

              <TableViewBar views={views} activeView={activeView} onSwitch={setActiveView} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">WO #</th>
                <th className="py-2 pr-4">Description</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Priority</th>
                <th className="py-2 pr-4">Asset</th>
                <th className="py-2 pr-4">Target finish</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {wos.length === 0 ? (
                <tr><td colSpan={8} className="py-6 text-center text-slate-400">No work orders found.</td></tr>
              ) : (
                wos.map((wo) => (
                  <tr key={wo.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-4 font-mono text-xs"><Link to={`/work-orders/${wo.id}`} className="text-blue-600">{wo.woNum}</Link></td>
                    <td className="py-2 pr-4">{wo.description}</td>
                    <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[wo.status] ?? ''}`}>{wo.status}</span></td>
                    <td className="py-2 pr-4 text-slate-500">{wo.type}</td>
                    <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[wo.priority] ?? ''}`}>{wo.priority}</span></td>
                    <td className="py-2 pr-4 text-slate-500">{wo.assetNum ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{wo.targetFinishDate ? new Date(wo.targetFinishDate).toLocaleDateString() : '—'}</td>
                    <td className="py-2"><Link to={`/work-orders/${wo.id}`} className="btn-link text-xs">View</Link></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </IdentityPageLayout>
  );
}

