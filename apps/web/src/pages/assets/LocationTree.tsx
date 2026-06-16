import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { IdentityPageLayout, MessageBanner } from '../../components/identity/IdentityLayout.js';

interface Location {
  id: string;
  name: string;
  code: string;
  type: string;
  parentId: string | null;
  siteId?: string | null;
  children?: Location[];
}

interface Site {
  id: string;
  name: string;
  siteNum: string;
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
      </div>
      {expanded && node.children?.map((child) => (
        <LocationNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function LocationTreePage() {
  const [tree, setTree] = useState<Location[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', type: 'FLOOR', parentId: '', siteId: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    api<Location[]>('/locations?tree=true').then(setTree).catch((e) => setError(String(e)));
    api<Site[]>('/admin/org/sites').then(setSites).catch(() => setSites([]));
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api('/locations', {
        method: 'POST',
        body: JSON.stringify({ ...form, parentId: form.parentId || undefined, siteId: form.siteId || undefined }),
      });
      setSuccess('Location created');
      setShowForm(false);
      const updated = await api<Location[]>('/locations?tree=true');
      setTree(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <IdentityPageLayout title="Locations" subtitle="Hierarchical site / building / floor / area structure">
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
              <span className="form-label">Code</span>
              <input className="form-input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </label>
            <label className="block">
              <span className="form-label">Site</span>
              <select className="form-input" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
                <option value="">No site</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.siteNum})</option>
                ))}
              </select>
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
            <div className="col-span-2 flex gap-2">
              <button type="button" className="btn-primary !w-auto px-4" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" className="btn-link" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="border border-slate-200 rounded bg-white p-3">
          {tree.length === 0 ? (
            <p className="text-slate-400 text-sm">No locations found.</p>
          ) : (
            tree.map((node) => <LocationNode key={node.id} node={node} />)
          )}
        </div>
      </div>
    </IdentityPageLayout>
  );
}