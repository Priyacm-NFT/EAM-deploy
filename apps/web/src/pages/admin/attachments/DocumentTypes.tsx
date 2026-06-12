import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';
import { usePagination } from '../../../hooks/usePagination.js';
import { Pagination } from '../../../components/Pagination.js';

interface DocumentType {
  id: string;
  name: string;
  label: string;
  description: string | null;
  allowedExtensions: string[];
  maxSizeBytes: number;
  retentionDays: number | null;
  visibility: 'PUBLIC' | 'ROLE_RESTRICTED';
  isActive: boolean;
  isSystem: boolean;
}

const EMPTY_FORM = {
  name: '',
  label: '',
  description: '',
  allowedExtensions: 'pdf,jpg,png,docx',
  maxSizeMb: 10,
  retentionDays: '',
  visibility: 'PUBLIC' as 'PUBLIC' | 'ROLE_RESTRICTED',
};

function mbToBytes(mb: number) { return mb * 1024 * 1024; }
function bytesToMb(bytes: number) { return Math.round(bytes / 1024 / 1024); }

export function DocumentTypesPage() {
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<DocumentType[]>('/admin/attachments/document-types')
      .then(setTypes)
      .catch(() => setTypes([]));
  }

  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const payload = {
        name: form.name,
        label: form.label || form.name,
        description: form.description || undefined,
        allowedExtensions: form.allowedExtensions
          .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
        maxSizeBytes: mbToBytes(Number(form.maxSizeMb)),
        retentionDays: form.retentionDays ? Number(form.retentionDays) : null,
        visibility: form.visibility,
      };
      if (editId) {
        await api(`/admin/attachments/document-types/${editId}`, {
          method: 'PUT', body: JSON.stringify(payload),
        });
        setMsg('Document type updated.');
      } else {
        await api('/admin/attachments/document-types', {
          method: 'POST', body: JSON.stringify(payload),
        });
        setMsg('Document type created.');
      }
      setShowCreate(false);
      setEditId(null);
      setForm(EMPTY_FORM);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(dt: DocumentType) {
    await api(`/admin/attachments/document-types/${dt.id}`, {
      method: 'PUT', body: JSON.stringify({ isActive: !dt.isActive }),
    });
    load();
  }

  async function deleteType(dt: DocumentType) {
    if (dt.isSystem) { setError('System document types cannot be deleted.'); return; }
    if (!window.confirm(`Delete document type "${dt.name}"?`)) return;
    await api(`/admin/attachments/document-types/${dt.id}`, { method: 'DELETE' });
    setMsg(`"${dt.name}" deleted.`);
    load();
  }

  function startEdit(dt: DocumentType) {
    setForm({
      name: dt.name,
      label: dt.label,
      description: dt.description ?? '',
      allowedExtensions: dt.allowedExtensions.join(', '),
      maxSizeMb: bytesToMb(dt.maxSizeBytes),
      retentionDays: dt.retentionDays?.toString() ?? '',
      visibility: dt.visibility,
    });
    setEditId(dt.id);
    setShowCreate(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }


  const { page, setPage, paged, totalPages, totalItems } = usePagination(types, 10);

  return (
    <IdentityPageLayout
      title="Document types"
      subtitle="Configure allowed file types, size limits, retention periods, and virus scan policies"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="admin-section-title">Document types</h2>
          <button
            type="button"
            className="btn-primary !w-auto px-4"
            onClick={() => {
              setShowCreate((v) => !v);
              setEditId(null);
              setForm(EMPTY_FORM);
            }}
          >
            {showCreate && !editId ? 'Cancel' : '+ New document type'}
          </button>
        </div>

        {showCreate && (
          <form
            onSubmit={submit}
            className="border border-slate-200 rounded-lg p-5 space-y-4 bg-slate-50 mb-6"
          >
            <h3 className="font-semibold text-sm text-slate-700">
              {editId ? 'Edit document type' : 'New document type'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField label="Name (internal key)" htmlFor="dt-name">
                <input
                  id="dt-name"
                  className="form-input"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. safety_certificate"
                />
              </FormField>
              <FormField label="Label (display name)" htmlFor="dt-label">
                <input
                  id="dt-label"
                  className="form-input"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="e.g. Safety Certificate"
                />
              </FormField>
              <FormField label="Allowed extensions" htmlFor="dt-ext" hint="Comma-separated: pdf, jpg, png">
                <input
                  id="dt-ext"
                  className="form-input"
                  value={form.allowedExtensions}
                  onChange={(e) => setForm({ ...form, allowedExtensions: e.target.value })}
                />
              </FormField>
              <FormField label="Max file size (MB)" htmlFor="dt-size">
                <input
                  id="dt-size"
                  className="form-input"
                  type="number"
                  min={1}
                  max={500}
                  value={form.maxSizeMb}
                  onChange={(e) => setForm({ ...form, maxSizeMb: Number(e.target.value) })}
                />
              </FormField>
              <FormField label="Retention (days)" htmlFor="dt-retention" hint="Leave blank for indefinite">
                <input
                  id="dt-retention"
                  className="form-input"
                  type="number"
                  min={1}
                  value={form.retentionDays}
                  onChange={(e) => setForm({ ...form, retentionDays: e.target.value })}
                  placeholder="365"
                />
              </FormField>
              <FormField label="Visibility" htmlFor="dt-vis">
                <select
                  id="dt-vis"
                  className="form-select"
                  value={form.visibility}
                  onChange={(e) => setForm({ ...form, visibility: e.target.value as 'PUBLIC' | 'ROLE_RESTRICTED' })}
                >
                  <option value="PUBLIC">Public (any authenticated user)</option>
                  <option value="ROLE_RESTRICTED">Role restricted</option>
                </select>
              </FormField>
            </div>

            <FormField label="Description" htmlFor="dt-desc">
              <input
                id="dt-desc"
                className="form-input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Brief description for users uploading this document type"
              />
            </FormField>

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                className="btn-primary !w-auto px-6"
                disabled={saving}
              >
                {saving ? 'Saving…' : editId ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                className="btn-secondary !w-auto px-4"
                onClick={() => { setShowCreate(false); setEditId(null); }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Extensions</th>
                <th>Max size</th>
                <th>Retention</th>
                <th>Visibility</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-400 py-10">
                    No document types defined yet.
                  </td>
                </tr>
              )}
              {paged.map((dt) => (
                <tr key={dt.id}>
                  <td>
                    <p className="font-medium text-primary">{dt.label || dt.name}</p>
                    {dt.description && (
                      <p className="text-xs text-slate-400">{dt.description}</p>
                    )}
                    {dt.isSystem && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">system</span>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {dt.allowedExtensions.map((ext) => (
                        <span
                          key={ext}
                          className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono"
                        >
                          .{ext}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-sm">{bytesToMb(dt.maxSizeBytes)} MB</td>
                  <td className="text-sm">
                    {dt.retentionDays ? `${dt.retentionDays}d` : 'Indefinite'}
                  </td>
                  <td>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      dt.visibility === 'PUBLIC'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {dt.visibility === 'PUBLIC' ? 'Public' : 'Restricted'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleActive(dt)}
                      className={`text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer ${
                        dt.isActive
                          ? 'bg-green-100 text-green-800 border-green-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {dt.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-link text-xs"
                        onClick={() => startEdit(dt)}
                      >
                        Edit
                      </button>
                      {!dt.isSystem && (
                        <button
                          type="button"
                          className="text-xs text-red-500 hover:text-red-700"
                          onClick={() => deleteType(dt)}
                        >
                          Delete
                        </button>
                      )}
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

