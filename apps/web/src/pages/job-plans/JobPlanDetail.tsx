import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DynamicFormRenderer } from '../../components/DynamicFormRenderer.js';
import { IdentityPageLayout, FormField, MessageBanner } from '../../components/identity/IdentityLayout.js';

type Tab = 'tasks' | 'labour' | 'materials' | 'tools' | 'safety';

interface JP { id: string; jpNum: string; description: string; longDescription: string | null; estimatedDurationHours: string | null }
interface Task { id: string; sequence: number; description: string; estimatedHours: string | null }
interface LabourLine { id: string; craft: string; estimatedHours: string; rate: string | null }
interface MaterialLine { id: string; description: string; qty: string; unitCost: string | null }
interface ToolLine { id: string; toolName: string; estimatedHours: string | null }
interface SafetyLine { id: string; sequence: number; hazardDescription: string; controlMeasure: string }

export function JobPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('tasks');
  const [jp, setJp] = useState<JP | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labour, setLabour] = useState<LabourLine[]>([]);
  const [materials, setMaterials] = useState<MaterialLine[]>([]);
  const [tools, setTools] = useState<ToolLine[]>([]);
  const [safety, setSafety] = useState<SafetyLine[]>([]);
  const [error, setError] = useState('');

  // New item forms
  const [newTask, setNewTask] = useState({ description: '', estimatedHours: '', sequence: '' });
  const [newLabour, setNewLabour] = useState({ craft: '', estimatedHours: '' });
  const [newMaterial, setNewMaterial] = useState({ description: '', qty: '1' });
  const [saving, setSaving] = useState(false);
  const [customData, setCustomData] = useState<Record<string, unknown>>({});

  const load = async () => {
    if (!id) return;
    try {
      const data = await api<JP & { tasks: Task[]; labour: LabourLine[]; materials: MaterialLine[]; tools: ToolLine[]; safety: SafetyLine[] }>(`/job-plans/${id}`);
      setJp(data); setTasks(data.tasks); setLabour(data.labour);
      setMaterials(data.materials); setTools(data.tools); setSafety(data.safety);
    } catch (e) { setError(String(e)); }
  };

  useEffect(() => { load(); }, [id]);

  const addTask = async () => {
    setSaving(true);
    try {
      await api(`/job-plans/${id}/tasks`, { method: 'POST', body: JSON.stringify({ ...newTask, sequence: parseInt(newTask.sequence) || tasks.length }) });
      setNewTask({ description: '', estimatedHours: '', sequence: '' });
      await load();
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  };

  const addLabour = async () => {
    setSaving(true);
    try {
      await api(`/job-plans/${id}/labour`, { method: 'POST', body: JSON.stringify(newLabour) });
      setNewLabour({ craft: '', estimatedHours: '' });
      await load();
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  };

  const addMaterial = async () => {
    setSaving(true);
    try {
      await api(`/job-plans/${id}/materials`, { method: 'POST', body: JSON.stringify(newMaterial) });
      setNewMaterial({ description: '', qty: '1' });
      await load();
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  };

  if (!jp) return <div className="admin-page"><p className="text-slate-400">Loading…</p></div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: 'tasks', label: `Tasks (${tasks.length})` },
    { id: 'labour', label: `Labour (${labour.length})` },
    { id: 'materials', label: `Materials (${materials.length})` },
    { id: 'tools', label: `Tools (${tools.length})` },
    { id: 'safety', label: `Safety (${safety.length})` },
  ];

  return (
    <IdentityPageLayout title={jp.jpNum} backTo="/job-plans" backLabel="Back to job plans">
      {error && <MessageBanner type="error" text={error} />}

      <div className="flex items-start gap-4 mb-4">
        <div className="flex-1">
          <p className="text-lg font-medium">{jp.description}</p>
          {jp.estimatedDurationHours && <p className="text-sm text-slate-500">Est. {jp.estimatedDurationHours} hours</p>}
          {jp.longDescription && <p className="text-sm text-slate-600 mt-1">{jp.longDescription}</p>}
        </div>
        <Link to={`/job-plans/${id}/edit`} className="btn-primary !w-auto px-4 text-sm">Edit</Link>
      </div>

      <div className="flex gap-1 border-b border-slate-200 mb-4" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            onClick={() => setTab(t.id)}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'tasks' && (
        <div className="admin-section">
          <table className="w-full text-sm mb-4">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="pb-2 pr-4">Seq</th><th className="pb-2 pr-4">Description</th><th className="pb-2">Est. hrs</th>
            </tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4 text-slate-400">{t.sequence}</td>
                  <td className="py-2 pr-4">{t.description}</td>
                  <td className="py-2">{t.estimatedHours ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bg-slate-50 rounded p-3 flex gap-3 items-end">
            <FormField label="Description" htmlFor="taskDesc">
              <input id="taskDesc" className="form-input" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })} />
            </FormField>
            <FormField label="Hrs" htmlFor="taskHrs">
              <input id="taskHrs" type="number" step="0.5" className="form-input w-20" value={newTask.estimatedHours} onChange={(e) => setNewTask({ ...newTask, estimatedHours: e.target.value })} />
            </FormField>
            <button type="button" className="btn-primary !w-auto px-4" onClick={addTask} disabled={saving}>+ Add</button>
          </div>
        </div>
      )}

      {tab === 'labour' && (
        <div className="admin-section">
          <table className="w-full text-sm mb-4">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="pb-2 pr-4">Craft</th><th className="pb-2">Est. hrs</th>
            </tr></thead>
            <tbody>
              {labour.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{l.craft}</td>
                  <td className="py-2">{l.estimatedHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bg-slate-50 rounded p-3 flex gap-3 items-end">
            <FormField label="Craft" htmlFor="lCraft">
              <input id="lCraft" className="form-input w-40" value={newLabour.craft} onChange={(e) => setNewLabour({ ...newLabour, craft: e.target.value })} />
            </FormField>
            <FormField label="Hours" htmlFor="lHrs">
              <input id="lHrs" type="number" step="0.5" className="form-input w-20" value={newLabour.estimatedHours} onChange={(e) => setNewLabour({ ...newLabour, estimatedHours: e.target.value })} />
            </FormField>
            <button type="button" className="btn-primary !w-auto px-4" onClick={addLabour} disabled={saving}>+ Add</button>
          </div>
        </div>
      )}

      {tab === 'materials' && (
        <div className="admin-section">
          <table className="w-full text-sm mb-4">
            <thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="pb-2 pr-4">Description</th><th className="pb-2">Qty</th>
            </tr></thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-2 pr-4">{m.description}</td>
                  <td className="py-2">{m.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bg-slate-50 rounded p-3 flex gap-3 items-end">
            <FormField label="Description" htmlFor="mDesc">
              <input id="mDesc" className="form-input" value={newMaterial.description} onChange={(e) => setNewMaterial({ ...newMaterial, description: e.target.value })} />
            </FormField>
            <FormField label="Qty" htmlFor="mQty">
              <input id="mQty" type="number" step="0.01" className="form-input w-20" value={newMaterial.qty} onChange={(e) => setNewMaterial({ ...newMaterial, qty: e.target.value })} />
            </FormField>
            <button type="button" className="btn-primary !w-auto px-4" onClick={addMaterial} disabled={saving}>+ Add</button>
          </div>
        </div>
      )}

      {tab === 'tools' && (
        <div className="admin-section">
          {tools.length === 0 ? <p className="text-slate-400 text-sm">No tools defined.</p> : (
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="pb-2 pr-4">Tool</th><th className="pb-2">Est. hrs</th>
            </tr></thead><tbody>
              {tools.map((t) => <tr key={t.id} className="border-b border-slate-100"><td className="py-2 pr-4">{t.toolName}</td><td className="py-2 text-slate-500">{t.estimatedHours ?? '—'}</td></tr>)}
            </tbody></table>
          )}
        </div>
      )}

      {tab === 'safety' && (
        <div className="admin-section">
          {safety.length === 0 ? <p className="text-slate-400 text-sm">No safety items.</p> : (
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500 border-b border-slate-200">
              <th className="pb-2 pr-4">Hazard</th><th className="pb-2">Control measure</th>
            </tr></thead><tbody>
              {safety.map((s) => <tr key={s.id} className="border-b border-slate-100"><td className="py-2 pr-4">{s.hazardDescription}</td><td className="py-2">{s.controlMeasure}</td></tr>)}
            </tbody></table>
          )}
        </div>
      )}
      {/* Custom fields from config engine */}
      <DynamicFormRenderer
        entityName="JobPlan"
        record={(jp as unknown as Record<string, unknown>) ?? {}}
        values={customData}
        onChange={(key, val) => setCustomData((prev) => ({ ...prev, [key]: val }))}
        readOnly
      />
    </IdentityPageLayout>
  );
}
