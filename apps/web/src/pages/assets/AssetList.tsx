import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { useTableView } from '../../hooks/useTableView.js';
import { TableViewBar } from '../../components/TableViewBar.js';

interface Asset {
  id: string; assetNum: string; description: string; status: string;
  criticality: string | null; manufacturer: string | null; model: string | null;
  serialNum: string | null; locationName: string | null; siteName: string | null;
  className: string | null;
  [key: string]: unknown;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800', INACTIVE: 'bg-slate-100 text-slate-600',
  IN_REPAIR: 'bg-yellow-100 text-yellow-800', DECOMMISSIONED: 'bg-red-100 text-red-800',
  DISPOSED: 'bg-gray-100 text-gray-500', STANDBY: 'bg-blue-100 text-blue-600',
  OPERATING: 'bg-green-100 text-green-800', UNDER_MAINTENANCE: 'bg-yellow-100 text-yellow-800',
};

const DEFAULT_COLUMNS = [
  { fieldKey: 'assetNum',     label: 'Asset #',              width: 100 },
  { fieldKey: 'description',  label: 'Description',          width: 220 },
  { fieldKey: 'status',       label: 'Status',               width: 120 },
  { fieldKey: 'className',    label: 'Class',                width: 120 },
  { fieldKey: 'locationName', label: 'Location / Site',      width: 160 },
  { fieldKey: 'manufacturer', label: 'Manufacturer / Model', width: 180 },
];

function getCellValue(asset: Asset, fieldKey: string): string {
  switch (fieldKey) {
    case 'assetNum':      return asset.assetNum ?? '—';
    case 'description':   return asset.description ?? '—';
    case 'status':        return asset.status ?? '—';
    case 'criticality':   return asset.criticality ?? '—';
    case 'className':     return asset.className ?? '—';
    case 'locationName':  return [asset.locationName, asset.siteName].filter(Boolean).join(' · ') || '—';
    case 'manufacturer':  return [asset.manufacturer, asset.model].filter(Boolean).join(' / ') || '—';
    case 'serialNum':     return asset.serialNum ?? '—';
    default:              return String(asset[fieldKey] ?? asset[`custom__${fieldKey}`] ?? '—');
  }
}

export function AssetListPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError]   = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();
  const { views, activeView, setActiveView } = useTableView('Asset');
  const columns = activeView?.columnConfig?.length ? activeView.columnConfig : DEFAULT_COLUMNS;

  useEffect(() => {
    setError('');
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (status) params.set('status', status);
    api<{ data: Asset[] } | Asset[]>(`/assets?${params}`)
      .then((res) => setAssets(Array.isArray(res) ? res : (res as { data: Asset[] }).data ?? []))
      .catch((e) => setError(String(e)));
  }, [search, status]);

  return (
    <IdentityPageLayout title="Assets" subtitle="Equipment, machinery and infrastructure register">
      {error && <MessageBanner type="error" text={error} />}
      <div className="admin-section">
        <div className="flex flex-wrap gap-3 mb-4 items-end">
          <label className="block flex-1 min-w-48">
            <span className="form-label">Search</span>
            <input className="form-input" placeholder="Asset #, description, serial…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="block w-44">
            <span className="form-label">Status</span>
            <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {['ACTIVE','INACTIVE','IN_REPAIR','STANDBY','DECOMMISSIONED','DISPOSED','OPERATING'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-primary !w-auto px-4"
            onClick={() => navigate('/assets/new')}>+ New asset</button>
        </div>

        <TableViewBar views={views} activeView={activeView} onSwitch={setActiveView} />

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 text-xs uppercase tracking-wide">
                {columns.map((col) => (
                  <th key={col.fieldKey} className="py-2 pr-4" style={{ minWidth: col.width ?? 120 }}>
                    {col.label}
                  </th>
                ))}
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr><td colSpan={columns.length + 1} className="py-8 text-center text-slate-400">No assets found.</td></tr>
              ) : assets.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  {columns.map((col, i) => (
                    <td key={col.fieldKey} className="py-2 pr-4" style={{ minWidth: col.width ?? 120 }}>
                      {col.fieldKey === 'status' ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[a.status] ?? 'bg-slate-100 text-slate-600'}`}>
                          {a.status}
                        </span>
                      ) : i === 0 ? (
                        <Link to={`/assets/${a.id}`} className="font-mono text-xs text-blue-600">
                          {getCellValue(a, col.fieldKey)}
                        </Link>
                      ) : (
                        <span className="text-slate-700">{getCellValue(a, col.fieldKey)}</span>
                      )}
                    </td>
                  ))}
                  <td className="py-2">
                    <Link to={`/assets/${a.id}`} className="btn-link text-xs">View</Link>
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
