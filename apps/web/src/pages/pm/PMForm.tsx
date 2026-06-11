/**
 * PMForm.tsx — NEW file
 * Route: /pm/new
 * Creates a PM master and redirects to PM list.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { IdentityPageLayout, FormField, FormActions, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface Asset { id: string; assetNum: string; description: string }
interface JobPlan { id: string; jpNum: string; description: string }

const FREQUENCY_TYPES = ['CALENDAR', 'METER', 'CALENDAR_AND_METER', 'SEASONAL'] as const;
const INTERVAL_UNITS  = ['DAY', 'WEEK', 'MONTH', 'YEAR', 'HOUR'] as const;

export function PMFormPage() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [jobPlans, setJobPlans] = useState<JobPlan[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [form, setForm] = useState({
    description: '',
    frequencyType: 'CALENDAR' as typeof FREQUENCY_TYPES[number],
    intervalValue: '1',
    intervalUnit: 'MONTH' as typeof INTERVAL_UNITS[number],
    nextRunDate: '',
    leadTimeDays: '7',
    priority: 'MEDIUM',
    assetId: '',
    jobPlanId: '',
    estimatedDuration: '',
  });

  useEffect(() => {
    api<{ data: Asset[] } | Asset[]>('/assets?pageSize=200')
      .then((r) => setAssets(Array.isArray(r) ? r : (r as { data: Asset[] }).data ?? []))
      .catch(() => {});
    api<JobPlan[]>('/job-plans')
      .then(setJobPlans)
      .catch(() => {});
  }, []);

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
          intervalValue: parseInt(form.intervalValue) || 1,
          intervalUnit: form.intervalUnit,
          nextRunDate: form.nextRunDate || undefined,
          leadTimeDays: parseInt(form.leadTimeDays) || 7,
          priority: form.priority,
          assetId: form.assetId || undefined,
          jobPlanId: form.jobPlanId || undefined,
          estimatedDuration: form.estimatedDuration ? parseFloat(form.estimatedDuration) : undefined,
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
              value={form.intervalValue} onChange={set('intervalValue')} />
          </FormField>

          <FormField label="Interval unit" htmlFor="intervalUnit">
            <select id="intervalUnit" className="form-input" value={form.intervalUnit}
              onChange={(e) => setForm((f) => ({ ...f, intervalUnit: e.target.value as typeof form.intervalUnit }))}>
              {INTERVAL_UNITS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </FormField>

          <FormField label="Next run date" htmlFor="nextRun">
            <input id="nextRun" type="date" className="form-input"
              value={form.nextRunDate} onChange={set('nextRunDate')} />
          </FormField>

          <FormField label="Lead time (days)" htmlFor="leadDays">
            <input id="leadDays" type="number" min="0" className="form-input w-28"
              value={form.leadTimeDays} onChange={set('leadTimeDays')} />
          </FormField>

          <FormField label="Asset" htmlFor="pmAsset">
            <select id="pmAsset" className="form-input" value={form.assetId} onChange={set('assetId')}>
              <option value="">— None —</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>{a.assetNum} – {a.description}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Job plan" htmlFor="pmJP">
            <select id="pmJP" className="form-input" value={form.jobPlanId} onChange={set('jobPlanId')}>
              <option value="">— None —</option>
              {jobPlans.map((j) => (
                <option key={j.id} value={j.id}>{j.jpNum} – {j.description}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Estimated duration (hours)" htmlFor="pmDur">
            <input id="pmDur" type="number" step="0.5" min="0" className="form-input w-32"
              value={form.estimatedDuration} onChange={set('estimatedDuration')} />
          </FormField>
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




