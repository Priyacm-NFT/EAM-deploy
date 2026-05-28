import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface Org {
  id: string;
  name: string;
  code: string;
  description: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

interface Site {
  id: string;
  orgId: string | null;
  name: string;
  siteNum: string;
  description: string | null;
  address: string | null;
  timezone: string | null;
  isActive: boolean;
}

const EMPTY_ORG = { name: '', code: '', description: '', address: '' };
const EMPTY_SITE = { name: '', siteNum: '', orgId: '', description: '', address: '', timezone: 'UTC' };

export function OrgStructurePage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [tab, setTab] = useState<'orgs' | 'sites'>('orgs');
  const [showOrgForm, setShowOrgForm] = useState(false);
  const [showSiteForm, setShowSiteForm] = useState(false);
  const [orgForm, setOrgForm] = useState(EMPTY_ORG);
  const [siteForm, setSiteForm] = useState(EMPTY_SITE);
  const [editOrgId, setEditOrgId] = useState<string | null>(null);
  const [editSiteId, setEditSiteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<Org[]>('/admin/org/organisations').then(setOrgs).catch(() => setOrgs([]));
    api<Site[]>('/admin/org/sites').then(setSites).catch(() => setSites([]));
  }

  useEffect(() => { load(); }, []);

  async function saveOrg(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    try {
      if (editOrgId) {
        await api(`/admin/org/organisations/${editOrgId}`, { method: 'PUT', body: JSON.stringify(orgForm) });
        setMsg('Organisation updated.');
      } else {
        await api('/admin/org/organisations', { method: 'POST', body: JSON.stringify(orgForm) });
        setMsg('Organisation created.');
      }
      setShowOrgForm(false);
      setEditOrgId(null);
      setOrgForm(EMPTY_ORG);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrg(o: Org) {
    if (!window.confirm(`Delete organisation "${o.name}"?`)) return;
    try {
      await api(`/admin/org/organisations/${o.id}`, { method: 'DELETE' });
      setMsg(`Organisation "${o.name}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function saveSite(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const payload = { ...siteForm, orgId: siteForm.orgId || undefined };
      if (editSiteId) {
        await api(`/admin/org/sites/${editSiteId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg('Site updated.');
      } else {
        await api('/admin/org/sites', { method: 'POST', body: JSON.stringify(payload) });
        setMsg('Site created.');
      }
      setShowSiteForm(false);
      setEditSiteId(null);
      setSiteForm(EMPTY_SITE);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function deleteSite(s: Site) {
    if (!window.confirm(`Delete site "${s.name}"?`)) return;
    try {
      await api(`/admin/org/sites/${s.id}`, { method: 'DELETE' });
      setMsg(`Site "${s.name}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function startEditOrg(o: Org) {
    setOrgForm({ name: o.name, code: o.code, description: o.description ?? '', address: o.address ?? '' });
    setEditOrgId(o.id);
    setShowOrgForm(true);
  }

  function startEditSite(s: Site) {
    setSiteForm({
      name: s.name,
      siteNum: s.siteNum,
      orgId: s.orgId ?? '',
      description: s.description ?? '',
      address: s.address ?? '',
      timezone: s.timezone ?? 'UTC',
    });
    setEditSiteId(s.id);
    setShowSiteForm(true);
  }

  const orgMap = Object.fromEntries(orgs.map((o) => [o.id, o.name]));

  return (
    <IdentityPageLayout
      title="Organisation structure"
      subtitle="Manage organisations and sites — sites are associated with work orders, assets, and purchasing"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200">
        {(['orgs', 'sites'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'orgs' ? `Organisations (${orgs.length})` : `Sites (${sites.length})`}
          </button>
        ))}
      </div>

      {/* Organisations */}
      {tab === 'orgs' && (
        <div className="admin-section">
          <div className="flex justify-between items-center">
            <h2 className="admin-section-title">Organisations</h2>
            <button
              type="button"
              className="btn-primary !w-auto px-4"
              onClick={() => { setShowOrgForm((v) => !v); setEditOrgId(null); setOrgForm(EMPTY_ORG); }}
            >
              {showOrgForm && !editOrgId ? 'Cancel' : '+ New organisation'}
            </button>
          </div>

          {showOrgForm && (
            <form onSubmit={saveOrg} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
              <h3 className="font-semibold text-primary text-sm">{editOrgId ? 'Edit organisation' : 'New organisation'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField label="Name" htmlFor="org-name">
                  <input id="org-name" className="form-input" required value={orgForm.name} onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })} placeholder="Acme Corporation" />
                </FormField>
                <FormField label="Code" htmlFor="org-code">
                  <input id="org-code" className="form-input" required value={orgForm.code} onChange={(e) => setOrgForm({ ...orgForm, code: e.target.value })} placeholder="ACME" />
                </FormField>
                <FormField label="Description" htmlFor="org-desc">
                  <input id="org-desc" className="form-input" value={orgForm.description} onChange={(e) => setOrgForm({ ...orgForm, description: e.target.value })} />
                </FormField>
                <FormField label="Address" htmlFor="org-addr">
                  <input id="org-addr" className="form-input" value={orgForm.address} onChange={(e) => setOrgForm({ ...orgForm, address: e.target.value })} />
                </FormField>
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>{saving ? 'Saving…' : editOrgId ? 'Update' : 'Create'}</button>
                <button type="button" className="btn-outline text-slate-500" onClick={() => { setShowOrgForm(false); setEditOrgId(null); }}>Cancel</button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Description</th>
                  <th>Sites</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-slate-400 py-10">No organisations yet.</td></tr>
                )}
                {orgs.map((o) => (
                  <tr key={o.id}>
                    <td className="font-medium text-primary">{o.name}</td>
                    <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{o.code}</code></td>
                    <td className="text-sm text-slate-500">{o.description || '—'}</td>
                    <td className="text-sm">{sites.filter((s) => s.orgId === o.id).length}</td>
                    <td>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${o.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {o.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-3">
                        <button type="button" className="btn-link text-xs" onClick={() => startEditOrg(o)}>Edit</button>
                        <button type="button" className="btn-danger text-xs" onClick={() => deleteOrg(o)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sites */}
      {tab === 'sites' && (
        <div className="admin-section">
          <div className="flex justify-between items-center">
            <h2 className="admin-section-title">Sites</h2>
            <button
              type="button"
              className="btn-primary !w-auto px-4"
              onClick={() => { setShowSiteForm((v) => !v); setEditSiteId(null); setSiteForm(EMPTY_SITE); }}
            >
              {showSiteForm && !editSiteId ? 'Cancel' : '+ New site'}
            </button>
          </div>

          {showSiteForm && (
            <form onSubmit={saveSite} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
              <h3 className="font-semibold text-primary text-sm">{editSiteId ? 'Edit site' : 'New site'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <FormField label="Site name" htmlFor="site-name">
                  <input id="site-name" className="form-input" required value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} placeholder="Main Facility" />
                </FormField>
                <FormField label="Site number" htmlFor="site-num">
                  <input id="site-num" className="form-input" required value={siteForm.siteNum} onChange={(e) => setSiteForm({ ...siteForm, siteNum: e.target.value })} placeholder="SITE01" />
                </FormField>
                <FormField label="Organisation" htmlFor="site-org">
                  <select id="site-org" className="form-select" value={siteForm.orgId} onChange={(e) => setSiteForm({ ...siteForm, orgId: e.target.value })}>
                    <option value="">No organisation</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Description" htmlFor="site-desc">
                  <input id="site-desc" className="form-input" value={siteForm.description} onChange={(e) => setSiteForm({ ...siteForm, description: e.target.value })} />
                </FormField>
                <FormField label="Address" htmlFor="site-addr">
                  <input id="site-addr" className="form-input" value={siteForm.address} onChange={(e) => setSiteForm({ ...siteForm, address: e.target.value })} />
                </FormField>
                <FormField label="Timezone" htmlFor="site-tz">
                  <input id="site-tz" className="form-input" value={siteForm.timezone} onChange={(e) => setSiteForm({ ...siteForm, timezone: e.target.value })} placeholder="UTC" />
                </FormField>
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>{saving ? 'Saving…' : editSiteId ? 'Update' : 'Create'}</button>
                <button type="button" className="btn-outline text-slate-500" onClick={() => { setShowSiteForm(false); setEditSiteId(null); }}>Cancel</button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Site name</th>
                  <th>Site #</th>
                  <th>Organisation</th>
                  <th>Address</th>
                  <th>Timezone</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sites.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-slate-400 py-10">No sites yet.</td></tr>
                )}
                {sites.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium text-primary">{s.name}</td>
                    <td><code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{s.siteNum}</code></td>
                    <td className="text-sm text-slate-600">{s.orgId ? orgMap[s.orgId] ?? '—' : '—'}</td>
                    <td className="text-xs text-slate-500 max-w-[120px] truncate">{s.address || '—'}</td>
                    <td className="text-xs text-slate-500">{s.timezone || 'UTC'}</td>
                    <td>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-3">
                        <button type="button" className="btn-link text-xs" onClick={() => startEditSite(s)}>Edit</button>
                        <button type="button" className="btn-danger text-xs" onClick={() => deleteSite(s)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </IdentityPageLayout>
  );
}
