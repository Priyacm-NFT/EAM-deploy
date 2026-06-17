import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, getAccessToken, isLoggedIn } from '../api/client.js';

interface SetupResponse {
  secret: string;
  qrDataUri: string;
  otpauthUri: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function mfaApi<T>(
  path: string,
  opts: RequestInit,
  bearerToken?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  const token = bearerToken ?? getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const method = (opts.method ?? 'GET').toUpperCase();
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const body = opts.body ?? (needsBody ? JSON.stringify({}) : undefined);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers, body });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const payload = err as { error?: string; message?: string };
    throw new Error(payload.error ?? payload.message ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export function MfaSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setupState = location.state as {
    mfa_session_token?: string;
    message?: string;
  } | null;
  const mfaSessionToken = setupState?.mfa_session_token ?? '';
  const setupMessage = setupState?.message ?? '';
  const setupOnly = Boolean(mfaSessionToken);
  const authToken = setupOnly ? mfaSessionToken : null;
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [mfaEnabled, setMfaEnabled] = useState(false);

  useEffect(() => {
    if (!setupOnly && !isLoggedIn()) {
      navigate('/login');
      return;
    }
    if (setupOnly) return;
    api<{ mfaEnabled: boolean }>('/auth/me')
      .then((me) => setMfaEnabled(me.mfaEnabled))
      .catch(() => undefined);
  }, [navigate, setupOnly]);

  async function startSetup() {
    setError('');
    setLoading(true);
    try {
      const data = await mfaApi<SetupResponse>(
        '/auth/mfa/setup',
        { method: 'POST' },
        authToken,
      );
      setSetup(data);
      setRecoveryCodes(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  async function verifySetup(e: React.FormEvent) {
    e.preventDefault();
    if (!setup) return;
    setError('');
    setLoading(true);
    try {
      const data = await mfaApi<{ recoveryCodes: string[] }>(
        '/auth/mfa/verify-setup',
        {
          method: 'POST',
          body: JSON.stringify({ secret: setup.secret, code }),
        },
        authToken,
      );
      setRecoveryCodes(data.recoveryCodes);
      setMfaEnabled(true);
      setSetup(null);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  async function disableMfa(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api('/auth/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ code: disableCode }),
      });
      setMfaEnabled(false);
      setDisableCode('');
      setSetup(null);
      setRecoveryCodes(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disable failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="auth-card">
        <h1 className="text-2xl font-bold text-primary mb-2">Two-factor authentication</h1>
        <p className="text-sm text-gray-500 mb-6">
          Protect your account with an authenticator app (Google Authenticator, Authy, etc.)
        </p>

        {setupMessage && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
            {setupMessage}
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {recoveryCodes && (
          <div className="space-y-4">
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              MFA is enabled. Save these recovery codes — they will not be shown again.
            </p>
            <ul className="grid grid-cols-2 gap-2 font-mono text-sm bg-gray-50 p-4 rounded border">
              {recoveryCodes.map((c) => (
                <li key={c} style={{ color: '#111827', fontWeight: 600 }}>{c}</li>
              ))}
            </ul>
          </div>
        )}

        {!recoveryCodes && mfaEnabled && !setup && !setupOnly && (
          <form onSubmit={disableMfa} className="space-y-4">
            <p className="text-sm text-gray-600">MFA is currently <strong>enabled</strong>.</p>
            <div>
              <label htmlFor="disable-code" className="form-label">
                Enter authenticator code to disable
              </label>
              <input
                id="disable-code"
                type="text"
                inputMode="numeric"
                className="form-input"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Disabling…' : 'Disable MFA'}
            </button>
          </form>
        )}

        {!recoveryCodes && !mfaEnabled && !setup && (
          <button type="button" onClick={startSetup} className="btn-primary" disabled={loading}>
            {loading ? 'Starting…' : 'Set up authenticator app'}
          </button>
        )}

        {!recoveryCodes && setup && (
          <form onSubmit={verifySetup} className="space-y-4">
            <img src={setup.qrDataUri} alt="MFA QR code" className="mx-auto w-48 h-48 rounded border" />
            <p className="text-xs text-gray-500 break-all text-center">
              Manual key: <span className="font-mono">{setup.secret}</span>
            </p>
            <div>
              <label htmlFor="verify-code" className="form-label">
                Enter the 6-digit code from your app
              </label>
              <input
                id="verify-code"
                type="text"
                inputMode="numeric"
                className="form-input text-center tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                placeholder="000000"
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Verifying…' : 'Enable MFA'}
            </button>
          </form>
        )}

        <p className="text-sm text-center text-gray-500 mt-6">
          <Link to={setupOnly ? '/login' : '/account'}>
            {setupOnly ? 'Back to sign in' : 'Back to account'}
          </Link>
        </p>
      </div>
    </div>
  );
}
