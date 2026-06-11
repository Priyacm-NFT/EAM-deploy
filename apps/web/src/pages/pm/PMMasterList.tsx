import { useTableView } from '../../hooks/useTableView.js';
import { TableViewBar } from '../../components/TableViewBar.js';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface PM {
  id: string; pmNum: string; description: string; status: string;
  frequencyType: string; interval: number | null; intervalUnit: string | null;
  nextDueDate: string | null; priority: string; isActive: boolean;
  assetNum: string | null; assetDescription: string | null; siteName: string | null;
}


const DEFAULT_COLUMNS = [
  { fieldKey: 'pmNum', label: 'PM #', width: 100 },
  { fieldKey: 'description', label: 'Description', width: 200 },
  { fieldKey: 'frequency', label: 'Frequency', width: 120 },
  { fieldKey: 'nextDueDate', label: 'Next due', width: 130 },
  { fieldKey: 'assetDescription', label: 'Asset', width: 150 },
];

export function PMMasterListPage() {
  const [pms, setPms] = useState<PM[]>([]);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { views, activeView, setActiveView } = useTableView('PMaster');
  const columns = activeView?.columnConfig?.length ? activeView.columnConfig : DEFAULT_COLUMNS;

  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    api<PM[]>(`/pm-masters?${params}`).then(setPms).catch((e) => setError(String(e)));
  }, [statusFilter]);

  const generateNow = async (pmId: string) => {
    try {
      const wo = await api<{ woNum: string; id: string }>(`/pm-masters/${pmId}/generate-now`, { method: 'POST' });
      navigate(`/work-orders/${wo.id}`);
    } catch (e) { setError(String(e)); }
  };

  return (
    <IdentityPageLayout title="Preventive Maintenance" subtitle="PM masters, schedules and forecast calendar">
      {error && <MessageBanner type="error" text={error} />}
      <div className="admin-section">
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <label className="block w-44">
            <span className="form-label">Status</span>
            <select className="form-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {['ACTIVE', 'INACTIVE', 'DRAFT'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <Link to="/pm/forecast" className="btn-link text-sm">Forecast calendar →</Link>
          <button type="button" className="btn-primary !w-auto px-4 ml-auto" onClick={() => navigate('/pm/new')}>+ New PM</button>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">PM #</th>
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">Frequency</th>
              <th className="py-2 pr-4">Next due</th>
              <th className="py-2 pr-4">Asset</th>
              <th className="py-2 pr-4">Site</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {pms.length === 0 ? (
              <tr><td colSpan={7} className="py-6 text-center text-slate-400">No PM masters.</td></tr>
            ) : (
              pms.map((pm) => {
                const isOverdue = pm.nextDueDate && new Date(pm.nextDueDate) < new Date();
                return (
                  <tr key={pm.id} className={`border-b border-slate-100 hover:bg-slate-50 ${isOverdue ? 'bg-red-50' : ''}`}>
                    <td className="py-2 pr-4 font-mono text-xs"><Link to={`/pm/${pm.id}`} className="text-blue-600">{pm.pmNum}</Link></td>
                    <td className="py-2 pr-4">{pm.description}</td>
                    <td className="py-2 pr-4 text-slate-500">{pm.frequencyType}{pm.interval ? ` / ${pm.interval} ${pm.intervalUnit}` : ''}</td>
                    <td className={`py-2 pr-4 text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-slate-500'}`}>
                      {pm.nextDueDate ? new Date(pm.nextDueDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{pm.assetNum ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{pm.siteName ?? '—'}</td>
                    <td className="py-2">
                      <button type="button" className="btn-link text-xs" onClick={() => navigate(`/pm/${pm.id}`)}>Edit</button>
                      <button type="button" className="btn-link text-xs" onClick={() => generateNow(pm.id)}>Generate WO</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </IdentityPageLayout>
  );
}
