import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';

interface Item { id: string; itemNum: string; description: string; itemType: string; unit: string; unitCost: string | null; isActive?: boolean; }
interface WO { id: string; woNum: string; description: string; }
interface Storeroom { id: string; name: string; code: string; }

export function ItemMasterListPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [showTx, setShowTx] = useState<Item | null>(null);
  const [storerooms, setStorerooms] = useState<Storeroom[]>([]);
  const [workOrders, setWorkOrders] = useState<WO[]>([]);
  const [txForm, setTxForm] = useState({ storeroomId: '', toStoreroomId: '', qty: '1', txType: 'ISSUE', notes: '', woId: '' });
  const [txBusy, setTxBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newItem, setNewItem] = useState({ itemNum: '', description: '', itemType: 'STOCKED', unit: 'EA', unitCost: '' });
  const [newBusy, setNewBusy] = useState(false);
  const [showCycleCount, setShowCycleCount] = useState(false);
  const [ccStoreroomId, setCcStoreroomId] = useState('');
  const [ccItems, setCcItems] = useState<Array<{ itemId: string; itemNum: string; description: string; qtyOnHand: string; countedQty: string }>>([]);
  const [ccBusy, setCcBusy] = useState(false);
  // FIX: surfaces deactivated Items — the "Deactivate" action added to
  // ItemDetailPage would otherwise be a one-way door out of this list
  // with no way back to find and reactivate a given Item again.
  const [showInactive, setShowInactive] = useState(false);

  const loadItems = () => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (showInactive) params.set('includeInactive', 'true');
    api<{ data: Item[] } | Item[]>(`/items?${params}`)
      .then((r) => setItems(Array.isArray(r) ? r : (r as { data: Item[] }).data ?? []))
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    loadItems();
    api<Storeroom[]>('/storerooms').then(setStorerooms).catch(() => {});
    api<{ data: WO[] } | WO[]>('/work-orders?pageSize=100')
      .then((r) => setWorkOrders(Array.isArray(r) ? r : (r as { data: WO[] }).data ?? []))
      .catch(() => {});
  }, [search, showInactive]);

  const doTransaction = async () => {
    if (!showTx || !txForm.storeroomId) { setError('Select a storeroom'); return; }
    if (txForm.txType === 'TRANSFER' && !txForm.toStoreroomId) { setError('Select destination storeroom'); return; }
    setTxBusy(true); setError('');
    try {
      if (txForm.txType === 'TRANSFER') {
        await api('/inventory/transfer', { method: 'POST', body: JSON.stringify({ itemId: showTx.id, fromStoreroomId: txForm.storeroomId, toStoreroomId: txForm.toStoreroomId, qty: txForm.qty, notes: txForm.notes || undefined }) });
      } else {
        const endpoints: Record<string, string> = { ISSUE: '/inventory/issue', RETURN: '/inventory/return', RECEIPT: '/inventory/receipt', ADJUSTMENT: '/inventory/adjustment' };
        const body: Record<string, unknown> = { itemId: showTx.id, storeroomId: txForm.storeroomId, qty: txForm.qty, notes: txForm.notes || undefined };
        if (txForm.txType === 'ISSUE' && txForm.woId) body.woId = txForm.woId;
        await api(endpoints[txForm.txType]!, { method: 'POST', body: JSON.stringify(body) });
      }
      setSuccess(`${txForm.txType} recorded for ${showTx.itemNum}`);
      setShowTx(null);
      setTxForm({ storeroomId: '', toStoreroomId: '', qty: '1', txType: 'ISSUE', notes: '', woId: '' });
      loadItems();
    } catch (e) { setError(String(e)); }
    finally { setTxBusy(false); }
  };

  const startCycleCount = async () => {
    if (!ccStoreroomId) { setError('Select a storeroom'); return; }
    setCcBusy(true); setError('');
    try {
      const result = await api<{ items: Array<{ itemId: string; itemNum: string; description: string; qtyOnHand: string }> }>(
        '/inventory/cycle-count/start', { method: 'POST', body: JSON.stringify({ storeroomId: ccStoreroomId }) }
      );
      setCcItems((result.items ?? []).map((i) => ({ ...i, countedQty: String(i.qtyOnHand) })));
    } catch (e) { setError(String(e)); }
    finally { setCcBusy(false); }
  };

  const commitCycleCount = async () => {
    setCcBusy(true); setError('');
    try {
      const result = await api<{ committed: number }>('/inventory/cycle-count/commit', {
        method: 'POST',
        body: JSON.stringify({ storeroomId: ccStoreroomId, counts: ccItems.map((i) => ({ itemId: i.itemId, countedQty: i.countedQty })) }),
      });
      setSuccess(`Cycle count committed — ${result.committed} variance(s) recorded`);
      setShowCycleCount(false); setCcItems([]); setCcStoreroomId('');
    } catch (e) { setError(String(e)); }
    finally { setCcBusy(false); }
  };

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    // FIX: itemNum used to be required here too, matching the input's
    // `required` attribute below — but the backend now auto-generates a
    // sequential ITM-00001 style number when it's left blank, same
    // convention as AST-00001 for assets and LOC-00001 for locations.
    // Only Description is still actually required.
    if (!newItem.description) { setError('Description is required'); return; }
    setNewBusy(true); setError('');
    try {
      const created = await api<{ itemNum: string }>('/items', {
        method: 'POST',
        body: JSON.stringify({ ...newItem, itemNum: newItem.itemNum || undefined, unitCost: newItem.unitCost || undefined }),
      });
      setSuccess(`Item ${created.itemNum} created`);
      setShowNew(false);
      setNewItem({ itemNum: '', description: '', itemType: 'STOCKED', unit: 'EA', unitCost: '' });
      loadItems();
    } catch (e) { setError(String(e)); }
    finally { setNewBusy(false); }
  };

  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Item Master</h1>

      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>{error}</div>}
      {success && <div style={{ background: '#dcfce7', color: '#16a34a', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>{success}</div>}

      {/* Top bar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="form-input" style={{ flex: 1, minWidth: '200px' }} placeholder="Item #, description…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
        <Link to="/inventory/storerooms" className="btn-link" style={{ fontSize: '14px' }}>Storerooms →</Link>
        <Link to="/inventory/transactions" className="btn-link" style={{ fontSize: '14px' }}>Transactions →</Link>
        <button type="button" className="btn-outline-light !w-auto px-4 text-sm" onClick={() => setShowCycleCount(true)}>
          🔄 Cycle Count
        </button>
        <button type="button" className="btn-primary !w-auto px-4" onClick={() => setShowNew(true)}>+ New item</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#64748b' }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive items
        </label>
      </div>

      {/* New item form */}
      {showNew && (
        <form onSubmit={createItem} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label className="form-label">Item # <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>(optional — auto-generated if left blank)</span></label>
            {/* FIX: same as Location Code — manual entry stays allowed,
                but is forced to uppercase as typed so "cap-45uf" and
                "CAP-45UF" can't end up as two different-looking item
                numbers for what's meant to be the same identifier. */}
            <input
              className="form-input" placeholder="e.g. ITM-00001" value={newItem.itemNum}
              onChange={(e) => setNewItem((f) => ({ ...f, itemNum: e.target.value.toUpperCase() }))}
            />
          </div>
          <div><label className="form-label">Description *</label><input className="form-input" required value={newItem.description} onChange={(e) => setNewItem((f) => ({ ...f, description: e.target.value }))} /></div>
          <div><label className="form-label">Type</label>
            <select className="form-input" value={newItem.itemType} onChange={(e) => setNewItem((f) => ({ ...f, itemType: e.target.value }))}>
              {['STOCKED', 'NON_STOCKED', 'SPECIAL_ORDER'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div><label className="form-label">Unit</label><input className="form-input" value={newItem.unit} onChange={(e) => setNewItem((f) => ({ ...f, unit: e.target.value }))} /></div>
          <div><label className="form-label">Unit cost</label><input type="number" step="0.01" className="form-input" value={newItem.unitCost} onChange={(e) => setNewItem((f) => ({ ...f, unitCost: e.target.value }))} /></div>
          <div style={{ gridColumn: 'span 2', display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn-primary !w-auto px-4" disabled={newBusy}>{newBusy ? 'Saving…' : 'Save item'}</button>
            <button type="button" className="btn-outline-light !w-auto px-4" onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Items table */}
      <div className="admin-section">
        <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', fontSize: '12px', color: '#64748b', textTransform: 'uppercase' }}>
              <th style={{ padding: '8px 12px' }}>Item #</th>
              <th style={{ padding: '8px 12px' }}>Description</th>
              <th style={{ padding: '8px 12px' }}>Type</th>
              <th style={{ padding: '8px 12px' }}>UOM</th>
              <th style={{ padding: '8px 12px' }}>Unit cost</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No items found.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 12px' }}>
                  <Link to={`/inventory/${item.id}`} style={{ color: '#e8650a', fontFamily: 'monospace', fontSize: '13px', textDecoration: 'none' }}>
                    {item.itemNum}
                  </Link>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {item.description}
                  {item.isActive === false && (
                    <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 600, padding: '1px 8px', borderRadius: '999px', background: '#f1f5f9', color: '#64748b' }}>
                      Inactive
                    </span>
                  )}
                </td>
                <td style={{ padding: '10px 12px', color: '#64748b' }}>{item.itemType}</td>
                <td style={{ padding: '10px 12px', color: '#64748b' }}>{item.unit}</td>
                <td style={{ padding: '10px 12px', color: '#64748b' }}>{item.unitCost ? `$${parseFloat(item.unitCost).toFixed(2)}` : '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  <button type="button" className="btn-link" style={{ fontSize: '13px' }} onClick={() => setShowTx(item)}>Transaction</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transaction modal */}
      {showTx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <h2 style={{ fontWeight: 600, fontSize: '18px', marginBottom: '16px', color: '#f1f5f9' }}>Record transaction — {showTx.itemNum}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div><label className="form-label">Transaction type</label>
                <select className="form-input" value={txForm.txType} onChange={(e) => setTxForm((f) => ({ ...f, txType: e.target.value, woId: '', toStoreroomId: '' }))}>
                  {['ISSUE', 'RETURN', 'RECEIPT', 'TRANSFER', 'ADJUSTMENT'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="form-label">{txForm.txType === 'TRANSFER' ? 'From storeroom' : 'Storeroom'}</label>
                <select className="form-input" value={txForm.storeroomId} onChange={(e) => setTxForm((f) => ({ ...f, storeroomId: e.target.value }))}>
                  <option value="">Select storeroom…</option>
                  {storerooms.map((s) => <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''}</option>)}
                </select>
              </div>
              {txForm.txType === 'TRANSFER' && (
                <div><label className="form-label">To storeroom</label>
                  <select className="form-input" value={txForm.toStoreroomId} onChange={(e) => setTxForm((f) => ({ ...f, toStoreroomId: e.target.value }))}>
                    <option value="">Select destination…</option>
                    {storerooms.filter((s) => s.id !== txForm.storeroomId).map((s) => <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''}</option>)}
                  </select>
                </div>
              )}
              {txForm.txType === 'ISSUE' && (
                <div><label className="form-label">Work Order (optional)</label>
                  <select className="form-input" value={txForm.woId} onChange={(e) => setTxForm((f) => ({ ...f, woId: e.target.value }))}>
                    <option value="">— None —</option>
                    {workOrders.map((w) => <option key={w.id} value={w.id}>{w.woNum} — {w.description}</option>)}
                  </select>
                </div>
              )}
              <div><label className="form-label">Quantity</label>
                <input type="number" step="0.01" className="form-input" style={{ width: '120px' }} value={txForm.qty} onChange={(e) => setTxForm((f) => ({ ...f, qty: e.target.value }))} />
              </div>
              <div><label className="form-label">Notes</label>
                <input className="form-input" value={txForm.notes} onChange={(e) => setTxForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
              <button type="button" className="btn-primary !w-auto px-4" disabled={txBusy} onClick={doTransaction}>{txBusy ? 'Saving…' : 'Confirm'}</button>
              <button type="button" className="btn-outline-light !w-auto px-4" onClick={() => setShowTx(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Cycle Count modal */}
      {showCycleCount && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: '#1e293b', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <h2 style={{ fontWeight: 600, fontSize: '18px', marginBottom: '16px', color: '#f1f5f9' }}>🔄 Cycle Count</h2>
            {ccItems.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div><label className="form-label">Select Storeroom</label>
                  <select className="form-input" value={ccStoreroomId} onChange={(e) => setCcStoreroomId(e.target.value)}>
                    <option value="">Select storeroom…</option>
                    {storerooms.map((s) => <option key={s.id} value={s.id}>{s.name} {s.code ? `(${s.code})` : ''}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                  <button type="button" className="btn-primary !w-auto px-4" disabled={ccBusy} onClick={startCycleCount}>{ccBusy ? 'Loading…' : 'Start Count'}</button>
                  <button type="button" className="btn-outline-light !w-auto px-4" onClick={() => setShowCycleCount(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>Enter physical count for each item. Variances will be recorded as adjustments.</p>
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: '12px' }}>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>System Qty</th>
                      <th style={{ padding: '8px', textAlign: 'left' }}>Counted Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ccItems.map((item, i) => (
                      <tr key={item.itemId} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '8px' }}>
                          <div style={{ fontFamily: 'monospace', color: '#e8650a' }}>{item.itemNum}</div>
                          <div style={{ color: '#94a3b8', fontSize: '12px' }}>{item.description}</div>
                        </td>
                        <td style={{ padding: '8px', color: '#94a3b8' }}>{item.qtyOnHand}</td>
                        <td style={{ padding: '8px' }}>
                          <input type="number" step="0.01" className="form-input" style={{ width: '100px' }}
                            value={item.countedQty}
                            onChange={(e) => setCcItems((prev) => prev.map((it, idx) => idx === i ? { ...it, countedQty: e.target.value } : it))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <button type="button" className="btn-primary !w-auto px-4" disabled={ccBusy} onClick={commitCycleCount}>{ccBusy ? 'Committing…' : 'Commit Count'}</button>
                  <button type="button" className="btn-outline-light !w-auto px-4" onClick={() => { setShowCycleCount(false); setCcItems([]); setCcStoreroomId(''); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
