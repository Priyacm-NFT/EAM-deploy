import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface MigrationRow {
  id: string;
  tableName: string;
  columnName: string;
  operation: string;
  status: string;
  executedBy: string | null;
  executedAt: string;
  error: string | null;
  sqlExecuted: string;
}

export function SchemaMigrationLogPage() {
  const [rows, setRows] = useState<MigrationRow[]>([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [rollingBack, setRollingBack] = useState<string | null>(null);

  function load() {
    api<MigrationRow[]>('/admin/config/migrations')
      .then(setRows)
      .catch(() => setRows([]));
  }

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const matchText =
      !filter ||
      r.tableName.toLowerCase().includes(filter.toLowerCase()) ||
      r.columnName.toLowerCase().includes(filter.toLowerCase());
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchText && matchStatus;
  });

  async function rollback(id: string) {
    if (!window.confirm('Roll back this migration? This will undo the DDL change.')) return;
    setRollingBack(id);
    setError(''); setMsg('');
    try {
      await api(`/admin/config/migrations/${id}/rollback`, { method: 'POST' });
      setMsg('Migration rolled back successfully.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rollback failed');
    } finally {
      setRollingBack(null);
    }
  }

  const counts = {
    applied: rows.filter((r) => r.status === 'SUCCESS').length,
    pending: rows.filter((r) => r.status === 'PENDING').length,
    failed: rows.filter((r) => r.status === 'FAILED').length,
  };

  const statusStyle: Record<string, string> = {
    SUCCESS: 'bg-green-100 text-green-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    FAILED: 'bg-red-100 text-red-800',
    ROLLED_BACK: 'bg-slate-100 text-slate-600',
  };

  const opLabel: Record<string, string> = {
    ADD_COLUMN: 'Add column',
    DROP_COLUMN: 'Drop column',
    RENAME_COLUMN: 'Rename column',
    ADD_INDEX: 'Add index',
    DROP_INDEX: 'Drop index',
  };

  return (
    <IdentityPageLayout
      title="Schema migration log"
      subtitle="Every custom field DDL change applied to the database — view history and roll back if needed"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Applied', count: counts.applied, color: 'text-green-700 bg-green-50 border-green-200' },
          { label: 'Pending', count: counts.pending, color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
          { label: 'Failed',  count: counts.failed,  color: 'text-red-700 bg-red-50 border-red-200' },
        ].map((stat) => (
          <div key={stat.label} className={`content-card border ${stat.color} text-center`}>
            <p className="text-3xl font-bold">{stat.count}</p>
            <p className="text-sm font-medium mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="admin-section">
        <h2 className="admin-section-title">Migration history</h2>

        <div className="flex flex-wrap gap-3">
          <input
            type="search"
            placeholder="Search entity, column…"
            className="form-input max-w-xs"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="form-select w-44"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="SUCCESS">Applied</option>
            <option value="PENDING">Pending</option>
            <option value="FAILED">Failed</option>
            <option value="ROLLED_BACK">Rolled back</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 mt-4">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Entity (table)</th>
                <th>Column</th>
                <th>Operation</th>
                <th>Status</th>
                <th>Applied at</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-10">
                    No migrations match your filters. Custom fields added in the Configuration Engine will appear here.
                  </td>
                </tr>
              )}
              {filtered.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono text-xs font-medium text-primary">{m.tableName}</td>
                  <td className="font-mono text-xs">{m.columnName}</td>
                  <td>{opLabel[m.operation] ?? m.operation}</td>
                  <td>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusStyle[m.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="text-slate-500 text-xs">
                    {m.executedAt ? new Date(m.executedAt).toLocaleString() : '—'}
                  </td>
                  <td>
                    {m.status === 'SUCCESS' && (
                      <button
                        type="button"
                        className="btn-danger text-xs"
                        disabled={rollingBack === m.id}
                        onClick={() => rollback(m.id)}
                      >
                        {rollingBack === m.id ? 'Rolling back…' : 'Rollback'}
                      </button>
                    )}
                    {m.status === 'FAILED' && (
                      <button
                        type="button"
                        className="btn-link text-xs"
                        onClick={() => api(`/admin/config/migrations/${m.id}/retry`, { method: 'POST' }).then(load)}
                      >
                        Retry
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </IdentityPageLayout>
  );
}

