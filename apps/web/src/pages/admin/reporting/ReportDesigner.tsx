import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormActions,
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';
import type { ReportDefinitionRow, ReportSubject } from './report-types.js';

export function ReportDesignerPage() {
  const [subjects, setSubjects] = useState<ReportSubject[]>([]);
  const [reports, setReports] = useState<ReportDefinitionRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [chartType, setChartType] = useState('bar');
  const [dragField, setDragField] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const subject = subjects.find((s) => s.id === subjectId);
  const available = useMemo(
    () => (subject?.availableFields ?? []).filter((f) => !selectedFields.includes(f.key)),
    [subject, selectedFields],
  );

  useEffect(() => {
    (async () => {
      try {
        const [s, r] = await Promise.all([
          api<ReportSubject[]>('/reports/subjects'),
          api<ReportDefinitionRow[]>('/reports/definitions'),
        ]);
        setSubjects(s);
        setReports(r);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  const loadReport = (row: ReportDefinitionRow) => {
    setActiveId(row.id);
    setName(row.name);
    setSubjectId(row.subjectId);
    setSelectedFields(row.definition.fields ?? []);
    setChartType(row.definition.chartType ?? 'bar');
    setPreviewRows([]);
    setMsg(`Loaded “${row.name}”`);
  };

  const newReport = () => {
    setActiveId(null);
    setName('');
    setSubjectId(subjects[0]?.id ?? '');
    setSelectedFields([]);
    setChartType('bar');
    setPreviewRows([]);
    setMsg('');
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Enter a report name');
      return;
    }
    if (!subjectId) {
      setError('Select a data subject');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        subjectId,
        definition: { fields: selectedFields, chartType, chartConfig: { type: chartType } },
      };
      if (activeId) {
        await api(`/reports/definitions/${activeId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        setMsg('Report saved.');
      } else {
        const created = await api<ReportDefinitionRow>('/reports/definitions', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setActiveId(created.id);
        setReports((prev) => [...prev, created]);
        setMsg('Report created.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    setError('');
    if (!activeId) await save();
    const id = activeId;
    if (!id) return;
    try {
      const res = await api<{ rows: Record<string, unknown>[] }>(
        `/reports/definitions/${id}/preview`,
      );
      setPreviewRows(res.rows);
      setMsg(`Preview loaded (${res.rows.length} rows).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    }
  };

  const onDropCanvas = () => {
    if (!dragField || selectedFields.includes(dragField)) return;
    setSelectedFields((prev) => [...prev, dragField]);
    setDragField(null);
  };

  return (
    <IdentityPageLayout
      title="Report designer"
      subtitle="Type a report name, pick a subject, and drag fields onto the canvas"
      backTo="/admin/reporting/library"
      backLabel="Back to reports"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <aside className="lg:col-span-3 admin-section">
          <h2 className="admin-section-title">Available fields</h2>
          <FormField label="Data subject" htmlFor="report-subject">
            <select
              id="report-subject"
              className="form-select"
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setSelectedFields([]);
              }}
            >
              <option value="">Select subject…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </FormField>
          {!subjectId ? (
            <p className="text-sm text-slate-500">Choose a subject to see fields.</p>
          ) : (
            <ul className="space-y-1 mt-2">
              {available.map((f) => (
                <li
                  key={f.key}
                  draggable
                  onDragStart={() => setDragField(f.key)}
                  className="cursor-grab rounded border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-slate-50 hover:bg-white"
                >
                  {f.label}
                </li>
              ))}
              {available.length === 0 && (
                <li className="text-sm text-slate-500">All fields added to report.</li>
              )}
            </ul>
          )}
        </aside>

        <section
          className="lg:col-span-6 admin-section"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropCanvas}
        >
          <h2 className="admin-section-title">Report canvas</h2>
          <FormField label="Report name" htmlFor="report-name">
            <input
              id="report-name"
              type="text"
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type your report name"
            />
          </FormField>
          <p className="text-sm text-slate-600 mb-2">Drag fields from the left panel into this area.</p>
          <div className="flex flex-wrap gap-2 min-h-[120px] p-3 border border-dashed border-slate-300 rounded-lg bg-slate-50/50">
            {selectedFields.length === 0 && (
              <span className="text-sm text-slate-400 self-center">Drop fields here</span>
            )}
            {selectedFields.map((key) => {
              const label = subject?.availableFields.find((f) => f.key === key)?.label ?? key;
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded-full bg-orange-100 text-orange-900 px-3 py-1 text-sm"
                >
                  {label}
                  <button
                    type="button"
                    className="text-orange-800 hover:text-red-600"
                    onClick={() => setSelectedFields((p) => p.filter((k) => k !== key))}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
          <FormField label="Chart type" htmlFor="chart-type">
            <select
              id="chart-type"
              className="form-select max-w-xs"
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
            >
              <option value="bar">Bar chart</option>
              <option value="line">Line chart</option>
              <option value="pie">Pie chart</option>
              <option value="table">Table only</option>
            </select>
          </FormField>
          {previewRows.length > 0 && (
            <div className="mt-4 overflow-auto max-h-48 border border-slate-200 rounded-lg text-xs">
              <table className="admin-table">
                <tbody>
                  {previewRows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => (
                        <td key={j}>{String(v ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="lg:col-span-3 admin-section space-y-3">
          <h2 className="admin-section-title">Saved reports</h2>
          <button type="button" className="btn-outline w-full" onClick={newReport}>
            New report
          </button>
          <ul className="text-sm space-y-1 max-h-48 overflow-auto border border-slate-200 rounded-lg divide-y">
            {reports.length === 0 && (
              <li className="p-3 text-slate-500 text-center">No saved reports</li>
            )}
            {reports.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-slate-800 hover:bg-slate-50"
                  onClick={() => loadReport(r)}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
          <FormActions>
            <button type="button" className="btn-primary !w-auto flex-1" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save report'}
            </button>
            <button type="button" className="btn-outline flex-1" onClick={preview}>
              Preview data
            </button>
          </FormActions>
          <Link to="/admin/reporting/library" className="btn-link text-sm block text-center">
            View report library
          </Link>
        </aside>
      </div>
    </IdentityPageLayout>
  );
}
