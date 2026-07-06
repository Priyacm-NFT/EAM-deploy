/**
 * JobPlanForm.tsx
 * Handles both /job-plans/new (create) and /job-plans/:id/edit (update).
 * When an :id route param is present, the existing job plan is loaded
 * and the submit button issues a PUT instead of a POST.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { IdentityPageLayout, FormField, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface JP { id: string; jpNum: string; description: string; longDescription: string | null; estimatedDurationHours: string | null }

export function JobPlanFormPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    description: '',
    longDescription: '',
    estimatedDurationHours: '',
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const jp = await api<JP>(`/job-plans/${id}`);
        setForm({
          description: jp.description ?? '',
          longDescription: jp.longDescription ?? '',
          estimatedDurationHours: jp.estimatedDurationHours ?? '',
        });
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) { setError('Description is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        description: form.description,
        longDescription: form.longDescription || undefined,
        estimatedDurationHours: form.estimatedDurationHours ? parseFloat(form.estimatedDurationHours) : undefined,
        customData,
      };
      if (isEdit) {
        await api(`/job-plans/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        navigate(`/job-plans/${id}`);
      } else {
        const created = await api<{ id: string }>('/job-plans', { method: 'POST', body: JSON.stringify(payload) });
        navigate(`/job-plans/${created.id}`);
      }
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <IdentityPageLayout title="Edit Job Plan" backTo="/job-plans" backLabel="Back to job plans">
        <p className="text-slate-400">Loading…</p>
      </IdentityPageLayout>
    );
  }

  return (
    <IdentityPageLayout title={isEdit ? 'Edit Job Plan' : 'New Job Plan'} backTo="/job-plans" backLabel="Back to job plans">
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

          <DynamicFormRenderer
            entityName="JobPlan"
            record={form}
            values={customData}
            onChange={(key, value) => setCustomData((prev) => ({ ...prev, [key]: value }))}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-2">
            <button type="button" className="btn-outline !w-auto px-6"
              onClick={() => navigate(isEdit ? `/job-plans/${id}` : '/job-plans')}>Cancel</button>
            <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
              {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save Changes' : 'Create Job Plan')}
            </button>
          </div>
        </div>
      </form>
    </IdentityPageLayout>
  );
}







