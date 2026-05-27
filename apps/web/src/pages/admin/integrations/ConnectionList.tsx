import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface Connection {
  id: string;
  name: string;
  adapterType: string;
  isActive: boolean;
  config: Record<string, unknown>;
  createdAt: string;
}

const ADAPTER_TYPES = ['REST', 'SOAP', 'KAFKA', 'RABBITMQ', 'SFTP', 'JDBC'];
const ADAPTER_ICONS: Record<string, string> = {
  REST: '🌐', SOAP: '📋', KAFKA: '⚡', RABBITMQ: '🐇', SFTP: '📁', JDBC: '🗄️',
};

const EMPTY_FORM = { name: '', adapterType: 'REST', config: '{}' };

export function ConnectionListPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [adapters, setAdapters] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [adapterFilter, setAdapterFilter] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  function load() {
    api<Connection[]>('/admin/integrations/connections').then(setConnections).catch(() => setConnections([]));
    api<string[]>('/admin/integrations/adapters').then(setAdapters).catch(() => setAdapters(ADAPTER_TYPES));
  }

  useEffect(() => { load(); }, []);

  const filtered = connections.filter((c) => {
    const matchText = !filter || c.name.toLowerCase().includes(filter.toLowerCase());
    const matchAdapter = !adapterFilter || c.adapterType === adapterFilter;
    return matchText && matchAdapter;
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    try {
      let parsedConfig: Record<string, unknown> = {};
      try { parsedConfig = JSON.parse(form.config); } catch { throw new Error('Config must be valid JSON'); }
      if (editId) {
        await api(`/admin/integrations/connections/${editId}`, {
          method: 'PUT',
          body: JSON.stringify({ name: form.name, adapterType: form.adapterType, config: parsedConfig }),
        });
        setMsg('Connection updated.');
      } else {
        await api('/admin/integrations/connections', {
          method: 'POST',
          body: JSON.stringify({ name: form.name, adapterType: form.adapterType, config: parsedConfig }),
        });
        setMsg('Connection created.');
      }
      setShowCreate(false);
      setEditId(null);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(id: string) {
    setTesting(id);
    setError('');
    setMsg('');
    try {
      await api(`/admin/integrations/connections/${id}/test`, { method: 'POST' });
      setMsg('Connection test successful.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection test failed');
    } finally {
      setTesting(null);
    }
  }

  async function toggleActive(c: Connection) {
    await api(`/admin/integrations/connections/${c.id}`, {
      method: 'PUT',
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    load();
  }

  async function deleteConn(c: Connection) {
    if (!window.confirm(`Delete connection "${c.name}"?`)) return;
    await api(`/admin/integrations/connections/${c.id}`, { method: 'DELETE' });
    setMsg('Connection deleted.');
    load();
  }

  function startEdit(c: Connection) {
    setForm({ name: c.name, adapterType: c.adapterType, config: JSON.stringify(c.config, null, 2) });
    setEditId(c.id);
    setShowCreate(true);
  }

  return (
    <IdentityPageLayout
      title="Integration connections"
      subtitle="Named, reusable connections to external systems — used by jobs, webhooks, and workflow integration nodes"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <h2 className="admin-section-title">Connections</h2>

        <div className="flex flex-wrap gap-3 items-end">
          <input
            type="search"
            placeholder="Search connections…"
            className="form-input flex-1 min-w-[180px]"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select className="form-select w-40" value={adapterFilter} onChange={(e) => setAdapterFilter(e.target.value)}>
            <option value="">All adapters</option>
            {(adapters.length > 0 ? adapters : ADAPTER_TYPES).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary !w-auto px-4"
            onClick={() => { setShowCreate((v) => !v); setEditId(null); setForm(EMPTY_FORM); }}
          >
            {showCreate && !editId ? 'Cancel' : '+ New connection'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={submit} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
            <h3 className="font-semibold text-primary text-sm">{editId ? 'Edit connection' : 'New connection'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label="Connection name" htmlFor="conn-name">
                <input id="conn-name" className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. SAP Production" />
              </FormField>
              <FormField label="Adapter type" htmlFor="conn-adapter">
                <select id="conn-adapter" className="form-select" value={form.adapterType} onChange={(e) => setForm({ ...form, adapterType: e.target.value })}>
                  {(adapters.length > 0 ? adapters : ADAPTER_TYPES).map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </FormField>
            </div>
            <FormField label="Configuration (JSON)" htmlFor="conn-config" hint="Base URL, credentials, headers, topic names, etc.">
              <textarea
                id="conn-config"
                className="form-input font-mono text-xs"
                rows={5}
                value={form.config}
                onChange={(e) => setForm({ ...form, config: e.target.value })}
                placeholder='{"baseUrl": "https://api.example.com", "apiKey": "..."}'
              />
            </FormField>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
              <button type="button" className="btn-outline text-slate-500" onClick={() => { setShowCreate(false); setEditId(null); setForm(EMPTY_FORM); }}>Cancel</button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Adapter</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-400 py-10">No connections configured. Create one above.</td></tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium text-primary">{c.name}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span>{ADAPTER_ICONS[c.adapterType] ?? '🔌'}</span>
                      <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{c.adapterType}</code>
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleActive(c)}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer ${c.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}
                    >
                      {c.isActive ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="flex gap-2 items-center">
                      <button type="button" className="btn-link text-xs" disabled={testing === c.id} onClick={() => testConnection(c.id)}>
                        {testing === c.id ? 'Testing…' : 'Test'}
                      </button>
                      <button type="button" className="btn-link text-xs" onClick={() => startEdit(c)}>Edit</button>
                      <button type="button" className="btn-danger text-xs" onClick={() => deleteConn(c)}>Delete</button>
                    </div>
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
