import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { FormLayoutDefinition, FormLayoutSection } from './form-layout-types.js';
import { emptyFormLayout } from './form-layout-types.js';
import { DynamicForm } from '@eam/ui';
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
}

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

const DRAG_MIME = 'application/x-eam-field-key';

function newSection(): FormLayoutSection {
  return {
    id: crypto.randomUUID(),
    title: 'New section',
    columns: 2,
    fields: [],
  };
}

export function FormDesignerPage() {
  const { entityId } = useParams();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [forms, setForms] = useState<FormLayoutRow[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [layout, setLayout] = useState<FormLayoutDefinition>(emptyFormLayout());
  const [formName, setFormName] = useState('Default layout');
  const [preview, setPreview] = useState<PreviewMode>('desktop');
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const usedKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of layout.sections) {
      for (const f of s.fields) keys.add(f.fieldKey);
    }
    return keys;
  }, [layout]);

  const availableFields = fields.filter((f) => !usedKeys.has(f.fieldKey));
  const selectedSection = layout.sections.find((s) => s.id === selectedSectionId) ?? null;
  const targetSectionId = selectedSectionId ?? layout.sections[0]?.id ?? null;

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;
    (async () => {
      try {
        const [entities, fieldRows, formRows] = await Promise.all([
          api<Entity[]>('/admin/config/entities'),
          api<FieldRow[]>(`/admin/config/entities/${entityId}/fields`),
          api<FormLayoutRow[]>(`/admin/config/entities/${entityId}/forms`),
        ]);
        if (cancelled) return;
        setEntity(entities.find((e) => e.id === entityId) ?? null);
        setFields(fieldRows);
        setForms(formRows);
        if (formRows.length > 0) {
          const form = formRows[0]!;
          setActiveFormId(form.id);
          setLayout(form.definition?.sections ? form.definition : emptyFormLayout());
          setFormName(form.name);
        }
      } catch (e) {
        setError(String(e));
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
    setMsg('New layout created. Add a section, then add fields.');
  }

  function addSection() {
    const section = newSection();
    setLayout((l) => ({ sections: [...l.sections, section] }));
    setSelectedSectionId(section.id);
    setMsg('Section added. Drag a field onto it or use + Add on a field.');
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
    setDragOverSectionId(null);
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

  function handleDragStart(e: React.DragEvent, fieldKey: string) {
    e.dataTransfer.setData(DRAG_MIME, fieldKey);
    e.dataTransfer.setData('text/plain', fieldKey);
    e.dataTransfer.effectAllowed = 'copy';
  }

  function readDraggedFieldKey(e: React.DragEvent): string | null {
    return e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain') || null;
  }

  function handleDropOnSection(e: React.DragEvent, sectionId: string) {
    e.preventDefault();
    e.stopPropagation();
    const fieldKey = readDraggedFieldKey(e);
    if (fieldKey) addFieldToSection(sectionId, fieldKey);
    setDragOverSectionId(null);
  }

  function addFieldByClick(fieldKey: string) {
    if (!targetSectionId) {
      setError('Add a section first, then click + Add on a field.');
      return;
    }
    addFieldToSection(targetSectionId, fieldKey);
    setError('');
    setMsg(`Added field to section.`);
  }

  async function save() {
    if (!entityId) return;
    setError('');
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
      setMsg('Layout saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
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
    <IdentityPageLayout
      title={`Form designer — ${entity?.label ?? 'Entity'}`}
      backTo={entityId ? `/admin/config/entities/${entityId}/fields` : '/admin/config'}
      backLabel="Back to fields"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <div className="flex flex-wrap gap-4 items-end">
          <FormField label="Layout name" htmlFor="layout-name">
            <input
              id="layout-name"
              type="text"
              className="form-input min-w-[14rem]"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </FormField>
          <FormField label="Saved layout" htmlFor="layout-select">
            <select
              id="layout-select"
              className="form-select min-w-[14rem]"
              value={activeFormId ?? ''}
              onChange={(e) => {
                const f = forms.find((x) => x.id === e.target.value);
                if (f) selectForm(f);
              }}
            >
              {forms.length === 0 && <option value="">No layouts yet</option>}
              {forms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormActions>
            <button type="button" className="btn-outline" onClick={createForm}>
              New layout
            </button>
            <button type="button" className="btn-primary !w-auto px-5" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save layout'}
            </button>
          </FormActions>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Field palette */}
        <aside className="xl:col-span-3 admin-section">
          <h2 className="admin-section-title">Available fields</h2>
          <p className="text-sm text-slate-600 mb-3">
            Drag onto a section, or click <strong className="text-slate-900">+ Add</strong>.
          </p>
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500">
              No fields yet.{' '}
              <Link to={`/admin/config/entities/${entityId}/fields`} className="btn-link">
                Manage fields
              </Link>{' '}
              first.
            </p>
          ) : (
            <ul className="space-y-2 max-h-[420px] overflow-y-auto">
              {availableFields.map((f) => (
                <li
                  key={f.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, f.fieldKey)}
                  className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-white hover:border-accent cursor-grab active:cursor-grabbing"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{f.label}</p>
                    <p className="text-xs text-slate-500 font-mono truncate">{f.fieldKey}</p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-xs font-medium text-accent hover:text-accent-dark px-2 py-1 rounded border border-accent/30"
                    onClick={() => addFieldByClick(f.fieldKey)}
                  >
                    + Add
                  </button>
                </li>
              ))}
              {availableFields.length === 0 && fields.length > 0 && (
                <li className="text-sm text-slate-500 text-center py-4">All fields are on the form.</li>
              )}
            </ul>
          )}
          <button type="button" className="btn-primary !w-full mt-4" onClick={addSection}>
            + Add section
          </button>
        </aside>

        {/* Canvas */}
        <div className="xl:col-span-6 admin-section min-h-[28rem]">
          <h2 className="admin-section-title">Form canvas</h2>
          {layout.sections.length === 0 ? (
            <div className="border-2 border-dashed border-slate-300 rounded-lg p-10 text-center bg-slate-50">
              <p className="text-slate-700 font-medium mb-2">No sections yet</p>
              <p className="text-sm text-slate-500 mb-4">Click &quot;+ Add section&quot; on the left to start.</p>
              <button type="button" className="btn-primary !w-auto px-6" onClick={addSection}>
                Add first section
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {layout.sections.map((section) => {
                const isSelected = selectedSectionId === section.id;
                const isDragOver = dragOverSectionId === section.id;
                return (
                  <div
                    key={section.id}
                    className={`rounded-lg border-2 p-4 transition-colors ${
                      isDragOver
                        ? 'border-accent bg-orange-50'
                        : isSelected
                          ? 'border-accent/70 bg-white'
                          : 'border-slate-200 bg-white'
                    }`}
                    onClick={() => setSelectedSectionId(section.id)}
                  >
                    <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
                      <input
                        className="form-input !w-auto min-w-[10rem] font-medium"
                        value={section.title}
                        onChange={(e) => updateSection(section.id, { title: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{section.columns} column(s)</span>
                        <button
                          type="button"
                          className="btn-danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSection(section.id);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div
                      className={`grid gap-2 min-h-[5rem] p-3 rounded-lg border-2 border-dashed transition-colors ${
                        isDragOver ? 'border-accent bg-orange-50/80' : 'border-slate-200 bg-slate-50'
                      } ${
                        section.columns === 1
                          ? 'grid-cols-1'
                          : section.columns === 2
                            ? 'grid-cols-1 sm:grid-cols-2'
                            : 'grid-cols-1 sm:grid-cols-3'
                      }`}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setDragOverSectionId(section.id);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'copy';
                        setDragOverSectionId(section.id);
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverSectionId(null);
                        }
                      }}
                      onDrop={(e) => handleDropOnSection(e, section.id)}
                    >
                      {section.fields.length === 0 ? (
                        <p className="text-sm text-slate-500 col-span-full text-center py-6">
                          Drop fields here or click + Add on a field
                        </p>
                      ) : (
                        section.fields.map((pl) => {
                          const f = fields.find((x) => x.fieldKey === pl.fieldKey);
                          return (
                            <div
                              key={pl.fieldKey}
                              className="border border-slate-200 rounded-md bg-white px-3 py-2 text-sm flex justify-between items-center shadow-sm"
                            >
                              <span className="text-slate-900 font-medium">{f?.label ?? pl.fieldKey}</span>
                              <button
                                type="button"
                                className="text-slate-400 hover:text-red-600 text-lg leading-none"
                                onClick={() => removeFieldFromSection(section.id, pl.fieldKey)}
                                title="Remove from section"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Properties + preview */}
        <aside className="xl:col-span-3 admin-section space-y-4">
          <div>
            <h2 className="admin-section-title">Section properties</h2>
            {selectedSection ? (
              <FormField label="Columns" htmlFor="section-cols">
                <select
                  id="section-cols"
                  className="form-select"
                  value={selectedSection.columns}
                  onChange={(e) =>
                    updateSection(selectedSection.id, {
                      columns: Number(e.target.value) as 1 | 2 | 3,
                    })
                  }
                >
                  <option value={1}>1 column</option>
                  <option value={2}>2 columns</option>
                  <option value={3}>3 columns</option>
                </select>
              </FormField>
            ) : (
              <p className="text-sm text-slate-500">Click a section on the canvas to edit columns.</p>
            )}
          </div>

          <div>
            <h2 className="admin-section-title">Live preview</h2>
            <div className="flex gap-1 mb-3">
              {(['desktop', 'tablet', 'phone'] as PreviewMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`text-xs px-3 py-1 rounded capitalize ${
                    preview === m ? 'bg-accent text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  onClick={() => setPreview(m)}
                >
                  {m}
                </button>
              ))}
            </div>
            <div
              className="border border-slate-200 rounded-lg p-3 bg-white overflow-auto"
              style={{ maxHeight: '360px' }}
            >
              {layout.sections.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">Preview appears after you add sections.</p>
              ) : (
                <div className={preview === 'phone' ? 'max-w-[260px]' : preview === 'tablet' ? 'max-w-md' : ''}>
                  <DynamicForm
                    entityName=""
                    fields={dynamicFields}
                    layout={layout}
                    readOnly
                    previewColumns={PREVIEW_COLS[preview]}
                  />
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </IdentityPageLayout>
  );
}
