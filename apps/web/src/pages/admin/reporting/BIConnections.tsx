import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';
import type { BiConnectionRow } from './report-types.js';

const ADAPTERS = ['POWERBI', 'QLIK', 'TABLEAU', 'COGNOS', 'BIRT'] as const;

const CONFIG_HINTS: Record<string, string> = {
  POWERBI: '{ "workspaceId": "your-workspace-id", "datasetId": "your-dataset-id" }',
  QLIK: '{ "host": "https://your-qlik-server", "appId": "your-app-id" }',
  TABLEAU: '{ "serverUrl": "https://your-tableau-server", "siteId": "" }',
  COGNOS: '{ "gatewayUrl": "https://your-cognos-gateway/bi" }',
  BIRT: '{ "runtimeUrl": "http://localhost:8080/birt" }',
};

export function BIConnectionsPage() {
  const [connections, setConnections] = useState<BiConnectionRow[]>([]);
  const [adapterType, setAdapterType] = useState<string>('POWERBI');
  const [name, setName] = useState('');
  const [configJson, setConfigJson] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const c = await api<BiConnectionRow[]>('/admin/reporting/bi-connections');
    setConnections(c);
  };

  useEffect(() => {
    load().catch((e) => setError(String(e)));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMsg('');
    if (!name.trim()) {
      setError('Enter a connection name');
      return;
    }
    try {
      const config = JSON.parse(configJson) as Record<string, unknown>;
      await api('/admin/reporting/bi-connections', {
        method: 'POST',
        body: JSON.stringify({ adapterType, name: name.trim(), config }),
      });
      setName('');
      setConfigJson('');
      setMsg('BI connection saved.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON or save failed');
    }
  };

  const test = async (id: string) => {
    setTesting(id);
    setMsg('');
    try {
      await api(`/admin/reporting/bi-connections/${id}/test`, { method: 'POST' });
      setMsg('Connection test completed.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(null);
    }
  };

  return (
    <IdentityPageLayout
      title="BI connections"
      subtitle="Type adapter settings for Power BI, Qlik, Tableau, and other tools"
      backTo="/admin/reporting/library"
      backLabel="Back to reports"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <form onSubmit={save} className="admin-section">
        <h2 className="admin-section-title">Add BI connection</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Adapter type" htmlFor="bi-adapter">
            <select
              id="bi-adapter"
              className="form-select"
              value={adapterType}
              onChange={(e) => setAdapterType(e.target.value)}
            >
              {ADAPTERS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Connection name" htmlFor="bi-name">
            <input
              id="bi-name"
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </FormField>
        </div>
        <FormField
          label="Configuration (JSON)"
          htmlFor="bi-config"
          hint="Replace placeholder values with your real BI server settings."
        >
          <textarea
            id="bi-config"
            className="form-input font-mono text-xs min-h-[8rem]"
            value={configJson}
            onChange={(e) => setConfigJson(e.target.value)}
            required
          />
        </FormField>
        <FormActions>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setConfigJson(CONFIG_HINTS[adapterType] ?? '{}')}
          >
            Load template
          </button>
          <button type="submit" className="btn-primary !w-auto px-6">
            Save connection
          </button>
        </FormActions>
      </form>

      <div className="admin-section">
        <h2 className="admin-section-title">Saved connections</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Adapter</th>
                <th>Last test</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {connections.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-500 py-6">
                    No connections yet. Add one using the form above.
                  </td>
                </tr>
              )}
              {connections.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.name}</td>
                  <td>{c.adapterType}</td>
                  <td>
                    <span
                      className={
                        c.lastTestStatus === 'OK'
                          ? 'text-green-700'
                          : c.lastTestStatus === 'FAILED'
                            ? 'text-red-700'
                            : 'text-slate-500'
                      }
                    >
                      {c.lastTestStatus ?? 'Not tested'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-link disabled:opacity-50"
                      disabled={testing === c.id}
                      onClick={() => test(c.id)}
                    >
                      {testing === c.id ? 'Testing…' : 'Test'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm mt-3">
          <Link to="/admin/reporting/library" className="btn-link">
            Back to report library
          </Link>
        </p>
      </div>
    </IdentityPageLayout>
  );
}
