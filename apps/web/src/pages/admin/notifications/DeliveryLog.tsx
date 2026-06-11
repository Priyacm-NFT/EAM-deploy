import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface DeliveryRecord {
  id: string;
  triggerId: string | null;
  recipientEmail: string | null;
  recipientUserId: string | null;
  channel: string;
  status: string;
  error: string | null;
  bounceType: string | null;
  bounceCode: string | null;
  bounceMessage: string | null;
  entityId: string | null;
  sentAt: string;
}

const STATUS_STYLE: Record<string, string> = {
  QUEUED:        'bg-yellow-100 text-yellow-800',
  DELIVERED:     'bg-green-100 text-green-800',
  DIGEST_QUEUED: 'bg-blue-100 text-blue-800',
  FAILED:        'bg-red-100 text-red-800',
  BOUNCED:       'bg-orange-100 text-orange-800',
};

export function DeliveryLogPage() {
  const [logs, setLogs] = useState<DeliveryRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  function load() {
    api<DeliveryRecord[]>('/admin/notifications/delivery-log')
      .then(setLogs)
      .catch(() => setLogs([]));
  }

  useEffect(() => { load(); }, []);

  const filtered = logs.filter((l) => {
    const matchStatus  = !statusFilter  || l.status.toUpperCase()  === statusFilter.toUpperCase();
    const matchChannel = !channelFilter || l.channel.toUpperCase() === channelFilter.toUpperCase();
    const matchSearch  = !search
      || (l.recipientEmail ?? '').toLowerCase().includes(search.toLowerCase())
      || l.channel.toLowerCase().includes(search.toLowerCase())
      || l.status.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchChannel && matchSearch;
  });

  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Stats from actual data
  const stats = {
    total:     logs.length,
    delivered: logs.filter((l) => l.status === 'DELIVERED').length,
    failed:    logs.filter((l) => l.status === 'FAILED').length,
    bounced:   logs.filter((l) => l.status === 'BOUNCED').length,
    queued:    logs.filter((l) => l.status === 'QUEUED' || l.status === 'DIGEST_QUEUED').length,
  };

  async function resend(id: string) {
    setMsg(''); setError('');
    try {
      await api(`/admin/notifications/delivery-log/${id}/resend`, { method: 'POST' });
      setMsg('Resend queued.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resend failed');
    }
  }

  function exportCsv() {
    const rows = [['ID', 'Trigger', 'Recipient', 'Channel', 'Status', 'Sent at', 'Error']];
    filtered.forEach((l) => rows.push([
      l.id, l.triggerId ?? '', l.recipientEmail ?? '',
      l.channel, l.status, l.sentAt, l.error ?? '',
    ]));
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'delivery-log.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <IdentityPageLayout
      title="Notification delivery log"
      subtitle="Full audit of every notification sent — filter, search, and export for compliance"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg   && <MessageBanner type="success" text={msg} />}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Total',     value: stats.total,     color: 'text-slate-700 bg-white border-slate-200' },
          { label: 'Delivered', value: stats.delivered, color: 'text-green-700 bg-green-50 border-green-200' },
          { label: 'Queued',    value: stats.queued,    color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
          { label: 'Failed',    value: stats.failed,    color: 'text-red-700 bg-red-50 border-red-200' },
          { label: 'Bounced',   value: stats.bounced,   color: 'text-orange-700 bg-orange-50 border-orange-200' },
        ].map((s) => (
          <div key={s.label} className={`content-card border ${s.color} text-center`}>
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs font-medium mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="admin-section">
        <div className="flex justify-between items-center mb-3">
          <h2 className="admin-section-title !border-0 !pb-0 !mb-0">
            Records ({filtered.length})
          </h2>
          <div className="flex gap-2">
            <button type="button" className="btn-outline text-xs" onClick={load}>Refresh</button>
            <button type="button" className="btn-primary !w-auto px-3 text-xs" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-3">
          <input type="search" placeholder="Search email, channel…" className="form-input flex-1 min-w-[180px]"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
          <select className="form-select w-40" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
            <option value="">All statuses</option>
            <option value="DELIVERED">Delivered</option>
            <option value="QUEUED">Queued</option>
            <option value="DIGEST_QUEUED">Digest queued</option>
            <option value="FAILED">Failed</option>
            <option value="BOUNCED">Bounced</option>
          </select>
          <select className="form-select w-36" value={channelFilter} onChange={(e) => { setChannelFilter(e.target.value); setPage(0); }}>
            <option value="">All channels</option>
            <option value="EMAIL">Email</option>
            <option value="IN_APP">In-app</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Sent at</th>
                <th>Error</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 && (
                <tr><td colSpan={6} className="text-center text-slate-400 py-10">
                  {logs.length === 0 ? 'No delivery records yet. Create a trigger and send a notification.' : 'No records match your filters.'}
                </td></tr>
              )}
              {paginated.map((log) => (
                <tr key={log.id}>
                  <td>
                    <p className="text-sm font-mono">{log.recipientEmail ?? '—'}</p>
                    {log.recipientUserId && <p className="text-xs text-slate-400">{log.recipientUserId.slice(0, 8)}…</p>}
                  </td>
                  <td>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${log.channel === 'EMAIL' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                      {log.channel === 'EMAIL' ? '✉ Email' : '🔔 In-app'}
                    </span>
                  </td>
                  <td>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[log.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="text-xs text-slate-500">
                    {new Date(log.sentAt).toLocaleString()}
                  </td>
                  <td className="text-xs text-red-600 max-w-[200px] truncate" title={log.error ?? ''}>
                    {log.error ?? log.bounceMessage ?? '—'}
                  </td>
                  <td>
                    {log.status === 'FAILED' && (
                      <button type="button" className="btn-link text-xs" onClick={() => resend(log.id)}>
                        Resend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-3 justify-end text-sm mt-3">
            <button type="button" className="btn-outline py-1 px-3 text-xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
            <span className="text-slate-600">Page {page + 1} of {totalPages}</span>
            <button type="button" className="btn-outline py-1 px-3 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</button>
          </div>
        )}
      </div>
    </IdentityPageLayout>
  );
}


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
