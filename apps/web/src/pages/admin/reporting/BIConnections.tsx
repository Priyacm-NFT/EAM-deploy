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
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
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
    setTesting(id); setMsg('');
    try {
      const result = await api<{ success: boolean; message: string }>(`/admin/reporting/bi-connections/${id}/test`, { method: 'POST' });
      setTestResults((prev) => ({ ...prev, [id]: { ok: result.success, message: result.message } }));
      setMsg(result.success ? 'Connection test passed.' : 'Connection test failed — see result in table.');
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Test failed';
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, message: msg } }));
      setError(msg);
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
            className="btn-primary !w-auto px-4"
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
                    <div className="flex flex-col gap-0.5">
                      <span className={
                        c.lastTestStatus === 'OK' ? 'text-green-700 text-sm font-medium' :
                        c.lastTestStatus === 'FAILED' ? 'text-red-700 text-sm font-medium' :
                        'text-slate-500 text-sm'
                      }>
                        {c.lastTestStatus ?? 'Not tested'}
                      </span>
                      {testResults[c.id] && (
                        <span className={`text-xs ${testResults[c.id]!.ok ? 'text-green-600' : 'text-red-500'}`}>
                          {testResults[c.id]!.ok ? '✓ ' : '✗ '}{testResults[c.id]!.message}
                        </span>
                      )}
                    </div>
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

      {/* ── Role → BI Permission Group Mappings ── */}
      <div className="admin-section">
        <h2 className="admin-section-title">Role → BI permission mappings</h2>
        <p className="text-sm text-slate-600 mb-4">
          Map EAM roles to BI tool permission groups per connection.
          For example, map <code className="text-xs bg-slate-100 px-1 rounded">MAINT_SUPERVISOR</code> → Power BI <code className="text-xs bg-slate-100 px-1 rounded">Viewer</code>.
        </p>

        {connections.length === 0 ? (
          <p className="text-sm text-slate-500">Save at least one BI connection first.</p>
        ) : (
          <BiPermissionMappingsPanel connections={connections} />
        )}
      </div>
    </IdentityPageLayout>
  );
}

// ── Sub-component: Per-connection mapping manager ────────────────────────────

interface BiPermMapping { id: string; eamRole: string; biGroup: string; biWorkspaceId: string | null }

function BiPermissionMappingsPanel({ connections }: { connections: Array<{ id: string; name: string; adapterType: string }> }) {
  const [connId, setConnId] = useState(connections[0]?.id ?? '');
  const [mappings, setMappings] = useState<BiPermMapping[]>([]);
  const [eamRole, setEamRole] = useState('');
  const [biGroup, setBiGroup] = useState('');
  const [biWorkspaceId, setBiWorkspaceId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load(id: string) {
    try {
      const m = await api<BiPermMapping[]>(`/admin/reporting/bi-connections/${id}/permission-mappings`);
      setMappings(m);
    } catch {
      setMappings([]);
    }
  }

  useEffect(() => { if (connId) void load(connId); }, [connId]);

  async function addMapping(e: React.FormEvent) {
    e.preventDefault();
    if (!eamRole.trim() || !biGroup.trim()) { setError('EAM role and BI group are required'); return; }
    setSaving(true); setError('');
    try {
      const m = await api<BiPermMapping>(`/admin/reporting/bi-connections/${connId}/permission-mappings`, {
        method: 'POST',
        body: JSON.stringify({ eamRole: eamRole.trim(), biGroup: biGroup.trim(), biWorkspaceId: biWorkspaceId.trim() || null }),
      });
      setMappings((prev) => [...prev.filter((x) => x.eamRole !== m.eamRole), m]);
      setEamRole(''); setBiGroup(''); setBiWorkspaceId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteMapping(id: string) {
    await api(`/admin/reporting/bi-connections/${connId}/permission-mappings/${id}`, { method: 'DELETE' });
    setMappings((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div>
        <label className="form-label text-xs">Select connection</label>
        <select className="form-select max-w-xs text-sm" value={connId}
          onChange={(e) => { setConnId(e.target.value); }}>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>{c.name} ({c.adapterType})</option>
          ))}
        </select>
      </div>

      <form onSubmit={addMapping} className="flex flex-wrap gap-3 items-end bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div>
          <label className="form-label text-xs">EAM role name</label>
          <input className="form-input text-sm w-44" value={eamRole} onChange={(e) => setEamRole(e.target.value)}
            placeholder="e.g. MAINT_SUPERVISOR" required />
        </div>
        <div>
          <label className="form-label text-xs">BI group / workspace role</label>
          <input className="form-input text-sm w-44" value={biGroup} onChange={(e) => setBiGroup(e.target.value)}
            placeholder="e.g. Viewer" required />
        </div>
        <div>
          <label className="form-label text-xs">Workspace ID (optional)</label>
          <input className="form-input text-sm w-44" value={biWorkspaceId} onChange={(e) => setBiWorkspaceId(e.target.value)}
            placeholder="BI workspace / site ID" />
        </div>
        <button type="submit" className="btn-primary !w-auto px-5 text-sm" disabled={saving}>
          {saving ? '…' : 'Add mapping'}
        </button>
      </form>

      {mappings.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No mappings yet for this connection.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="admin-table text-sm">
            <thead>
              <tr>
                <th>EAM role</th>
                <th>BI group</th>
                <th>Workspace ID</th>
                <th>Remove</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m) => (
                <tr key={m.id}>
                  <td><code className="text-xs bg-accent/10 text-accent-dark px-1.5 py-0.5 rounded">{m.eamRole}</code></td>
                  <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{m.biGroup}</code></td>
                  <td className="text-slate-500 text-xs">{m.biWorkspaceId ?? '—'}</td>
                  <td>
                    <button type="button" className="btn-danger text-xs" onClick={() => deleteMapping(m.id)}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
