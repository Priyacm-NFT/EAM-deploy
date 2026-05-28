import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface Tx {
  id: string; txType: string; qty: string; totalCost: string | null;
  txDate: string; referenceNum: string | null; notes: string | null;
  itemNum: string | null; itemDescription: string | null;
  storeroomName: string | null; woNum: string | null;
}

export function TransactionLogPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [error, setError] = useState('');
  const [txType, setTxType] = useState('');
  const [page] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (txType) params.set('txType', txType);
    api<{ data: Tx[] }>(`/inventory/transactions?${params}`).then((r) => setTxs(r.data)).catch((e) => setError(String(e)));
  }, [txType, page]);

  const TX_COLORS: Record<string, string> = {
    ISSUE: 'bg-red-50 text-red-700', RETURN: 'bg-green-50 text-green-700',
    RECEIPT: 'bg-blue-50 text-blue-700', TRANSFER: 'bg-purple-50 text-purple-700',
    ADJUSTMENT: 'bg-orange-50 text-orange-700', CYCLE_COUNT: 'bg-slate-50 text-slate-600',
  };

  return (
    <IdentityPageLayout title="Transaction Log" backTo="/inventory" backLabel="Back to inventory">
      {error && <MessageBanner type="error" text={error} />}
      <div className="admin-section">
        <div className="flex gap-3 mb-4 items-end">
          <label className="block w-44">
            <span className="form-label">Type</span>
            <select className="form-input" value={txType} onChange={(e) => setTxType(e.target.value)}>
              <option value="">All</option>
              {['ISSUE', 'RETURN', 'RECEIPT', 'TRANSFER', 'ADJUSTMENT', 'CYCLE_COUNT'].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Item</th>
              <th className="py-2 pr-4">Storeroom</th>
              <th className="py-2 pr-4">Qty</th>
              <th className="py-2 pr-4">Cost</th>
              <th className="py-2">WO #</th>
            </tr>
          </thead>
          <tbody>
            {txs.length === 0 ? (
              <tr><td colSpan={7} className="py-6 text-center text-slate-400">No transactions.</td></tr>
            ) : (
              txs.map((tx) => (
                <tr key={tx.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-slate-500">{new Date(tx.txDate).toLocaleString()}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TX_COLORS[tx.txType] ?? ''}`}>{tx.txType}</span>
                  </td>
                  <td className="py-2 pr-4">{tx.itemNum ? `${tx.itemNum} – ` : ''}{tx.itemDescription}</td>
                  <td className="py-2 pr-4 text-slate-500">{tx.storeroomName ?? '—'}</td>
                  <td className="py-2 pr-4">{tx.qty}</td>
                  <td className="py-2 pr-4 text-slate-500">{tx.totalCost ? `$${parseFloat(tx.totalCost).toFixed(2)}` : '—'}</td>
                  <td className="py-2 text-slate-500">{tx.woNum ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </IdentityPageLayout>
  );
}
