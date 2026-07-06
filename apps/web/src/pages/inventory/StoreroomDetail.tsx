import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

// FIX: the Storeroom list's Code column was styled to *look* like a
// link (blue, monospace) but had no <Link>, no onClick — clicking it did
// nothing, and no Storeroom Detail page existed at all. The backend
// (GET /storerooms/:id) already fully supported this — item balances,
// below-min flags, bin locations — nothing in the UI was calling it.

interface Balance {
  id: string;
  itemId: string;
  itemNum: string | null;
  itemDescription: string | null;
  qtyOnHand: string;
  qtyReserved: string;
  qtyOnOrder: string | null;
  minQty: string | null;
  maxQty: string | null;
  avgCost: string | null;
  binLocation: string | null;
  isHazardous: boolean;
  belowMin: boolean;
}

interface StoreroomDetailData {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  balances: Balance[];
}

export function StoreroomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [sr, setSr] = useState<StoreroomDetailData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api<StoreroomDetailData>(`/storerooms/${id}`)
      .then(setSr)
      .catch((e) => setError(String(e)));
  }, [id]);

  if (!sr) {
    return (
      <IdentityPageLayout title="Storeroom" backTo="/inventory/storerooms" backLabel="Back to storerooms">
        {error ? <MessageBanner type="error" text={error} /> : <p className="text-slate-400 text-sm">Loading…</p>}
      </IdentityPageLayout>
    );
  }

  const totalOnHand = sr.balances.reduce((sum, b) => sum + (parseFloat(b.qtyOnHand) || 0), 0);
  const belowMinCount = sr.balances.filter((b) => b.belowMin).length;

  return (
    <IdentityPageLayout title={`${sr.code} — ${sr.name}`} subtitle={sr.description ?? undefined} backTo="/inventory/storerooms" backLabel="Back to storerooms">
      {error && <MessageBanner type="error" text={error} />}

      <div className="admin-section grid grid-cols-3 gap-4 mb-4">
        <div><span className="form-label">Status</span><p>{sr.isActive ? 'Active' : 'Inactive'}</p></div>
        <div><span className="form-label">Items stocked</span><p>{sr.balances.length}</p></div>
        <div><span className="form-label">Total units on hand</span><p>{totalOnHand}</p></div>
      </div>

      {belowMinCount > 0 && (
        <div className="mb-4 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          {belowMinCount} item{belowMinCount === 1 ? ' is' : 's are'} at or below its reorder minimum in this storeroom.
        </div>
      )}

      <div className="admin-section">
        <h2 className="admin-section-title mb-3">Item balances</h2>
        {sr.balances.length === 0 ? (
          <p className="text-slate-400 text-sm">No items stocked in this storeroom yet — use an item's "Transaction" button (Receipt) to add stock here.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                <th className="pb-2 pr-4">Item #</th>
                <th className="pb-2 pr-4">Description</th>
                <th className="pb-2 pr-4">On hand</th>
                <th className="pb-2 pr-4">Reserved</th>
                <th className="pb-2 pr-4">Available</th>
                <th className="pb-2 pr-4">Min / Max</th>
                <th className="pb-2 pr-4">Bin</th>
                <th className="pb-2 pr-4">Avg cost</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {sr.balances.map((b) => {
                const onHand = parseFloat(b.qtyOnHand) || 0;
                const reserved = parseFloat(b.qtyReserved) || 0;
                return (
                  <tr key={b.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4"><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{b.itemNum}</code></td>
                    <td className="py-2 pr-4">{b.itemDescription}{b.isHazardous && <span className="ml-2 text-xs text-red-600 font-semibold">HAZ</span>}</td>
                    <td className={`py-2 pr-4 ${b.belowMin ? 'text-amber-700 font-semibold' : ''}`}>{onHand}</td>
                    <td className="py-2 pr-4 text-slate-500">{reserved}</td>
                    <td className="py-2 pr-4">{(onHand - reserved).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-slate-500">{b.minQty ?? '—'} / {b.maxQty ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{b.binLocation ?? '—'}</td>
                    <td className="py-2 pr-4 text-slate-500">{b.avgCost ? `$${parseFloat(b.avgCost).toFixed(2)}` : '—'}</td>
                    <td className="py-2">
                      <a href={`/inventory?search=${encodeURIComponent(b.itemNum ?? '')}`} className="btn-link text-xs">View item</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </IdentityPageLayout>
  );
}
