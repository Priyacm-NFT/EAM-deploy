import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { IdentityPageLayout, FormField, FormActions, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { useActiveDefaultSite } from '../../hooks/useActiveDefaultSite.js';

interface PMDetail {
  id: string; pmNum: string; description: string; status: string;
  frequencyType: string; interval: number | null; intervalUnit: string | null;
  nextDueDate: string | null; leadDays: number; priority: string;
  isActive: boolean; assetId: string | null; jobPlanId: string | null;
  locationId: string | null; siteId: string | null; routeId: string | null;
}
interface Asset { id: string; assetNum: string; description: string }
interface JobPlan { id: string; jpNum: string; description: string }

const FREQUENCY_TYPES = ['CALENDAR', 'METER', 'CALENDAR_AND_METER', 'SEASONAL'] as const;
const INTERVAL_UNITS = ['DAY', 'WEEK', 'MONTH', 'YEAR', 'HOUR'] as const;

async function resolvePmSiteId(
  p: PMDetail,
  defaultSiteId: string | null,
): Promise<string> {
  let siteId = p.siteId ?? '';
  if (!siteId && p.assetId) {
    try {
      const asset = await api<{ siteId?: string | null }>(`/assets/${p.assetId}`);
      siteId = asset.siteId ?? '';
    } catch { /* keep resolving from location */ }
  }
  if (!siteId && p.locationId) {
    try {
      const loc = await api<{ siteId?: string | null }>(`/locations/${p.locationId}`);
      siteId = loc.siteId ?? '';
    } catch { /* keep resolving from route */ }
  }
  if (!siteId && p.routeId) {
    try {
      const route = await api<{ siteId?: string | null }>(`/pm-routes/${p.routeId}`);
      siteId = route.siteId ?? '';
    } catch { /* no site on route */ }
  }
  if (!siteId && defaultSiteId) {
    siteId = defaultSiteId;
  }
  return siteId;
}

async function loadSiteAssets(siteId: string): Promise<Asset[]> {
  const siteQuery = `siteId=${encodeURIComponent(siteId)}&`;
  const r = await api<{ data: Asset[] } | Asset[]>(`/assets?${siteQuery}pageSize=200`);
  return Array.isArray(r) ? r : (r as { data: Asset[] }).data ?? [];
}

export function PMDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { defaultSiteId, ready: defaultSiteReady } = useActiveDefaultSite();
  const [pm, setPm] = useState<PMDetail | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [jobPlans, setJobPlans] = useState<JobPlan[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [generating, setGenerating] = useState(false);
  const [assetsReady, setAssetsReady] = useState(false);
  const [form, setForm] = useState({
    description: '', frequencyType: 'CALENDAR', interval: '1',
    intervalUnit: 'MONTH', leadDays: '7', priority: 'MEDIUM',
    siteId: '', assetId: '', jobPlanId: '', status: 'ACTIVE',
    // FIX: deliberately starts blank, NOT pre-filled from the current
    // nextDueDate — see the save() comment below for why that matters.
    manualNextDueDate: '',
  });

  useEffect(() => {
    if (!id || !defaultSiteReady) return;
    setAssetsReady(false);
    api<PMDetail>(`/pm-masters/${id}`).then(async (p) => {
      const siteId = await resolvePmSiteId(p, defaultSiteId);
      setPm(p);
      setForm({
        description: p.description,
        frequencyType: p.frequencyType,
        interval: String(p.interval ?? 1),
        intervalUnit: p.intervalUnit ?? 'MONTH',
        leadDays: String(p.leadDays ?? 7),
        priority: p.priority,
        siteId,
        assetId: p.assetId ?? '',
        jobPlanId: p.jobPlanId ?? '',
        status: p.status,
        manualNextDueDate: '',
      });
    }).catch((e) => {
      setError(String(e));
      setAssetsReady(true);
    });

    api<JobPlan[]>('/job-plans').then(setJobPlans).catch(() => {});
  }, [id, defaultSiteReady, defaultSiteId]);

  useEffect(() => {
    if (!pm) return;
    if (!form.siteId) {
      setAssets([]);
      setAssetsReady(true);
      return;
    }
    setAssetsReady(false);
    loadSiteAssets(form.siteId)
      .then(setAssets)
      .catch(() => setAssets([]))
      .finally(() => setAssetsReady(true));
  }, [pm, form.siteId]);

  useEffect(() => {
    if (form.assetId && assets.length > 0 && !assets.some((a) => a.id === form.assetId)) {
      setForm((f) => ({ ...f, assetId: '' }));
    }
  }, [assets, form.assetId]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setMsg('');
    try {
      // FIX: manualNextDueDate is only included when the admin actually
      // typed something into the new override field — sending it blank/
      // undefined lets the backend fall back to its normal behaviour
      // (recompute from frequency/interval if those changed, otherwise
      // leave the existing due date untouched). This is what makes
      // "change the description without accidentally resetting the due
      // date" possible at all — see the PUT /pm-masters/:id fix in pm.ts.
      await api(`/pm-masters/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          description: form.description,
          frequencyType: form.frequencyType,
          interval: parseInt(form.interval) || 1,
          intervalUnit: form.intervalUnit,
          leadDays: parseInt(form.leadDays) || 7,
          priority: form.priority,
          assetId: form.assetId || null,
          jobPlanId: form.jobPlanId || null,
          status: form.status,
          manualNextDueDate: form.manualNextDueDate || undefined,
        }),
      });
      setForm((f) => ({ ...f, manualNextDueDate: '' }));
      setMsg('PM master updated successfully.');
      const refreshed = await api<PMDetail>(`/pm-masters/${id}`);
      const siteId = await resolvePmSiteId(refreshed, defaultSiteId);
      setPm(refreshed);
      setForm((f) => ({ ...f, siteId }));
    } catch (e) {
      setError(String(e));
    } finally { setSaving(false); }
  };

  const generateWO = async () => {
    setGenerating(true); setError('');
    try {
      const wo = await api<{ woNum: string; id: string }>(`/pm-masters/${id}/generate-now`, { method: 'POST' });
      navigate(`/work-orders/${wo.id}`);
    } catch (e) {
      setError(String(e));
      setGenerating(false);
    }
  };

  if (!pm || !assetsReady) return <IdentityPageLayout title="Loading…" backTo="/pm" backLabel="Back to PM masters"><div /></IdentityPageLayout>;

  const isOverdue = pm.nextDueDate && new Date(pm.nextDueDate) < new Date();

  return (
    <IdentityPageLayout title={`PM Master — ${pm.pmNum}`} backTo="/pm" backLabel="Back to PM masters">
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {/* Status bar */}
      <div className="admin-section flex flex-wrap gap-4 items-center mb-0">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${pm.isActive ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
          {pm.status}
        </span>
        {pm.nextDueDate && (
          <span className={`text-sm ${isOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
            Next due: {new Date(pm.nextDueDate).toLocaleDateString()} {isOverdue && '— OVERDUE'}
          </span>
        )}
        <button
          type="button"
          className="btn-primary !w-auto px-4 ml-auto"
          onClick={generateWO}
          disabled={generating}
        >
          {generating ? 'Generating…' : 'Generate WO now'}
        </button>
      </div>

      {/* Edit form */}
      <form onSubmit={save}>
        <div className="admin-section grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
          <div className="col-span-2">
            <FormField label="Description *" htmlFor="pmDesc">
              <input id="pmDesc" className="form-input" required value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </FormField>
          </div>

          <FormField label="Status" htmlFor="pmStatus">
            <select id="pmStatus" className="form-input" value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {['ACTIVE', 'INACTIVE', 'DRAFT'].map((s) => <option key={s}>{s}</option>)}
            </select>
          </FormField>

          <FormField label="Priority" htmlFor="pmPriority">
            <select id="pmPriority" className="form-input" value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </FormField>

          <FormField label="Frequency type" htmlFor="freqType">
            <select id="freqType" className="form-input" value={form.frequencyType}
              onChange={(e) => setForm({ ...form, frequencyType: e.target.value })}>
              {FREQUENCY_TYPES.map((t) => <option key={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </FormField>

          <FormField label="Interval" htmlFor="interval">
            <input id="interval" type="number" min="1" className="form-input"
              value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })} />
          </FormField>

          <FormField label="Interval unit" htmlFor="intervalUnit">
            <select id="intervalUnit" className="form-input" value={form.intervalUnit}
              onChange={(e) => setForm({ ...form, intervalUnit: e.target.value })}>
              {INTERVAL_UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </FormField>

          <FormField label="Lead time (days)" htmlFor="leadDays">
            <input id="leadDays" type="number" min="0" className="form-input"
              value={form.leadDays} onChange={(e) => setForm({ ...form, leadDays: e.target.value })} />
          </FormField>

          {/* FIX: real bug found during PM Compliance testing — saving
              this form always recomputed nextDueDate relative to "right
              now" (since frequencyType/interval/intervalUnit are always
              submitted together), so there was no way to ever set or
              preserve a deliberate due date. This field is a genuine
              override: leave blank to keep the normal auto-recompute
              behaviour; fill it in to set nextDueDate to exactly that
              date on this save, regardless of frequency settings. */}
          <FormField label="Override next due date (optional)" htmlFor="manualNextDueDate" hint="Leave blank to auto-calculate from frequency/interval as usual.">
            <input id="manualNextDueDate" type="date" className="form-input"
              value={form.manualNextDueDate} onChange={(e) => setForm({ ...form, manualNextDueDate: e.target.value })} />
          </FormField>

          <FormField label="Asset" htmlFor="pmAsset">
            <select id="pmAsset" className="form-input" value={form.assetId}
              onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
              <option value="">— None —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.assetNum} – {a.description}</option>)}
            </select>
          </FormField>

          <FormField label="Job plan (required to Generate WO)" htmlFor="pmJP">
            <select id="pmJP" className="form-input" value={form.jobPlanId}
              onChange={(e) => setForm({ ...form, jobPlanId: e.target.value })}>
              <option value="">— None —</option>
              {jobPlans.map((j) => <option key={j.id} value={j.id}>{j.jpNum} – {j.description}</option>)}
            </select>
          </FormField>
        </div>

        <FormActions>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="btn-link" onClick={() => navigate('/pm')}>Cancel</button>
        </FormActions>
      </form>
      {/* Custom fields from config engine */}
      <DynamicFormRenderer
        entityName="PMaster"
        record={(pm as unknown as Record<string, unknown>) ?? {}}
        values={customData}
        onChange={(key, val) => setCustomData((prev) => ({ ...prev, [key]: val }))}
        readOnly
      />
    </IdentityPageLayout>
  );
}


