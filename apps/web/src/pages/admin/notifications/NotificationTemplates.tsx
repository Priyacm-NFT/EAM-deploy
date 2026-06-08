import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface NotificationTemplate {
  id: string;
  name: string;
  subjectTemplate: string;
  htmlTemplate: string;
  textTemplate: string | null;
  createdAt: string;
  updatedAt?: string;
}

const MERGE_FIELDS = ['{{wo_num}}', '{{assignee.name}}', '{{asset.description}}', '{{requester.name}}', '{{status}}', '{{site}}', '{{due_date}}'];

const DEFAULT_HTML = `<p>Hello {{assignee.name}},</p>
<p>Work order <strong>{{wo_num}}</strong> has been assigned to you.</p>
<p>Asset: {{asset.description}}<br/>Site: {{site}}<br/>Due: {{due_date}}</p>
<p>Please log in to EAM to review and action this work order.</p>`;

const EMPTY_FORM = { name: '', subjectTemplate: '', htmlTemplate: DEFAULT_HTML, textTemplate: '' };

export function NotificationTemplatesPage() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<NotificationTemplate[]>('/admin/notifications/templates').then(setTemplates).catch(() => setTemplates([]));
  }

  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const payload = { name: form.name, subjectTemplate: form.subjectTemplate, htmlTemplate: form.htmlTemplate, textTemplate: form.textTemplate || undefined };
      if (editId) {
        await api(`/admin/notifications/templates/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
        setMsg('Template updated.');
      } else {
        await api('/admin/notifications/templates', { method: 'POST', body: JSON.stringify(payload) });
        setMsg('Template created.');
      }
      setShowCreate(false);
      setEditId(null);
      setForm(EMPTY_FORM);
      setPreview(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function runPreview() {
    setPreviewing(true);
    setPreview(null);
    try {
      const result = await api<{ subject: string; html: string }>('/admin/notifications/templates/preview', {
        method: 'POST',
        body: JSON.stringify({ subjectTemplate: form.subjectTemplate, htmlTemplate: form.htmlTemplate }),
      });
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  async function deleteTemplate(t: NotificationTemplate) {
    if (!window.confirm(`Delete template "${t.name}"? Active triggers using this template will stop sending.`)) return;
    try {
      await api(`/admin/notifications/templates/${t.id}`, { method: 'DELETE' });
      setMsg(`"${t.name}" deleted.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  function startEdit(t: NotificationTemplate) {
    setForm({ name: t.name, subjectTemplate: t.subjectTemplate, htmlTemplate: t.htmlTemplate, textTemplate: t.textTemplate ?? '' });
    setEditId(t.id);
    setPreview(null);
    setShowCreate(true);
  }

  return (
    <IdentityPageLayout
      title="Notification templates"
      subtitle="Create and manage email templates with merge fields — used by workflow notification nodes and triggers"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <div className="admin-section">
        <h2 className="admin-section-title">Templates</h2>

        <div className="flex justify-end">
          <button type="button" className="btn-primary !w-auto px-4" onClick={() => { setShowCreate((v) => !v); setEditId(null); setForm(EMPTY_FORM); setPreview(null); }}>
            {showCreate && !editId ? 'Cancel' : '+ New template'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={submit} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-primary text-sm">{editId ? 'Edit template' : 'New template'}</h3>
              <div className="flex flex-wrap gap-1">
                {MERGE_FIELDS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="text-xs bg-accent/10 text-accent-dark px-1.5 py-0.5 rounded border border-accent/20 hover:bg-accent/20 transition-colors"
                    onClick={() => setForm((fm) => ({ ...fm, htmlTemplate: fm.htmlTemplate + f }))}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <FormField label="Template name" htmlFor="tpl-name">
              <input id="tpl-name" className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Work Order Assignment" />
            </FormField>
            <FormField label="Subject line" htmlFor="tpl-subj" hint="Merge fields supported">
              <input id="tpl-subj" className="form-input" required value={form.subjectTemplate} onChange={(e) => setForm({ ...form, subjectTemplate: e.target.value })} placeholder="Work Order {{wo_num}} assigned to you" />
            </FormField>
            <FormField label="HTML body" htmlFor="tpl-html" hint="Full HTML with merge fields">
              <textarea
                id="tpl-html"
                className="form-input font-mono text-xs"
                rows={10}
                required
                value={form.htmlTemplate}
                onChange={(e) => setForm({ ...form, htmlTemplate: e.target.value })}
              />
            </FormField>
            <FormField label="Plain-text body (optional)" htmlFor="tpl-text" hint="Fallback for email clients that don't render HTML">
              <textarea
                id="tpl-text"
                className="form-input text-xs"
                rows={3}
                value={form.textTemplate}
                onChange={(e) => setForm({ ...form, textTemplate: e.target.value })}
              />
            </FormField>

            <div className="flex gap-3">
              <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>{saving ? 'Saving…' : editId ? 'Update' : 'Create'}</button>
              <button type="button" className="btn-outline" disabled={previewing} onClick={runPreview}>{previewing ? 'Previewing…' : 'Preview'}</button>
              <button type="button" className="btn-outline text-slate-500" onClick={() => { setShowCreate(false); setEditId(null); setPreview(null); }}>Cancel</button>
            </div>

            {preview && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200">
                  Preview (sample data)
                </div>
                <div className="px-4 py-2 text-xs text-slate-600">
                  <strong>Subject:</strong> {preview.subject}
                </div>
                <div
                  className="px-4 py-3 text-sm border-t border-slate-100 bg-white"
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              </div>
            )}
          </form>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Template name</th>
                <th>Subject</th>
                <th>Last updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 && (
                <tr><td colSpan={4} className="text-center text-slate-400 py-10">No templates yet. Create one above.</td></tr>
              )}
              {templates.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium text-primary">{t.name}</td>
                  <td className="text-sm text-slate-600 max-w-xs truncate">{t.subjectTemplate}</td>
                  <td className="text-xs text-slate-500">{t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <div className="flex gap-3">
                      <button type="button" className="btn-link text-xs" onClick={() => startEdit(t)}>Edit</button>
                      <button type="button" className="btn-danger text-xs" onClick={() => deleteTemplate(t)}>Delete</button>
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
