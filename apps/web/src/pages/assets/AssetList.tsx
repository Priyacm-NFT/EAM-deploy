import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface Asset {
  id: string; assetNum: string; description: string; status: string;
  criticality: string | null; manufacturer: string | null; model: string | null;
  serialNum: string | null; locationName: string | null; siteName: string | null;
  className: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-slate-100 text-slate-600',
  IN_REPAIR: 'bg-yellow-100 text-yellow-800',
  DECOMMISSIONED: 'bg-red-100 text-red-800',
  DISPOSED: 'bg-gray-100 text-gray-500',
  STANDBY: 'bg-blue-100 text-blue-600',
  // legacy
  OPERATING: 'bg-green-100 text-green-800',
  UNDER_MAINTENANCE: 'bg-yellow-100 text-yellow-800',
};

export function AssetListPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (status) params.set('status', status);
      // API returns { data: Asset[], page, pageSize }
      const res = await api<{ data: Asset[] } | Asset[]>(`/assets?${params}`);
      setAssets(Array.isArray(res) ? res : (res as { data: Asset[] }).data ?? []);
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => { void load(); }, [search, status]);

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
              {['ACTIVE','INACTIVE','IN_REPAIR','STANDBY','DECOMMISSIONED','DISPOSED'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-primary !w-auto px-4"
            onClick={() => navigate('/assets/new')}>+ New asset</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 text-xs uppercase tracking-wide">
                <th className="py-2 pr-4">Asset #</th>
                <th className="py-2 pr-4">Description</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Class</th>
                <th className="py-2 pr-4">Location / Site</th>
                <th className="py-2 pr-4">Manufacturer / Model</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-slate-400">No assets found.</td></tr>
              ) : assets.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-mono text-xs text-blue-600">
                    <Link to={`/assets/${a.id}`}>{a.assetNum}</Link>
                  </td>
                  <td className="py-2 pr-4">{a.description}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[a.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{a.className ?? '—'}</td>
                  <td className="py-2 pr-4 text-slate-500">
                    {[a.locationName, a.siteName].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="py-2 pr-4 text-slate-500">
                    {[a.manufacturer, a.model].filter(Boolean).join(' / ') || '—'}
                  </td>
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
