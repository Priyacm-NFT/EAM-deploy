import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../../components/identity/IdentityLayout.js';

interface BounceEntry {
  id: string;
  email: string;
  bounceType: 'hard' | 'soft';
  bounceCode: string | null;
  bounceMessage: string | null;
  suppressUntil: string | null;
  createdAt: string;
}

export function BounceListPage() {
  const [entries, setEntries] = useState<BounceEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function syncBounces() {
    setSyncing(true);
    try {
      const r = await api<{ synced: number }>('/admin/notifications/bounce-list/sync', { method: 'POST' });
      setMsg(`Synced ${r.synced} bounce record(s) from delivery log.`);
      load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Sync failed'); }
    finally { setSyncing(false); }
  }

  
  function load() {
    api<BounceEntry[]>('/admin/notifications/bounce-list').then(setEntries).catch(() => setEntries([]));
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string, email: string) {
    if (!window.confirm(`Remove ${email} from bounce list? Future emails will be delivered to this address.`)) return;
    await api(`/admin/notifications/bounce-list/${id}`, { method: 'DELETE' });
    setMsg(`${email} removed from bounce list.`);
    load();
  }

  const filtered = filter
    ? entries.filter((e) => e.email.toLowerCase().includes(filter.toLowerCase()))
    : entries;

  const hard = entries.filter((e) => e.bounceType === 'hard').length;
  const soft = entries.filter((e) => e.bounceType === 'soft').length;
  const active = entries.filter((e) => !e.suppressUntil || new Date(e.suppressUntil) > new Date()).length;

  return (
    <IdentityPageLayout
      title="Email Bounce List"
      subtitle="Emails that have hard or soft bounced — suppressed from future delivery to protect sender reputation"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Hard bounces', value: hard, color: 'text-red-700 bg-red-50 border-red-200' },
          { label: 'Soft bounces', value: soft, color: 'text-amber-700 bg-amber-50 border-amber-200' },
          { label: 'Currently suppressed', value: active, color: 'text-slate-700 bg-slate-50 border-slate-200' },
        ].map((s) => (
          <div key={s.label} className={`admin-section border ${s.color} text-center !py-4`}>
            <p className="text-3xl font-bold">{s.value}</p>
            <p className="text-sm font-medium mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Webhook info */}
      <div className="admin-section">
        <h2 className="admin-section-title">Bounce webhook endpoint</h2>
        <p className="text-sm text-slate-600 mb-3">
          Configure your SMTP relay (Mailgun, SendGrid, Postmark, AWS SES) to send bounce notifications to:
        </p>
        <code className="block bg-slate-100 border border-slate-200 rounded-lg px-4 py-3 text-sm font-mono text-slate-700">
          POST {window.location.origin}/webhooks/email/bounce
        </code>
        <p className="text-xs text-slate-400 mt-2">
          Optionally set header <code>X-Bounce-Secret: your-secret</code> and the env var <code>BOUNCE_WEBHOOK_SECRET</code> to verify requests.
        </p>
      </div>

      {/* Bounce list */}
      <div className="admin-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="admin-section-title !border-0 !pb-0 !mb-0">Suppressed addresses ({filtered.length})</h2>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={syncBounces}
              disabled={syncing}
              style={{ background: '#fff7ed', color: '#ea580c', border: '1.5px solid #fed7aa', borderRadius: '8px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }}>
              {syncing ? '⏳ Syncing…' : '↻ Sync from delivery log'}
            </button>
            <input type="search" className="form-input w-64 text-sm" placeholder="Filter by email…"
              value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-slate-400 text-sm">No bounces recorded yet.</p>
            <p className="text-slate-400 text-xs mt-1">Bounce data appears here when your SMTP relay sends bounce webhooks.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Type</th>
                  <th>Code</th>
                  <th>Reason</th>
                  <th>Suppress until</th>
                  <th>Recorded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const expired = e.suppressUntil && new Date(e.suppressUntil) < new Date();
                  return (
                    <tr key={e.id} className={expired ? 'opacity-50' : ''}>
                      <td className="font-mono text-sm">{e.email}</td>
                      <td>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${e.bounceType === 'hard' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {e.bounceType}
                        </span>
                      </td>
                      <td className="text-xs font-mono text-slate-500">{e.bounceCode ?? '—'}</td>
                      <td className="text-xs text-slate-500 max-w-[200px] truncate" title={e.bounceMessage ?? ''}>
                        {e.bounceMessage ?? '—'}
                      </td>
                      <td className="text-xs text-slate-500">
                        {e.suppressUntil
                          ? expired ? <span className="text-green-600">Expired</span> : new Date(e.suppressUntil).toLocaleDateString()
                          : <span className="text-red-600 font-medium">Permanent</span>}
                      </td>
                      <td className="text-xs text-slate-500">{new Date(e.createdAt).toLocaleString()}</td>
                      <td>
                        <button type="button" className="btn-link text-xs text-orange-600 hover:text-orange-700"
                          onClick={() => remove(e.id, e.email)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </IdentityPageLayout>
  );
}
