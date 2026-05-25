import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import type { ReportDefinitionRow, ReportSubject } from './report-types.js';

export function ReportDesignerPage() {
  const [subjects, setSubjects] = useState<ReportSubject[]>([]);
  const [reports, setReports] = useState<ReportDefinitionRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState('New report');
  const [subjectId, setSubjectId] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [chartType, setChartType] = useState('bar');
  const [dragField, setDragField] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [saving, setSaving] = useState(false);

  const subject = subjects.find((s) => s.id === subjectId);
  const available = useMemo(
    () => (subject?.availableFields ?? []).filter((f) => !selectedFields.includes(f.key)),
    [subject, selectedFields],
  );

  useEffect(() => {
    (async () => {
      const [s, r] = await Promise.all([
        api<ReportSubject[]>('/reports/subjects'),
        api<ReportDefinitionRow[]>('/reports/definitions'),
      ]);
      setSubjects(s);
      setReports(r);
      if (s[0] && !subjectId) setSubjectId(s[0].id);
    })();
  }, [subjectId]);

  const loadReport = (row: ReportDefinitionRow) => {
    setActiveId(row.id);
    setName(row.name);
    setSubjectId(row.subjectId);
    setSelectedFields(row.definition.fields ?? []);
    setChartType(row.definition.chartType ?? 'bar');
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name,
        subjectId,
        definition: { fields: selectedFields, chartType, chartConfig: { type: chartType } },
      };
      if (activeId) {
        await api(`/reports/definitions/${activeId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        const created = await api<ReportDefinitionRow>('/reports/definitions', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setActiveId(created.id);
        setReports((prev) => [...prev, created]);
      }
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    if (!activeId) {
      await save();
    }
    const id = activeId;
    if (!id) return;
    const res = await api<{ rows: Record<string, unknown>[] }>(
      `/reports/definitions/${id}/preview`,
    );
    setPreviewRows(res.rows);
  };

  const onDropCanvas = () => {
    if (!dragField || selectedFields.includes(dragField)) return;
    setSelectedFields((prev) => [...prev, dragField]);
    setDragField(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Report designer</h1>
        <Link to="/admin/reporting/library" className="text-sm text-blue-600">
          Report library
        </Link>
      </div>
      <div className="grid grid-cols-12 gap-4 min-h-[480px]">
        <aside className="col-span-3 border rounded-lg bg-white p-3">
          <h2 className="text-sm font-medium mb-2">Fields</h2>
          <select
            className="w-full border rounded px-2 py-1 mb-2 text-sm"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setSelectedFields([]);
            }}
          >
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <ul className="space-y-1">
            {available.map((f) => (
              <li
                key={f.key}
                draggable
                onDragStart={() => setDragField(f.key)}
                className="cursor-grab rounded border px-2 py-1 text-sm bg-slate-50"
              >
                {f.label}
              </li>
            ))}
          </ul>
        </aside>
        <section
          className="col-span-6 border rounded-lg bg-white p-4"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropCanvas}
        >
          <input
            className="border rounded px-2 py-1 w-full mb-3"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="text-xs text-slate-500 mb-2">Drop fields to build the report</p>
          <div className="flex flex-wrap gap-2 min-h-[120px]">
            {selectedFields.map((key) => {
              const label = subject?.availableFields.find((f) => f.key === key)?.label ?? key;
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-900 px-3 py-1 text-sm"
                >
                  {label}
                  <button
                    type="button"
                    className="text-blue-700"
                    onClick={() => setSelectedFields((p) => p.filter((k) => k !== key))}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
          <label className="block text-sm mt-4">
            Chart type
            <select
              className="ml-2 border rounded px-2 py-1"
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
            >
              <option value="bar">Bar</option>
              <option value="line">Line</option>
              <option value="pie">Pie</option>
              <option value="table">Table only</option>
            </select>
          </label>
          {previewRows.length > 0 && (
            <div className="mt-4 overflow-auto max-h-48 border rounded text-xs">
              <table className="w-full">
                <tbody>
                  {previewRows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t">
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-2 py-1">
                          {String(v ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="col-span-3 border rounded-lg bg-white p-3 space-y-2">
          <h2 className="text-sm font-medium">Saved reports</h2>
          <ul className="text-sm space-y-1 max-h-40 overflow-auto">
            {reports.map((r) => (
              <li key={r.id}>
                <button type="button" className="text-left hover:underline" onClick={() => loadReport(r)}>
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="w-full rounded bg-slate-900 text-white py-2 text-sm"
            disabled={saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save report'}
          </button>
          <button
            type="button"
            className="w-full rounded border py-2 text-sm"
            onClick={preview}
          >
            Preview data
          </button>
        </aside>
      </div>
    </div>
  );
}
