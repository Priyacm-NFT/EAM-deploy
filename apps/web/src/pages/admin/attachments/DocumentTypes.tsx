import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface DocumentType {
  id: string;
  name: string;
  description: string;
  allowedExtensions: string[];
  maxFileSizeMb: number;
  retentionDays: number | null;
  visibility: 'public' | 'restricted';
  virusScanEnabled: boolean;
  scanAction: 'quarantine' | 'reject' | 'alert';
  mandatoryForStatuses: string[];
  isActive: boolean;
}

const EMPTY_FORM = {
  name: '',
  description: '',
  allowedExtensions: 'pdf,jpg,png,docx',
  maxFileSizeMb: 10,
  retentionDays: '',
  visibility: 'restricted' as 'public' | 'restricted',
  virusScanEnabled: true,
  scanAction: 'quarantine' as 'quarantine' | 'reject' | 'alert',
  mandatoryForStatuses: '',
};

export function DocumentTypesPage() {
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<DocumentType[]>('/admin/attachments/document-types').then(setTypes).catch(() => setTypes([]));
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
        description: form.description,
        allowedExtensions: form.allowedExtensions.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
        maxFileSizeMb: Number(form.maxFileSizeMb),
        retentionDays: form.retentionDays ? Number(form.retentionDays) : null,
        visibility: form.visibility,
        virusScanEnabled: form.virusScanEnabled,
        scanAction: form.scanAction,
        mandatoryForStatuses: form.mandatoryForStatuses.split(',').map((s) => s.trim()).filter(Boolean),
      };
      if (editId) {
        await api(`/admin/attachments/document-types/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg('Document type updated.');
      } else {
        await api('/admin/attachments/document-types', { method: 'POST', body: JSON.stringify(payload) });
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
    await api(`/admin/attachments/document-types/${dt.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !dt.isActive }) });
    load();
  }

  async function deleteType(dt: DocumentType) {
    if (!window.confirm(`Delete document type "${dt.name}"? Existing attachments of this type are unaffected.`)) return;
    await api(`/admin/attachments/document-types/${dt.id}`, { method: 'DELETE' });
    setMsg(`"${dt.name}" deleted.`);
    load();
  }

  function startEdit(dt: DocumentType) {
    setForm({
      name: dt.name,
      description: dt.description,
      allowedExtensions: dt.allowedExtensions.join(', '),
      maxFileSizeMb: dt.maxFileSizeMb,
      retentionDays: dt.retentionDays?.toString() ?? '',
      visibility: dt.visibility,
      virusScanEnabled: dt.virusScanEnabled,
      scanAction: dt.scanAction,
      mandatoryForStatuses: dt.mandatoryForStatuses.join(', '),
    });
    setEditId(dt.id);
    setShowCreate(true);
  }

  return (
    <IdentityPageLayout
      title="Document types"
      subtitle="Define allowed file types, size limits, retention periods, and virus scan policies for each document category"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <h2 className="admin-section-title">Document types</h2>

        <div className="flex justify-end">
          <button type="button" className="btn-outline" onClick={() => { setShowCreate((v) => !v); setEditId(null); setForm(EMPTY_FORM); }}>
            {showCreate && !editId ? 'Cancel' : '+ New document type'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={submit} className="border border-slate-200 rounded-lg p-4 space-y-4 bg-slate-50">
            <h3 className="font-semibold text-primary text-sm">{editId ? 'Edit document type' : 'New document type'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FormField label="Name" htmlFor="dt-name">
                <input id="dt-name" className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Safety Certificate" />
              </FormField>
              <FormField label="Allowed extensions" htmlFor="dt-ext" hint="Comma-separated, e.g. pdf, jpg, png">
                <input id="dt-ext" className="form-input" value={form.allowedExtensions} onChange={(e) => setForm({ ...form, allowedExtensions: e.target.value })} />
              </FormField>
              <FormField label="Max file size (MB)" htmlFor="dt-size">
                <input id="dt-size" className="form-input" type="number" min={1} max={500} value={form.maxFileSizeMb} onChange={(e) => setForm({ ...form, maxFileSizeMb: Number(e.target.value) })} />
              </FormField>
              <FormField label="Retention period (days)" htmlFor="dt-retention" hint="Leave blank for indefinite">
                <input id="dt-retention" className="form-input" type="number" min={1} value={form.retentionDays} onChange={(e) => setForm({ ...form, retentionDays: e.target.value })} placeholder="e.g. 365" />
              </FormField>
              <FormField label="Visibility" htmlFor="dt-vis">
                <select id="dt-vis" className="form-select" value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value as 'public' | 'restricted' })}>
                  <option value="restricted">Restricted (role-based)</option>
                  <option value="public">Public (any authenticated user)</option>
                </select>
              </FormField>
              <FormField label="Virus scan action" htmlFor="dt-scan">
                <select id="dt-scan" className="form-select" value={form.scanAction} onChange={(e) => setForm({ ...form, scanAction: e.target.value as 'quarantine' | 'reject' | 'alert' })}>
                  <option value="quarantine">Quarantine (hold for review)</option>
                  <option value="reject">Reject (delete file, notify uploader)</option>
                  <option value="alert">Alert only (accept but flag)</option>
                </select>
              </FormField>
            </div>
            <FormField label="Description" htmlFor="dt-desc">
              <input id="dt-desc" className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Brief description for users" />
            </FormField>
            <FormField label="Mandatory for statuses" htmlFor="dt-mandatory" hint="Comma-separated status codes that require this document type">
              <input id="dt-mandatory" className="form-input" value={form.mandatoryForStatuses} onChange={(e) => setForm({ ...form, mandatoryForStatuses: e.target.value })} placeholder="e.g. APPR, INPRG" />
            </FormField>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input type="checkbox" checked={form.virusScanEnabled} onChange={(e) => setForm({ ...form, virusScanEnabled: e.target.checked })} className="rounded border-slate-300 text-accent" />
              Enable virus scanning for this type
            </label>
            <div className="flex gap-3">
              <button type="submit" className="btn-outline" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
              <button type="button" className="btn-outline text-slate-500" onClick={() => { setShowCreate(false); setEditId(null); }}>Cancel</button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Allowed extensions</th>
                <th>Max size</th>
                <th>Retention</th>
                <th>Virus scan</th>
                <th>Visibility</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {types.length === 0 && (
                <tr><td colSpan={8} className="text-center text-slate-400 py-10">No document types defined yet.</td></tr>
              )}
              {types.map((dt) => (
                <tr key={dt.id}>
                  <td>
                    <p className="font-medium text-primary">{dt.name}</p>
                    <p className="text-xs text-slate-400">{dt.description}</p>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {dt.allowedExtensions.map((ext) => (
                        <span key={ext} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">.{ext}</span>
                      ))}
                    </div>
                  </td>
                  <td className="text-sm">{dt.maxFileSizeMb} MB</td>
                  <td className="text-sm">{dt.retentionDays ? `${dt.retentionDays}d` : 'Indefinite'}</td>
                  <td>
                    {dt.virusScanEnabled ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                        {dt.scanAction}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Disabled</span>
                    )}
                  </td>
                  <td>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${dt.visibility === 'public' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>
                      {dt.visibility}
                    </span>
                  </td>
                  <td>
                    <button type="button" onClick={() => toggleActive(dt)} className={`text-xs font-semibold px-2 py-0.5 rounded-full border cursor-pointer ${dt.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {dt.isActive ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button type="button" className="btn-link text-xs" onClick={() => startEdit(dt)}>Edit</button>
                      <button type="button" className="btn-danger text-xs" onClick={() => deleteType(dt)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </IdentityPageLayout>
  );
}
