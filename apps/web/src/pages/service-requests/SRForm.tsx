import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import {
  IdentityPageLayout, FormField, FormActions, MessageBanner,
} from '../../components/identity/IdentityLayout.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { useActiveDefaultSite } from '../../hooks/useActiveDefaultSite.js';

interface Asset { id: string; assetNum: string; description: string }
interface Location { id: string; code: string; name: string }
interface SRCategory { id: string; name: string; routingRole: string | null; slaHours: number | null }
interface SiteOption { id: string; siteNum: string; name: string }

export function SRFormPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { defaultSiteId } = useActiveDefaultSite();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<SRCategory[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [form, setForm] = useState({
    description: '', priority: 'MEDIUM', channel: 'WEB',
    siteId: '', assetId: '', locationId: '', category: '',
    startDate: '', endDate: '',
  });

  const activeSiteId = isNew ? form.siteId : '';

  useEffect(() => {
    // FIX (P1-2 gap — UI): category used to be pure free text with no
    // relationship to sr_categories at all — this dropdown is what
    // actually makes the routing_role / SLA-hours config on that table
    // reachable from a normal SR submission, instead of only being
    // testable via a raw API call.
    api<SRCategory[]>('/sr-categories').then(setCategories).catch(() => setCategories([]));

    api<SiteOption[]>('/account/lookups/sites').then(setSites).catch(() => setSites([]));

    if (!isNew) {
      api<typeof form & { id: string; siteId?: string; startDate?: string | null; endDate?: string | null }>(`/service-requests/${id}`)
        .then((sr) => setForm({
          description: (sr as { description?: string }).description ?? '',
          priority: sr.priority,
          channel: sr.channel,
          siteId: (sr as { siteId?: string }).siteId ?? '',
          assetId: (sr as { assetId?: string }).assetId ?? '',
          locationId: (sr as { locationId?: string }).locationId ?? '',
          category: (sr as { category?: string }).category ?? '',
          // FIX (SR start/end date parity): pull the date part only —
          // <input type="date"> needs YYYY-MM-DD, not the full ISO
          // timestamp the API returns.
          startDate: sr.startDate ? sr.startDate.slice(0, 10) : '',
          endDate: sr.endDate ? sr.endDate.slice(0, 10) : '',
        }))
        .catch((e) => setError(String(e)));
    }
  }, [id, isNew]);

  useEffect(() => {
    if (!isNew || form.siteId || !defaultSiteId) return;
    setForm((f) => ({ ...f, siteId: defaultSiteId }));
  }, [isNew, defaultSiteId, form.siteId]);

  useEffect(() => {
    if (!isNew) return;
    if (!activeSiteId) {
      setAssets([]);
      setLocations([]);
      return;
    }
    const siteQuery = `siteId=${encodeURIComponent(activeSiteId)}&`;
    const locationQuery = `?flat=true&siteId=${encodeURIComponent(activeSiteId)}`;
    api<{ data: Asset[] } | Asset[]>(`/assets?${siteQuery}pageSize=200`)
      .then((r) => setAssets(Array.isArray(r) ? r : (r as { data: Asset[] }).data ?? []))
      .catch(() => setAssets([]));
    api<Location[]>(`/locations${locationQuery}`)
      .then(setLocations)
      .catch(() => setLocations([]));
  }, [isNew, activeSiteId]);

  useEffect(() => {
    if (!isNew) return;
    setForm((f) => (f.assetId || f.locationId ? { ...f, assetId: '', locationId: '' } : f));
  }, [activeSiteId, isNew]);

  useEffect(() => {
    if (isNew) return;
    if (!form.siteId) {
      setAssets([]);
      setLocations([]);
      return;
    }
    const siteQuery = `siteId=${encodeURIComponent(form.siteId)}&`;
    const locationQuery = `?flat=true&siteId=${encodeURIComponent(form.siteId)}`;
    api<{ data: Asset[] } | Asset[]>(`/assets?${siteQuery}pageSize=200`)
      .then((r) => setAssets(Array.isArray(r) ? r : (r as { data: Asset[] }).data ?? []))
      .catch(() => setAssets([]));
    api<Location[]>(`/locations${locationQuery}`)
      .then(setLocations)
      .catch(() => setLocations([]));
  }, [isNew, form.siteId]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.description.trim()) { setError('Summary is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        description: form.description,
        priority: form.priority,
        channel: form.channel,
        assetId: form.assetId || undefined,
        locationId: form.locationId || undefined,
        category: form.category || undefined,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        customData,
      };
      if (isNew) {
        const created = await api<{ id: string }>('/service-requests', {
          method: 'POST', body: JSON.stringify(payload),
        });
        navigate(`/service-requests/${created.id}`);
      } else {
        await api(`/service-requests/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        navigate(`/service-requests/${id}`);
      }
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  };

  return (
    <IdentityPageLayout
      title={isNew ? 'New Service Request' : 'Edit Service Request'}
      backTo={isNew ? '/service-requests' : `/service-requests/${id}`}
    >
      {error && <MessageBanner type="error" text={error} />}

      <div className="admin-section grid grid-cols-2 gap-4 max-w-3xl">
        <div className="col-span-2">
          <FormField label="Summary *" htmlFor="desc">
            <textarea id="desc" className="form-input" rows={6}
              placeholder="Describe the fault or service needed…"
              value={form.description} onChange={(e) => set('description', e.target.value)} />
          </FormField>
        </div>

        <FormField label="Start Date" htmlFor="startDate">
          <input id="startDate" type="date" className="form-input" value={form.startDate}
            onChange={(e) => set('startDate', e.target.value)} />
        </FormField>

        <FormField label="End Date" htmlFor="endDate">
          <input id="endDate" type="date" className="form-input" value={form.endDate}
            onChange={(e) => set('endDate', e.target.value)} />
        </FormField>

        <FormField label="Priority" htmlFor="priority">
          <select id="priority" className="form-input" value={form.priority}
            onChange={(e) => set('priority', e.target.value)}>
            {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </FormField>

        <FormField label="Channel" htmlFor="channel">
          <select id="channel" className="form-input" value={form.channel}
            onChange={(e) => set('channel', e.target.value)}>
            {['WEB', 'EMAIL', 'MOBILE', 'WALK_IN', 'API'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </FormField>

        <FormField label="Category" htmlFor="category">
          <select id="category" className="form-input" value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">— None —</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
          {(() => {
            const selected = categories.find((c) => c.name === form.category);
            if (!selected) return null;
            return (
              <p className="text-xs text-slate-500 mt-1">
                {selected.routingRole && <>Routes to <strong>{selected.routingRole}</strong>. </>}
                {selected.slaHours && <>SLA target: {selected.slaHours}h.</>}
              </p>
            );
          })()}
        </FormField>
        {categories.length === 0 && (
          <p className="text-xs text-slate-400 -mt-2 mb-3">
            No categories configured yet — <a href="/sr-categories" className="text-accent hover:underline">add some</a> to enable SLA/routing defaults.
          </p>
        )}

        <FormField label="Site" htmlFor="siteId">
          <select id="siteId" className="form-input" value={form.siteId}
            onChange={(e) => {
              const siteId = e.target.value;
              if (isNew) {
                set('siteId', siteId);
              } else {
                setForm((f) => ({ ...f, siteId, assetId: '', locationId: '' }));
              }
            }}>
            <option value="">— None —</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.siteNum} — {s.name}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Asset" htmlFor="assetId">
          <select id="assetId" className="form-input" value={form.assetId}
            onChange={(e) => set('assetId', e.target.value)}>
            <option value="">— None —</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.assetNum} – {a.description}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Location" htmlFor="locationId">
          <select id="locationId" className="form-input" value={form.locationId}
            onChange={(e) => set('locationId', e.target.value)}>
            <option value="">— None —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.code} – {l.name}</option>
            ))}
          </select>
        </FormField>
      </div>

      <DynamicFormRenderer
        entityName="ServiceRequest"
        record={form as unknown as Record<string, unknown>}
        values={customData}
        onChange={(key, val) => setCustomData((prev) => ({ ...prev, [key]: val }))}
      />

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-2">
        <button type="button" className="btn-outline !w-auto px-6"
          onClick={() => navigate(isNew ? '/service-requests' : `/service-requests/${id}`)}>
          Cancel
        </button>
        <button type="button" className="btn-primary !w-auto px-6" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : isNew ? 'Create Service Request' : 'Save Changes'}
        </button>
      </div>
    </IdentityPageLayout>
  );
}
