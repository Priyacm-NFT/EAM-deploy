import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { IdentityPageLayout, FormField, MessageBanner } from '../../components/identity/IdentityLayout.js';

const PERMIT_TYPES = ['HOT_WORK','CONFINED_SPACE','ELECTRICAL','HEIGHT','EXCAVATION','CHEMICAL','GENERAL'] as const;

export function PermitFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const woId = searchParams.get('woId') ?? '';

  const [form, setForm] = useState({
    type: 'GENERAL' as typeof PERMIT_TYPES[number],
    description: '',
    validFrom: '',
    validTo: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) { setError('Description is required'); return; }
    setSaving(true); setError('');
    try {
      const created = await api<{ id: string }>('/permits', {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          description: form.description,
          validFrom: form.validFrom || undefined,
          validTo: form.validTo || undefined,
          notes: form.notes || undefined,
          woId: woId || undefined,
        }),
      });
      // Navigate back to WO if came from WO, else to permit detail
      if (woId) {
        navigate(`/work-orders/${woId}`);
      } else {
        navigate(`/permits/${created.id}`);
      }
    } catch (e) {
      setError(String(e));
      setSaving(false);
    }
  };

  return (
    <IdentityPageLayout title="New Permit to Work" backTo={woId ? `/work-orders/${woId}` : '/permits'} backLabel={woId ? 'Back to work order' : 'Back to permits'}>
      {error && <MessageBanner type="error" text={error} />}
      {woId && <p className="text-sm text-blue-600 mb-4">This permit will be linked to Work Order.</p>}
      <form onSubmit={handleSubmit}>
        <div className="admin-section space-y-4 max-w-2xl">
          <FormField label="Permit type *" htmlFor="ptype">
            <select id="ptype" className="form-input" value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as typeof form.type }))}>
              {PERMIT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </FormField>

          <FormField label="Description / scope of work *" htmlFor="pdesc">
            <textarea id="pdesc" className="form-input" rows={3} required
              placeholder="Describe the work being permitted…"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Valid from" htmlFor="pfrom">
              <input id="pfrom" type="datetime-local" className="form-input"
                value={form.validFrom} onChange={set('validFrom')} />
            </FormField>
            <FormField label="Valid to" htmlFor="pto">
              <input id="pto" type="datetime-local" className="form-input"
                value={form.validTo} onChange={set('validTo')} />
            </FormField>
          </div>

          <FormField label="Notes" htmlFor="pnotes">
            <textarea id="pnotes" className="form-input" rows={2}
              placeholder="Precautions, additional information…"
              value={form.notes} onChange={set('notes')} />
          </FormField>

          <DynamicFormRenderer
            entityName="Permit"
            record={{}}
            values={customData}
            onChange={(key, val) => setCustomData((prev) => ({ ...prev, [key]: val }))}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-2">
            <button type="button" className="btn-outline !w-auto px-6"
              onClick={() => woId ? navigate(`/work-orders/${woId}`) : navigate('/permits')}>Cancel</button>
            <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
              {saving ? 'Creating…' : 'Create Permit'}
            </button>
          </div>
        </div>
      </form>
    </IdentityPageLayout>
  );
}
