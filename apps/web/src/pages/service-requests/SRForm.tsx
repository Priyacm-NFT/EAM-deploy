import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import {
  IdentityPageLayout, FormField, FormActions, MessageBanner,
} from '../../components/identity/IdentityLayout.js';

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
  const [form, setForm] = useState({
    subject: '', description: '', priority: 'MEDIUM', channel: 'WEB',
    assetId: '', locationId: '', category: '', reporterName: '', reporterEmail: '',
  });

  useEffect(() => {
    Promise.all([
      api<Asset[]>('/assets'),
      api<Location[]>('/locations'),
    ]).then(([a, l]) => { setAssets(a); setLocations(l); }).catch((e) => setError(String(e)));

    if (!isNew) {
      api<typeof form & { id: string }>(`/service-requests/${id}`).then((sr) => {
        setForm({
          subject: sr.subject, description: (sr as { description?: string }).description ?? '',
          priority: sr.priority, channel: sr.channel,
          assetId: (sr as { assetId?: string }).assetId ?? '',
          locationId: (sr as { locationId?: string }).locationId ?? '',
          category: sr.category ?? '',
          reporterName: (sr as { reporterName?: string }).reporterName ?? '',
          reporterEmail: (sr as { reporterEmail?: string }).reporterEmail ?? '',
        });
      }).catch((e) => setError(String(e)));
    }
  }, [id, isNew]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        assetId: form.assetId || undefined,
        locationId: form.locationId || undefined,
        category: form.category || undefined,
        reporterEmail: form.reporterEmail || undefined,
      };
      if (isNew) {
        const created = await api<{ id: string }>('/service-requests', { method: 'POST', body: JSON.stringify(payload) });
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
      <div className="admin-section grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <FormField label="Subject *" htmlFor="subject">
            <input id="subject" className="form-input" value={form.subject} onChange={(e) => set('subject', e.target.value)} />
          </FormField>
        </div>
        <div className="col-span-2">
          <FormField label="Description" htmlFor="desc">
            <textarea id="desc" className="form-input" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </FormField>
        </div>
        <FormField label="Priority" htmlFor="priority">
          <select id="priority" className="form-input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {['URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </FormField>
        <FormField label="Channel" htmlFor="channel">
          <select id="channel" className="form-input" value={form.channel} onChange={(e) => set('channel', e.target.value)}>
            {['WEB', 'EMAIL', 'PHONE', 'MOBILE', 'WALK_IN', 'IOT'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="Category" htmlFor="category">
          <input id="category" className="form-input" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. ELECTRICAL, HVAC…" />
        </FormField>
        <FormField label="Asset" htmlFor="assetId">
          <select id="assetId" className="form-input" value={form.assetId} onChange={(e) => set('assetId', e.target.value)}>
            <option value="">— None —</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.assetNum} – {a.description}</option>)}
          </select>
        </FormField>
        <FormField label="Location" htmlFor="locationId">
          <select id="locationId" className="form-input" value={form.locationId} onChange={(e) => set('locationId', e.target.value)}>
            <option value="">— None —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} – {l.name}</option>)}
          </select>
        </FormField>
        <FormField label="Reporter name" htmlFor="reporterName">
          <input id="reporterName" className="form-input" value={form.reporterName} onChange={(e) => set('reporterName', e.target.value)} />
        </FormField>
        <FormField label="Reporter email" htmlFor="reporterEmail">
          <input id="reporterEmail" type="email" className="form-input" value={form.reporterEmail} onChange={(e) => set('reporterEmail', e.target.value)} />
        </FormField>
      </div>
      <FormActions>
        <button type="button" className="btn-primary !w-auto px-6" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-link" onClick={() => navigate(isNew ? '/service-requests' : `/service-requests/${id}`)}>
          Cancel
        </button>
      </FormActions>
    </IdentityPageLayout>
  );
}
