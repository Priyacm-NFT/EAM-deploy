import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface Item { id: string; itemNum: string; description: string; type: string; uom: string; isActive: boolean; unitCost: string | null }

export function ItemMasterListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showTx, setShowTx] = useState<Item | null>(null);
  const [txForm, setTxForm] = useState({ storeroomId: '', qty: '1', txType: 'ISSUE', notes: '' });
  const [storerooms, setStorerooms] = useState<Array<{ id: string; name: string }>>([]);
  const [txBusy, setTxBusy] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    api<{ data: Item[] }>(`/inventory/items?${params}`).then((r) => setItems(r.data)).catch((e) => setError(String(e)));
    api<Array<{ id: string; name: string }>>('/inventory/storerooms').then(setStorerooms).catch(() => {});
  }, [search]);

  const doTransaction = async () => {
    if (!showTx) return;
    setTxBusy(true);
    setError('');
    try {
      const endpoints: Record<string, string> = {
        ISSUE: '/inventory/issue', RETURN: '/inventory/return',
        RECEIPT: '/inventory/receipt', ADJUSTMENT: '/inventory/adjustment',
      };
      await api(endpoints[txForm.txType]!, {
        method: 'POST',
        body: JSON.stringify({ itemId: showTx.id, storeroomId: txForm.storeroomId, qty: txForm.qty, notes: txForm.notes }),
      });
      setSuccess(`${txForm.txType} transaction recorded`);
      setShowTx(null);
    } catch (e) { setError(String(e)); }
    finally { setTxBusy(false); }
  };

  return (
    <IdentityPageLayout title="Item Master" subtitle="Storeroom items, parts and consumables">
      {error && <MessageBanner type="error" text={error} />}
      {success && <MessageBanner type="success" text={success} />}

      <div className="admin-section">
        <div className="flex gap-3 mb-4 items-end">
          <label className="block flex-1">
            <span className="form-label">Search</span>
            <input className="form-input" placeholder="Item #, description…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <Link to="/inventory/storerooms" className="btn-link text-sm">Storerooms →</Link>
          <Link to="/inventory/transactions" className="btn-link text-sm">Transactions →</Link>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">Item #</th>
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">UOM</th>
              <th className="py-2 pr-4">Unit cost</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className="py-6 text-center text-slate-400">No items found.</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 pr-4 font-mono text-xs text-blue-600">{item.itemNum}</td>
                  <td className="py-2 pr-4">{item.description}</td>
                  <td className="py-2 pr-4 text-slate-500">{item.type}</td>
                  <td className="py-2 pr-4 text-slate-500">{item.uom}</td>
                  <td className="py-2 pr-4 text-slate-500">{item.unitCost ? `$${parseFloat(item.unitCost).toFixed(2)}` : '—'}</td>
                  <td className="py-2">
                    <button type="button" className="btn-link text-xs" onClick={() => setShowTx(item)}>Transact</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Quick transaction dialog */}
      {showTx && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h2 className="font-semibold mb-3">Transaction — {showTx.description}</h2>
            {error && <MessageBanner type="error" text={error} />}
            <div className="space-y-3">
              <label className="block">
                <span className="form-label">Transaction type</span>
                <select className="form-input" value={txForm.txType} onChange={(e) => setTxForm({ ...txForm, txType: e.target.value })}>
                  {['ISSUE', 'RETURN', 'RECEIPT', 'ADJUSTMENT'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="form-label">Storeroom</span>
                <select className="form-input" value={txForm.storeroomId} onChange={(e) => setTxForm({ ...txForm, storeroomId: e.target.value })}>
                  <option value="">— Select —</option>
                  {storerooms.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="form-label">Quantity</span>
                <input type="number" step="0.01" className="form-input" value={txForm.qty} onChange={(e) => setTxForm({ ...txForm, qty: e.target.value })} />
              </label>
              <label className="block">
                <span className="form-label">Notes</span>
                <textarea className="form-input" rows={2} value={txForm.notes} onChange={(e) => setTxForm({ ...txForm, notes: e.target.value })} />
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button type="button" className="btn-primary !w-auto px-4" onClick={doTransaction} disabled={txBusy}>{txBusy ? 'Saving…' : 'Confirm'}</button>
              <button type="button" className="btn-link" onClick={() => setShowTx(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </IdentityPageLayout>
  );
}
