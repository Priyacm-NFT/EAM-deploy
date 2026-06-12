import { useEffect, useState } from 'react';
import { api } from '../../../api/client.js';
import {
  FormField,
  IdentityPageLayout,
  MessageBanner,
} from '../../../components/identity/IdentityLayout.js';

type SmsProvider = 'twilio' | 'aws_sns' | 'msg91';

interface SmsConfig {
  provider: SmsProvider;
  isActive: boolean;
  fromNumber: string;
  accountSid?: string;
  authToken?: string;
  awsRegion?: string;
  awsAccessKeyId?: string;
  apiKey?: string;
  senderId?: string;
}

const PROVIDER_LABELS: Record<SmsProvider, string> = {
  twilio: 'Twilio',
  aws_sns: 'AWS SNS',
  msg91: 'MSG91',
};

const emptyForm: SmsConfig = {
  provider: 'twilio',
  isActive: true,
  fromNumber: '',
  accountSid: '',
  authToken: '',
  awsRegion: '',
  awsAccessKeyId: '',
  apiKey: '',
  senderId: '',
};

export function SmsConfigPage() {
  const [config, setConfig] = useState<SmsConfig>(emptyForm);
  const [saved, setSaved] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api<SmsConfig>('/admin/identity/sms-config').then((c) => {
      if (c && Object.keys(c).length > 0) {
        // Secret fields (apiKey, authToken) are not returned by GET for security.
        // Keep them as empty string — user must re-enter only if they want to change.
        setConfig({ ...emptyForm, ...c });
        setSaved(true);
      }
    }).catch(() => setSaved(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setMsg('');
    try {
      // Strip masked placeholder values before sending — backend keeps existing if empty
      const MASKED = '••••••••';
      const payload = {
        ...config,
        authToken: config.authToken === MASKED ? '' : config.authToken,
        apiKey:    config.apiKey    === MASKED ? '' : config.apiKey,
      };
      await api('/admin/identity/sms-config', {
        method: saved ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setMsg('SMS configuration saved.');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(e: React.FormEvent) {
    e.preventDefault();
    if (!testPhone) { setError('Enter a phone number to test.'); return; }
    setTesting(true); setError(''); setMsg('');
    try {
      const res = await api<{ ok: boolean; error?: string }>(
        '/admin/identity/sms-config/test',
        { method: 'POST', body: JSON.stringify({ phone: testPhone }) },
      );
      if (res.ok) setMsg(`Test SMS sent to ${testPhone}`);
      else setError(res.error ?? 'Test failed');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setTesting(false); }
  }

  function field(label: string, id: string, value: string, onChange: (v: string) => void, opts?: { type?: string; hint?: string; placeholder?: string }) {
    return (
      <FormField label={label} htmlFor={id} hint={opts?.hint}>
        <input
          id={id}
          type={opts?.type ?? 'text'}
          className="form-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={opts?.placeholder}
          autoComplete="off"
        />
      </FormField>
    );
  }

  return (
    <IdentityPageLayout
      title="SMS OTP configuration"
      subtitle="Configure the SMS provider used for multi-factor authentication one-time passwords"
    >
      {error && <MessageBanner type="error" text={error} />}
      {msg && <MessageBanner type="success" text={msg} />}

      <form onSubmit={save} className="admin-section">
        <h2 className="admin-section-title">Provider settings</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="SMS provider" htmlFor="sms-provider">
            <select
              id="sms-provider"
              className="form-select"
              value={config.provider}
              onChange={(e) => setConfig({ ...emptyForm, provider: e.target.value as SmsProvider, isActive: config.isActive })}
            >
              {(Object.keys(PROVIDER_LABELS) as SmsProvider[]).map((p) => (
                <option key={p} value={p}>{PROVIDER_LABELS[p]}</option>
              ))}
            </select>
          </FormField>

          {field('From number / sender ID', 'sms-from', config.fromNumber, (v) => setConfig({ ...config, fromNumber: v }), {
            placeholder: config.provider === 'msg91' ? 'EAMAPP' : '+1234567890',
            hint: config.provider === 'msg91' ? '6-char sender ID' : 'E.164 format',
          })}
        </div>

        {/* Twilio fields */}
        {config.provider === 'twilio' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {field('Account SID', 'tw-sid', config.accountSid ?? '', (v) => setConfig({ ...config, accountSid: v }), { placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' })}
            {field('Auth token', 'tw-token', config.authToken ?? '', (v) => setConfig({ ...config, authToken: v }), { type: 'password', placeholder: '••••••••' })}
          </div>
        )}

        {/* AWS SNS fields */}
        {config.provider === 'aws_sns' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {field('AWS region', 'aws-region', config.awsRegion ?? '', (v) => setConfig({ ...config, awsRegion: v }), { placeholder: 'ap-south-1' })}
            {field('AWS access key ID', 'aws-key', config.awsAccessKeyId ?? '', (v) => setConfig({ ...config, awsAccessKeyId: v }), { placeholder: 'AKIAIOSFODNN7EXAMPLE' })}
            {field('AWS secret access key', 'aws-secret', config.authToken ?? '', (v) => setConfig({ ...config, authToken: v }), { type: 'password', placeholder: '••••••••' })}
          </div>
        )}

        {/* MSG91 fields */}
        {config.provider === 'msg91' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {field('API key', 'msg-key', config.apiKey ?? '', (v) => setConfig({ ...config, apiKey: v }), { type: 'password', placeholder: '••••••••' })}
          </div>
        )}

        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-200">
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={config.isActive}
              onChange={(e) => setConfig({ ...config, isActive: e.target.checked })}
              className="rounded border-slate-300 text-accent"
            />
            Enable SMS OTP for MFA
          </label>
        </div>

        <div className="flex gap-3 mt-4">
          <button type="submit" className="btn-primary !w-auto px-6" disabled={saving}>
            {saving ? 'Saving…' : 'Save configuration'}
          </button>
        </div>
      </form>

      {/* Test SMS */}
      <form onSubmit={sendTest} className="admin-section">
        <h2 className="admin-section-title">Send test OTP</h2>
        <p className="text-sm text-slate-500 mb-4">
          Send a test 6-digit OTP to verify your SMS provider is configured correctly.
        </p>
        <div className="flex gap-3 items-end">
          <FormField label="Phone number" htmlFor="test-phone" hint="E.164 format e.g. +919876543210">
            <input
              id="test-phone"
              type="tel"
              className="form-input w-64"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+919876543210"
            />
          </FormField>
          <button type="submit" className="btn-primary !w-auto px-6" disabled={testing || !saved}>
            {testing ? 'Sending…' : 'Send test OTP'}
          </button>
        </div>
        {!saved && (
          <p className="text-xs text-amber-600 mt-2">Save configuration before sending a test.</p>
        )}
      </form>

      {/* Env vars reference */}
      <div className="admin-section">
        <h2 className="admin-section-title">Environment variables reference</h2>
        <p className="text-sm text-slate-500 mb-3">
          These values can also be set as environment variables in your deployment instead of saving via UI.
        </p>
        <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-slate-200 space-y-1">
          {config.provider === 'twilio' && (
            <>
              <p>SMS_PROVIDER=twilio</p>
              <p>TWILIO_ACCOUNT_SID=ACxxxxxxx</p>
              <p>TWILIO_AUTH_TOKEN=your_auth_token</p>
              <p>TWILIO_FROM_NUMBER=+1234567890</p>
            </>
          )}
          {config.provider === 'aws_sns' && (
            <>
              <p>SMS_PROVIDER=aws_sns</p>
              <p>AWS_REGION=ap-south-1</p>
              <p>AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE</p>
              <p>AWS_SECRET_ACCESS_KEY=your_secret</p>
              <p>SMS_FROM_NUMBER=+1234567890</p>
            </>
          )}
          {config.provider === 'msg91' && (
            <>
              <p>SMS_PROVIDER=msg91</p>
              <p>MSG91_API_KEY=your_api_key</p>
              <p>MSG91_SENDER_ID=EAMAPP</p>
            </>
          )}
        </div>
      </div>
    </IdentityPageLayout>
  );
}
