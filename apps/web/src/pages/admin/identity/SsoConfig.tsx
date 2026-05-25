import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';

interface Provider {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

export function SsoConfigPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState({
    type: 'OIDC' as 'SAML' | 'OIDC' | 'LDAP' | 'AD',
    name: '',
    configJson: '{}',
  });

  function reload() {
    api<Provider[]>('/admin/identity-providers').then(setProviders);
  }

  useEffect(() => {
    reload();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const config = JSON.parse(form.configJson) as Record<string, unknown>;
    await api('/admin/identity-providers', {
      method: 'POST',
      body: JSON.stringify({ type: form.type, name: form.name, config }),
    });
    setForm({ type: 'OIDC', name: '', configJson: '{}' });
    reload();
  }

  async function test(id: string) {
    const result = await api<{ ok: boolean; result?: unknown }>(
      `/admin/identity-providers/${id}/test`,
      { method: 'POST' },
    );
    alert(JSON.stringify(result, null, 2));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">SSO / Identity providers</h1>
      <ul className="bg-white border rounded divide-y">
        {providers.map((p) => (
          <li key={p.id} className="p-3 flex justify-between items-center">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-sm text-slate-500">
                {p.type} · {p.isActive ? 'Active' : 'Disabled'}
              </p>
            </div>
            <button type="button" className="text-blue-600 text-sm" onClick={() => test(p.id)}>
              Test
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={create} className="max-w-lg space-y-3 border p-4 rounded bg-white">
        <h2 className="font-medium">Connect provider</h2>
        <select
          className="border rounded w-full px-2 py-1"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
        >
          <option value="OIDC">OIDC</option>
          <option value="SAML">SAML</option>
          <option value="LDAP">LDAP</option>
          <option value="AD">AD</option>
        </select>
        <input
          className="border rounded w-full px-2 py-1"
          placeholder="Display name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <textarea
          className="border rounded w-full px-2 py-1 font-mono text-xs h-32"
          value={form.configJson}
          onChange={(e) => setForm({ ...form, configJson: e.target.value })}
        />
        <button type="submit" className="bg-slate-800 text-white px-4 py-2 rounded text-sm">
          Save provider
        </button>
      </form>
    </div>
  );
}
