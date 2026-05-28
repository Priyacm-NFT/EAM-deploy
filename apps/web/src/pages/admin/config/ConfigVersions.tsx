import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface ConfigVersion {
  id: string;
  entityType: string;
  entityId: string;
  versionNum: number;
  snapshot: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

export function ConfigVersionsPage() {
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [filter, setFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error] = useState('');
  const [msg] = useState('');

  function load() {
    api<ConfigVersion[]>('/admin/config/versions').then(setVersions).catch(() => setVersions([]));
  }

  useEffect(() => { load(); }, []);

  const entityTypes = [...new Set(versions.map((v) => v.entityType))].sort();

  const filtered = versions.filter((v) => {
    const matchEntity = !entityFilter || v.entityType === entityFilter;
    const matchSearch = !filter ||
      v.entityType.toLowerCase().includes(filter.toLowerCase()) ||
      v.entityId.toLowerCase().includes(filter.toLowerCase());
    return matchEntity && matchSearch;
  });

  return (
    <IdentityPageLayout
      title="Config versions"
      subtitle="Audit trail of all configuration changes — schema fields, forms, and field rules are automatically versioned"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="search"
              placeholder="Search by entity type or ID…"
              className="form-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <select
            className="form-select w-48"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
          >
            <option value="">All entity types</option>
            {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Total versions', value: versions.length, color: 'text-primary' },
            { label: 'Entity types', value: entityTypes.length, color: 'text-accent' },
            { label: 'Today', value: versions.filter((v) => new Date(v.createdAt).toDateString() === new Date().toDateString()).length, color: 'text-green-700' },
            { label: 'Filtered', value: filtered.length, color: 'text-slate-600' },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Entity type</th>
                <th>Entity ID</th>
                <th>Version</th>
                <th>Changed at</th>
                <th>Changed by</th>
                <th>Snapshot</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-400 py-10">
                    No config versions found.
                  </td>
                </tr>
              )}
              {filtered.map((v) => (
                <>
                  <tr key={v.id}>
                    <td>
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{v.entityType}</code>
                    </td>
                    <td className="text-xs font-mono text-slate-500 max-w-[120px] truncate">{v.entityId}</td>
                    <td>
                      <span className="text-xs font-mono bg-accent/10 text-accent-dark px-2 py-0.5 rounded-full">v{v.versionNum}</span>
                    </td>
                    <td className="text-xs text-slate-500">{new Date(v.createdAt).toLocaleString()}</td>
                    <td className="text-xs text-slate-500">{v.createdBy ? <span className="font-mono">{v.createdBy.slice(0, 8)}…</span> : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-link text-xs"
                        onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                      >
                        {expanded === v.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expanded === v.id && (
                    <tr key={`${v.id}-exp`}>
                      <td colSpan={6} className="bg-slate-50 p-0">
                        <pre className="text-xs text-slate-600 font-mono p-4 overflow-x-auto max-h-64">
                          {JSON.stringify(v.snapshot, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </IdentityPageLayout>
  );
}
