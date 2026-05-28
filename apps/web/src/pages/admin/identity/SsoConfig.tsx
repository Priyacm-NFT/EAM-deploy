import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import { AdminAccessBanner } from '../../../components/AdminAccessBanner.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface Provider {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}

const CONFIG_HINTS: Record<string, string> = {
  OIDC: `{
  "issuer": "https://your-idp.example.com",
  "clientId": "your-client-id",
  "clientSecret": "your-client-secret",
  "redirectUri": "${API_URL}/auth/oidc/{providerId}/callback",
  "claims_map": { "email": "email", "name": "name", "groups": "groups" }
}`,
  SAML: `{
  "idpMetadata": "<EntityDescriptor>...</EntityDescriptor>",
  "spEntityId": "eam-sp",
  "acsUrl": "${API_URL}/auth/saml/{providerId}/callback",
  "claims_map": { "email": "email", "name": "displayName" }
}`,
  LDAP: `{
  "url": "ldap://your-server:389",
  "bindDn": "cn=service,dc=example,dc=com",
  "bindPassword": "your-password",
  "baseDn": "ou=users,dc=example,dc=com",
  "groupBaseDn": "ou=groups,dc=example,dc=com"
}`,
  AD: `{
  "url": "ldap://your-ad-server:389",
  "bindDn": "CN=Service Account,OU=Users,DC=corp,DC=local",
  "bindPassword": "your-password",
  "baseDn": "OU=Users,DC=corp,DC=local",
  "groupBaseDn": "OU=Groups,DC=corp,DC=local"
}`,
};

export function SsoConfigPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [form, setForm] = useState({
    type: 'OIDC' as 'SAML' | 'OIDC' | 'LDAP' | 'AD',
    name: '',
    configJson: '',
  });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);

  function reload() {
    api<Provider[]>('/admin/identity-providers')
      .then(setProviders)
      .catch((e) => {
        if (String(e).toLowerCase().includes('forbidden')) setForbidden(true);
        else setError(String(e));
      });
  }

  useEffect(() => {
    reload();
  }, []);

  function applyTypeHint(type: typeof form.type) {
    setForm((f) => ({ ...f, type, configJson: f.configJson.trim() ? f.configJson : CONFIG_HINTS[type] }));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setSaving(true);
    try {
      const config = JSON.parse(form.configJson) as Record<string, unknown>;
      await api('/admin/identity-providers', {
        method: 'POST',
        body: JSON.stringify({ type: form.type, name: form.name, config }),
      });
      setForm({ type: 'OIDC', name: '', configJson: '' });
      setMsg('Identity provider saved.');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON or save failed');
    } finally {
      setSaving(false);
    }
  }

  async function sync(id: string) {
    setMsg('');
    try {
      const result = await api<{ ok: boolean; result?: unknown }>(
        `/admin/identity-providers/${id}/sync`,
        { method: 'POST' },
      );
      setMsg(typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : 'Sync completed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    }
  }

  async function test(id: string) {
    setMsg('');
    try {
      const result = await api<{ ok: boolean; result?: unknown }>(
        `/admin/identity-providers/${id}/test`,
        { method: 'POST' },
      );
      setMsg(typeof result.result === 'object' ? JSON.stringify(result.result, null, 2) : 'Test completed.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
    }
  }

  async function disable(id: string) {
    if (!window.confirm('Disable this provider?')) return;
    await api(`/admin/identity-providers/${id}`, { method: 'DELETE' });
    setMsg('Provider disabled.');
    reload();
  }

  function ssoLoginUrl(p: Provider): string | null {
    if (p.type === 'SAML') return `${API_URL}/auth/saml/${p.id}/login`;
    if (p.type === 'OIDC') return `${API_URL}/auth/oidc/${p.id}/login`;
    return null;
  }

  if (forbidden) {
    return (
      <IdentityPageLayout title="SSO & identity providers" subtitle="Connect SAML, OIDC, LDAP, or Active Directory">
        <AdminAccessBanner />
      </IdentityPageLayout>
    );
  }

  return (
    <IdentityPageLayout
      title="SSO & identity providers"
      subtitle="Type your provider details below — nothing is pre-configured"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && (
        <div className="admin-section">
          <MessageBanner type="success" text="Action completed" />
          <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-3 overflow-auto max-h-48 mt-2">
            {msg}
          </pre>
        </div>
      )}

      <form onSubmit={create} className="admin-section">
        <h2 className="admin-section-title">Add identity provider</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Provider type" htmlFor="sso-type">
            <select
              id="sso-type"
              className="form-select"
              value={form.type}
              onChange={(e) => applyTypeHint(e.target.value as typeof form.type)}
            >
              <option value="OIDC">OIDC (Azure AD, Okta, Google)</option>
              <option value="SAML">SAML 2.0</option>
              <option value="LDAP">LDAP</option>
              <option value="AD">Active Directory</option>
            </select>
          </FormField>
          <FormField label="Display name" htmlFor="sso-name">
            <input
              id="sso-name"
              type="text"
              className="form-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </FormField>
        </div>
        <FormField
          label="Configuration (JSON)"
          htmlFor="sso-config"
          hint="Replace every placeholder value with your real IdP / LDAP settings. Click “Load template” if the box is empty."
        >
          <textarea
            id="sso-config"
            className="form-input font-mono text-xs min-h-[12rem]"
            value={form.configJson}
            onChange={(e) => setForm({ ...form, configJson: e.target.value })}
            required
          />
        </FormField>
        <FormActions>
          <button
            type="button"
            className="btn-primary !w-auto px-4"
            onClick={() => setForm((f) => ({ ...f, configJson: CONFIG_HINTS[f.type] }))}
          >
            Load template
          </button>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
            {saving ? 'Saving…' : 'Save provider'}
          </button>
        </FormActions>
      </form>

      <div className="admin-section">
        <h2 className="admin-section-title">Configured providers</h2>
        {providers.length === 0 ? (
          <p className="text-sm text-slate-500">No providers yet. Add one using the form above.</p>
        ) : (
          <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            {providers.map((p) => (
              <li
                key={p.id}
                className="p-4 flex flex-wrap justify-between items-start gap-3 bg-white hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">{p.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {p.type} · {p.isActive ? 'Active' : 'Disabled'}
                  </p>
                  {ssoLoginUrl(p) && (
                    <a href={ssoLoginUrl(p)!} className="text-xs btn-link mt-1 inline-block">
                      Open SSO login URL
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {(p.type === 'LDAP' || p.type === 'AD') && (
                    <button type="button" className="btn-primary !w-auto !py-1.5 !px-3" onClick={() => sync(p.id)}>
                      Sync users
                    </button>
                  )}
                  <button type="button" className="btn-primary !w-auto !py-1.5 !px-3" onClick={() => test(p.id)}>
                    Test connection
                  </button>
                  {p.isActive && (
                    <button type="button" className="btn-danger" onClick={() => disable(p.id)}>
                      Disable
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </IdentityPageLayout>
  );
}

