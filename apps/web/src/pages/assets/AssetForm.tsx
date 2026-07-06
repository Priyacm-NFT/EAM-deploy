import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import {
  IdentityPageLayout,
  FormField,
  MessageBanner,
} from '../../components/identity/IdentityLayout.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { useActiveDefaultSite } from '../../hooks/useActiveDefaultSite.js';

interface Location { id: string; name: string; code: string }
interface AssetOption { id: string; assetNum: string; description: string }
// FIX (Sheet row 1/10 gap — item-match validation on Move and
// Classification-attribute inheritance both key off asset.itemId): but
// nothing in the Asset form ever let anyone set it — the field only ever
// got populated indirectly, via the IAS "Create from Assembly" flow. This
// is the missing "Item" picker so a plain Asset edit can link/relink its
// Rotating Item directly, same as every other lookup field on this form.
interface ItemOption { id: string; itemNum: string; description: string }
interface Asset {
  id: string; assetNum: string; description: string; status: string;
  criticality: string | null; manufacturer: string | null; model: string | null;
  serialNum: string | null; locationId: string | null; classId: string | null;
  parentAssetId: string | null;
  itemId: string | null;
  isLinear?: boolean;
  lengthUnit: string | null;
  totalLength: string | null;
  isRotating: boolean;
  assetType?: 'NORMAL' | 'STRUCTURAL';
  installDate: string | null; warrantyExpiry: string | null;
  purchaseCost: string | null; replacementCost: string | null; notes: string | null;
}

export function AssetFormPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { defaultSiteId } = useActiveDefaultSite();

  const [locations, setLocations] = useState<Location[]>([]);
  // FIX: candidate Items for the new "Item" (Rotating Item) dropdown —
  // same loaded-once-up-front pattern as locations/classes above.
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  // FIX: list of candidate parent assets for the "Parent Asset" dropdown —
  // this is the same role as Maximo's "Move/Modify" action that assigns a
  // Parent to the current asset, making it a Subassembly of that parent.
  // Loaded once on page load so every existing asset is already sitting in
  // the dropdown — no typing/searching needed, just open and click.
  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  const [form, setForm] = useState({
    assetNum: '', description: '', status: 'OPERATING', criticality: 'MEDIUM',
    manufacturer: '', model: '', serialNum: '', locationId: '', classId: '',
    parentAssetId: '', itemId: '',
    // FIX: rotating-asset flag. A rotating asset is interchangeable and
    // trackable as it moves between locations — checking this means a
    // future "Move" of this asset will also roll its Site/Org forward to
    // match wherever it's currently in use, instead of staying tied to
    // one fixed Site/Org for life.
    isRotating: false,
    // FIX (Sheet row 7 — Structural vs Normal (PBS) asset type field):
    // STRUCTURAL = fixed infrastructure (building, cabinet frame, room)
    // that can never be Moved; NORMAL = ordinary installable/removable
    // equipment. Defaults to NORMAL — matches the DB column's own
    // default, so leaving this untouched keeps today's behaviour.
    assetType: 'NORMAL' as 'NORMAL' | 'STRUCTURAL',
    isLinear: false,
    lengthUnit: '',
    totalLength: '',
    installDate: '', warrantyExpiry: '', purchaseCost: '', replacementCost: '', notes: '',
  });

  useEffect(() => {
    // FIX: these three were combined into one Promise.all with a single
    // shared .catch() that set a page-wide error banner — if even one
    // of them 403'd (e.g. a scoped user without a permission on
    // /asset-classifications specifically, separate from their
    // assets:read/write permissions), the whole page showed "Error:
    // Forbidden" even though the page itself, and asset creation, both
    // worked fine. Each lookup now fails independently and silently
    // (falls back to an empty list, same as the Parent Asset dropdown
    // below already does) instead of one optional lookup blocking the
    // whole form with a scary top-level error.
    if (!isNew) {
      api<Location[]>('/locations').then(setLocations).catch(() => setLocations([]));
    }
    api<{ data: ItemOption[] } | ItemOption[]>('/items?pageSize=500')
      .then((itemsResp) => setItemOptions(Array.isArray(itemsResp) ? itemsResp : itemsResp.data ?? []))
      .catch(() => setItemOptions([]));

    if (isNew) {
      api<{ assetCode: string }>('/assets/next-code')
        .then((r) => setForm((f) => ({ ...f, assetNum: r.assetCode })))
        .catch(() => {});
    } else {
      api<Asset>(`/assets/${id}`).then((a) => {
        setForm({
          assetNum: a.assetNum, description: a.description, status: a.status,
          criticality: a.criticality ?? 'MEDIUM', manufacturer: a.manufacturer ?? '',
          model: a.model ?? '', serialNum: a.serialNum ?? '',
          locationId: a.locationId ?? '', classId: a.classId ?? '',
          parentAssetId: a.parentAssetId ?? '', itemId: a.itemId ?? '',
          isRotating: a.isRotating ?? false,
          assetType: a.assetType ?? 'NORMAL',
          isLinear: a.isLinear ?? false,
          lengthUnit: a.lengthUnit ?? '',
          totalLength: a.totalLength ?? '',
          installDate: a.installDate ? a.installDate.slice(0, 10) : '',
          warrantyExpiry: a.warrantyExpiry ? a.warrantyExpiry.slice(0, 10) : '',
          purchaseCost: a.purchaseCost ?? '', replacementCost: a.replacementCost ?? '',
          notes: a.notes ?? '',
        });
      }).catch((e) => setError(String(e)));
    }
  }, [id, isNew]);

  useEffect(() => {
    if (!isNew) return;
    const params = defaultSiteId ? `?siteId=${defaultSiteId}` : '';
    api<Location[]>(`/locations${params}`)
      .then(setLocations)
      .catch(() => setLocations([]));
  }, [isNew, defaultSiteId]);

  useEffect(() => {
    if (!isNew || !form.locationId) return;
    if (locations.length > 0 && !locations.some((l) => l.id === form.locationId)) {
      setForm((f) => ({ ...f, locationId: '' }));
    }
  }, [locations, defaultSiteId, isNew, form.locationId]);

  // FIX: load every asset once on page load so the "Parent asset" dropdown
  // already has the full list ready — open it and click, no typing needed.
  // pageSize is generous (500) so the dropdown has the whole asset register;
  // for very large registries this is the one place to add a search-box
  // variant back in, but for a normal-sized register a plain dropdown is
  // simpler and matches "already iruka assets ellam inga vantha directa
  // parent asset click pannikalam."
  useEffect(() => {
    const siteQuery = isNew && defaultSiteId ? `siteId=${defaultSiteId}&` : '';
    api<{ data: AssetOption[] } | AssetOption[]>(`/assets?${siteQuery}pageSize=500`)
      .then((r) => {
        const list = Array.isArray(r) ? r : r.data ?? [];
        setAssetOptions(list.filter((a) => a.id !== id));
      })
      .catch(() => setAssetOptions([]));
  }, [id, isNew, defaultSiteId]);

  useEffect(() => {
    if (!isNew || !form.parentAssetId) return;
    if (assetOptions.length > 0 && !assetOptions.some((a) => a.id === form.parentAssetId)) {
      setForm((f) => ({ ...f, parentAssetId: '' }));
    }
  }, [assetOptions, defaultSiteId, isNew, form.parentAssetId]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        locationId: form.locationId || undefined,
        classId: form.classId || undefined,
        // FIX: same "send null explicitly when cleared on an existing
        // asset" treatment as parentAssetId below — otherwise unlinking
        // an Item (clearing the dropdown back to "— none —") would be
        // silently dropped as undefined and the old itemId would stick.
        itemId: form.itemId || (isNew ? undefined : null),
        // FIX (Sheet row 13 — Linear Assets): don't send an empty string
        // for a numeric column — Postgres would reject "" for `numeric`.
        // Same clear-on-edit treatment as itemId/parentAssetId above.
        lengthUnit: form.lengthUnit || (isNew ? undefined : null),
        totalLength: form.totalLength || (isNew ? undefined : null),
        // FIX: send null explicitly when cleared, so removing a parent
        // assignment on an existing asset actually clears it server-side
        // instead of being dropped as "undefined" and ignored.
        parentAssetId: form.parentAssetId || (isNew ? undefined : null),
        installDate: form.installDate || undefined,
        warrantyExpiry: form.warrantyExpiry || undefined,
        purchaseCost: form.purchaseCost || undefined,
        replacementCost: form.replacementCost || undefined,
        notes: form.notes || undefined,
        customData,
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
        {/* FIX: previously showed a disabled "Auto-generated" box on
            create — even greyed out, an empty box with a label still
            reads as "a field you're expected to interact with". Removed
            entirely for create: nothing to look at, nothing to fill in,
            the number is simply assigned sequentially (AST-00001,
            AST-00042, ...) when the form is saved. Description now takes
            the full row on create since there's no longer a field
            sharing it. On edit, the existing Asset # is still shown
            (read-only — an asset's number is treated as immutable once
            assigned, same as Maximo). */}
        {isNew ? (
          <FormField label="Asset Code" htmlFor="assetCode">
            <input
              id="assetCode"
              className="form-input bg-slate-50 text-slate-500"
              value={form.assetNum}
              disabled
              readOnly
              tabIndex={-1}
              onPaste={(e) => e.preventDefault()}
            />
          </FormField>
        ) : (
          <FormField label="Asset #" htmlFor="assetNum">
            <input id="assetNum" className="form-input bg-slate-50 text-slate-500" value={form.assetNum} disabled readOnly />
          </FormField>
        )}
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
        {/* FIX: removed the manual Class picker that used to be here.
            Classification is actually driven by the linked Item —
            the asset's own Classification tab has a "Sync from Item"
            action that pulls the class (and its spec attributes) from
            whatever Item is linked via the field below. A standalone
            manual Class dropdown at create time was redundant with
            that, and worse, could leave classId set to something that
            doesn't match what Sync from Item would derive, since
            nothing kept the two in sync with each other. */}
        {/* FIX (Sheet row 1/10 — Item-match validation on Move, and
            Classification attribute inheritance): both features key off
            asset.itemId, which this form never exposed before — the only
            way it ever got set was indirectly, through the IAS "Create
            from Assembly" flow. This lets any asset link/relink its
            Item (Maximo calls this the "Rotating Item") directly. */}
        <FormField label="Item (Rotating Item)" htmlFor="itemId" hint="Which Item/part this asset represents — drives item-match validation on Move (CM Locations) and Classification-tab syncing.">
          <select id="itemId" className="form-input" value={form.itemId} onChange={(e) => set('itemId', e.target.value)}>
            <option value="">— No linked Item —</option>
            {itemOptions.map((it) => <option key={it.id} value={it.id}>{it.itemNum} — {it.description}</option>)}
          </select>
        </FormField>
        <FormField label="Location" htmlFor="locationId">
          <select id="locationId" className="form-input" value={form.locationId} onChange={(e) => set('locationId', e.target.value)}>
            <option value="">— Select location —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
          </select>
        </FormField>

        {/* ── Parent Asset dropdown ── */}
        {/* FIX: this is the Maximo-equivalent "Parent" field. Assigning an
            asset here makes the CURRENT asset a Subassembly/child of the
            selected parent. The parent's own "Subassemblies" list (on its
            Asset Detail page) will then show this asset. Plain dropdown —
            every existing asset is already in the list, just open and
            click, no searching/typing required. */}
        <div className="col-span-2">
          <FormField label="Parent asset" htmlFor="parentAsset" hint="Makes this asset a sub-asset (subassembly) of the selected parent — like Maximo's Parent field.">
            <select
              id="parentAsset"
              className="form-input"
              value={form.parentAssetId}
              onChange={(e) => set('parentAssetId', e.target.value)}
            >
              <option value="">— No parent (top-level asset) —</option>
              {assetOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.assetNum} — {a.description}</option>
              ))}
            </select>
          </FormField>
        </div>

        {/* ── Rotating asset toggle ── */}
        <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-accent focus:ring-accent"
            checked={form.isRotating}
            onChange={(e) => setForm((f) => ({ ...f, isRotating: e.target.checked }))}
          />
          Rotating asset
        </label>

        <FormField label="Asset Type" htmlFor="assetType">
          <select
            id="assetType"
            className="form-select"
            value={form.assetType}
            onChange={(e) => setForm((f) => ({ ...f, assetType: e.target.value as 'NORMAL' | 'STRUCTURAL' }))}
          >
            <option value="NORMAL">Normal — installable/removable equipment</option>
            <option value="STRUCTURAL">Structural — fixed infrastructure, cannot be moved</option>
          </select>
        </FormField>

        {/* ── Linear asset toggle ── */}
        <label className="flex items-center gap-2 text-sm text-slate-800 cursor-pointer">
          <input
            type="checkbox"
            className="rounded border-slate-300 text-accent focus:ring-accent"
            checked={form.isLinear}
            onChange={(e) => setForm((f) => ({ ...f, isLinear: e.target.checked }))}
          />
          Linear asset
        </label>
        {form.isLinear && (
          <>
            <FormField label="Length unit" htmlFor="lengthUnit">
              <select id="lengthUnit" className="form-input" value={form.lengthUnit} onChange={(e) => set('lengthUnit', e.target.value)}>
                <option value="">— Select unit —</option>
                <option value="m">Meters (m)</option>
                <option value="km">Kilometers (km)</option>
                <option value="ft">Feet (ft)</option>
                <option value="mi">Miles (mi)</option>
              </select>
            </FormField>
            <FormField label="Total length" htmlFor="totalLength">
              <input id="totalLength" type="number" step="0.001" min="0" className="form-input" value={form.totalLength} onChange={(e) => set('totalLength', e.target.value)} placeholder="e.g. 4.250" />
            </FormField>
          </>
        )}

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

      <DynamicFormRenderer
        entityName="Asset"
        record={form as unknown as Record<string, unknown>}
        values={customData}
        onChange={(key, val) => setCustomData((prev) => ({ ...prev, [key]: val }))}
      />

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-2">
        <button type="button" className="btn-outline !w-auto px-6"
          onClick={() => navigate(isNew ? '/assets' : `/assets/${id}`)}>
          Cancel
        </button>
        <button type="button" className="btn-primary !w-auto px-6" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </IdentityPageLayout>
  );
}
