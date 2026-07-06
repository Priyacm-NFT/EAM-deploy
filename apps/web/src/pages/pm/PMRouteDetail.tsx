import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface RouteAsset {
  id: string;
  assetId: string;
  seq: number;
  assetNum: string;
  assetDescription: string;
}

interface AssetOption { id: string; assetNum: string; description: string }

export function PMRouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [route, setRoute] = useState<{ id: string; name: string; description: string | null; assets: RouteAsset[] } | null>(null);
  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [adding, setAdding] = useState(false);

  function load() {
    if (!id) return;
    api<typeof route>(`/pm-routes/${id}`).then(setRoute).catch((e) => setError(String(e)));
  }

  useEffect(() => {
    load();
    api<{ data: AssetOption[] } | AssetOption[]>('/assets?pageSize=500')
      .then((r) => setAssetOptions(Array.isArray(r) ? r : (r as { data: AssetOption[] }).data ?? []))
      .catch(() => setAssetOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function addAsset() {
    if (!id || !selectedAssetId) return;
    setAdding(true); setError(''); setSuccess('');
    try {
      await api(`/pm-routes/${id}/assets`, {
        method: 'POST',
        body: JSON.stringify({ assetId: selectedAssetId, seq: route?.assets.length ?? 0 }),
      });
      setSelectedAssetId('');
      setSuccess('Asset added to route.');
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setAdding(false);
    }
  }

  async function removeAsset(routeAssetId: string) {
    if (!id) return;
    try {
      await api(`/pm-routes/${id}/assets/${routeAssetId}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError(String(e));
    }
  }

  if (!route) {
    return (
      <IdentityPageLayout title="PM Route" backTo="/pm-routes" backLabel="Back to PM Routes">
        {error ? <MessageBanner type="error" text={error} /> : <p className="text-slate-400 text-sm">Loading…</p>}
      </IdentityPageLayout>
    );
  }

  const availableAssets = assetOptions.filter((a) => !route.assets.some((ra) => ra.assetId === a.id));

  return (
    <IdentityPageLayout title={route.name} subtitle={route.description ?? undefined} backTo="/pm-routes" backLabel="Back to PM Routes">
      {error && <MessageBanner type="error" text={error} />}
      {success && <MessageBanner type="success" text={success} />}

      <div className="admin-section">
        <h2 className="admin-section-title mb-3">Route stops ({route.assets.length} asset{route.assets.length === 1 ? '' : 's'})</h2>

        <p className="text-sm text-slate-500 mb-3">
          When a PM master targets this route, one Work Order is generated with one task line per asset below, in this order — this is what makes it "one visit, many assets" instead of one WO per asset.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 flex gap-3 items-end">
          <label className="block flex-1">
            <span className="form-label">Add an asset</span>
            <select className="form-input" value={selectedAssetId} onChange={(e) => setSelectedAssetId(e.target.value)}>
              <option value="">— Select an asset —</option>
              {availableAssets.map((a) => <option key={a.id} value={a.id}>{a.assetNum} — {a.description}</option>)}
            </select>
          </label>
          <button type="button" className="btn-primary !w-auto px-4" disabled={adding || !selectedAssetId} onClick={addAsset}>
            {adding ? 'Adding…' : 'Add to route'}
          </button>
        </div>

        {route.assets.length === 0 ? (
          <p className="text-slate-400 text-sm">No assets on this route yet. Add at least one before pointing a PM master at it.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>#</th><th>Asset #</th><th>Description</th><th></th></tr></thead>
            <tbody>
              {[...route.assets].sort((a, b) => a.seq - b.seq).map((ra, i) => (
                <tr key={ra.id}>
                  <td>{i + 1}</td>
                  <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{ra.assetNum}</code></td>
                  <td>{ra.assetDescription}</td>
                  <td><button type="button" className="btn-link text-xs text-red-600" onClick={() => removeAsset(ra.id)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-section mt-4">
        <p className="text-sm text-slate-500">
          Next: go to <a href="/pm/new" className="text-accent hover:underline">+ New PM</a> and pick this route
          instead of a single asset when setting up the schedule.
        </p>
      </div>
    </IdentityPageLayout>
  );
}
