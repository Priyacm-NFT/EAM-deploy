import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';
import { useActiveDefaultSite } from '../../hooks/useActiveDefaultSite.js';

interface Location {
  id: string;
  name: string;
  code: string;
  type: string;
  parentId: string | null;
  siteId?: string | null;
  isActive?: boolean;
  children?: Location[];
}

interface ItemOption { id: string; itemNum: string; description: string; }

// FIX (Sheet row 17): mirrors the backend's derivePosition in assets.ts
// — shown live in the form as the admin types either the Code or Name
// field, so they see exactly what will be auto-filled before saving,
// and can still type their own value to override it. Tries Code first,
// falls back to Name when Code has no usable underscore/hyphen
// separator — an admin who types the segmented identifier into Name
// instead of Code still gets the derivation.
function derivePosition(code: string, name: string): string | null {
  return derivePositionFromSegmentedString(code) ?? derivePositionFromSegmentedString(name);
}

function derivePositionFromSegmentedString(value: string): string | null {
  const trimmed = value.trim();
  const separator = trimmed.includes('_') ? '_' : trimmed.includes('-') ? '-' : null;
  if (!separator) return null;
  const segments = trimmed.split(separator);
  const last = segments[segments.length - 1];
  return last && last.trim() ? last.trim() : null;
}

function flattenTree(nodes: Location[], depth = 0): (Location & { depth: number })[] {
  return nodes.flatMap((n) => [
    { ...n, depth },
    ...(n.children ? flattenTree(n.children, depth + 1) : []),
  ]);
}

function LocationNode({ node, depth = 0 }: { node: Location; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  return (
    <div style={{ paddingLeft: `${depth * 20}px` }}>
      <div className="flex items-center gap-2 py-1 hover:bg-slate-50 rounded px-2">
        {node.children && node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-slate-400 hover:text-slate-700 w-4 text-center"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▼' : '▶'}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <span className="text-xs font-mono text-slate-400 w-24">{node.code}</span>
        <Link to={`/locations/${node.id}`} className="text-sm text-slate-700 hover:text-blue-600">
          {node.name}
        </Link>
        <span className="text-xs text-slate-400">{node.type}</span>
        {/* FIX: this is the "history" view the location list needed —
            deactivated locations were previously either invisible
            entirely (once includeInactive support existed) or
            indistinguishable from active ones. Clicking through still
            opens the same LocationDetailPage — a deactivated record's
            full detail, not a stripped-down "trash" view. */}
        {node.isActive === false && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">
            Inactive
          </span>
        )}
      </div>
      {expanded && node.children?.map((child) => (
        <LocationNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function LocationTreePage() {
  const { defaultSiteId, defaultSite } = useActiveDefaultSite();
  const [tree, setTree] = useState<Location[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', code: '', type: 'FLOOR', parentId: '',
    isCmLocation: false, cmItemId: '', assetRequired: false, position: '',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  function loadTree(includeInactive: boolean, siteId: string | null) {
    if (!siteId) {
      setTree([]);
      return;
    }
    const params = new URLSearchParams({ tree: 'true', siteId });
    if (includeInactive) params.set('includeInactive', 'true');
    api<Location[]>(`/locations?${params}`)
      .then(setTree)
      .catch((e) => setError(String(e)));
  }

  useEffect(() => {
    loadTree(showInactive, defaultSiteId);
    api<{ data: ItemOption[] } | ItemOption[]>('/items?pageSize=200')
      .then((r) => setItems(Array.isArray(r) ? r : (r as { data: ItemOption[] }).data ?? []))
      .catch(() => setItems([]));
  }, [showInactive, defaultSiteId]);

  const save = async () => {
    if (!defaultSiteId) {
      setError('No active site selected. Set a Default Insert Site in Default Information.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api('/locations', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          parentId: form.parentId || undefined,
          siteId: defaultSiteId,
          cmItemId: form.isCmLocation ? (form.cmItemId || undefined) : undefined,
          position: form.position.trim() || undefined,
        }),
      });
      setSuccess('Location created');
      setShowForm(false);
      setForm({ name: '', code: '', type: 'FLOOR', parentId: '', isCmLocation: false, cmItemId: '', assetRequired: false, position: '' });
      loadTree(showInactive, defaultSiteId);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <IdentityPageLayout
      title="Locations"
      subtitle={defaultSite
        ? `Hierarchical structure for ${defaultSite.siteNum} — ${defaultSite.name}`
        : 'Hierarchical site / building / floor / area structure'}
    >
      {error && <MessageBanner type="error" text={error} />}
      {success && <MessageBanner type="success" text={success} />}

      <div className="admin-section">
        <div className="flex justify-between items-center mb-3">
          <h2 className="admin-section-title">Location hierarchy</h2>
          <button type="button" className="btn-primary !w-auto px-4" onClick={() => setShowForm(!showForm)}>
            + Add location
          </button>
        </div>

        {showForm && (
          <div className="bg-slate-50 border border-slate-200 rounded p-4 mb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="form-label">Name</span>
              <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="block">
              {/* FIX: Code was a required-looking manual field with no
                  indication it could be left blank — the backend now
                  auto-generates a sequential LOC-00001 style code the
                  same way assets already do. Left as an editable field
                  (unlike Asset #, which is fully hidden on create) since
                  a real, meaningful code (e.g. matching an existing
                  facility numbering scheme) is genuinely useful for
                  locations, and the Position field's auto-derivation
                  below still reads from whatever's typed here. */}
              <span className="form-label">Code <span className="text-xs text-slate-400 font-normal">(optional — auto-generated if left blank)</span></span>
              {/* FIX: manual entry stays allowed (auto-generation only
                  fills in when this is left blank), but whatever's typed
                  is now forced to uppercase as you type — codes are
                  meant to be a short alphanumeric identifier (matching
                  the LOC-00001 auto-generated style), and letting
                  "loc-1" and "LOC-1" both exist as distinct codes would
                  just be a source of duplicate-looking, inconsistent
                  location codes down the line. */}
              <input
                className="form-input" value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. LOC-00001"
              />
            </label>
            <label className="block">
              <span className="form-label">
                Position {!form.position && derivePosition(form.code, form.name) && (
                  <span className="text-xs text-slate-400">(auto: "{derivePosition(form.code, form.name)}" from {derivePositionFromSegmentedString(form.code) ? 'code' : 'name'})</span>
                )}
              </span>
              <input
                className="form-input"
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                placeholder={derivePosition(form.code, form.name) ?? 'e.g. SLOT_1'}
              />
            </label>
            <label className="block">
              <span className="form-label">Site</span>
              <p className="text-sm text-slate-700 bg-slate-100 border border-slate-200 rounded px-3 py-2">
                {defaultSite ? `${defaultSite.siteNum} — ${defaultSite.name}` : 'No active site — set Default Insert Site in Default Information'}
              </p>
            </label>
            <label className="block">
              <span className="form-label">Type</span>
              <select className="form-input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {['SITE', 'BUILDING', 'FLOOR', 'ROOM', 'AREA', 'ZONE', 'YARD', 'OTHER'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="form-label">Parent location (optional)</span>
              <select className="form-input" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
                <option value="">No parent (top-level)</option>
                {flattenTree(tree).map((l) => (
                  <option key={l.id} value={l.id}>{'— '.repeat(l.depth)}{l.code} – {l.name}</option>
                ))}
              </select>
            </label>

            {/* FIX (Sheet row 14): real Maximo's Configuration Management
                Location section — flagging a location as CM expects one
                specific Item (see Row 3's item-match validation on
                Move), and Asset Required marks whether an empty slot
                here is a configuration gap (feeds the Configuration
                Consistency Report, Row 9). */}
            <div className="col-span-2 border-t border-slate-200 pt-3 mt-1">
              <label className="flex items-center gap-2 text-sm text-slate-700 mb-2">
                <input
                  type="checkbox"
                  checked={form.isCmLocation}
                  onChange={(e) => setForm({ ...form, isCmLocation: e.target.checked })}
                />
                CM Location — this location requires a specific Item
              </label>
              {form.isCmLocation && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="form-label">Required Item</span>
                    <select className="form-input" value={form.cmItemId} onChange={(e) => setForm({ ...form, cmItemId: e.target.value })}>
                      <option value="">— None configured —</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.itemNum} — {i.description}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 mt-6">
                    <input
                      type="checkbox"
                      checked={form.assetRequired}
                      onChange={(e) => setForm({ ...form, assetRequired: e.target.checked })}
                    />
                    Asset Required (flag as a gap if empty)
                  </label>
                </div>
              )}
            </div>

            <div className="col-span-2 flex gap-2">
              <button type="button" className="btn-primary !w-auto px-4" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn-link" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-600 mb-2">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive locations
        </label>

        <div className="border border-slate-200 rounded bg-white p-3">
          {!defaultSiteId ? (
            <p className="text-slate-400 text-sm">Select a Default Insert Site to view locations.</p>
          ) : tree.length === 0 ? (
            <p className="text-slate-400 text-sm">No locations found.</p>
          ) : (
            tree.map((node) => <LocationNode key={node.id} node={node} />)
          )}
        </div>
      </div>
    </IdentityPageLayout>
  );
}