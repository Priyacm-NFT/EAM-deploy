import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { IdentityPageLayout, FormField, MessageBanner } from '../../components/identity/IdentityLayout.js';

// FIX (P1-6 gap — UI for AC-P1-6.6): this used to be a hardcoded const
// array — meaning even after the backend started reading permit types
// from permit_types_config, any *new* type an admin configured would
// never show up here, since this form never asked the API. Now fetches
// /admin/permit-types and falls back to the original 7 only if that
// call fails (e.g. before the seed migration has run).
const FALLBACK_PERMIT_TYPES = ['HOT_WORK','CONFINED_SPACE','ELECTRICAL','HEIGHT','EXCAVATION','CHEMICAL','GENERAL'];

interface PermitTypeConfig { id: string; type: string; label: string; maxValidityHours: number | null }

export function PermitFormPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const woId = searchParams.get('woId') ?? '';

  const [permitTypes, setPermitTypes] = useState<PermitTypeConfig[]>(
    FALLBACK_PERMIT_TYPES.map((t) => ({ id: t, type: t, label: t.replace(/_/g, ' '), maxValidityHours: null })),
  );

  useEffect(() => {
    api<PermitTypeConfig[]>('/admin/permit-types')
      .then((types) => { if (types.length > 0) setPermitTypes(types); })
      .catch(() => {});
  }, []);

  const [form, setForm] = useState({
    type: 'GENERAL',
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
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
              {permitTypes.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            {permitTypes.find((t) => t.type === form.type)?.maxValidityHours && (
              <p className="text-xs text-slate-500 mt-1">
                Max validity: {permitTypes.find((t) => t.type === form.type)?.maxValidityHours} hours from Valid From.
              </p>
            )}
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
