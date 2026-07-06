/**
 * PMForm.tsx — NEW file
 * Route: /pm/new
 * Creates a PM master and redirects to PM list.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { IdentityPageLayout, FormField, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { useActiveDefaultSite } from '../../hooks/useActiveDefaultSite.js';

interface Asset { id: string; assetNum: string; description: string }
interface JobPlan { id: string; jpNum: string; description: string }
interface PMRoute { id: string; name: string; assetCount: number }

const FREQUENCY_TYPES = ['CALENDAR', 'METER', 'CALENDAR_AND_METER', 'SEASONAL'] as const;
const INTERVAL_UNITS  = ['DAY', 'WEEK', 'MONTH', 'YEAR', 'HOUR'] as const;

export function PMFormPage() {
  const navigate = useNavigate();
  const { defaultSiteId } = useActiveDefaultSite();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [jobPlans, setJobPlans] = useState<JobPlan[]>([]);
  const [pmRoutesList, setPmRoutesList] = useState<PMRoute[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [form, setForm] = useState({
    description: '',
    frequencyType: 'CALENDAR' as typeof FREQUENCY_TYPES[number],
    // FIX: real bug found during PM Compliance testing — this form sent
    // `intervalValue`/`nextRunDate`/`leadTimeDays`/`estimatedDuration`,
    // but POST /pm-masters actually reads `interval`/`startDate`/
    // `leadDays` and doesn't look at estimatedDuration at all. Since the
    // wrong keys meant `interval` was always undefined server-side,
    // every new PM's due date silently computed as "today" regardless
    // of the frequency picked here — this is very likely why due dates
    // kept clustering around "now." Renamed the state fields to match
    // the real API field names directly, and wired manualNextDueDate as
    // a genuine override (see the same field on PMDetail.tsx's edit
    // form, and the backend comment in pm.ts).
    interval: '1',
    intervalUnit: 'MONTH' as typeof INTERVAL_UNITS[number],
    leadDays: '7',
    manualNextDueDate: '',
    priority: 'MEDIUM',
    assetId: '',
    jobPlanId: '',
    // FIX (P1-5 gap — UI): routeId lets this PM target a whole route
    // (many assets, one visit) instead of a single asset. targetMode is
    // purely a UI toggle — only one of assetId/routeId actually gets
    // sent, whichever the technician picked.
    routeId: '',
  });
  const [targetMode, setTargetMode] = useState<'asset' | 'route'>('asset');

  useEffect(() => {
    api<JobPlan[]>('/job-plans')
      .then((r) => setJobPlans(Array.isArray(r) ? r : ((r as { data: JobPlan[] }).data ?? [])))
      .catch(() => {});
    api<PMRoute[]>('/pm-routes').then(setPmRoutesList).catch(() => setPmRoutesList([]));
  }, []);

  useEffect(() => {
    if (!defaultSiteId) {
      setAssets([]);
      return;
    }
    const siteQuery = `siteId=${encodeURIComponent(defaultSiteId)}&`;
    api<{ data: Asset[] } | Asset[]>(`/assets?${siteQuery}pageSize=200`)
      .then((r) => setAssets(Array.isArray(r) ? r : (r as { data: Asset[] }).data ?? []))
      .catch(() => setAssets([]));
  }, [defaultSiteId]);

  useEffect(() => {
    if (form.assetId && assets.length > 0 && !assets.some((a) => a.id === form.assetId)) {
      setForm((f) => ({ ...f, assetId: '' }));
    }
  }, [assets, form.assetId]);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) { setError('Description is required'); return; }
    setSaving(true); setError('');
    try {
      await api('/pm-masters', {
        method: 'POST',
        body: JSON.stringify({
          description: form.description,
          frequencyType: form.frequencyType,
          interval: parseInt(form.interval) || 1,
          intervalUnit: form.intervalUnit,
          manualNextDueDate: form.manualNextDueDate || undefined,
          leadDays: parseInt(form.leadDays) || 7,
          priority: form.priority,
          siteId: defaultSiteId || undefined,
          assetId: targetMode === 'asset' ? (form.assetId || undefined) : undefined,
          routeId: targetMode === 'route' ? (form.routeId || undefined) : undefined,
          jobPlanId: form.jobPlanId || undefined,
          customData,
        }),
      });
      navigate('/pm');
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <IdentityPageLayout title="New PM Master" backTo="/pm" backLabel="Back to PM masters">
      {error && <MessageBanner type="error" text={error} />}
      <form onSubmit={handleSubmit}>
        <div className="admin-section grid grid-cols-2 gap-4 max-w-3xl">

          <div className="col-span-2">
            <FormField label="Description *" htmlFor="pmDesc">
              <input id="pmDesc" className="form-input" required
                placeholder="e.g. Monthly pump lubrication"
                value={form.description} onChange={set('description')} />
            </FormField>
          </div>

          <FormField label="Frequency type" htmlFor="freqType">
            <select id="freqType" className="form-input" value={form.frequencyType}
              onChange={(e) => setForm((f) => ({ ...f, frequencyType: e.target.value as typeof form.frequencyType }))}>
              {FREQUENCY_TYPES.map((t) => <option key={t}>{t.replace(/_/g,' ')}</option>)}
            </select>
          </FormField>

          <FormField label="Priority" htmlFor="pmPriority">
            <select id="pmPriority" className="form-input" value={form.priority} onChange={set('priority')}>
              {['LOW','MEDIUM','HIGH','EMERGENCY'].map((p) => <option key={p}>{p}</option>)}
            </select>
          </FormField>

          <FormField label="Interval" htmlFor="interval">
            <input id="interval" type="number" min="1" className="form-input"
              value={form.interval} onChange={set('interval')} />
          </FormField>

          <FormField label="Interval unit" htmlFor="intervalUnit">
            <select id="intervalUnit" className="form-input" value={form.intervalUnit}
              onChange={(e) => setForm((f) => ({ ...f, intervalUnit: e.target.value as typeof form.intervalUnit }))}>
              {INTERVAL_UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </FormField>

          {/* FIX: real due-date input, not just a computation seed —
              leave blank to let the backend calculate it from the
              frequency/interval above (starting from today), or set a
              specific date directly (e.g. to deliberately backdate a
              test PM, or because you already know the correct real due
              date). See the manualNextDueDate handling in pm.ts. */}
          <FormField label="Next due date (optional — leave blank to auto-calculate)" htmlFor="manualNextDueDate">
            <input id="manualNextDueDate" type="date" className="form-input"
              value={form.manualNextDueDate} onChange={set('manualNextDueDate')} />
          </FormField>

          <FormField label="Lead time (days)" htmlFor="leadDays">
            <input id="leadDays" type="number" min="0" className="form-input w-28"
              value={form.leadDays} onChange={set('leadDays')} />
          </FormField>

          <div className="col-span-2">
            <span className="form-label">Target</span>
            <div className="flex gap-4 mb-2">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={targetMode === 'asset'} onChange={() => setTargetMode('asset')} /> Single asset
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" checked={targetMode === 'route'} onChange={() => setTargetMode('route')} /> Route (many assets, one visit)
              </label>
            </div>
            {targetMode === 'asset' ? (
              <select id="pmAsset" className="form-input" value={form.assetId} onChange={set('assetId')}>
                <option value="">— None —</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.assetNum} – {a.description}</option>
                ))}
              </select>
            ) : (
              <>
                <select id="pmRoute" className="form-input" value={form.routeId} onChange={set('routeId')}>
                  <option value="">— Select a route —</option>
                  {pmRoutesList.map((r) => (
                    <option key={r.id} value={r.id}>{r.name} ({r.assetCount} asset{r.assetCount === 1 ? '' : 's'})</option>
                  ))}
                </select>
                {pmRoutesList.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    No routes yet — <a href="/pm-routes" className="text-accent hover:underline">create one</a> first.
                  </p>
                )}
              </>
            )}
          </div>

          <FormField label="Job plan" htmlFor="pmJP">
            <select id="pmJP" className="form-input" value={form.jobPlanId} onChange={set('jobPlanId')}>
              <option value="">— None —</option>
              {jobPlans.map((j) => (
                <option key={j.id} value={j.id}>{j.jpNum} – {j.description}</option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="admin-section max-w-3xl mt-4">
          <DynamicFormRenderer
            entityName="PMaster"
            record={form}
            values={customData}
            onChange={(key, value) => setCustomData((prev) => ({ ...prev, [key]: value }))}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-2">
          <button type="button" className="btn-outline !w-auto px-6" onClick={() => navigate('/pm')}>Cancel</button>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
            {saving ? 'Creating…' : 'Create PM Master'}
          </button>
        </div>
      </form>
    </IdentityPageLayout>
  );
}




