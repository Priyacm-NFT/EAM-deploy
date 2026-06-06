import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import { FormField, IdentityPageLayout, MessageBanner } from '../../../components/identity/IdentityLayout.js';

interface SmtpConfig {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;   // API uses fromEmail not fromAddress
  fromName: string;
  isActive: boolean;
}

export function SmtpConfigPage() {
  const [configs, setConfigs] = useState<SmtpConfig[]>([]);
  const [form, setForm] = useState({ host: '', port: 1025, secure: false, username: '', password: '', fromEmail: '', fromName: 'EAM Platform', isActive: true });
  const [editId, setEditId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<SmtpConfig[]>('/admin/notifications/smtp').then(setConfigs).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  function startEdit(c: SmtpConfig) {
    setEditId(c.id);
    setForm({ host: c.host, port: c.port, secure: c.secure, username: c.username ?? '', password: '', fromEmail: c.fromEmail, fromName: c.fromName ?? '', isActive: c.isActive });
  }

  function startNew() {
    setEditId(null);
    setForm({ host: 'localhost', port: 1025, secure: false, username: '', password: '', fromEmail: '', fromName: 'EAM Platform', isActive: true });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMsg('');
    try {
      const payload = { ...form, password: form.password || undefined };
      if (editId) {
        await api(`/admin/notifications/smtp/${editId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/admin/notifications/smtp', { method: 'POST', body: JSON.stringify(payload) });
      }
      setMsg('SMTP configuration saved.');
      setEditId(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally { setSaving(false); }
  }

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testEmail) { setError('Enter a test email address.'); return; }
    setTesting(true); setError(''); setMsg('');
    try {
      await api('/admin/notifications/smtp/test', { method: 'POST', body: JSON.stringify({ toEmail: testEmail }) });
      setMsg(`Test email sent to ${testEmail}. Check MailHog at localhost:8025`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed — check SMTP settings');
    } finally { setTesting(false); }
  }

  async function toggleActive(c: SmtpConfig) {
    await api(`/admin/notifications/smtp/${c.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !c.isActive }) });
    load();
  }

  return (
    <IdentityPageLayout title="SMTP Configuration" subtitle="Configure outbound email servers for system notifications">
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {/* Existing configs */}
      {configs.length > 0 && (
        <div className="admin-section">
          <h2 className="admin-section-title">Configured SMTP servers</h2>
          <div className="space-y-3">
            {configs.map((c) => (
              <div key={c.id} className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{c.host}:{c.port}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {c.secure && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">TLS</span>}
                  </div>
                  <p className="text-xs text-slate-500">From: {c.fromName} &lt;{c.fromEmail}&gt;</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => toggleActive(c)} className="btn-secondary !w-auto px-3 text-xs">
                    {c.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  <button type="button" onClick={() => startEdit(c)} className="btn-secondary !w-auto px-3 text-xs">Edit</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit form */}
      <div className="admin-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="admin-section-title">{editId ? 'Edit SMTP server' : 'Add SMTP server'}</h2>
          {editId && <button type="button" onClick={startNew} className="btn-link text-sm">+ Add new instead</button>}
        </div>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="SMTP host" htmlFor="smtp-host">
              <input id="smtp-host" className="form-input" required value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="localhost" />
            </FormField>
            <FormField label="Port" htmlFor="smtp-port">
              <input id="smtp-port" className="form-input" type="number" required value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
            </FormField>
            <FormField label="Username (optional)" htmlFor="smtp-user">
              <input id="smtp-user" className="form-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Leave blank if no auth" />
            </FormField>
            <FormField label="Password" htmlFor="smtp-pass" hint={editId ? 'Leave blank to keep existing' : ''}>
              <input id="smtp-pass" className="form-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editId ? '••••••••' : 'SMTP password'} />
            </FormField>
            <FormField label="From email" htmlFor="smtp-from">
              <input id="smtp-from" className="form-input" required type="email" value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} placeholder="noreply@company.com" />
            </FormField>
            <FormField label="From name" htmlFor="smtp-fname">
              <input id="smtp-fname" className="form-input" value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} placeholder="EAM Platform" />
            </FormField>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} className="rounded" />
              Use TLS (port 465)
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
              Active
            </label>
          </div>
          <div className="text-xs text-slate-400 bg-slate-50 rounded p-3 border border-slate-200">
            <p className="font-medium text-slate-500 mb-1">Local development (MailHog)</p>
            <p>Host: localhost &nbsp;|&nbsp; Port: 1025 &nbsp;|&nbsp; No username/password needed &nbsp;|&nbsp; View emails at <strong>localhost:8025</strong></p>
          </div>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
            {saving ? 'Saving…' : editId ? 'Update SMTP' : 'Save SMTP'}
          </button>
        </form>
      </div>

      {/* Test email */}
      {configs.some((c) => c.isActive) && (
        <div className="admin-section">
          <h2 className="admin-section-title">Send test email</h2>
          <p className="text-sm text-slate-600 mb-3">Verify configuration by sending a test email via the active SMTP server.</p>
          <form onSubmit={sendTest} className="flex gap-3 items-end max-w-md">
            <FormField label="Recipient email" htmlFor="test-email">
              <input id="test-email" className="form-input" type="email" required value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@company.com" />
            </FormField>
            <button type="submit" className="btn-primary !w-auto px-4 shrink-0 mb-[1px]" disabled={testing}>
              {testing ? 'Sending…' : 'Send test'}
            </button>
          </form>
        </div>
      )}
    </IdentityPageLayout>
  );
}

