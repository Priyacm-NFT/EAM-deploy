import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../../components/identity/IdentityLayout.js';

interface BiConnectionInfo {
  host: string;
  port: number;
  database: string;
  username: string;
  schema: string;
  ssl: boolean;
  jdbcUrl: string;
  directQueryNote: string;
  views: Array<{ name: string; subject: string }>;
}

interface ProvisionResult {
  provisioned: number;
  failed: number;
  results: Array<{ subject: string; viewName: string; ok: boolean; error?: string }>;
  connectionInfo: BiConnectionInfo;
}

export function BIRlsViewsPage() {
  const [info, setInfo] = useState<BiConnectionInfo | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<BiConnectionInfo>('/admin/reporting/bi-rls-views/info')
      .then(setInfo)
      .catch((e) => setError(String(e)));
  }, []);

  async function provision() {
    if (!window.confirm('This will CREATE OR REPLACE tenant-scoped views on the reporting database. Proceed?')) return;
    setProvisioning(true); setError(''); setMsg('');
    try {
      const res = await api<ProvisionResult>('/admin/reporting/bi-rls-views/provision', { method: 'POST' });
      setResult(res);
      setMsg(`Provisioned ${res.provisioned} view(s)${res.failed > 0 ? `, ${res.failed} failed` : ''}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Provisioning failed');
    } finally {
      setProvisioning(false);
    }
  }

  return (
    <IdentityPageLayout
      title="BI Row-Level Security Views"
      subtitle="Provision tenant-scoped database views for Power BI, Qlik, Tableau and other BI tools"
      backTo="/admin/reporting/library"
      backLabel="Back to reports"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {/* What this does */}
      <div className="admin-section">
        <h2 className="admin-section-title">How it works</h2>
        <p className="text-sm text-slate-600 mb-3">
          Each tenant gets its own set of <strong>read-only database views</strong> that filter all data to their tenant ID.
          BI tools connect to the reporting replica with a read-only credential and query these views directly — 
          they see only their own data, enforced at the database level.
        </p>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 font-mono text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-700 font-sans text-xs uppercase tracking-wide mb-2">Generated DDL pattern:</p>
          <p>CREATE OR REPLACE VIEW rpt_tenant_{'<uuid>'}_work_orders AS</p>
          <p className="pl-4">SELECT * FROM work_orders WHERE tenant_id = '{'<your-tenant-uuid>'}' ;</p>
        </div>
      </div>

      {/* Connection info */}
      {info && (
        <div className="admin-section">
          <h2 className="admin-section-title">Reporting database connection</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            {[
              { label: 'Host', value: info.host },
              { label: 'Port', value: String(info.port) },
              { label: 'Database', value: info.database },
              { label: 'Username', value: info.username },
              { label: 'Schema', value: info.schema },
              { label: 'SSL', value: info.ssl ? 'Yes' : 'No' },
            ].map((item) => (
              <div key={item.label} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                <p className="text-xs text-slate-500 mb-0.5">{item.label}</p>
                <p className="font-mono text-sm text-slate-800 font-medium">{item.value}</p>
              </div>
            ))}
          </div>
          <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
            <p className="text-xs text-slate-500 mb-1">JDBC URL (for Tableau / Cognos / BIRT)</p>
            <code className="text-xs font-mono text-slate-700 break-all">{info.jdbcUrl}</code>
          </div>
          <p className="text-xs text-slate-500 mt-2 italic">{info.directQueryNote}</p>
        </div>
      )}

      {/* Views list */}
      {info && (
        <div className="admin-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="admin-section-title !border-0 !pb-0 !mb-0">
              Tenant views ({info.views.length})
            </h2>
            <button type="button" className="btn-primary !w-auto px-5" disabled={provisioning} onClick={provision}>
              {provisioning ? 'Provisioning…' : '⚡ Provision all views'}
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Click <strong>Provision all views</strong> to create or update these views on the reporting database.
            Run this whenever you add a new tenant or change the schema.
          </p>
          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>View name</th>
                  <th>Source table</th>
                  {result && <th>Last provision</th>}
                </tr>
              </thead>
              <tbody>
                {info.views.map((v) => {
                  const r = result?.results.find((x) => x.viewName === v.name);
                  return (
                    <tr key={v.name}>
                      <td><code className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{v.name}</code></td>
                      <td className="text-sm text-slate-600">{v.subject}</td>
                      {result && (
                        <td>
                          {r ? (
                            <span className={`text-xs font-semibold ${r.ok ? 'text-green-700' : 'text-red-600'}`}>
                              {r.ok ? '✓ Provisioned' : `✗ ${r.error}`}
                            </span>
                          ) : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Setup instructions */}
      <div className="admin-section">
        <h2 className="admin-section-title">BI tool setup</h2>
        <div className="space-y-3 text-sm text-slate-600">
          <p><strong>Power BI:</strong> Use <em>PostgreSQL connector</em>, enter the host/database/username above, and select the tenant views from the schema browser.</p>
          <p><strong>Tableau:</strong> Use <em>PostgreSQL</em> data source, enter the JDBC URL, then browse to the tenant views.</p>
          <p><strong>Qlik Sense:</strong> Create a new data connection with <em>PostgreSQL ODBC</em> driver, select the views.</p>
          <p><strong>All tools:</strong> The reporting user only has SELECT access. The views filter all data to your tenant automatically — no additional WHERE clauses needed.</p>
        </div>
      </div>
    </IdentityPageLayout>
  );
}
