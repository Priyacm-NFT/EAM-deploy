import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';

// FIX (Sheet row 10 — Item Assembly Structure): real Maximo confirmed
// structure — the IAS *template* (which child Items/positions make up
// this Item's assembly) is defined on the Item record itself (Item
// Application → Item Assembly Structure tab, "New Row" per child). The
// template is then *applied* from the Assets application to actually
// create a real asset + its child assets. This page covers both halves
// in one place: an "Item Assembly Structure" tab to define the template,
// and a "Create Asset from Assembly" action that calls
// POST /assets/create-from-assembly to apply it — letting an Item's
// component list be defined once and reused for every asset built from
// it, instead of creating each child asset by hand every time.

interface Item {
  id: string;
  itemNum: string;
  description: string;
  longDescription: string | null;
  itemType: string;
  unitOfIssue: string;
  manufacturer: string | null;
  partNum: string | null;
  commodityCode: string | null;
  isHazardous: boolean;
  isActive: boolean;
  createdAt?: string;
  createdByName?: string | null;
  // FIX: real bug found during Row 12 (Classification attribute
  // inheritance) testing — "Sync from Item" correctly ran and returned
  // success, but the asset's classification table stayed empty because
  // the linked Item's customData (the source of truth for specs) had
  // never been set by anyone — there was no UI to set it at all, only
  // raw SQL. This field plus the new "Specifications" editor below is
  // that missing piece.
  customData: Record<string, unknown> | null;
}

interface IASRow {
  id: string;
  childItemId: string;
  childItemNum: string;
  childItemDescription: string;
  position: string;
  quantity: number;
  notes: string | null;
}

interface ItemOption { id: string; itemNum: string; description: string; }
interface LocationOption { id: string; code: string; name: string; }

type Tab = 'overview' | 'assembly';

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [iasRows, setIasRows] = useState<IASRow[]>([]);
  const [allItems, setAllItems] = useState<ItemOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);

  // FIX: editable draft of the Item's specifications (customData) — a
  // plain key/value list, since this column has no fixed schema. New
  // rows start with empty key/value so the admin types both; existing
  // entries are seeded from whatever the Item already has.
  const [specRows, setSpecRows] = useState<{ key: string; value: string }[]>([]);
  const [savingSpecs, setSavingSpecs] = useState(false);

  // New IAS row form
  const [showRowForm, setShowRowForm] = useState(false);
  const [rowForm, setRowForm] = useState({ childItemId: '', position: '', quantity: '1', notes: '' });
  const [rowBusy, setRowBusy] = useState(false);

  // Create-asset-from-assembly form
  const [createForm, setCreateForm] = useState({ description: '', assetNum: '', locationId: '' });
  const [createBusy, setCreateBusy] = useState(false);
  const [createResult, setCreateResult] = useState<{ parentAssetId: string; childCount: number } | null>(null);
  // FIX: Items had no delete/deactivate path anywhere in this UI — no
  // button, and until now, no backend route either (see the new
  // DELETE/reactivate routes in inventory.ts). Same "Deactivate" pattern
  // as Organisations/Sites/Locations elsewhere in the platform.
  const [togglingActive, setTogglingActive] = useState(false);

  async function toggleActive() {
    if (!id || !item) return;
    const willDeactivate = item.isActive;
    if (willDeactivate && !window.confirm(`Deactivate item "${item.itemNum} — ${item.description}"? It will be hidden from Item Master by default but its historical data is preserved. It can be reactivated later.`)) {
      return;
    }
    setTogglingActive(true); setError('');
    try {
      await api(`/items/${id}${willDeactivate ? '' : '/reactivate'}`, {
        method: willDeactivate ? 'DELETE' : 'POST',
      });
      setSuccess(willDeactivate ? 'Item deactivated.' : 'Item reactivated.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update item status');
    } finally {
      setTogglingActive(false);
    }
  }

  function load() {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api<Item>(`/items/${id}`),
      api<IASRow[]>(`/items/${id}/assembly-structure`),
    ])
      .then(([itemData, ias]) => {
        setItem(itemData);
        setIasRows(ias);
        const specs = (itemData.customData as Record<string, unknown>) ?? {};
        setSpecRows(Object.entries(specs).map(([key, value]) => ({ key, value: String(value) })));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    // FIX: Item picker for "child item" excludes whatever Item this page
    // is for, so an Item can never be set as its own assembly component.
    api<{ data: ItemOption[] } | ItemOption[]>('/items?pageSize=200')
      .then((r) => setAllItems(Array.isArray(r) ? r : (r as { data: ItemOption[] }).data ?? []))
      .catch(() => {});
    api<LocationOption[]>('/locations?flat=true').then(setLocations).catch(() => {});
  }, []);

  async function addRow(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !rowForm.childItemId || !rowForm.position.trim()) {
      setError('Child item and position are required.');
      return;
    }
    setRowBusy(true); setError('');
    try {
      await api(`/items/${id}/assembly-structure`, {
        method: 'POST',
        body: JSON.stringify({
          childItemId: rowForm.childItemId,
          position: rowForm.position.trim(),
          quantity: Number(rowForm.quantity) || 1,
          notes: rowForm.notes || undefined,
        }),
      });
      setSuccess('Component added to assembly structure.');
      setShowRowForm(false);
      setRowForm({ childItemId: '', position: '', quantity: '1', notes: '' });
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setRowBusy(false);
    }
  }

  async function removeRow(rowId: string) {
    if (!id) return;
    if (!window.confirm('Remove this component from the assembly structure?')) return;
    try {
      await api(`/items/${id}/assembly-structure/${rowId}`, { method: 'DELETE' });
      setIasRows((rows) => rows.filter((r) => r.id !== rowId));
    } catch (e) {
      setError(String(e));
    }
  }

  async function createFromAssembly(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !createForm.description.trim()) {
      setError('Description is required.');
      return;
    }
    setCreateBusy(true); setError(''); setCreateResult(null);
    try {
      const result = await api<{ parentAsset: { id: string; assetNum: string }; childAssets: { id: string }[] }>(
        '/assets/create-from-assembly',
        {
          method: 'POST',
          body: JSON.stringify({
            parentItemId: id,
            description: createForm.description,
            assetNum: createForm.assetNum || undefined,
            locationId: createForm.locationId || undefined,
          }),
        },
      );
      setCreateResult({ parentAssetId: result.parentAsset.id, childCount: result.childAssets.length });
      setSuccess(`Created asset ${result.parentAsset.assetNum} with ${result.childAssets.length} component(s).`);
      setCreateForm({ description: '', assetNum: '', locationId: '' });
    } catch (e) {
      setError(String(e));
    } finally {
      setCreateBusy(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '24px', color: '#94a3b8' }}>Loading item…</div>;
  }

  if (error && !item) {
    return (
      <div style={{ padding: '24px' }}>
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>{error}</div>
        <Link to="/inventory" className="btn-link">← Back to Item Master</Link>
      </div>
    );
  }

  if (!item) return null;

  return (
    <div style={{ padding: '24px' }}>
      <Link to="/inventory" className="btn-link" style={{ fontSize: '14px', marginBottom: '8px', display: 'inline-block' }}>
        ← Back to Item Master
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>
          {item.itemNum} — {item.description}
        </h1>
        <button
          type="button"
          className="btn-outline-light !w-auto px-4 text-sm"
          style={{ color: item.isActive ? '#dc2626' : '#16a34a' }}
          disabled={togglingActive}
          onClick={toggleActive}
        >
          {togglingActive ? 'Saving…' : item.isActive ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>
      <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>
        {item.itemType} · Unit of Issue: {item.unitOfIssue}
        {item.isHazardous && <span style={{ color: '#dc2626', marginLeft: '8px' }}>⚠ Hazardous</span>}
      </p>

      {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>{error}</div>}
      {success && <div style={{ background: '#dcfce7', color: '#16a34a', padding: '10px', borderRadius: '8px', marginBottom: '12px' }}>{success}</div>}

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid #e2e8f0', marginBottom: '20px' }}>
        {([
          ['overview', 'Overview'],
          ['assembly', `Item Assembly Structure (${iasRows.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            style={{
              padding: '10px 18px',
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              borderBottom: tab === key ? '2px solid #e8650a' : '2px solid transparent',
              color: tab === key ? '#e8650a' : '#64748b',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ──────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="admin-section" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div><span className="form-label">Item #</span><p>{item.itemNum}</p></div>
          <div><span className="form-label">Description</span><p>{item.description}</p></div>
          <div><span className="form-label">Long description</span><p>{item.longDescription || '—'}</p></div>
          <div><span className="form-label">Item type</span><p>{item.itemType}</p></div>
          <div><span className="form-label">Manufacturer</span><p>{item.manufacturer || '—'}</p></div>
          <div><span className="form-label">Manufacturer part #</span><p>{item.partNum || '—'}</p></div>
          <div><span className="form-label">Commodity code</span><p>{item.commodityCode || '—'}</p></div>
          <div><span className="form-label">Unit of issue</span><p>{item.unitOfIssue}</p></div>
          <div>
            <span className="form-label">Status</span>
            <p>
              <span style={{
                fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '999px',
                background: item.isActive ? '#dcfce7' : '#f1f5f9', color: item.isActive ? '#16a34a' : '#64748b',
              }}>
                {item.isActive ? 'Active' : 'Inactive'}
              </span>
            </p>
          </div>
          <div><span className="form-label">Created by</span><p>{item.createdByName ?? '—'}</p></div>
          <div><span className="form-label">Created date</span><p>{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</p></div>
        </div>
      )}

      {/* FIX: real bug fix — these specs are the source of truth that
          "Sync from Item" (on the Asset Detail page's Classification
          tab, Sheet row 12) pulls into a linked asset's classification
          attributes. Previously there was no UI to set them at all —
          Sync would run successfully and return an empty table every
          time, since every Item's customData defaulted to {} and
          nothing ever populated it. */}
      {tab === 'overview' && (
        <div className="admin-section" style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Specifications</h2>
              <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                Key/value specs for this Item — these are what "Sync from Item" pulls into a linked asset's Classification tab.
              </p>
            </div>
            <button
              type="button"
              className="btn-outline-light !w-auto px-4 text-sm"
              onClick={() => setSpecRows((rows) => [...rows, { key: '', value: '' }])}
            >
              + Add row
            </button>
          </div>

          {specRows.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '12px' }}>
              No specifications defined yet. Click "+ Add row" to add one.
            </p>
          ) : (
            <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse', marginTop: '12px' }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: '12px', color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 0', width: '40%' }}>Spec name</th>
                  <th style={{ padding: '8px 0' }}>Value</th>
                  <th style={{ padding: '8px 0', width: '60px' }} />
                </tr>
              </thead>
              <tbody>
                {specRows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 8px 6px 0' }}>
                      <input
                        className="form-input"
                        placeholder="e.g. max_pressure"
                        value={row.key}
                        onChange={(e) => setSpecRows((rows) => rows.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))}
                      />
                    </td>
                    <td style={{ padding: '6px 8px' }}>
                      <input
                        className="form-input"
                        placeholder="e.g. 50 bar"
                        value={row.value}
                        onChange={(e) => setSpecRows((rows) => rows.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))}
                      />
                    </td>
                    <td style={{ padding: '6px 0' }}>
                      <button
                        type="button"
                        className="btn-link"
                        style={{ fontSize: '13px', color: '#dc2626' }}
                        onClick={() => setSpecRows((rows) => rows.filter((_, idx) => idx !== i))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginTop: '16px' }}>
            <button
              type="button"
              className="btn-primary !w-auto px-6"
              disabled={savingSpecs}
              onClick={async () => {
                setSavingSpecs(true); setError('');
                try {
                  // FIX: rows with a blank key are dropped before saving
                  // — an empty key would otherwise overwrite a real spec
                  // under the JSON key "" the next time this runs.
                  const customData = Object.fromEntries(
                    specRows.filter((r) => r.key.trim()).map((r) => [r.key.trim(), r.value]),
                  );
                  const updated = await api<Item>(`/items/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ customData }),
                  });
                  setItem(updated);
                  setSuccess('Specifications saved.');
                } catch (e) {
                  setError(String(e));
                } finally {
                  setSavingSpecs(false);
                }
              }}
            >
              {savingSpecs ? 'Saving…' : 'Save specifications'}
            </button>
          </div>
        </div>
      )}

      {/* ── Item Assembly Structure tab ───────────────────────────────── */}
      {tab === 'assembly' && (
        <div>
          {/* FIX: this is the "Item Assembly Structure" tab on the Item
              record — defines the template (real Maximo: "In the
              Children section click the New Row button... start adding
              the Items that will be part of the structure"). This is
              metadata only; nothing here creates an asset yet. */}
          <div className="admin-section" style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 600 }}>Children</h2>
                <p style={{ fontSize: '13px', color: '#94a3b8' }}>
                  The components and positions that make up this Item's assembly structure.
                </p>
              </div>
              <button type="button" className="btn-primary !w-auto px-4 text-sm" onClick={() => setShowRowForm((v) => !v)}>
                {showRowForm ? 'Cancel' : '+ New Row'}
              </button>
            </div>

            {showRowForm && (
              <form onSubmit={addRow} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', marginBottom: '16px', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label className="form-label">Child item *</label>
                  <select className="form-input" required value={rowForm.childItemId} onChange={(e) => setRowForm((f) => ({ ...f, childItemId: e.target.value }))}>
                    <option value="">Select an item…</option>
                    {allItems.filter((i) => i.id !== id).map((i) => (
                      <option key={i.id} value={i.id}>{i.itemNum} — {i.description}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label">Position *</label>
                  <input className="form-input" required placeholder="e.g. SLOT_1" value={rowForm.position} onChange={(e) => setRowForm((f) => ({ ...f, position: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Quantity</label>
                  <input type="number" min="1" className="form-input" value={rowForm.quantity} onChange={(e) => setRowForm((f) => ({ ...f, quantity: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="form-label">Notes</label>
                  <input className="form-input" value={rowForm.notes} onChange={(e) => setRowForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '12px' }}>
                  <button type="submit" className="btn-primary !w-auto px-6" disabled={rowBusy}>{rowBusy ? 'Adding…' : 'Add component'}</button>
                </div>
              </form>
            )}

            <table style={{ width: '100%', fontSize: '14px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', fontSize: '12px', color: '#94a3b8', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '8px 0' }}>Position</th>
                  <th style={{ padding: '8px 0' }}>Child item</th>
                  <th style={{ padding: '8px 0' }}>Qty</th>
                  <th style={{ padding: '8px 0' }}>Notes</th>
                  <th style={{ padding: '8px 0' }} />
                </tr>
              </thead>
              <tbody>
                {iasRows.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8' }}>No components defined yet.</td></tr>
                ) : iasRows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 0', fontFamily: 'monospace', fontSize: '13px' }}>{row.position}</td>
                    <td style={{ padding: '8px 0' }}>{row.childItemNum} — {row.childItemDescription}</td>
                    <td style={{ padding: '8px 0' }}>{row.quantity}</td>
                    <td style={{ padding: '8px 0', color: '#94a3b8' }}>{row.notes || '—'}</td>
                    <td style={{ padding: '8px 0' }}>
                      <button type="button" className="btn-link" style={{ fontSize: '13px', color: '#dc2626' }} onClick={() => removeRow(row.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* FIX: this is the "apply structure from the Assets
              application" half — real Maximo: "You use the Assets
              application to apply an item assembly structure to a
              rotating asset or to an operating location." Calls
              POST /assets/create-from-assembly, which creates the parent
              asset plus one child asset per row above, in one action. */}
          <div className="admin-section">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Create Asset from Assembly</h2>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>
              Creates one new asset from this Item, plus a child asset for every component listed above —
              each pre-filled with its template position. Equivalent to applying this Item's assembly structure
              from the Assets application.
            </p>
            {iasRows.length === 0 && (
              <p style={{ fontSize: '13px', color: '#b45309', marginBottom: '12px' }}>
                No components are defined yet — this will create a standalone asset with no children.
              </p>
            )}
            <form onSubmit={createFromAssembly} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label className="form-label">Asset description *</label>
                <input className="form-input" required placeholder="e.g. Cabinet — Substation 4" value={createForm.description} onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Asset # (optional)</label>
                <input className="form-input" placeholder="Auto-generated if blank" value={createForm.assetNum} onChange={(e) => setCreateForm((f) => ({ ...f, assetNum: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Location (optional)</label>
                <select className="form-input" value={createForm.locationId} onChange={(e) => setCreateForm((f) => ({ ...f, locationId: e.target.value }))}>
                  <option value="">— None —</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.code} — {l.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <button type="submit" className="btn-primary !w-auto px-6" disabled={createBusy}>
                  {createBusy ? 'Creating…' : 'Create Asset from Assembly'}
                </button>
              </div>
            </form>

            {createResult && (
              <div style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                <p style={{ fontSize: '13px', color: '#16a34a' }}>
                  Created with {createResult.childCount} component(s).{' '}
                  <Link to={`/assets/${createResult.parentAssetId}`} className="btn-link" style={{ fontSize: '13px' }}>
                    View the new asset →
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
