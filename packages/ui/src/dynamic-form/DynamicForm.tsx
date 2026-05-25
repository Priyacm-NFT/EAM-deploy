import * as React from 'react';
import { Input } from '../components/input.js';
import { Button } from '../components/button.js';

export interface DynamicFormProps {
  entityName: string;
  fields?: Array<{ fieldKey: string; label: string; fieldType: string; required?: boolean }>;
  initialData?: Record<string, unknown>;
  onSubmit?: (data: Record<string, unknown>) => void;
  readOnly?: boolean;
}

export function DynamicForm({
  fields = [],
  initialData = {},
  onSubmit,
  readOnly,
}: DynamicFormProps) {
  const [data, setData] = React.useState(initialData);

  return (
    <form
      className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.(data);
      }}
    >
      {fields.map((f) => (
        <label key={f.fieldKey} className="flex flex-col gap-1 text-sm">
          <span>
            {f.label}
            {f.required ? ' *' : ''}
          </span>
          <Input
            value={String(data[f.fieldKey] ?? '')}
            readOnly={readOnly}
            onChange={(e) => setData((d) => ({ ...d, [f.fieldKey]: e.target.value }))}
          />
        </label>
      ))}
      {!readOnly && (
        <Button type="submit" className="col-span-full w-fit">
          Save
        </Button>
      )}
    </form>
  );
}
