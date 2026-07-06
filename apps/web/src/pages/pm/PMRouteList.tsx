import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

// FIX (P1-5 gap — UI for AC-P1-5.7): "Route PM generates a single WO
// covering all route assets." The API (/pm-routes) existed with no
// screen to create a route or attach assets to it — this is that screen.

interface PMRoute {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  assetCount: number;
}

export function PMRouteListPage() {
  const navigate = useNavigate();
  const [routesList, setRoutesList] = useState<PMRoute[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);

  function load() {
    api<PMRoute[]>('/pm-routes').then(setRoutesList).catch((e) => setError(String(e)));
  }
  useEffect(() => { load(); }, []);

  async function create() {
    setSaving(true); setError('');
    try {
      const created = await api<{ id: string }>('/pm-routes', {
        method: 'POST',
        body: JSON.stringify({ name: form.name.trim(), description: form.description || undefined }),
      });
      navigate(`/pm-routes/${created.id}`);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  }

  return (
    <IdentityPageLayout
      title="PM Routes"
      subtitle="Group assets that get inspected together on one visit — a route PM generates a single Work Order covering every asset on it"
      backTo="/pm"
      backLabel="Back to Preventive Maintenance"
    >
      {error && <MessageBanner type="error" text={error} />}

      <div className="admin-section">
        <div className="flex justify-between items-center mb-3">
          <h2 className="admin-section-title">Routes</h2>
          <button type="button" className="btn-primary !w-auto px-4" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : '+ New route'}
          </button>
        </div>

        {showForm && (
          <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 grid grid-cols-1 gap-3">
            <label className="block">
              <span className="form-label">Name</span>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pump Station Walk — North" />
            </label>
            <label className="block">
              <span className="form-label">Description</span>
              <input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="flex gap-2">
              <button type="button" className="btn-primary !w-auto px-4" disabled={saving || !form.name.trim()} onClick={create}>
                {saving ? 'Creating…' : 'Create & add assets'}
              </button>
              <button type="button" className="btn-link" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {routesList.length === 0 ? (
          <p className="text-slate-400 text-sm">No routes yet. A route is what lets a single PM master generate one Work Order covering many assets in one visit.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Description</th><th>Assets</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {routesList.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-slate-500">{r.description ?? '—'}</td>
                  <td>{r.assetCount}</td>
                  <td>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${r.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                      {r.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td><Link to={`/pm-routes/${r.id}`} className="btn-link text-xs">Manage assets</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </IdentityPageLayout>
  );
}
