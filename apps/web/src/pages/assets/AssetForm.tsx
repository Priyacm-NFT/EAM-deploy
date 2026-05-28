import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import {
  IdentityPageLayout,
  FormField,
  FormActions,
  MessageBanner,
} from '../../components/identity/IdentityLayout.js';

interface Location { id: string; name: string; code: string }
interface AssetClass { id: string; classCode: string; description: string }
interface Asset {
  id: string; assetNum: string; description: string; status: string;
  criticality: string | null; manufacturer: string | null; model: string | null;
  serialNum: string | null; locationId: string | null; classId: string | null;
  installDate: string | null; warrantyExpiry: string | null;
  purchaseCost: string | null; replacementCost: string | null; notes: string | null;
}

export function AssetFormPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();

  const [locations, setLocations] = useState<Location[]>([]);
  const [classes, setClasses] = useState<AssetClass[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    assetNum: '', description: '', status: 'OPERATING', criticality: 'MEDIUM',
    manufacturer: '', model: '', serialNum: '', locationId: '', classId: '',
    installDate: '', warrantyExpiry: '', purchaseCost: '', replacementCost: '', notes: '',
  });

  useEffect(() => {
    Promise.all([
      api<Location[]>('/locations'),
      api<AssetClass[]>('/asset-classifications'),
    ]).then(([locs, cls]) => {
      setLocations(locs);
      setClasses(cls);
    }).catch((e) => setError(String(e)));

    if (!isNew) {
      api<Asset>(`/assets/${id}`).then((a) => {
        setForm({
          assetNum: a.assetNum, description: a.description, status: a.status,
          criticality: a.criticality ?? 'MEDIUM', manufacturer: a.manufacturer ?? '',
          model: a.model ?? '', serialNum: a.serialNum ?? '',
          locationId: a.locationId ?? '', classId: a.classId ?? '',
          installDate: a.installDate ? a.installDate.slice(0, 10) : '',
          warrantyExpiry: a.warrantyExpiry ? a.warrantyExpiry.slice(0, 10) : '',
          purchaseCost: a.purchaseCost ?? '', replacementCost: a.replacementCost ?? '',
          notes: a.notes ?? '',
        });
      }).catch((e) => setError(String(e)));
    }
  }, [id, isNew]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        locationId: form.locationId || undefined,
        classId: form.classId || undefined,
        installDate: form.installDate || undefined,
        warrantyExpiry: form.warrantyExpiry || undefined,
        purchaseCost: form.purchaseCost || undefined,
        replacementCost: form.replacementCost || undefined,
        notes: form.notes || undefined,
      };
      if (isNew) {
        const created = await api<{ id: string }>('/assets', { method: 'POST', body: JSON.stringify(payload) });
        navigate(`/assets/${created.id}`);
      } else {
        await api(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
        navigate(`/assets/${id}`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <IdentityPageLayout
      title={isNew ? 'New Asset' : 'Edit Asset'}
      backTo={isNew ? '/assets' : `/assets/${id}`}
      backLabel={isNew ? 'Back to assets' : 'Back to asset'}
    >
      {error && <MessageBanner type="error" text={error} />}

      <div className="admin-section grid grid-cols-2 gap-4">
        <FormField label="Asset number" htmlFor="assetNum">
          <input id="assetNum" className="form-input" value={form.assetNum} onChange={(e) => set('assetNum', e.target.value)} placeholder="Auto-generated if blank" />
        </FormField>
        <FormField label="Description *" htmlFor="desc">
          <input id="desc" className="form-input" required value={form.description} onChange={(e) => set('description', e.target.value)} />
        </FormField>
        <FormField label="Status" htmlFor="status">
          <select id="status" className="form-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {['OPERATING', 'IDLE', 'UNDER_MAINTENANCE', 'DECOMMISSIONED', 'DISPOSED'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </FormField>
        <FormField label="Criticality" htmlFor="criticality">
          <select id="criticality" className="form-input" value={form.criticality} onChange={(e) => set('criticality', e.target.value)}>
            {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="Class" htmlFor="classId">
          <select id="classId" className="form-input" value={form.classId} onChange={(e) => set('classId', e.target.value)}>
            <option value="">— Select class —</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.classCode} – {c.description}</option>)}
          </select>
        </FormField>
        <FormField label="Location" htmlFor="locationId">
          <select id="locationId" className="form-input" value={form.locationId} onChange={(e) => set('locationId', e.target.value)}>
            <option value="">— Select location —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} – {l.name}</option>)}
          </select>
        </FormField>
        <FormField label="Manufacturer" htmlFor="manufacturer">
          <input id="manufacturer" className="form-input" value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} />
        </FormField>
        <FormField label="Model" htmlFor="model">
          <input id="model" className="form-input" value={form.model} onChange={(e) => set('model', e.target.value)} />
        </FormField>
        <FormField label="Serial number" htmlFor="serialNum">
          <input id="serialNum" className="form-input" value={form.serialNum} onChange={(e) => set('serialNum', e.target.value)} />
        </FormField>
        <FormField label="Install date" htmlFor="installDate">
          <input id="installDate" type="date" className="form-input" value={form.installDate} onChange={(e) => set('installDate', e.target.value)} />
        </FormField>
        <FormField label="Warranty expiry" htmlFor="warrantyExpiry">
          <input id="warrantyExpiry" type="date" className="form-input" value={form.warrantyExpiry} onChange={(e) => set('warrantyExpiry', e.target.value)} />
        </FormField>
        <FormField label="Purchase cost" htmlFor="purchaseCost">
          <input id="purchaseCost" type="number" step="0.01" className="form-input" value={form.purchaseCost} onChange={(e) => set('purchaseCost', e.target.value)} />
        </FormField>
        <FormField label="Replacement cost" htmlFor="replacementCost">
          <input id="replacementCost" type="number" step="0.01" className="form-input" value={form.replacementCost} onChange={(e) => set('replacementCost', e.target.value)} />
        </FormField>
        <div className="col-span-2">
          <FormField label="Notes" htmlFor="notes">
            <textarea id="notes" className="form-input" rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </FormField>
        </div>
      </div>

      <FormActions>
        <button type="button" className="btn-primary !w-auto px-6" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-link" onClick={() => navigate(isNew ? '/assets' : `/assets/${id}`)}>
          Cancel
        </button>
      </FormActions>
    </IdentityPageLayout>
  );
}
