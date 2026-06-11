import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import {
  IdentityPageLayout, FormField, FormActions, MessageBanner,
} from '../../components/identity/IdentityLayout.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';

interface Asset { id: string; assetNum: string; description: string }
interface Location { id: string; code: string; name: string }

export function SRFormPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [form, setForm] = useState({
    description: '', priority: 'MEDIUM', channel: 'WEB',
    assetId: '', locationId: '', category: '',
  });

  useEffect(() => {
    // /assets returns {data: Asset[], page, pageSize} — unwrap safely
    api<{ data: Asset[] } | Asset[]>('/assets?pageSize=200')
      .then((r) => setAssets(Array.isArray(r) ? r : (r as { data: Asset[] }).data ?? []))
      .catch(() => {});

    // /locations returns a tree array — use flat=true for a simple list
    api<Location[]>('/locations?flat=true')
      .then(setLocations)
      .catch(() => {});

    if (!isNew) {
      api<typeof form & { id: string }>(`/service-requests/${id}`)
        .then((sr) => setForm({
          description: (sr as { description?: string }).description ?? '',
          priority: sr.priority,
          channel: sr.channel,
          assetId: (sr as { assetId?: string }).assetId ?? '',
          locationId: (sr as { locationId?: string }).locationId ?? '',
          category: (sr as { category?: string }).category ?? '',
        }))
        .catch((e) => setError(String(e)));
    }
  }, [id, isNew]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.description.trim()) { setError('Description is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        description: form.description,
        priority: form.priority,
        channel: form.channel,
        assetId: form.assetId || undefined,
        locationId: form.locationId || undefined,
        category: form.category || undefined,
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
          <FormField label="Description *" htmlFor="desc">
            <textarea id="desc" className="form-input" rows={3}
              placeholder="Describe the fault or service needed…"
              value={form.description} onChange={(e) => set('description', e.target.value)} />
          </FormField>
        </div>

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
          <input id="category" className="form-input" value={form.category}
            placeholder="e.g. ELECTRICAL, HVAC…"
            onChange={(e) => set('category', e.target.value)} />
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

