import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface Entity {
  id: string;
  name: string;
  label: string;
  tableName: string;
}

interface FieldRow {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequiredGlobal: boolean;
  isSystem: boolean;
  validationRules?: Record<string, unknown>;
}

interface FieldRule {
  id: string;
  fieldKey: string;
  ruleType: string;
  conditionExpression: string | null;
  statusCondition: string | null;
}

const RULE_TYPES = [
  { value: 'REQUIRED',  label: 'Required'  },
  { value: 'READONLY',  label: 'Read-only' },
  { value: 'HIDDEN',    label: 'Hidden'    },
  { value: 'VISIBLE',   label: 'Visible'   },
];

const FIELD_TYPES: { value: string; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATE', label: 'Date' },
  { value: 'DATETIME', label: 'Date & time' },
  { value: 'BOOLEAN', label: 'Yes / No' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'URL', label: 'URL' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'PICKLIST', label: 'Picklist' },
  { value: 'MULTI_SELECT', label: 'Multi-select' },
  { value: 'LOOKUP', label: 'Lookup' },
  { value: 'FORMULA', label: 'Formula' },
  { value: 'ATTACHMENT', label: 'Attachment' },
];

const emptyForm = {
  fieldKey: '',
  label: '',
  fieldType: 'TEXT',
  isRequiredGlobal: false,
  min: '',
  max: '',
  minLength: '',
  maxLength: '',
  regex: '',
  lookupEntity: '',
};

function formatValidation(rules?: Record<string, unknown>): string {
  if (!rules || Object.keys(rules).length === 0) return 'None';
  return Object.entries(rules)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

export function ConfigFieldListPage() {
  const { entityId } = useParams();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [picklists, setPicklists] = useState<{ id: string; name: string; label: string }[]>([]);
  const [rulesField, setRulesField] = useState<FieldRow | null>(null);
  const [rules, setRules] = useState<FieldRule[]>([]);
  const [ruleForm, setRuleForm] = useState({ ruleType: 'REQUIRED', conditionExpression: '', statusCondition: '' });
  const [savingRule, setSavingRule] = useState(false);

  function load() {
    if (!entityId) return;
    api<Entity[]>('/admin/config/entities')
      .then((list) => setEntity(list.find((e) => e.id === entityId) ?? null))
      .catch((e) => setError(String(e)));
    api<FieldRow[]>(`/admin/config/entities/${entityId}/fields`)
      .then(setFields)
      .catch((e) => setError(String(e)));
    api<{ id: string; name: string; label: string }[]>('/admin/config/picklists')
      .then(setPicklists)
      .catch(() => setPicklists([]));
  }

  useEffect(() => {
    load();
  }, [entityId]);

  const filtered = fields.filter(
    (f) =>
      f.fieldKey.toLowerCase().includes(filter.toLowerCase()) ||
      f.label.toLowerCase().includes(filter.toLowerCase()) ||
      f.fieldType.toLowerCase().includes(filter.toLowerCase()),
  );

  const showLengthRules = ['TEXT', 'EMAIL', 'URL', 'PHONE'].includes(form.fieldType);
  const showRangeRules = ['NUMBER', 'DATE', 'DATETIME'].includes(form.fieldType);

  async function addField(e: React.FormEvent) {
    e.preventDefault();
    if (!entityId) return;
    setError('');
    setMsg('');
    setSaving(true);
    try {
      const validationRules: Record<string, unknown> = {};
      if (form.regex.trim()) validationRules.regex = form.regex.trim();
      if (form.minLength) validationRules.minLength = Number(form.minLength);
      if (form.maxLength) validationRules.maxLength = Number(form.maxLength);
      if (form.min) {
        validationRules.min = form.fieldType === 'NUMBER' ? Number(form.min) : form.min;
      }
      if (form.max) {
        validationRules.max = form.fieldType === 'NUMBER' ? Number(form.max) : form.max;
      }

      await api(`/admin/config/entities/${entityId}/fields`, {
        method: 'POST',
        body: JSON.stringify({
          fieldKey: form.fieldKey.trim(),
          label: form.label.trim(),
          fieldType: form.fieldType,
          isRequiredGlobal: form.isRequiredGlobal,
          validationRules,
          lookupEntity: form.lookupEntity || null,
        }),
      });
      setForm(emptyForm);
      setMsg(`Field "${form.label.trim()}" added. A database column custom__${form.fieldKey.trim()} was created.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add field');
    } finally {
      setSaving(false);
    }
  }

  async function removeField(id: string, label: string) {
    if (!entityId || !window.confirm(`Delete field "${label}"? The database column will be removed.`)) return;
    setError('');
    try {
      await api(`/admin/config/entities/${entityId}/fields/${id}`, { method: 'DELETE' });
      setMsg(`Field "${label}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  async function openRules(field: FieldRow) {
    setRulesField(field);
    setRuleForm({ ruleType: 'REQUIRED', conditionExpression: '', statusCondition: '' });
    try {
      const all = await api<FieldRule[]>(`/admin/config/entities/${entityId}/rules`);
      setRules(all.filter((r) => r.fieldKey === field.fieldKey));
    } catch {
      setRules([]);
    }
  }

  async function saveRule() {
    if (!entityId || !rulesField) return;
    setSavingRule(true);
    try {
      await api(`/admin/config/entities/${entityId}/rules`, {
        method: 'POST',
        body: JSON.stringify({
          fieldKey: rulesField.fieldKey,
          ruleType: ruleForm.ruleType,
          conditionExpression: ruleForm.conditionExpression.trim() || null,
          statusCondition: ruleForm.statusCondition.trim() || null,
        }),
      });
      setRuleForm({ ruleType: 'REQUIRED', conditionExpression: '', statusCondition: '' });
      const all = await api<FieldRule[]>(`/admin/config/entities/${entityId}/rules`);
      setRules(all.filter((r) => r.fieldKey === rulesField.fieldKey));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save rule');
    } finally {
      setSavingRule(false);
    }
  }

  async function deleteRule(ruleId: string) {
    if (!entityId) return;
    try {
      await api(`/admin/config/entities/${entityId}/rules/${ruleId}`, { method: 'DELETE' });
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete rule');
    }
  }

  const entityTitle = entity?.label ?? 'Entity';

  return (
    <IdentityPageLayout
      title={`Manage fields — ${entityTitle}`}
      subtitle={
        entity
          ? `Add custom fields for ${entity.name}. Stored as custom__field_key on table ${entity.tableName}.`
          : 'Define fields and validation rules for this entity'
      }
      backTo="/admin/config"
      backLabel="Back to configuration"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {entity && (
        <div className="admin-section">
          <div className="flex flex-wrap gap-3 text-sm">
            <Link to={`/admin/config/entities/${entityId}/forms`} className="btn-primary !w-auto px-4">
              Open form designer
            </Link>
            <span className="text-slate-600 self-center">
              Entity: <strong className="text-slate-900">{entity.name}</strong>
            </span>
          </div>
        </div>
      )}

      <form onSubmit={addField} className="admin-section space-y-4">
        <h2 className="admin-section-title">Add custom field</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Field key" htmlFor="field-key" hint="Snake_case, e.g. serial_number">
            <input
              id="field-key"
              type="text"
              className="form-input font-mono"
              value={form.fieldKey}
              onChange={(e) => setForm({ ...form, fieldKey: e.target.value })}
              required
              pattern="[a-z][a-z0-9_]*"
              title="Lowercase letters, numbers, and underscores only"
            />
          </FormField>
          <FormField label="Display label" htmlFor="field-label">
            <input
              id="field-label"
              type="text"
              className="form-input"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              required
            />
          </FormField>
          <FormField label="Field type" htmlFor="field-type">
            <select
              id="field-type"
              className="form-select"
              value={form.fieldType}
              onChange={(e) => setForm({ ...form, fieldType: e.target.value })}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </FormField>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-accent focus:ring-accent"
                checked={form.isRequiredGlobal}
                onChange={(e) => setForm({ ...form, isRequiredGlobal: e.target.checked })}
              />
              Required on every form (global)
            </label>
          </div>
        </div>

        {/* Picklist selector — shown only for PICKLIST and MULTI_SELECT types */}
        {(form.fieldType === 'PICKLIST' || form.fieldType === 'MULTI_SELECT') && (
          <div className="border border-amber-200 rounded-lg p-4 bg-amber-50/60">
            <FormField label="Linked picklist *" htmlFor="field-picklist">
              <select
                id="field-picklist"
                className="form-select"
                value={form.lookupEntity}
                onChange={(e) => setForm({ ...form, lookupEntity: e.target.value })}
              >
                <option value="">— Select a picklist —</option>
                {picklists.map((pl) => (
                  <option key={pl.id} value={pl.name}>{pl.label} ({pl.name})</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Don't see your picklist? Create it first under <strong>Configuration → Picklists</strong>.
              </p>
            </FormField>
          </div>
        )}

        <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/80 space-y-4">
          <p className="text-sm font-medium text-slate-800">Validation rules (optional)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {showLengthRules && (
              <>
                <FormField label="Minimum length" htmlFor="field-min-len">
                  <input
                    id="field-min-len"
                    type="number"
                    min={0}
                    className="form-input"
                    value={form.minLength}
                    onChange={(e) => setForm({ ...form, minLength: e.target.value })}
                  />
                </FormField>
                <FormField label="Maximum length" htmlFor="field-max-len">
                  <input
                    id="field-max-len"
                    type="number"
                    min={0}
                    className="form-input"
                    value={form.maxLength}
                    onChange={(e) => setForm({ ...form, maxLength: e.target.value })}
                  />
                </FormField>
              </>
            )}
            {showRangeRules && (
              <>
                <FormField
                  label="Minimum value"
                  htmlFor="field-min"
                  hint={form.fieldType.includes('DATE') ? 'YYYY-MM-DD for dates' : undefined}
                >
                  <input
                    id="field-min"
                    type="text"
                    className="form-input"
                    value={form.min}
                    onChange={(e) => setForm({ ...form, min: e.target.value })}
                  />
                </FormField>
                <FormField
                  label="Maximum value"
                  htmlFor="field-max"
                  hint={form.fieldType.includes('DATE') ? 'YYYY-MM-DD for dates' : undefined}
                >
                  <input
                    id="field-max"
                    type="text"
                    className="form-input"
                    value={form.max}
                    onChange={(e) => setForm({ ...form, max: e.target.value })}
                  />
                </FormField>
              </>
            )}
            <FormField
              label="Regex pattern"
              htmlFor="field-regex"
              hint="Example: ^[A-Z]{2}-[0-9]+$"
            >
              <input
                id="field-regex"
                type="text"
                className="form-input font-mono text-sm"
                value={form.regex}
                onChange={(e) => setForm({ ...form, regex: e.target.value })}
              />
            </FormField>
          </div>
        </div>

        <FormActions>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
            {saving ? 'Adding…' : 'Add field'}
          </button>
        </FormActions>
      </form>

      <div className="admin-section">
        <h2 className="admin-section-title">Existing fields ({fields.length})</h2>
        <FormField label="Search fields" htmlFor="field-search">
          <input
            id="field-search"
            type="search"
            className="form-input max-w-md"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </FormField>

        <div className="overflow-x-auto rounded-lg border border-slate-200 mt-4">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Field key</th>
                <th>Label</th>
                <th>Type</th>
                <th>Required</th>
                <th>Validation</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-8">
                    {fields.length === 0
                      ? 'No fields yet. Add one using the form above.'
                      : 'No fields match your search.'}
                  </td>
                </tr>
              )}
              {filtered.map((f) => (
                <tr key={f.id}>
                  <td>
                    <code className="text-xs bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded">
                      {f.fieldKey}
                    </code>
                    {f.isSystem && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">
                        System
                      </span>
                    )}
                  </td>
                  <td className="font-medium text-slate-900">{f.label}</td>
                  <td>
                    <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                      {FIELD_TYPES.find((t) => t.value === f.fieldType)?.label ?? f.fieldType}
                    </span>
                  </td>
                  <td>{f.isRequiredGlobal ? 'Yes' : 'No'}</td>
                  <td className="text-xs text-slate-600 max-w-[12rem] truncate" title={formatValidation(f.validationRules)}>
                    {formatValidation(f.validationRules)}
                  </td>
                  <td>
                    {!f.isSystem ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-link text-xs"
                          onClick={() => openRules(f)}
                        >
                          Rules
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={() => removeField(f.id, f.label)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Built-in</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rules panel — slides in when a field's Rules button is clicked */}
      {rulesField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Field rules — <code className="text-sm bg-slate-100 px-1.5 py-0.5 rounded">{rulesField.fieldKey}</code>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Rules control when this field is required, read-only, or hidden.</p>
              </div>
              <button type="button" className="text-slate-400 hover:text-slate-600 text-xl font-bold" onClick={() => setRulesField(null)}>✕</button>
            </div>

            <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Existing rules */}
              {rules.length === 0
                ? <p className="text-sm text-slate-400 italic">No rules yet for this field.</p>
                : (
                  <div className="space-y-2">
                    {rules.map((r) => (
                      <div key={r.id} className="flex items-start justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm">
                        <div>
                          <span className="font-medium text-slate-800">{RULE_TYPES.find((t) => t.value === r.ruleType)?.label ?? r.ruleType}</span>
                          {r.conditionExpression && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              When: <code className="bg-slate-100 px-1 rounded">{r.conditionExpression}</code>
                            </p>
                          )}
                          {r.statusCondition && (
                            <p className="text-xs text-slate-500">
                              Status: <code className="bg-slate-100 px-1 rounded">{r.statusCondition}</code>
                            </p>
                          )}
                        </div>
                        <button type="button" className="btn-danger text-xs shrink-0 ml-3" onClick={() => deleteRule(r.id)}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}

              {/* Add new rule */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Add rule</p>
                <div>
                  <label className="form-label">Rule type</label>
                  <select
                    className="form-select"
                    value={ruleForm.ruleType}
                    onChange={(e) => setRuleForm({ ...ruleForm, ruleType: e.target.value })}
                  >
                    {RULE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="form-label">Condition expression <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    className="form-input font-mono text-xs"
                    value={ruleForm.conditionExpression}
                    onChange={(e) => setRuleForm({ ...ruleForm, conditionExpression: e.target.value })}
                    placeholder="e.g. priority == 'URGENT'"
                  />
                  <p className="text-xs text-slate-400 mt-1">Leave blank to apply always. Use == and != operators.</p>
                </div>
                <div>
                  <label className="form-label">Apply only when status is <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input
                    className="form-input font-mono text-xs"
                    value={ruleForm.statusCondition}
                    onChange={(e) => setRuleForm({ ...ruleForm, statusCondition: e.target.value })}
                    placeholder="e.g. INPRG"
                  />
                </div>
                <button
                  type="button"
                  className="btn-primary !w-auto px-5"
                  onClick={saveRule}
                  disabled={savingRule}
                >
                  {savingRule ? 'Saving…' : 'Add rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </IdentityPageLayout>
  );
}


                