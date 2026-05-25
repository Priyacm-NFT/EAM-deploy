import * as React from 'react';
import type { FormLayoutDefinition } from '@eam/shared';
import { Input } from '../components/input.js';
import { Button } from '../components/button.js';

export interface FieldRuleState {
  visible: boolean;
  readonly: boolean;
  required: boolean;
}

export interface DynamicFormField {
  fieldKey: string;
  label: string;
  fieldType: string;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
}

export interface DynamicFormProps {
  entityName: string;
  fields?: DynamicFormField[];
  layout?: FormLayoutDefinition;
  fieldRules?: Record<string, FieldRuleState>;
  initialData?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void;
  readOnly?: boolean;
  previewColumns?: 1 | 2 | 3;
}

function gridClass(cols: 1 | 2 | 3): string {
  if (cols === 1) return 'grid-cols-1';
  if (cols === 2) return 'grid-cols-1 md:grid-cols-2';
  return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
}

function FieldInput({
  field,
  value,
  readOnly,
  required,
  onChange,
}: {
  field: DynamicFormField;
  value: unknown;
  readOnly?: boolean;
  required?: boolean;
  onChange: (v: unknown) => void;
}) {
  const common = {
    readOnly,
    required,
    placeholder: field.placeholder,
  };

  if (field.fieldType === 'BOOLEAN') {
    return (
      <input
        type="checkbox"
        checked={Boolean(value)}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }

  if (field.fieldType === 'NUMBER') {
    return (
      <Input
        type="number"
        value={value === undefined || value === null ? '' : String(value)}
        {...common}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    );
  }

  if (field.fieldType === 'DATE') {
    return (
      <Input
        type="date"
        value={String(value ?? '')}
        {...common}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <Input
      value={String(value ?? '')}
      {...common}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function DynamicForm({
  fields = [],
  layout,
  fieldRules = {},
  initialData = {},
  onSubmit,
  readOnly,
  previewColumns,
}: DynamicFormProps) {
  const [data, setData] = React.useState(initialData);

  const fieldByKey = React.useMemo(
    () => new Map(fields.map((f) => [f.fieldKey, f])),
    [fields],
  );

  const visibleFields = fields.filter((f) => {
    const rule = fieldRules[f.fieldKey];
    return !(rule && !rule.visible);
  });

  function renderField(f: DynamicFormField) {
    const rule = fieldRules[f.fieldKey];
    const isReadOnly = readOnly || rule?.readonly;
    const isRequired = f.required || rule?.required;
    return (
      <label key={f.fieldKey} className="flex flex-col gap-1 text-sm">
        <span>
          {f.label}
          {isRequired ? ' *' : ''}
        </span>
        <FieldInput
          field={f}
          value={data[f.fieldKey]}
          readOnly={isReadOnly}
          required={isRequired}
          onChange={(v) => setData((d) => ({ ...d, [f.fieldKey]: v }))}
        />
        {f.helpText ? <span className="text-xs text-slate-500">{f.helpText}</span> : null}
      </label>
    );
  }

  const sections =
    layout?.sections?.length
      ? layout.sections
      : [{ id: 'default', title: '', columns: (previewColumns ?? 3) as 1 | 2 | 3, fields: visibleFields.map((f) => ({ fieldKey: f.fieldKey })) }];

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(data);
      }}
    >
      {sections.map((section) => {
        const cols = previewColumns ?? section.columns;
        const sectionFields = section.fields
          .map((pl) => fieldByKey.get(pl.fieldKey))
          .filter((f): f is DynamicFormField => Boolean(f))
          .filter((f) => {
            const rule = fieldRules[f.fieldKey];
            return !(rule && !rule.visible);
          });

        if (sectionFields.length === 0) return null;

        return (
          <div key={section.id}>
            {section.title ? (
              <h3 className="text-sm font-semibold text-slate-700 mb-3">{section.title}</h3>
            ) : null}
            <div className={`grid gap-4 ${gridClass(cols)}`}>
              {sectionFields.map(renderField)}
            </div>
          </div>
        );
      })}
      {!readOnly && onSubmit && (
        <Button type="submit" className="w-fit">
          Save
        </Button>
      )}
    </form>
  );
}
