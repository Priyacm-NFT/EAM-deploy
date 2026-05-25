import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { FormLayoutDefinition, FormLayoutSection } from './form-layout-types.js';
import { emptyFormLayout } from './form-layout-types.js';
import { DynamicForm } from '@eam/ui';
import { api } from '../../../api/client.js';

interface FieldRow {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequiredGlobal: boolean;
  placeholder?: string;
  helpText?: string;
}

interface FormLayoutRow {
  id: string;
  name: string;
  definition: FormLayoutDefinition;
  isActive: boolean;
}

type PreviewMode = 'desktop' | 'tablet' | 'phone';

const PREVIEW_COLS: Record<PreviewMode, 1 | 2 | 3> = {
  desktop: 3,
  tablet: 2,
  phone: 1,
};

function newSection(): FormLayoutSection {
  return {
    id: crypto.randomUUID(),
    title: 'Section',
    columns: 2,
    fields: [],
  };
}

export function FormDesignerPage() {
  const { entityId } = useParams();
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [forms, setForms] = useState<FormLayoutRow[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [layout, setLayout] = useState<FormLayoutDefinition>(emptyFormLayout());
  const [formName, setFormName] = useState('Default layout');
  const [preview, setPreview] = useState<PreviewMode>('desktop');
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [dragFieldKey, setDragFieldKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const usedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of layout.sections) {
      for (const f of s.fields) keys.add(f.fieldKey);
    }
    return keys;
  }, [layout]);

  const availableFields = fields.filter((f) => !usedKeys.has(f.fieldKey));

  const selectedSection = layout.sections.find((s) => s.id === selectedSectionId) ?? null;

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;
    (async () => {
      const [fieldRows, formRows] = await Promise.all([
        api<FieldRow[]>(`/admin/config/entities/${entityId}/fields`),
        api<FormLayoutRow[]>(`/admin/config/entities/${entityId}/forms`),
      ]);
      if (cancelled) return;
      setFields(fieldRows);
      setForms(formRows);
      if (formRows.length > 0) {
        setActiveFormId((prev) => {
          const pick = prev ? formRows.find((f) => f.id === prev) : formRows[0];
          const form = pick ?? formRows[0]!;
          setLayout(form.definition?.sections ? form.definition : emptyFormLayout());
          setFormName(form.name);
          return form.id;
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entityId]);

  async function reloadForms() {
    if (!entityId) return;
    const formRows = await api<FormLayoutRow[]>(`/admin/config/entities/${entityId}/forms`);
    setForms(formRows);
  }

  function selectForm(form: FormLayoutRow) {
    setActiveFormId(form.id);
    setLayout(form.definition?.sections ? form.definition : emptyFormLayout());
    setFormName(form.name);
    setSelectedSectionId(null);
  }

  async function createForm() {
    if (!entityId) return;
    const created = await api<FormLayoutRow>(`/admin/config/entities/${entityId}/forms`, {
      method: 'POST',
      body: JSON.stringify({ name: 'New layout', definition: emptyFormLayout() }),
    });
    setForms((prev) => [...prev, created]);
    selectForm(created);
  }

  function addSection() {
    const section = newSection();
    setLayout((l) => ({ sections: [...l.sections, section] }));
    setSelectedSectionId(section.id);
  }

  function updateSection(sectionId: string, patch: Partial<FormLayoutSection>) {
    setLayout((l) => ({
      sections: l.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
    }));
  }

  function removeSection(sectionId: string) {
    setLayout((l) => ({ sections: l.sections.filter((s) => s.id !== sectionId) }));
    if (selectedSectionId === sectionId) setSelectedSectionId(null);
  }

  function addFieldToSection(sectionId: string, fieldKey: string) {
    setLayout((l) => ({
      sections: l.sections.map((s) =>
        s.id === sectionId && !s.fields.some((f) => f.fieldKey === fieldKey)
          ? { ...s, fields: [...s.fields, { fieldKey }] }
          : s,
      ),
    }));
    setDragFieldKey(null);
  }

  function removeFieldFromSection(sectionId: string, fieldKey: string) {
    setLayout((l) => ({
      sections: l.sections.map((s) =>
        s.id === sectionId
          ? { ...s, fields: s.fields.filter((f) => f.fieldKey !== fieldKey) }
          : s,
      ),
    }));
  }

  async function save() {
    if (!entityId) return;
    setSaving(true);
    try {
      if (activeFormId) {
        await api(`/admin/config/entities/${entityId}/forms/${activeFormId}`, {
          method: 'PUT',
          body: JSON.stringify({ name: formName, definition: layout }),
        });
      } else {
        const created = await api<FormLayoutRow>(`/admin/config/entities/${entityId}/forms`, {
          method: 'POST',
          body: JSON.stringify({ name: formName, definition: layout }),
        });
        setActiveFormId(created.id);
        setForms((prev) => [...prev, created]);
      }
      await reloadForms();
    } finally {
      setSaving(false);
    }
  }

  const dynamicFields = fields.map((f) => ({
    fieldKey: f.fieldKey,
    label: f.label,
    fieldType: f.fieldType,
    required: f.isRequiredGlobal,
    placeholder: f.placeholder,
    helpText: f.helpText,
  }));

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-4 mb-3">
        <Link to="/admin/config" className="text-sm text-blue-600">
          ← Configuration
        </Link>
        <h1 className="text-xl font-semibold">Form designer</h1>
        <select
          className="border rounded text-sm px-2 py-1 ml-auto"
          value={activeFormId ?? ''}
          onChange={(e) => {
            const f = forms.find((x) => x.id === e.target.value);
            if (f) selectForm(f);
          }}
        >
          {forms.length === 0 && <option value="">No layouts</option>}
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button type="button" className="text-sm text-blue-600" onClick={createForm}>
          + New layout
        </button>
        <button
          type="button"
          className="bg-blue-600 text-white text-sm px-3 py-1.5 rounded disabled:opacity-50"
          disabled={saving}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <label className="text-sm mb-2 block max-w-xs">
        Layout name
        <input
          className="border rounded w-full px-2 py-1 mt-1"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
        />
      </label>

      <div className="flex flex-1 gap-3 min-h-0">
        <aside className="w-52 shrink-0 border rounded bg-white p-3 overflow-y-auto">
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-2">Fields</h2>
          <p className="text-xs text-slate-500 mb-2">Drag onto a section</p>
          <ul className="space-y-1">
            {availableFields.map((f) => (
              <li
                key={f.id}
                draggable
                onDragStart={() => setDragFieldKey(f.fieldKey)}
                onDragEnd={() => setDragFieldKey(null)}
                className="text-sm border rounded px-2 py-1.5 cursor-grab bg-slate-50 hover:bg-slate-100"
              >
                {f.label}
                <span className="block text-xs text-slate-400 font-mono">{f.fieldKey}</span>
              </li>
            ))}
            {availableFields.length === 0 && (
              <li className="text-xs text-slate-400">All fields placed</li>
            )}
          </ul>
          <button
            type="button"
            className="mt-4 w-full text-sm border rounded py-1.5 hover:bg-slate-50"
            onClick={addSection}
          >
            + Add section
          </button>
        </aside>

        <div className="flex-1 border rounded bg-white p-4 overflow-y-auto min-w-0">
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-3">Canvas</h2>
          {layout.sections.length === 0 ? (
            <p className="text-sm text-slate-500">Add a section, then drag fields into it.</p>
          ) : (
            <div className="space-y-4">
              {layout.sections.map((section) => (
                <div
                  key={section.id}
                  className={`border-2 rounded-lg p-3 ${
                    selectedSectionId === section.id ? 'border-blue-500' : 'border-dashed border-slate-200'
                  }`}
                  onClick={() => setSelectedSectionId(section.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragFieldKey) addFieldToSection(section.id, dragFieldKey);
                  }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <input
                      className="font-medium text-sm border-b border-transparent focus:border-slate-300 outline-none"
                      value={section.title}
                      onChange={(e) => updateSection(section.id, { title: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-xs text-slate-400">{section.columns} col</span>
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSection(section.id);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <div
                    className={`grid gap-2 min-h-[4rem] p-2 rounded bg-slate-50/80 ${
                      section.columns === 1
                        ? 'grid-cols-1'
                        : section.columns === 2
                          ? 'grid-cols-2'
                          : 'grid-cols-3'
                    }`}
                  >
                    {section.fields.length === 0 ? (
                      <p className="text-xs text-slate-400 col-span-full text-center py-4">
                        Drop fields here
                      </p>
                    ) : (
                      section.fields.map((pl) => {
                        const f = fields.find((x) => x.fieldKey === pl.fieldKey);
                        return (
                          <div
                            key={pl.fieldKey}
                            className="border rounded bg-white px-2 py-2 text-sm flex justify-between"
                          >
                            <span>{f?.label ?? pl.fieldKey}</span>
                            <button
                              type="button"
                              className="text-xs text-slate-400 hover:text-red-600"
                              onClick={() => removeFieldFromSection(section.id, pl.fieldKey)}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="w-56 shrink-0 border rounded bg-white p-3 overflow-y-auto">
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-2">Section</h2>
          {selectedSection ? (
            <div className="space-y-3 text-sm">
              <label className="block">
                Columns
                <select
                  className="border rounded w-full mt-1 px-2 py-1"
                  value={selectedSection.columns}
                  onChange={(e) =>
                    updateSection(selectedSection.id, {
                      columns: Number(e.target.value) as 1 | 2 | 3,
                    })
                  }
                >
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Select a section to edit properties</p>
          )}

          <h2 className="text-xs font-semibold text-slate-500 uppercase mt-6 mb-2">Preview</h2>
          <div className="flex gap-1 mb-2">
            {(['desktop', 'tablet', 'phone'] as PreviewMode[]).map((m) => (
              <button
                key={m}
                type="button"
                className={`text-xs px-2 py-0.5 rounded ${
                  preview === m ? 'bg-blue-600 text-white' : 'bg-slate-100'
                }`}
                onClick={() => setPreview(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div
            className={`border rounded p-2 bg-slate-50 overflow-auto ${
              preview === 'phone' ? 'max-w-[280px]' : preview === 'tablet' ? 'max-w-md' : ''
            }`}
            style={{ maxHeight: '320px' }}
          >
            <DynamicForm
              entityName=""
              fields={dynamicFields}
              layout={layout}
              readOnly
              previewColumns={PREVIEW_COLS[preview]}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
