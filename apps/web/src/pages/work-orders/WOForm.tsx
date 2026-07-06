import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, FormField, FormActions, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { useActiveDefaultSite } from '../../hooks/useActiveDefaultSite.js';

interface Asset { id: string; assetNum: string; description: string }
interface Location { id: string; code: string; name: string }
interface JobPlan { id: string; jpNum: string; description: string }

export function WOFormPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { defaultSiteId } = useActiveDefaultSite();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [jobPlans, setJobPlans] = useState<JobPlan[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  const [form, setForm] = useState({
    description: '', longDescription: '', type: 'CM', priority: 'MEDIUM',
    status: 'DRAFT',
    assetId: searchParams.get('assetId') ?? '', locationId: '', jobPlanId: '',
    targetStartDate: '', targetFinishDate: '', notes: '',
  });

  useEffect(() => {
    if (isNew) {
      const siteQuery = defaultSiteId ? `siteId=${defaultSiteId}&` : '';
      const locationQuery = defaultSiteId ? `?siteId=${defaultSiteId}` : '';
      Promise.all([
        api<{ data: Asset[] }>(`/assets?${siteQuery}pageSize=500`),
        api<Location[]>(`/locations${locationQuery}`),
        api<{ data: JobPlan[] }>('/job-plans'),
      ]).then(([a, l, jp]) => {
        setAssets(a.data ?? []);
        setLocations(Array.isArray(l) ? l : []);
        setJobPlans(Array.isArray(jp) ? jp : (jp.data ?? []));
      }).catch((e) => setError(String(e)));
    } else {
      Promise.all([
        api<{ data: Asset[] }>('/assets'),
        api<Location[]>('/locations'),
        api<{ data: JobPlan[] }>('/job-plans'),
      ]).then(([a, l, jp]) => {
        setAssets(a.data ?? []);
        setLocations(Array.isArray(l) ? l : []);
        setJobPlans(Array.isArray(jp) ? jp : (jp.data ?? []));
      }).catch((e) => setError(String(e)));
    }

    if (!isNew) {
      api<typeof form & { id: string }>(`/work-orders/${id}`).then((wo) => {
        setForm({
          description: wo.description,
          longDescription: (wo as { longDescription?: string }).longDescription ?? '',
          type: (wo as { type: string }).type,
          priority: (wo as { priority: string }).priority,
          assetId: (wo as { assetId?: string }).assetId ?? '',
          locationId: (wo as { locationId?: string }).locationId ?? '',
          jobPlanId: (wo as { jobPlanId?: string }).jobPlanId ?? '',
          targetStartDate: (wo as { targetStartDate?: string }).targetStartDate?.slice(0, 10) ?? '',
          targetFinishDate: (wo as { targetFinishDate?: string }).targetFinishDate?.slice(0, 10) ?? '',
          notes: (wo as { notes?: string }).notes ?? '',
        });
      }).catch((e) => setError(String(e)));
    }
  }, [id, isNew, defaultSiteId]);

  useEffect(() => {
    if (!isNew) return;
    if (form.locationId && locations.length > 0 && !locations.some((l) => l.id === form.locationId)) {
      setForm((f) => ({ ...f, locationId: '' }));
    }
    if (form.assetId && assets.length > 0 && !assets.some((a) => a.id === form.assetId)) {
      setForm((f) => ({ ...f, assetId: '' }));
    }
  }, [locations, assets, defaultSiteId, isNew, form.locationId, form.assetId]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        assetId: form.assetId || undefined,
        locationId: form.locationId || undefined,
        jobPlanId: form.jobPlanId || undefined,
        targetStartDate: form.targetStartDate || undefined,
        targetFinishDate: form.targetFinishDate || undefined,
        longDescription: form.longDescription || undefined,
        notes: form.notes || undefined,
        customData,
      };
      if (isNew) {
        const created = await api<{ id: string }>('/work-orders', { method: 'POST', body: JSON.stringify(payload) });
        navigate(`/work-orders/${created.id}`);
      } else {
        await api(`/work-orders/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        navigate(`/work-orders/${id}`);
      }
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  };

  return (
    <IdentityPageLayout
      title={isNew ? 'New Work Order' : 'Edit Work Order'}
      backTo={isNew ? '/work-orders' : `/work-orders/${id}`}
    >
      {error && <MessageBanner type="error" text={error} />}
      <div className="admin-section grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <FormField label="Description *" htmlFor="desc">
            <input id="desc" className="form-input" value={form.description} onChange={(e) => set('description', e.target.value)} />
          </FormField>
        </div>
        <FormField label="Status" htmlFor="status">
          <select id="status" className="form-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {['DRAFT', 'WAPPR', 'APPR', 'INPRG', 'COMP', 'CLOSE', 'HOLD', 'CAN'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </FormField>
        <FormField label="Type" htmlFor="type">
          <select id="type" className="form-input" value={form.type} onChange={(e) => set('type', e.target.value)}>
            {['CM', 'PM', 'PROJECT', 'INSPECTION', 'CALIBRATION'].map((t) => <option key={t}>{t}</option>)}
          </select>
        </FormField>
        <FormField label="Priority" htmlFor="priority">
          <select id="priority" className="form-input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
            {['EMERGENCY', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </FormField>
        <FormField label="Asset" htmlFor="assetId">
          <select id="assetId" className="form-input" value={form.assetId} onChange={(e) => set('assetId', e.target.value)}>
            <option value="">— None —</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.assetNum} — {a.description}</option>)}
          </select>
        </FormField>
        <FormField label="Location" htmlFor="locationId">
          <select id="locationId" className="form-input" value={form.locationId} onChange={(e) => set('locationId', e.target.value)}>
            <option value="">— None —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
          </select>
        </FormField>
        <FormField label="Job plan" htmlFor="jobPlanId">
          <select id="jobPlanId" className="form-input" value={form.jobPlanId} onChange={(e) => set('jobPlanId', e.target.value)}>
            <option value="">— None —</option>
            {jobPlans.map((jp) => <option key={jp.id} value={jp.id}>{jp.jpNum} – {jp.description}</option>)}
          </select>
        </FormField>
        <FormField label="Target start" htmlFor="targetStart">
          <input id="targetStart" type="date" className="form-input" value={form.targetStartDate} onChange={(e) => set('targetStartDate', e.target.value)} />
        </FormField>
        <FormField label="Target finish" htmlFor="targetFinish">
          <input id="targetFinish" type="date" className="form-input" value={form.targetFinishDate} onChange={(e) => set('targetFinishDate', e.target.value)} />
        </FormField>
        <div className="col-span-2">
          <FormField label="Long description" htmlFor="longDesc">
            <textarea id="longDesc" className="form-input" rows={4} value={form.longDescription} onChange={(e) => set('longDescription', e.target.value)} />
          </FormField>
        </div>
      </div>

      <DynamicFormRenderer
        entityName="WorkOrder"
        record={form as unknown as Record<string, unknown>}
        values={customData}
        onChange={(key, val) => setCustomData((prev) => ({ ...prev, [key]: val }))}
      />

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-2">
        <button type="button" className="btn-outline !w-auto px-6"
          onClick={() => navigate(isNew ? '/work-orders' : `/work-orders/${id}`)}>
          Cancel
        </button>
        <button type="button" className="btn-primary !w-auto px-6" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </IdentityPageLayout>
  );
}
