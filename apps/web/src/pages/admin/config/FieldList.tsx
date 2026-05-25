import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../api/client.js';

interface FieldRow {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequiredGlobal: boolean;
  isSystem: boolean;
  validationRules?: Record<string, unknown>;
}

export function ConfigFieldListPage() {
  const { entityId } = useParams();
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [form, setForm] = useState({
    fieldKey: '',
    label: '',
    fieldType: 'TEXT',
    isRequiredGlobal: false,
    min: '',
    max: '',
    minLength: '',
    maxLength: '',
    regex: '',
  });

  function load() {
    if (!entityId) return;
    api<FieldRow[]>(`/admin/config/entities/${entityId}/fields`).then(setFields);
  }

  useEffect(() => {
    load();
  }, [entityId]);

  async function addField(e: React.FormEvent) {
    e.preventDefault();
    if (!entityId) return;
    const validationRules: Record<string, unknown> = {};
    if (form.regex) validationRules.regex = form.regex;
    if (form.minLength) validationRules.minLength = Number(form.minLength);
    if (form.maxLength) validationRules.maxLength = Number(form.maxLength);
    if (form.min) {
      validationRules.min =
        form.fieldType === 'NUMBER' ? Number(form.min) : form.min;
    }
    if (form.max) {
      validationRules.max =
        form.fieldType === 'NUMBER' ? Number(form.max) : form.max;
    }

    await api(`/admin/config/entities/${entityId}/fields`, {
      method: 'POST',
      body: JSON.stringify({
        fieldKey: form.fieldKey,
        label: form.label,
        fieldType: form.fieldType,
        isRequiredGlobal: form.isRequiredGlobal,
        validationRules,
      }),
    });
    setForm({
      fieldKey: '',
      label: '',
      fieldType: 'TEXT',
      isRequiredGlobal: false,
      min: '',
      max: '',
      minLength: '',
      maxLength: '',
      regex: '',
    });
    load();
  }

  async function removeField(id: string) {
    if (!entityId || !confirm('Delete this field? The database column will be soft-dropped.')) return;
    await api(`/admin/config/entities/${entityId}/fields/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="max-w-4xl">
      <Link to="/admin/config" className="text-sm text-blue-600">
        ← Configuration
      </Link>
      <h1 className="text-xl font-semibold mt-2 mb-4">Entity fields</h1>

      <form onSubmit={addField} className="border rounded bg-white p-4 mb-6 space-y-3">
        <h2 className="font-medium text-sm">Add custom field</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            Field key
            <input
              className="border rounded w-full px-2 py-1 mt-1"
              value={form.fieldKey}
              onChange={(e) => setForm({ ...form, fieldKey: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            Label
            <input
              className="border rounded w-full px-2 py-1 mt-1"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            Type
            <select
              className="border rounded w-full px-2 py-1 mt-1"
              value={form.fieldType}
              onChange={(e) => setForm({ ...form, fieldType: e.target.value })}
            >
              <option value="TEXT">Text</option>
              <option value="NUMBER">Number</option>
              <option value="DATE">Date</option>
              <option value="BOOLEAN">Boolean</option>
            </select>
          </label>
          <label className="text-sm flex items-end gap-2">
            <input
              type="checkbox"
              checked={form.isRequiredGlobal}
              onChange={(e) => setForm({ ...form, isRequiredGlobal: e.target.checked })}
            />
            Required globally
          </label>
          <label className="text-sm">
            Min length
            <input
              className="border rounded w-full px-2 py-1 mt-1"
              type="number"
              value={form.minLength}
              onChange={(e) => setForm({ ...form, minLength: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Max length
            <input
              className="border rounded w-full px-2 py-1 mt-1"
              type="number"
              value={form.maxLength}
              onChange={(e) => setForm({ ...form, maxLength: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Min {form.fieldType === 'DATE' ? '(YYYY-MM-DD)' : '(value)'}
            <input
              className="border rounded w-full px-2 py-1 mt-1"
              value={form.min}
              onChange={(e) => setForm({ ...form, min: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Max {form.fieldType === 'DATE' ? '(YYYY-MM-DD)' : '(value)'}
            <input
              className="border rounded w-full px-2 py-1 mt-1"
              value={form.max}
              onChange={(e) => setForm({ ...form, max: e.target.value })}
            />
          </label>
          <label className="text-sm col-span-2">
            Regex
            <input
              className="border rounded w-full px-2 py-1 mt-1 font-mono text-xs"
              value={form.regex}
              onChange={(e) => setForm({ ...form, regex: e.target.value })}
            />
          </label>
        </div>
        <button type="submit" className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded">
          Add field
        </button>
      </form>

      <table className="w-full text-sm border rounded bg-white">
        <thead>
          <tr className="border-b bg-slate-50 text-left">
            <th className="p-2">Key</th>
            <th className="p-2">Label</th>
            <th className="p-2">Type</th>
            <th className="p-2">Validation</th>
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.id} className="border-b">
              <td className="p-2 font-mono text-xs">{f.fieldKey}</td>
              <td className="p-2">{f.label}</td>
              <td className="p-2">{f.fieldType}</td>
              <td className="p-2 text-xs text-slate-600">
                {f.validationRules && Object.keys(f.validationRules).length > 0
                  ? JSON.stringify(f.validationRules)
                  : '—'}
              </td>
              <td className="p-2 text-right">
                {!f.isSystem && (
                  <button
                    type="button"
                    className="text-red-600"
                    onClick={() => removeField(f.id)}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
