import * as React from 'react';
import { Input } from '../components/input.js';
import { Button } from '../components/button.js';

export interface FieldRuleState {
  visible: boolean;
  readonly: boolean;
  required: boolean;
}

export interface DynamicFormProps {
  entityName: string;
  fields?: Array<{ fieldKey: string; label: string; fieldType: string; required?: boolean }>;
  fieldRules?: Record<string, FieldRuleState>;
  initialData?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void;
  readOnly?: boolean;
}

export function DynamicForm({
  fields = [],
  fieldRules = {},
  initialData = {},
  onSubmit,
  readOnly,
}: DynamicFormProps) {
  const [data, setData] = React.useState(initialData);

  const visibleFields = fields.filter((f) => {
    const rule = fieldRules[f.fieldKey];
    if (rule && !rule.visible) return false;
    return true;
  });

  return (
    <form
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(data);
      }}
    >
      {visibleFields.map((f) => {
        const rule = fieldRules[f.fieldKey];
        const isReadOnly = readOnly || rule?.readonly;
        const isRequired = f.required || rule?.required;
        return (
          <label key={f.fieldKey} className="flex flex-col gap-1 text-sm">
            <span>
              {f.label}
              {isRequired ? ' *' : ''}
            </span>
            <Input
              value={String(data[f.fieldKey] ?? '')}
              readOnly={isReadOnly}
              onChange={(e) => setData((d) => ({ ...d, [f.fieldKey]: e.target.value }))}
            />
          </label>
        );
      })}
      {!readOnly && (
        <Button type="submit" className="col-span-full w-fit">
          Save
        </Button>
      )}
    </form>
  );
}
