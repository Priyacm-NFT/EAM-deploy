import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';
import { usePagination } from '../../../hooks/usePagination.js';
import { Pagination } from '../../../components/Pagination.js';

interface WorkflowRow {
  id: string;
  name: string;
  entityType: string;
  triggerCondition: string;
  currentVersion: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function WorkflowListPage() {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [filter, setFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', entityType: '', triggerCondition: '' });

  function load() {
    api<WorkflowRow[]>('/admin/workflows')
      .then(setWorkflows)
      .catch(() => setWorkflows([]));
  }

  useEffect(() => { load(); }, []);

  const entityTypes = [...new Set(workflows.map((w) => w.entityType))].sort();

  const filtered = workflows.filter((w) => {
    const matchText = !filter || w.name.toLowerCase().includes(filter.toLowerCase());
    const matchEntity = !entityFilter || w.entityType === entityFilter;
    return matchText && matchEntity;
  });

  async function createWorkflow(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    setCreating(true);
    try {
      const result = await api<WorkflowRow>('/admin/workflows', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      setMsg(`Workflow "${result.name}" created. Open the designer to build the flow.`);
      setShowCreate(false);
      setCreateForm({ name: '', entityType: '', triggerCondition: '' });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(w: WorkflowRow) {
    try {
      await api(`/admin/workflows/${w.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !w.isActive }),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function deleteWorkflow(w: WorkflowRow) {
    if (!window.confirm(`Delete workflow "${w.name}"? This cannot be undone.`)) return;
    try {
      await api(`/admin/workflows/${w.id}`, { method: 'DELETE' });
      setMsg(`Workflow "${w.name}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  const { page, setPage, paged, totalPages, totalItems } = usePagination(filtered, 10);

  return (
    <IdentityPageLayout
      title="Workflow builder"
      subtitle="Design, version, and deploy approval & automation workflows — changes never affect in-flight records"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <h2 className="admin-section-title">Workflows</h2>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <input
              type="search"
              placeholder="Search workflows…"
              className="form-input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <select
            className="form-select w-48"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
          >
            <option value="">All entity types</option>
            {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            type="button"
            className="btn-primary !w-auto px-4"
            onClick={() => setShowCreate((v) => !v)}
          >
            {showCreate ? 'Cancel' : '+ New workflow'}
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={createWorkflow}
            className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50"
          >
            <h3 className="font-semibold text-primary text-sm">New workflow</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FormField label="Workflow name" htmlFor="wf-name">
                <input
                  id="wf-name"
                  className="form-input"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. PR Approval Flow"
                />
              </FormField>
              <FormField label="Entity type" htmlFor="wf-entity">
                <input
                  id="wf-entity"
                  className="form-input"
                  required
                  value={createForm.entityType}
                  onChange={(e) => setCreateForm({ ...createForm, entityType: e.target.value })}
                  placeholder="e.g. purchase_requisition"
                />
              </FormField>
              <FormField label="Trigger condition" htmlFor="wf-trigger" hint="Status transition that activates this flow">
                <input
                  id="wf-trigger"
                  className="form-input"
                  value={createForm.triggerCondition}
                  onChange={(e) => setCreateForm({ ...createForm, triggerCondition: e.target.value })}
                  placeholder="e.g. DRAFT → WAPPR"
                />
              </FormField>
            </div>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary !w-auto px-6" disabled={creating}>
                {creating ? 'Creating…' : 'Create workflow'}
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Workflow name</th>
                <th>Entity</th>
                <th>Trigger</th>
                <th>Version</th>
                <th>Status</th>
                <th>Last updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center text-slate-400 py-10">
                    No workflows yet. Create one above, then open the designer to build the flow.
                  </td>
                </tr>
              )}
              {paged.map((w) => (
                <tr key={w.id}>
                  <td className="font-medium text-primary">{w.name}</td>
                  <td>
                    <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{w.entityType}</code>
                  </td>
                  <td className="text-sm text-slate-600">{w.triggerCondition || '—'}</td>
                  <td>
                    <span className="text-xs font-mono bg-accent/10 text-accent-dark px-2 py-0.5 rounded-full">
                      v{w.currentVersion}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleActive(w)}
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer ${
                        w.isActive
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {w.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="text-xs text-slate-500">
                    {new Date(w.updatedAt).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="flex gap-3 items-center">
                      <Link to={`/admin/workflows/${w.id}`} className="btn-link">
                        Designer
                      </Link>
                      <Link to={`/admin/workflows/${w.id}/history`} className="btn-link">
                        History
                      </Link>
                      <button type="button" className="btn-danger" onClick={() => deleteWorkflow(w)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    
      <Pagination page={page} totalPages={totalPages} totalItems={totalItems} pageSize={10} onChange={setPage} />
    </IdentityPageLayout>
  );
}
