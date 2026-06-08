/**
 * JobPlanForm.tsx
 * NEW file — handles /job-plans/new
 * Creates a job plan then redirects to its detail page.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { IdentityPageLayout, FormField, MessageBanner } from '../../components/identity/IdentityLayout.js';

export function JobPlanFormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    description: '',
    longDescription: '',
    estimatedDurationHours: '',
  });
  const [saving, setSaving] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) { setError('Description is required'); return; }
    setSaving(true); setError('');
    try {
      const created = await api<{ id: string }>('/job-plans', {
        method: 'POST',
        body: JSON.stringify({
          description: form.description,
          longDescription: form.longDescription || undefined,
          estimatedDurationHours: form.estimatedDurationHours ? parseFloat(form.estimatedDurationHours) : undefined,
        }),
      });
      navigate(`/job-plans/${created.id}`);
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <IdentityPageLayout title="New Job Plan" backTo="/job-plans" backLabel="Back to job plans">
      {error && <MessageBanner type="error" text={error} />}
      <form onSubmit={handleSubmit}>
        <div className="admin-section space-y-4 max-w-2xl">
          <FormField label="Description *" htmlFor="desc">
            <input id="desc" className="form-input" required
              placeholder="e.g. Monthly pump inspection"
              value={form.description} onChange={set('description')} />
          </FormField>

          <FormField label="Long description" htmlFor="longDesc">
            <textarea id="longDesc" className="form-input" rows={3}
              placeholder="Detailed scope of work…"
              value={form.longDescription} onChange={set('longDescription')} />
          </FormField>

          <FormField label="Estimated duration (hours)" htmlFor="estHrs">
            <input id="estHrs" type="number" step="0.5" min="0" className="form-input w-40"
              placeholder="e.g. 2.5"
              value={form.estimatedDurationHours} onChange={set('estimatedDurationHours')} />
          </FormField>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
              {saving ? 'Creating…' : 'Create Job Plan'}
            </button>
            <button type="button" className="btn-secondary !w-auto px-4"
              onClick={() => navigate('/job-plans')}>Cancel</button>
          </div>
        </div>
      </form>
    </IdentityPageLayout>
  );
}



