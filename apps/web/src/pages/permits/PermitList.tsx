import { useTableView } from '../../hooks/useTableView.js';
import { TableViewBar } from '../../components/TableViewBar.js';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { usePagination } from '../../hooks/usePagination.js';
import { Pagination } from '../../components/Pagination.js';

interface Permit { id: string; permitNum: string; type: string; status: string; validFrom: string | null; validTo: string | null; createdAt: string }

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600', PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
  ACTIVE: 'bg-green-100 text-green-800', EXPIRED: 'bg-orange-100 text-orange-700',
  CLOSED: 'bg-gray-100 text-gray-500', REJECTED: 'bg-red-100 text-red-700',
};


const DEFAULT_COLUMNS = [
  { fieldKey: 'permitNum', label: 'PTW #', width: 100 },
  { fieldKey: 'type', label: 'Type', width: 120 },
  { fieldKey: 'status', label: 'Status', width: 110 },
  { fieldKey: 'validFrom', label: 'Valid from', width: 130 },
  { fieldKey: 'validTo', label: 'Valid to', width: 130 },
];

export function PermitListPage() {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');

  const { views, activeView, setActiveView } = useTableView('Permit');
  const columns = activeView?.columnConfig?.length ? activeView.columnConfig : DEFAULT_COLUMNS;

  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (type) params.set('type', type);
    api<Permit[]>(`/permits?${params}`).then(setPermits).catch((e) => setError(String(e)));
  }, [status, type]);

  const { page, setPage, paged, totalPages, totalItems } = usePagination(permits, 10);

  return (
    <IdentityPageLayout title="Permits to Work" subtitle="PTW requests, approvals and active permits">
      {error && <MessageBanner type="error" text={error} />}
      <div className="admin-section">
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <label className="block w-36">
            <span className="form-label">Status</span>
            <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              {['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'EXPIRED', 'CLOSED', 'REJECTED'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="block w-44">
            <span className="form-label">Type</span>
            <select className="form-input" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All</option>
              {['HOT_WORK', 'CONFINED_SPACE', 'ELECTRICAL', 'HEIGHT', 'EXCAVATION', 'CHEMICAL', 'GENERAL'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <button type="button" className="btn-primary !w-auto px-4 ml-auto" onClick={() => navigate('/permits/new')}>+ New permit</button>
        </div>

        <TableViewBar views={views} activeView={activeView} onSwitch={setActiveView} />
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              {columns.map((col) => (
                <th key={col.fieldKey} className="py-2 pr-4">{col.label}</th>
              ))}
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {permits.length === 0 ? (
              <tr><td colSpan={6} className="py-6 text-center text-slate-400">No permits found.</td></tr>
            ) : (
              paged.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-mono text-xs"><Link to={`/permits/${p.id}`} className="text-blue-600">{p.permitNum}</Link></td>
                  <td className="py-2 pr-4">{p.type.replace('_', ' ')}</td>
                  <td className="py-2 pr-4"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] ?? ''}`}>{p.status}</span></td>
                  <td className="py-2 pr-4 text-slate-500">{p.validFrom ? new Date(p.validFrom).toLocaleDateString() : '—'}</td>
                  <td className="py-2 pr-4 text-slate-500">{p.validTo ? new Date(p.validTo).toLocaleDateString() : '—'}</td>
                  <td className="py-2"><Link to={`/permits/${p.id}`} className="btn-link text-xs">View</Link></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={10} onChange={setPage} />
    </IdentityPageLayout>
  );
}
