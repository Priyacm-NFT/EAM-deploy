import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';
import { usePagination } from '../../../hooks/usePagination.js';
import { Pagination } from '../../../components/Pagination.js';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

const AVAILABLE_SCOPES = [
  'read:assets', 'write:assets',
  'read:work_orders', 'write:work_orders',
  'read:service_requests', 'write:service_requests',
  'read:inventory', 'write:inventory',
  'read:reports',
  'admin:config', 'admin:users',
];

const EMPTY_FORM = { name: '', scopes: [] as string[], expiresAt: '' };

export function ApiKeyManagerPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<{ rawKey: string; name: string } | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<ApiKey[]>('/admin/integrations/api-keys').then(setKeys).catch(() => setKeys([]));
  }

  useEffect(() => { load(); }, []);

  function toggleScope(scope: string) {
    setForm((f) =>
      f.scopes.includes(scope)
        ? { ...f, scopes: f.scopes.filter((s) => s !== scope) }
        : { ...f, scopes: [...f.scopes, scope] },
    );
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError(''); setMsg('');
    try {
      const result = await api<ApiKey & { rawKey: string }>('/admin/integrations/api-keys', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          scopes: form.scopes,
          expiresAt: form.expiresAt || undefined,
        }),
      });
      setNewKey({ rawKey: result.rawKey, name: result.name });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(key: ApiKey) {
    await api(`/admin/integrations/api-keys/${key.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !key.isActive }),
    });
    load();
  }

  async function deleteKey(key: ApiKey) {
    if (!window.confirm(`Revoke API key "${key.name}"?\n\nThis cannot be undone — any consumer using this key will lose access immediately.`)) return;
    await api(`/admin/integrations/api-keys/${key.id}`, { method: 'DELETE' });
    setMsg(`API key "${key.name}" revoked.`);
    load();
  }

  function copyKey(raw: string) {
    navigator.clipboard.writeText(raw).then(() => setMsg('Key copied to clipboard.'));
  }

  const isExpired = (key: ApiKey) =>
    key.expiresAt ? new Date(key.expiresAt) < new Date() : false;

  const { page, setPage, paged, totalPages, totalItems } = usePagination(keys, 10);

  return (
    <IdentityPageLayout
      title="API Key Management"
      subtitle="Create and revoke per-consumer API keys for external integrations and the API gateway"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {/* ── New key created — show raw key ONCE ── */}
      {newKey && (
        <div className="admin-section border-2 border-green-300 bg-green-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-green-800 mb-1">✓ API key created: <strong>{newKey.name}</strong></p>
              <p className="text-xs text-green-700 mb-3">
                Copy this key now — it will <strong>never be shown again</strong>.
              </p>
              <div className="flex items-center gap-2">
                <code className="bg-white border border-green-300 text-green-900 font-mono text-sm px-3 py-2 rounded-lg select-all break-all">
                  {newKey.rawKey}
                </code>
                <button type="button" className="btn-outline text-xs !border-green-400 text-green-700 hover:bg-green-100 shrink-0"
                  onClick={() => copyKey(newKey.rawKey)}>
                  Copy
                </button>
              </div>
            </div>
            <button type="button" onClick={() => setNewKey(null)}
              className="text-green-500 hover:text-green-700 text-lg shrink-0">✕</button>
          </div>
        </div>
      )}

      {/* ── Key list ── */}
      <div className="admin-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="admin-section-title !border-0 !pb-0 !mb-0">API Keys ({keys.length})</h2>
          <button type="button" className="btn-primary !w-auto px-4"
            onClick={() => { setShowCreate((v) => !v); setForm(EMPTY_FORM); }}>
            {showCreate ? 'Cancel' : '+ New API key'}
          </button>
        </div>

        {/* ── Create form ── */}
        {showCreate && (
          <form onSubmit={create} className="border border-slate-200 rounded-xl p-5 bg-slate-50 space-y-4 mb-4">
            <h3 className="font-semibold text-slate-800 text-sm">New API key</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Key name *" htmlFor="key-name">
                <input id="key-name" className="form-input" required
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. SAP integration, Power BI connector" />
              </FormField>
              <FormField label="Expiry date (optional)" htmlFor="key-expires">
                <input id="key-expires" className="form-input" type="date"
                  value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </FormField>
            </div>
            <div>
              <p className="form-label mb-2">Scopes (leave blank for full read access)</p>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_SCOPES.map((scope) => (
                  <label key={scope} className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-mono">
                    <input type="checkbox" checked={form.scopes.includes(scope)}
                      onChange={() => toggleScope(scope)}
                      className="rounded border-slate-300 text-accent" />
                    <span className="text-slate-700">{scope}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
                {saving ? 'Creating…' : 'Create key'}
              </button>
              <button type="button" className="btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </form>
        )}

        {/* ── Table ── */}
        <div className="overflow-x-auto rounded-lg border border-slate-100">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key prefix</th>
                <th>Scopes</th>
                <th>Status</th>
                <th>Last used</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 && (
                <tr><td colSpan={7} className="text-center text-slate-400 py-10">No API keys yet.</td></tr>
              )}
              {paged.map((key) => {
                const expired = isExpired(key);
                return (
                  <tr key={key.id} className={expired ? 'opacity-60' : ''}>
                    <td className="font-medium text-slate-800">{key.name}</td>
                    <td>
                      <code className="bg-slate-100 text-slate-700 font-mono text-xs px-2 py-0.5 rounded">
                        {key.keyPrefix}…
                      </code>
                    </td>
                    <td>
                      {key.scopes.length === 0
                        ? <span className="text-xs text-slate-400 italic">All scopes</span>
                        : (
                          <div className="flex flex-wrap gap-1">
                            {key.scopes.slice(0, 3).map((s) => (
                              <span key={s} className="text-[10px] bg-accent/10 text-accent-dark font-mono px-1.5 py-0.5 rounded">{s}</span>
                            ))}
                            {key.scopes.length > 3 && <span className="text-xs text-slate-400">+{key.scopes.length - 3}</span>}
                          </div>
                        )}
                    </td>
                    <td>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        expired ? 'bg-slate-100 text-slate-500 border-slate-200' :
                        key.isActive ? 'bg-green-100 text-green-800 border-green-200' :
                        'bg-red-100 text-red-600 border-red-200'
                      }`}>
                        {expired ? 'Expired' : key.isActive ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                    <td className="text-xs text-slate-500">
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}
                    </td>
                    <td className="text-xs text-slate-500">
                      {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div className="flex gap-2">
                        {!expired && (
                          <button type="button" className="btn-link text-xs" onClick={() => toggleActive(key)}>
                            {key.isActive ? 'Disable' : 'Enable'}
                          </button>
                        )}
                        <button type="button" className="btn-danger text-xs" onClick={() => deleteKey(key)}>
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-500 space-y-1">
          <p><strong>How to use:</strong> Pass the key in the <code className="bg-slate-100 px-1 rounded">Authorization</code> header:</p>
          <code className="block bg-slate-100 px-3 py-2 rounded font-mono text-slate-700">
            Authorization: ApiKey {'<your-key>'}
          </code>
          <p>Keys are hashed — if you lose a key, revoke it and create a new one.</p>
        </div>
      </div>
    
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={10} onChange={setPage} />
    </IdentityPageLayout>
  );
}
