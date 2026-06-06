import { useEffect, useState } from 'react';
//import { Link, useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, FormField, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface Item {
  id: string; itemNum: string; description: string; itemType: string;
  unit: string; unitCost: string | null; isActive: boolean;
}

export function ItemMasterListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [showTx, setShowTx] = useState<Item | null>(null);
  const [storerooms, setStorerooms] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [txForm, setTxForm] = useState({ storeroomId: '', qty: '1', txType: 'ISSUE', notes: '' });
  const [txBusy, setTxBusy] = useState(false);
  // New item form
  const [showNew, setShowNew] = useState(false);
  const [newItem, setNewItem] = useState({ itemNum: '', description: '', itemType: 'STOCKED', unit: 'EA', unitCost: '' });
  const [newBusy, setNewBusy] = useState(false);
  

  const loadItems = () => {
    setError('');
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    // API route is /items (not /inventory/items)
    api<{ data: Item[] } | Item[]>(`/items?${params}`)
      .then((r) => setItems(Array.isArray(r) ? r : (r as { data: Item[] }).data ?? []))
      .catch((e) => setError(String(e)));
  };

  const loadStorerooms = () => {
    // API route is /storerooms (not /inventory/storerooms)
    api<Array<{ id: string; name: string; code: string }>>('/storerooms')
      .then(setStorerooms)
      .catch(() => {});
  };

  useEffect(() => { loadItems(); loadStorerooms(); }, [search]);

  const doTransaction = async () => {
    if (!showTx || !txForm.storeroomId) { setError('Select a storeroom'); return; }
    setTxBusy(true); setError('');
    try {
      const endpoints: Record<string, string> = {
        ISSUE: '/inventory/issue', RETURN: '/inventory/return',
        RECEIPT: '/inventory/receipt', ADJUSTMENT: '/inventory/adjustment',
      };
      await api(endpoints[txForm.txType]!, {
        method: 'POST',
        body: JSON.stringify({ itemId: showTx.id, storeroomId: txForm.storeroomId, qty: txForm.qty, notes: txForm.notes }),
      });
      setSuccess(`${txForm.txType} recorded for ${showTx.itemNum}`);
      setShowTx(null);
      setTxForm({ storeroomId: '', qty: '1', txType: 'ISSUE', notes: '' });
    } catch (e) { setError(String(e)); }
    finally { setTxBusy(false); }
  };

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.itemNum || !newItem.description) { setError('Item # and description are required'); return; }
    setNewBusy(true); setError('');
    try {
      await api('/items', { method: 'POST', body: JSON.stringify({ ...newItem, unitCost: newItem.unitCost || undefined }) });
      setSuccess(`Item ${newItem.itemNum} created`);
      setShowNew(false);
      setNewItem({ itemNum: '', description: '', itemType: 'STOCKED', unit: 'EA', unitCost: '' });
      loadItems();
    } catch (e) { setError(String(e)); }
    finally { setNewBusy(false); }
  };

  return (
    <IdentityPageLayout title="Item Master" subtitle="Storeroom items, parts and consumables">
      {error && <MessageBanner type="error" text={error} />}
      {success && <MessageBanner type="success" text={success} />}

      <div className="admin-section">
        <div className="flex gap-3 mb-4 items-end flex-wrap">
          <label className="block flex-1 min-w-48">
            <span className="form-label">Search</span>
            <input className="form-input" placeholder="Item #, description…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <Link to="/inventory/storerooms" className="btn-link text-sm self-end pb-2">Storerooms →</Link>
          <Link to="/inventory/transactions" className="btn-link text-sm self-end pb-2">Transactions →</Link>
          <button type="button" className="btn-primary !w-auto px-4"
            onClick={() => setShowNew(true)}>+ New item</button>
        </div>

        {/* New item form */}
        {showNew && (
          <form onSubmit={createItem} className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 grid grid-cols-2 gap-3">
            <FormField label="Item #" htmlFor="iNum">
              <input id="iNum" className="form-input" required value={newItem.itemNum}
                onChange={(e) => setNewItem((f) => ({ ...f, itemNum: e.target.value }))} />
            </FormField>
            <FormField label="Description" htmlFor="iDesc">
              <input id="iDesc" className="form-input" required value={newItem.description}
                onChange={(e) => setNewItem((f) => ({ ...f, description: e.target.value }))} />
            </FormField>
            <FormField label="Type" htmlFor="iType">
              <select id="iType" className="form-input" value={newItem.itemType}
                onChange={(e) => setNewItem((f) => ({ ...f, itemType: e.target.value }))}>
                {['STOCKED','NON_STOCKED','SPECIAL_ORDER'].map((t) => <option key={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Unit of measure" htmlFor="iUnit">
              <input id="iUnit" className="form-input w-24" value={newItem.unit}
                onChange={(e) => setNewItem((f) => ({ ...f, unit: e.target.value }))} />
            </FormField>
            <FormField label="Unit cost" htmlFor="iCost">
              <input id="iCost" type="number" step="0.01" className="form-input w-32" value={newItem.unitCost}
                onChange={(e) => setNewItem((f) => ({ ...f, unitCost: e.target.value }))} />
            </FormField>
            <div className="col-span-2 flex gap-2">
              <button type="submit" className="btn-primary !w-auto px-4" disabled={newBusy}>
                {newBusy ? 'Saving…' : 'Save item'}
              </button>
              <button type="button" className="btn-secondary !w-auto px-4" onClick={() => setShowNew(false)}>Cancel</button>
            </div>
          </form>
        )}

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
              <tr><td colSpan={6} className="py-8 text-center text-slate-400">No items found.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2 pr-4 font-mono text-xs text-blue-600">{item.itemNum}</td>
                <td className="py-2 pr-4">{item.description}</td>
                <td className="py-2 pr-4 text-slate-500">{item.itemType}</td>
                <td className="py-2 pr-4 text-slate-500">{item.unit}</td>
                <td className="py-2 pr-4 text-slate-500">
                  {item.unitCost ? `$${parseFloat(item.unitCost).toFixed(2)}` : '—'}
                </td>
                <td className="py-2">
                  <button type="button" className="btn-link text-xs"
                    onClick={() => setShowTx(item)}>Transaction</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transaction modal */}
      {showTx && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="font-semibold text-lg mb-4">Record transaction — {showTx.itemNum}</h2>
            <div className="space-y-3">
              <FormField label="Transaction type" htmlFor="txType">
                <select id="txType" className="form-input" value={txForm.txType}
                  onChange={(e) => setTxForm((f) => ({ ...f, txType: e.target.value }))}>
                  {['ISSUE','RETURN','RECEIPT','ADJUSTMENT'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Storeroom" htmlFor="txStore">
                <select id="txStore" className="form-input" value={txForm.storeroomId}
                  onChange={(e) => setTxForm((f) => ({ ...f, storeroomId: e.target.value }))}>
                  <option value="">Select storeroom…</option>
                  {storerooms.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
              </FormField>
              <FormField label="Quantity" htmlFor="txQty">
                <input id="txQty" type="number" step="0.01" className="form-input w-32"
                  value={txForm.qty} onChange={(e) => setTxForm((f) => ({ ...f, qty: e.target.value }))} />
              </FormField>
              <FormField label="Notes" htmlFor="txNotes">
                <input id="txNotes" className="form-input" value={txForm.notes}
                  onChange={(e) => setTxForm((f) => ({ ...f, notes: e.target.value }))} />
              </FormField>
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" className="btn-primary !w-auto px-4" disabled={txBusy} onClick={doTransaction}>
                {txBusy ? 'Saving…' : 'Confirm'}
              </button>
              <button type="button" className="btn-secondary !w-auto px-4"
                onClick={() => setShowTx(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </IdentityPageLayout>
  );
}

