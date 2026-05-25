export interface DynamicTableProps {
  columns: Array<{ field_key: string; label?: string }>;
  rows: Record<string, unknown>[];
}

export function DynamicTable({ columns, rows }: DynamicTableProps) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {columns.map((c) => (
              <th key={c.field_key} className="px-4 py-2 text-left font-medium">
                {c.label ?? c.field_key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              {columns.map((c) => (
                <td key={c.field_key} className="px-4 py-2">
                  {String(row[c.field_key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
