import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  IdentityPageLayout,
  FormField,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface FieldDef {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isSystem: boolean;
}

interface ColumnConfig {
  fieldKey: string;
  label: string;
  width?: number;
  sortable?: boolean;
  aggregate?: 'none' | 'count' | 'sum' | 'avg';
}

interface TableView {
  id: string;
  name: string;
  columnConfig: ColumnConfig[];
  defaultSort?: string;
  defaultFilter?: Record<string, unknown>;
  isDefault: boolean;
  roleId?: string | null;
}

interface Entity {
  id: string;
  name: string;
  label: string;
}

// System fields always available for every entity
const SYSTEM_FIELDS: Record<string, FieldDef[]> = {
  WorkOrder: [
    { id: 'sys_woNum', fieldKey: 'woNum', label: 'WO Number', fieldType: 'TEXT', isSystem: true },
    { id: 'sys_description', fieldKey: 'description', label: 'Description', fieldType: 'TEXT', isSystem: true },
    { id: 'sys_status', fieldKey: 'status', label: 'Status', fieldType: 'TEXT', isSystem: true },
    { id: 'sys_type', fieldKey: 'type', label: 'Type', fieldType: 'TEXT', isSystem: true },
    { id: 'sys_priority', fieldKey: 'priority', label: 'Priority', fieldType: 'TEXT', isSystem: true },
    { id: 'sys_createdAt', fieldKey: 'createdAt', label: 'Created', fieldType: 'DATETIME', isSystem: true },
  ],
  Asset: [
    { id: 'sys_assetNum', fieldKey: 'assetNum', label: 'Asset Number', fieldType: 'TEXT', isSystem: true },
    { id: 'sys_description', fieldKey: 'description', label: 'Description', fieldType: 'TEXT', isSystem: true },
    { id: 'sys_status', fieldKey: 'status', label: 'Status', fieldType: 'TEXT', isSystem: true },
    { id: 'sys_criticality', fieldKey: 'criticality', label: 'Criticality', fieldType: 'TEXT', isSystem: true },
  ],
  ServiceRequest: [
    { id: 'sys_srNum', fieldKey: 'srNum', label: 'SR Number', fieldType: 'TEXT', isSystem: true },
    { id: 'sys_description', fieldKey: 'description', label: 'Description', fieldType: 'TEXT', isSystem: true },
    { id: 'sys_status', fieldKey: 'status', label: 'Status', fieldType: 'TEXT', isSystem: true },
    { id: 'sys_priority', fieldKey: 'priority', label: 'Priority', fieldType: 'TEXT', isSystem: true },
  ],
};

export function TableDesignerPage() {
  const { entityId } = useParams<{ entityId: string }>();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [allFields, setAllFields] = useState<FieldDef[]>([]);
  const [views, setViews] = useState<TableView[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [viewName, setViewName] = useState('Default view');
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [defaultSort, setDefaultSort] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!entityId) return;
    async function load() {
      try {
        const entities = await api<Entity[]>('/admin/config/entities');
        const ent = entities.find((e) => e.id === entityId);
        if (!ent) return;
        setEntity(ent);

        const [customFields, viewList] = await Promise.all([
          api<FieldDef[]>(`/admin/config/entities/${entityId}/fields`),
          api<TableView[]>(`/admin/config/entities/${entityId}/views`),
        ]);

        const sysFields = SYSTEM_FIELDS[ent.name] ?? [];
        setAllFields([...sysFields, ...customFields.filter((f) => f.isSystem === false)]);
        setViews(viewList);

        if (viewList.length > 0) {
          const first = viewList[0]!;
          setActiveViewId(first.id);
          setViewName(first.name);
          setColumns(first.columnConfig ?? []);
          setDefaultSort(first.defaultSort ?? '');
          setIsDefault(first.isDefault);
        }
      } catch (e) {
        setError(String(e));
      }
    }
    load();
  }, [entityId]);

  function loadView(view: TableView) {
    setActiveViewId(view.id);
    setViewName(view.name);
    setColumns(view.columnConfig ?? []);
    setDefaultSort(view.defaultSort ?? '');
    setIsDefault(view.isDefault);
    setMsg('');
    setError('');
  }

  function addColumn(field: FieldDef) {
    if (columns.find((c) => c.fieldKey === field.fieldKey)) return;
    setColumns((prev) => [...prev, {
      fieldKey: field.fieldKey,
      label: field.label,
      width: 150,
      sortable: true,
      aggregate: 'none',
    }]);
  }

  function removeColumn(fieldKey: string) {
    setColumns((prev) => prev.filter((c) => c.fieldKey !== fieldKey));
  }

  function moveColumn(index: number, dir: -1 | 1) {
    const next = [...columns];
    const swapIdx = index + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[index], next[swapIdx]] = [next[swapIdx]!, next[index]!];
    setColumns(next);
  }

  function updateColumn(index: number, patch: Partial<ColumnConfig>) {
    setColumns((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c));
  }

  async function save() {
    if (!entityId) return;
    setSaving(true); setError(''); setMsg('');
    try {
      const payload = {
        name: viewName,
        columnConfig: columns,
        defaultSort: defaultSort || undefined,
        isDefault,
      };
      if (activeViewId) {
        await api(`/admin/config/entities/${entityId}/views/${activeViewId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setMsg('View saved.');
      } else {
        const created = await api<TableView>(`/admin/config/entities/${entityId}/views`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setActiveViewId(created.id);
        setViews((prev) => [...prev, created]);
        setMsg('View created.');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function createNew() {
    setActiveViewId(null);
    setViewName('New view');
    setColumns([]);
    setDefaultSort('');
    setIsDefault(false);
    setMsg('');
    setError('');
  }

  async function deleteView(view: TableView) {
    if (!window.confirm(`Delete view "${view.name}"?`)) return;
    try {
      await api(`/admin/config/entities/${entityId}/views/${view.id}`, { method: 'DELETE' });
      setViews((prev) => prev.filter((v) => v.id !== view.id));
      if (activeViewId === view.id) createNew();
      setMsg('View deleted.');
    } catch (e) {
      setError(String(e));
    }
  }

  const availableFields = allFields.filter((f) => !columns.find((c) => c.fieldKey === f.fieldKey));

  return (
    <IdentityPageLayout
      title={`Table designer — ${entity?.label ?? '…'}`}
      subtitle="Define columns, sort order, and saved views for list screens"
      backTo="/admin/config"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="flex gap-4">
        {/* Left: saved views list */}
        <div className="w-48 shrink-0 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Saved views</p>
          {views.map((v) => (
            <div
              key={v.id}
              className={`flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer border ${activeViewId === v.id ? 'bg-accent/10 border-accent text-accent font-medium' : 'border-slate-200 hover:bg-slate-50'}`}
              onClick={() => loadView(v)}
            >
              <span className="truncate">{v.name}{v.isDefault && <span className="ml-1 text-xs text-green-600">(default)</span>}</span>
              <button
                type="button"
                className="text-slate-400 hover:text-red-500 ml-2 text-xs shrink-0"
                onClick={(e) => { e.stopPropagation(); deleteView(v); }}
              >✕</button>
            </div>
          ))}
          <button type="button" className="btn-outline w-full text-xs py-1.5" onClick={createNew}>
            + New view
          </button>
        </div>

        {/* Right: editor */}
        <div className="flex-1 space-y-4">
          <div className="admin-section space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="View name" htmlFor="vname">
                <input id="vname" className="form-input" value={viewName} onChange={(e) => setViewName(e.target.value)} />
              </FormField>
              <FormField label="Default sort (field key)" htmlFor="dsort">
                <input id="dsort" className="form-input font-mono text-xs" value={defaultSort} onChange={(e) => setDefaultSort(e.target.value)} placeholder="e.g. createdAt DESC" />
              </FormField>
            </div>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="rounded border-slate-300 text-accent" />
              Set as default view for this entity
            </label>
          </div>

          {/* Available fields */}
          <div className="admin-section">
            <h3 className="admin-section-title">Available fields — click to add</h3>
            {availableFields.length === 0
              ? <p className="text-slate-400 text-sm">All fields are already in this view.</p>
              : (
                <div className="flex flex-wrap gap-2">
                  {availableFields.map((f) => (
                    <button
                      key={f.fieldKey}
                      type="button"
                      onClick={() => addColumn(f)}
                      className="text-xs px-2 py-1 rounded border border-slate-200 bg-white hover:bg-accent/10 hover:border-accent hover:text-accent transition-colors"
                    >
                      {f.label}
                      {!f.isSystem && <span className="ml-1 text-slate-400">(custom)</span>}
                    </button>
                  ))}
                </div>
              )}
          </div>

          {/* Column config table */}
          <div className="admin-section overflow-x-auto">
            <h3 className="admin-section-title">Columns ({columns.length})</h3>
            {columns.length === 0
              ? <p className="text-slate-400 text-sm">No columns yet. Click fields above to add them.</p>
              : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                      <th className="pb-2 pr-2">Order</th>
                      <th className="pb-2 pr-3">Field</th>
                      <th className="pb-2 pr-3">Label</th>
                      <th className="pb-2 pr-3">Width (px)</th>
                      <th className="pb-2 pr-3">Sortable</th>
                      <th className="pb-2 pr-3">Aggregate</th>
                      <th className="pb-2">Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((col, i) => (
                      <tr key={col.fieldKey} className="border-b border-slate-100">
                        <td className="py-2 pr-2">
                          <div className="flex gap-1">
                            <button type="button" onClick={() => moveColumn(i, -1)} disabled={i === 0} className="text-slate-400 hover:text-slate-700 disabled:opacity-20">↑</button>
                            <button type="button" onClick={() => moveColumn(i, 1)} disabled={i === columns.length - 1} className="text-slate-400 hover:text-slate-700 disabled:opacity-20">↓</button>
                          </div>
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-500">{col.fieldKey}</td>
                        <td className="py-2 pr-3">
                          <input
                            className="form-input !py-1 text-xs"
                            value={col.label}
                            onChange={(e) => updateColumn(i, { label: e.target.value })}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="number"
                            className="form-input !py-1 text-xs w-20"
                            value={col.width ?? 150}
                            onChange={(e) => updateColumn(i, { width: Number(e.target.value) })}
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <input
                            type="checkbox"
                            checked={col.sortable ?? true}
                            onChange={(e) => updateColumn(i, { sortable: e.target.checked })}
                            className="rounded border-slate-300 text-accent"
                          />
                        </td>
                        <td className="py-2 pr-3">
                          <select
                            className="form-select !py-1 text-xs"
                            value={col.aggregate ?? 'none'}
                            onChange={(e) => updateColumn(i, { aggregate: e.target.value as ColumnConfig['aggregate'] })}
                          >
                            <option value="none">None</option>
                            <option value="count">Count</option>
                            <option value="sum">Sum</option>
                            <option value="avg">Average</option>
                          </select>
                        </td>
                        <td className="py-2">
                          <button type="button" className="btn-danger text-xs" onClick={() => removeColumn(col.fieldKey)}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>

          <div className="flex gap-3">
            <button type="button" className="btn-primary !w-auto px-6" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : activeViewId ? 'Update view' : 'Create view'}
            </button>
          </div>
        </div>
      </div>
    </IdentityPageLayout>
  );
}
