import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';
import type { FormLayoutDefinition } from '../pages/admin/config/form-layout-types.js';

interface FieldDef {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequiredGlobal: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  defaultValue?: string | null;
  validationRules?: Record<string, unknown>;
  lookupEntity?: string | null;
  isActive: boolean;
}

interface FieldRule {
  id: string;
  fieldKey: string;
  ruleType: 'REQUIRED' | 'READONLY' | 'HIDDEN' | 'VISIBLE';
  conditionExpression?: string | null;
}

interface PicklistValue {
  id: string;
  value: string;
  label: string;
  displayOrder: number;
  isActive: boolean;
}

interface EntityInfo {
  id: string;
  name: string;
}

interface Props {
  /** entity name e.g. 'WorkOrder', 'Asset' */
  entityName: string;
  /** current record data — used for condition evaluation */
  record: Record<string, unknown>;
  /** current values of custom fields */
  values: Record<string, unknown>;
  /** called whenever a custom field changes */
  onChange: (key: string, value: unknown) => void;
  /** read-only mode — show values without inputs */
  readOnly?: boolean;
}

function evaluateCondition(expr: string, data: Record<string, unknown>): boolean {
  try {
    // Simple condition evaluator — supports == and !=
    const cleaned = expr.trim();
    const eqMatch = cleaned.match(/^(\w+)\s*==\s*'([^']*)'$/);
    if (eqMatch) return String(data[eqMatch[1]] ?? '') === eqMatch[2];
    const neMatch = cleaned.match(/^(\w+)\s*!=\s*'([^']*)'$/);
    if (neMatch) return String(data[neMatch[1]] ?? '') !== neMatch[2];
    return true;
  } catch {
    return true;
  }
}

export function DynamicFormRenderer({ entityName, record, values, onChange, readOnly = false }: Props) {
  const [entity, setEntity] = useState<EntityInfo | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [rules, setRules] = useState<FieldRule[]>([]);
  const [layout, setLayout] = useState<FormLayoutDefinition | null>(null);
  const [picklists, setPicklists] = useState<Record<string, PicklistValue[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const entities = await api<EntityInfo[]>('/admin/config/entities');
      const ent = entities.find((e) => e.name === entityName);
      if (!ent) { setLoading(false); return; }
      setEntity(ent);

      const [fieldList, ruleList, formLayouts, me] = await Promise.all([
        api<FieldDef[]>(`/admin/config/entities/${ent.id}/fields`),
        api<FieldRule[]>(`/admin/config/entities/${ent.id}/rules`),
        api<Array<{ id: string; definition: FormLayoutDefinition; isActive: boolean; roleId: string | null }>>(
          `/admin/config/entities/${ent.id}/forms`
        ),
        api<{ roles: string[] }>('/auth/me').catch(() => ({ roles: [] })),
      ]);

      const activeFields = fieldList.filter((f) => f.isActive);
      setFields(activeFields);
      setRules(ruleList);

      // Pick role-specific layout first, fall back to default (no role)
      const userRoles = me.roles ?? [];
      const roleLayout = formLayouts.find((f) => f.isActive && f.roleId && userRoles.includes(f.roleId));
      const defaultLayout = formLayouts.find((f) => f.isActive && !f.roleId) ?? formLayouts[0];
      const activeLayout = roleLayout ?? defaultLayout;
      setLayout(activeLayout?.definition ?? null);

      // Load picklist values for PICKLIST fields
      const picklistFields = activeFields.filter((f) => f.fieldType === 'PICKLIST' || f.fieldType === 'MULTI_SELECT');
      if (picklistFields.length > 0) {
        const allPicklists = await api<Array<{ id: string; name: string; label: string }>>('/admin/config/picklists');
          const entries = await Promise.all(
            picklistFields.map(async (f) => {
              // Case-insensitive match: lookupEntity → name, label, fieldKey
              const lookup = (f.lookupEntity ?? f.fieldKey).toLowerCase().trim();
              const pl = allPicklists.find((p) =>
                p.name.toLowerCase() === lookup ||
                p.name.toLowerCase() === f.fieldKey.toLowerCase() ||
                p.label.toLowerCase() === lookup ||
                p.label.toLowerCase().replace(/\s+/g, '_') === lookup ||
                p.name.toLowerCase().endsWith(`_${f.fieldKey.toLowerCase()}`)
              );
              if (!pl) return [f.fieldKey, []] as [string, PicklistValue[]];
              const vals = await api<PicklistValue[]>(`/admin/config/picklists/${pl.id}/values`);
              return [f.fieldKey, vals.filter((v) => v.isActive)] as [string, PicklistValue[]];
          })
        );
        setPicklists(Object.fromEntries(entries));
      }
    } catch (e) {
      console.warn('[DynamicFormRenderer] Failed to load config:', e);
    } finally {
      setLoading(false);
    }
  }, [entityName]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-xs text-slate-400 italic">Loading custom fields…</p>;
  if (!entity || fields.length === 0) return null;

  // Compute field states from rules
  const ctx = { ...record, ...values };
  const fieldStates: Record<string, { visible: boolean; readonly: boolean; required: boolean }> = {};
  for (const f of fields) {
    fieldStates[f.fieldKey] = { visible: true, readonly: false, required: f.isRequiredGlobal };
  }
  for (const rule of rules) {
    const state = fieldStates[rule.fieldKey];
    if (!state) continue;
    const condMet = rule.conditionExpression ? evaluateCondition(rule.conditionExpression, ctx) : true;
    if (!condMet) continue;
    if (rule.ruleType === 'HIDDEN') state.visible = false;
    if (rule.ruleType === 'VISIBLE') state.visible = true;
    if (rule.ruleType === 'READONLY') state.readonly = true;
    if (rule.ruleType === 'REQUIRED') state.required = true;
  }

  const visibleFields = fields.filter((f) => fieldStates[f.fieldKey]?.visible !== false);

  function renderInput(field: FieldDef) {
    const state = fieldStates[field.fieldKey];
    const isRO = readOnly || state?.readonly;
    const value = values[field.fieldKey] ?? field.defaultValue ?? '';

    if (isRO) {
      return <p className="text-sm text-slate-800">{String(value || '—')}</p>;
    }

    const baseClass = 'form-input';

    switch (field.fieldType) {
      case 'BOOLEAN':
        return (
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(field.fieldKey, e.target.checked)}
            className="rounded border-slate-300 text-accent w-4 h-4"
          />
        );

      case 'NUMBER':
        return (
          <input
            type="number"
            className={baseClass}
            value={String(value)}
            placeholder={field.placeholder ?? ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        );

      case 'DATE':
        return (
          <input
            type="date"
            className={baseClass}
            value={String(value)}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        );

      case 'DATETIME':
        return (
          <input
            type="datetime-local"
            className={baseClass}
            value={String(value)}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        );

      case 'PICKLIST': {
        const options = picklists[field.fieldKey] ?? [];
        return (
          <select
            className="form-select"
            value={String(value)}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          >
            <option value="">— Select —</option>
            {options.map((o) => (
              <option key={o.id} value={o.value}>{o.label}</option>
            ))}
          </select>
        );
      }

      case 'MULTI_SELECT': {
        const options = picklists[field.fieldKey] ?? [];
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex flex-wrap gap-2">
            {options.map((o) => (
              <label key={o.id} className="inline-flex items-center gap-1 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, o.value]
                      : selected.filter((v) => v !== o.value);
                    onChange(field.fieldKey, next);
                  }}
                  className="rounded border-slate-300 text-accent"
                />
                {o.label}
              </label>
            ))}
          </div>
        );
      }

      case 'URL':
        return (
          <input
            type="url"
            className={baseClass}
            value={String(value)}
            placeholder={field.placeholder ?? 'https://'}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        );

      case 'EMAIL':
        return (
          <input
            type="email"
            className={baseClass}
            value={String(value)}
            placeholder={field.placeholder ?? ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        );

      case 'TEXTAREA':
        return (
          <textarea
            className={baseClass}
            rows={3}
            value={String(value)}
            placeholder={field.placeholder ?? ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        );

      case 'INTEGER':
        return (
          <input
            type="number"
            step="1"
            className={baseClass}
            value={String(value)}
            placeholder={field.placeholder ?? ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        );

      case 'DECIMAL':
        return (
          <input
            type="number"
            step="0.01"
            className={baseClass}
            value={String(value)}
            placeholder={field.placeholder ?? ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        );

      case 'FORMULA':
      case 'CALCULATED':
        // Formula fields are always read-only — display computed value
        return (
          <p className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono">
            {String(value || '—')}
            <span className="ml-2 text-[10px] text-slate-400 font-sans">computed</span>
          </p>
        );

      case 'LOOKUP': {
        // Lookup renders as a search-select against another entity
        const options = picklists[field.fieldKey] ?? [];
        return options.length > 0 ? (
          <select
            className="form-select"
            value={String(value)}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          >
            <option value="">— Select {field.label} —</option>
            {options.map((o) => (
              <option key={o.id} value={o.value}>{o.label}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            className={baseClass}
            value={String(value)}
            placeholder={field.placeholder ?? `Search ${field.lookupEntity ?? 'record'}…`}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        );
      }

      case 'ATTACHMENT':
        return (
          <div className="space-y-1">
            {value && String(value) && (
              <p className="text-xs text-slate-500">
                Current: <span className="font-medium">{String(value)}</span>
              </p>
            )}
            <input
              type="file"
              className="block text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-accent/10 file:text-accent hover:file:bg-accent/20 cursor-pointer"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onChange(field.fieldKey, file.name);
              }}
            />
          </div>
        );

      default: // TEXT, PHONE, etc.
        return (
          <input
            type="text"
            className={baseClass}
            value={String(value)}
            placeholder={field.placeholder ?? ''}
            onChange={(e) => onChange(field.fieldKey, e.target.value)}
          />
        );
    }
  }

  // If a form layout exists, render by sections; otherwise flat grid
  if (layout && layout.sections.length > 0) {
    const fieldMap = Object.fromEntries(fields.map((f) => [f.fieldKey, f]));
    return (
      <div className="space-y-4">
        {layout.sections.map((section) => {
          const sectionFields = section.fields
            .map((p) => fieldMap[p.fieldKey])
            .filter((f): f is FieldDef => !!f && fieldStates[f.fieldKey]?.visible !== false);

          if (sectionFields.length === 0) return null;

          const colClass = section.columns === 3
            ? 'grid-cols-1 md:grid-cols-3'
            : section.columns === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1';

          return (
            <div key={section.id} className="admin-section">
              {section.title && <h3 className="admin-section-title">{section.title}</h3>}
              <div className={`grid ${colClass} gap-4`}>
                {sectionFields.map((field) => {
                  const state = fieldStates[field.fieldKey];
                  return (
                    <div key={field.fieldKey}>
                      <label className="form-label">
                        {field.label}
                        {state?.required && <span className="text-red-500 ml-1">*</span>}
                      </label>
                      {renderInput(field)}
                      {field.helpText && <p className="text-xs text-slate-400 mt-1">{field.helpText}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Fallback: flat 2-column grid of all visible fields
  return (
    <div className="admin-section">
      <h3 className="admin-section-title">Custom Fields</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visibleFields.map((field) => {
          const state = fieldStates[field.fieldKey];
          return (
            <div key={field.fieldKey}>
              <label className="form-label">
                {field.label}
                {state?.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {renderInput(field)}
              {field.helpText && <p className="text-xs text-slate-400 mt-1">{field.helpText}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

