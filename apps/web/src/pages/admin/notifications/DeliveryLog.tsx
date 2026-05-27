import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface DeliveryRecord {
  id: string;
  triggerId: string;
  triggerEventType: string;
  templateName: string | null;
  recipientEmail: string;
  recipientName: string | null;
  sentAt: string | null;
  status: 'delivered' | 'failed' | 'bounced' | 'pending';
  errorMessage: string | null;
  retryCount: number;
  channel: 'email' | 'in_app';
  entityType: string | null;
  entityId: string | null;
}

interface DeliveryStats {
  totalSent: number;
  delivered: number;
  failed: number;
  bounced: number;
  pending: number;
}

const STATUS_STYLE: Record<string, string> = {
  delivered: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  bounced: 'bg-orange-100 text-orange-800',
  pending: 'bg-yellow-100 text-yellow-800',
};

export function DeliveryLogPage() {
  const [logs, setLogs] = useState<DeliveryRecord[]>([]);
  const [stats, setStats] = useState<DeliveryStats | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  function load() {
    api<DeliveryRecord[]>('/admin/notifications/delivery-log').then(setLogs).catch(() => setLogs([]));
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (logs.length > 0) {
      setStats({
        totalSent: logs.length,
        delivered: logs.filter((l) => l.status === 'delivered').length,
        failed: logs.filter((l) => l.status === 'failed').length,
        bounced: logs.filter((l) => l.status === 'bounced').length,
        pending: logs.filter((l) => l.status === 'pending').length,
      });
    }
  }, [logs]);

  const filtered = logs.filter((l) => {
    const matchStatus = !statusFilter || l.status === statusFilter;
    const matchChannel = !channelFilter || l.channel === channelFilter;
    const matchSearch = !search || l.recipientEmail.toLowerCase().includes(search.toLowerCase()) || l.triggerEventType.toLowerCase().includes(search.toLowerCase()) || (l.templateName ?? '').toLowerCase().includes(search.toLowerCase());
    const matchFrom = !dateFrom || new Date(l.sentAt ?? '') >= new Date(dateFrom);
    const matchTo = !dateTo || new Date(l.sentAt ?? '') <= new Date(dateTo + 'T23:59:59');
    return matchStatus && matchChannel && matchSearch && matchFrom && matchTo;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  async function retry(log: DeliveryRecord) {
    setRetrying(log.id);
    setMsg('');
    setError('');
    try {
      await api(`/admin/notifications/delivery-log/${log.id}/retry`, { method: 'POST' });
      setMsg(`Retrying delivery to ${log.recipientEmail}.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Retry failed');
    } finally {
      setRetrying(null);
    }
  }

  async function exportCsv() {
    const rows = [['ID', 'Event', 'Template', 'Recipient', 'Channel', 'Status', 'Sent at', 'Retries', 'Error']];
    filtered.forEach((l) => rows.push([l.id, l.triggerEventType, l.templateName ?? '', l.recipientEmail, l.channel, l.status, l.sentAt ?? '', String(l.retryCount), l.errorMessage ?? '']));
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'notification-delivery-log.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <IdentityPageLayout
      title="Notification delivery log"
      subtitle="Full audit of every notification sent — retry failures and export the log for compliance reporting"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: stats.totalSent, color: 'text-slate-700 bg-white border-slate-200' },
            { label: 'Delivered', value: stats.delivered, color: 'text-green-700 bg-green-50 border-green-200' },
            { label: 'Failed', value: stats.failed, color: 'text-red-700 bg-red-50 border-red-200' },
            { label: 'Bounced', value: stats.bounced, color: 'text-orange-700 bg-orange-50 border-orange-200' },
            { label: 'Pending', value: stats.pending, color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
          ].map((s) => (
            <div key={s.label} className={`content-card border ${s.color} text-center`}>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs font-medium mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="admin-section">
        <div className="flex justify-between items-center">
          <h2 className="admin-section-title mb-0">Delivery records</h2>
          <div className="flex gap-2">
            <button type="button" className="btn-outline text-xs" onClick={load}>Refresh</button>
            <button type="button" className="btn-outline text-xs" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <input type="search" placeholder="Search recipient, event, template…" className="form-input flex-1 min-w-[180px]" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <select className="form-select w-40" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <option value="">All statuses</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="bounced">Bounced</option>
            <option value="pending">Pending</option>
          </select>
          <select className="form-select w-36" value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value); setPage(0); }}>
            <option value="">All channels</option>
            <option value="email">Email</option>
            <option value="in_app">In-app</option>
          </select>
          <input type="date" className="form-input w-40" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} title="From date" />
          <input type="date" className="form-input w-40" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} title="To date" />
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Template</th>
                <th>Recipient</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Retries</th>
                <th>Sent at</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr><td colSpan={8} className="text-center text-slate-400 py-10">No delivery records match your filters.</td></tr>
              )}
              {paginated.map((log) => (
                <>
                  <tr key={log.id}>
                    <td>
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{log.triggerEventType}</code>
                      {log.entityType && <span className="block text-xs text-slate-400 mt-0.5">{log.entityType}</span>}
                    </td>
                    <td className="text-sm">{log.templateName ?? <span className="text-slate-400">—</span>}</td>
                    <td>
                      <p className="text-sm font-medium">{log.recipientName ?? log.recipientEmail}</p>
                      {log.recipientName && <p className="text-xs text-slate-400">{log.recipientEmail}</p>}
                    </td>
                    <td>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${log.channel === 'email' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {log.channel === 'email' ? '✉ Email' : '🔔 In-app'}
                      </span>
                    </td>
                    <td>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[log.status]}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="text-sm text-center">{log.retryCount}</td>
                    <td className="text-xs text-slate-500">
                      {log.sentAt ? new Date(log.sentAt).toLocaleString() : '—'}
                    </td>
                    <td>
                      <div className="flex gap-2 items-center">
                        {log.errorMessage && (
                          <button type="button" className="btn-link text-xs text-red-600" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                            {expanded === log.id ? 'Hide' : 'Error'}
                          </button>
                        )}
                        {(log.status === 'failed' || log.status === 'bounced') && (
                          <button type="button" className="btn-link text-xs" disabled={retrying === log.id} onClick={() => retry(log)}>
                            {retrying === log.id ? '…' : 'Retry'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === log.id && log.errorMessage && (
                    <tr key={`${log.id}-err`}>
                      <td colSpan={8} className="bg-red-50 px-4 py-2">
                        <pre className="text-xs text-red-700 whitespace-pre-wrap font-mono">{log.errorMessage}</pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-3 justify-end text-sm">
            <button type="button" className="btn-outline py-1 px-3 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <span className="text-slate-600">Page {page + 1} of {totalPages} ({filtered.length} records)</span>
            <button type="button" className="btn-outline py-1 px-3 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </IdentityPageLayout>
  );
}
