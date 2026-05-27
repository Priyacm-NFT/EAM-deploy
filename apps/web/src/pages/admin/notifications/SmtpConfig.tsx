import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

interface SmtpConfig {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromAddress: string;
  fromName: string;
  isActive: boolean;
  lastTestedAt: string | null;
  lastTestStatus: 'success' | 'failed' | null;
}

export function SmtpConfigPage() {
  const [config, setConfig] = useState<SmtpConfig | null>(null);
  const [form, setForm] = useState({
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromAddress: '',
    fromName: 'EAM Platform',
    isActive: true,
  });
  const [testEmail, setTestEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  function load() {
    api<SmtpConfig>('/admin/notifications/smtp')
      .then((c) => {
        setConfig(c);
        setForm({
          host: c.host,
          port: c.port,
          secure: c.secure,
          username: c.username,
          password: '',
          fromAddress: c.fromAddress,
          fromName: c.fromName,
          isActive: c.isActive,
        });
      })
      .catch(() => {});
  }

  useEffect(() => { load(); }, []);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const payload = { ...form, password: form.password || undefined };
      await api('/admin/notifications/smtp', { method: 'POST', body: JSON.stringify(payload) });
      setMsg('SMTP configuration saved.');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function sendTestEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!testEmail) { setError('Enter a test email address.'); return; }
    setTesting(true);
    setError('');
    setMsg('');
    try {
      await api('/admin/notifications/smtp/test', {
        method: 'POST',
        body: JSON.stringify({ toEmail: testEmail }),
      });
      setMsg(`Test email sent to ${testEmail}. Check your inbox.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed — check SMTP settings');
    } finally {
      setTesting(false);
    }
  }

  const statusColor = config?.lastTestStatus === 'success' ? 'bg-green-100 text-green-800 border-green-200' : config?.lastTestStatus === 'failed' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <IdentityPageLayout
      title="SMTP configuration"
      subtitle="Configure the outbound email server used for all system notifications — send a test email to verify"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      {/* Connection Status */}
      {config && (
        <div className="admin-section">
          <h2 className="admin-section-title">Connection status</h2>
          <div className="flex flex-wrap gap-4 items-center">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${statusColor}`}>
              <span className={`inline-block w-2 h-2 rounded-full ${config.lastTestStatus === 'success' ? 'bg-green-500' : config.lastTestStatus === 'failed' ? 'bg-red-500' : 'bg-slate-400'}`} />
              {config.lastTestStatus ? `Last test: ${config.lastTestStatus}` : 'Not yet tested'}
            </div>
            {config.lastTestedAt && (
              <p className="text-sm text-slate-500">
                Tested at: {new Date(config.lastTestedAt).toLocaleString()}
              </p>
            )}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${config.isActive ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {config.isActive ? 'Active' : 'Inactive'}
            </div>
          </div>
          <div className="text-sm text-slate-600 space-y-0.5 mt-2">
            <p><span className="font-medium">Server:</span> {config.host}:{config.port} {config.secure ? '(TLS)' : '(STARTTLS)'}</p>
            <p><span className="font-medium">From:</span> {config.fromName} &lt;{config.fromAddress}&gt;</p>
          </div>
        </div>
      )}

      {/* SMTP Settings Form */}
      <div className="admin-section">
        <h2 className="admin-section-title">SMTP settings</h2>
        <form onSubmit={saveConfig} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="SMTP host" htmlFor="smtp-host">
              <input id="smtp-host" className="form-input" required value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.sendgrid.net" />
            </FormField>
            <FormField label="Port" htmlFor="smtp-port">
              <input id="smtp-port" className="form-input" type="number" required value={form.port} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
            </FormField>
            <FormField label="Username" htmlFor="smtp-user">
              <input id="smtp-user" className="form-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="apikey or username" />
            </FormField>
            <FormField label="Password" htmlFor="smtp-pass" hint={config ? 'Leave blank to keep existing password' : ''}>
              <input id="smtp-pass" className="form-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={config ? '••••••••' : 'SMTP password or API key'} />
            </FormField>
            <FormField label="From address" htmlFor="smtp-from">
              <input id="smtp-from" className="form-input" required type="email" value={form.fromAddress} onChange={(e) => setForm({ ...form, fromAddress: e.target.value })} placeholder="noreply@yourcompany.com" />
            </FormField>
            <FormField label="From name" htmlFor="smtp-fname">
              <input id="smtp-fname" className="form-input" value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} placeholder="EAM Platform" />
            </FormField>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input type="checkbox" checked={form.secure} onChange={(e) => setForm({ ...form, secure: e.target.checked })} className="rounded border-slate-300 text-accent" />
              Use TLS (port 465) instead of STARTTLS
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm text-slate-700">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded border-slate-300 text-accent" />
              Active (use this configuration for outbound email)
            </label>
          </div>

          <div className="text-xs text-slate-400 bg-slate-50 rounded p-3 border border-slate-200 space-y-1">
            <p className="font-semibold text-slate-500">Common configurations</p>
            <p>SendGrid: host=smtp.sendgrid.net, port=587, user=apikey, pass=SG.*</p>
            <p>AWS SES: host=email-smtp.us-east-1.amazonaws.com, port=587, STARTTLS</p>
            <p>Office 365: host=smtp.office365.com, port=587, STARTTLS</p>
          </div>

          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>{saving ? 'Saving…' : 'Save SMTP settings'}</button>
        </form>
      </div>

      {/* Test Email */}
      <div className="admin-section">
        <h2 className="admin-section-title">Send test email</h2>
        <p className="text-sm text-slate-600">Verify the SMTP configuration by sending a test email.</p>
        <form onSubmit={sendTestEmail} className="flex gap-3 items-end max-w-md">
          <FormField label="Recipient email" htmlFor="test-email">
            <input id="test-email" className="form-input" type="email" required value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@company.com" />
          </FormField>
          <button type="submit" className="btn-outline shrink-0 mb-[1px]" disabled={testing || !config}>
            {testing ? 'Sending…' : 'Send test'}
          </button>
        </form>
        {!config && <p className="text-xs text-slate-400 mt-1">Save SMTP settings first before sending a test.</p>}
      </div>
    </IdentityPageLayout>
  );
}
