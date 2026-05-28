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

/** Shield / MFA visual for the left panel */
function MfaIllustration() {
  return (
    <svg viewBox="0 0 300 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[260px] mx-auto">
      {/* Outer glow ring */}
      <circle cx="150" cy="105" r="80" stroke="white" strokeOpacity="0.06" strokeWidth="32"/>
      <circle cx="150" cy="105" r="60" stroke="white" strokeOpacity="0.08" strokeWidth="16"/>

      {/* Shield body */}
      <path
        d="M150 28 L198 48 L198 98 C198 132 174 158 150 168 C126 158 102 132 102 98 L102 48 Z"
        fill="url(#shieldGrad)" stroke="white" strokeOpacity="0.2" strokeWidth="1.5"
      />

      {/* Lock icon inside shield */}
      <rect x="136" y="82" width="28" height="22" rx="4" fill="white" fillOpacity="0.2" stroke="white" strokeOpacity="0.5" strokeWidth="1.5"/>
      <path d="M142 82 L142 76 C142 72.686 144.686 70 148 70 L152 70 C155.314 70 158 72.686 158 76 L158 82"
        stroke="white" strokeOpacity="0.7" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="150" cy="93" r="3" fill="white" fillOpacity="0.9"/>
      <rect x="149" y="93" width="2" height="6" rx="1" fill="white" fillOpacity="0.9"/>

      {/* Floating code dots */}
      <g>
        <circle cx="88" cy="65" r="4" fill="#f97316" fillOpacity="0.7"/>
        <circle cx="98" cy="65" r="4" fill="#f97316" fillOpacity="0.4"/>
        <circle cx="108" cy="65" r="4" fill="#f97316" fillOpacity="0.7"/>
        <circle cx="118" cy="65" r="4" fill="#f97316" fillOpacity="0.2"/>
      </g>
      <g>
        <circle cx="182" cy="65" r="4" fill="#60a5fa" fillOpacity="0.7"/>
        <circle cx="192" cy="65" r="4" fill="#60a5fa" fillOpacity="0.2"/>
        <circle cx="202" cy="65" r="4" fill="#60a5fa" fillOpacity="0.5"/>
      </g>

      {/* 6-digit OTP code strip */}
      <rect x="96" y="148" width="108" height="34" rx="10" fill="white" fillOpacity="0.08" stroke="white" strokeOpacity="0.15" strokeWidth="1"/>
      {[0,1,2,3,4,5].map((i) => (
        <g key={i}>
          <rect x={104 + i * 16} y="155" width="12" height="20" rx="3" fill="white" fillOpacity={i < 3 ? 0.18 : 0.06}/>
          {i < 3 && (
            <text x={110 + i * 16} y="169" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="monospace" fillOpacity="0.9">
              {['3','8','5'][i]}
            </text>
          )}
        </g>
      ))}

      <defs>
        <linearGradient id="shieldGrad" x1="102" y1="28" x2="198" y2="168" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.6"/>
          <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.6"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function StepBadge({ num, label, active }: { num: number; label: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${active
      ? 'border-orange-400/40 bg-orange-400/10'
      : 'border-white/10 bg-white/5'
    }`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${active
        ? 'bg-orange-500 text-white'
        : 'bg-white/10 text-white/40'
      }`}>{num}</div>
      <span className={`text-sm ${active ? 'text-white font-medium' : 'text-white/40'}`}>{label}</span>
    </div>
  );
}

function MfaLeftPanel({ step }: { step: number }) {
  return (
    <div
      className="hidden lg:flex flex-col justify-between p-10 relative overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #0f2a4a 0%, #1a3f6f 50%, #0d2137 100%)' }}
    >
      <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #f97316, transparent)' }} />
      <div className="absolute -bottom-20 -left-10 w-80 h-80 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />

      {/* Logo */}
      <div className="relative z-10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.644 1.59a.75.75 0 01.712 0l9.75 5.25a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25a.75.75 0 010-1.32l9.75-5.25z" />
            <path d="M3.265 10.602l7.668 4.129a2.25 2.25 0 002.134 0l7.668-4.13 1.37.739a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.71 0l-9.75-5.25a.75.75 0 010-1.32l1.37-.738z" />
          </svg>
        </div>
        <span className="text-white font-bold text-lg tracking-wide">EAM Platform</span>
      </div>

      {/* Main */}
      <div className="relative z-10 space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-white leading-tight">
            Secure Your<br />
            <span style={{ color: '#f97316' }}>Account</span>
          </h2>
          <p className="mt-3 text-blue-200 text-sm leading-relaxed max-w-xs">
            Two-factor authentication adds an extra layer of protection — only you can access your account, even if your password is compromised.
          </p>
        </div>

        <MfaIllustration />

        <div className="space-y-2">
          <StepBadge num={1} label="Scan QR code with your app" active={step === 1} />
          <StepBadge num={2} label="Enter the 6-digit code" active={step === 2} />
          <StepBadge num={3} label="Save your recovery codes" active={step === 3} />
        </div>
      </div>

      <div className="relative z-10 flex gap-2">
        <div className="w-2 h-2 rounded-full bg-white/30" />
        <div className="w-5 h-2 rounded-full" style={{ background: '#f97316' }} />
        <div className="w-2 h-2 rounded-full bg-white/60" />
      </div>
    </div>
  );
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

  // Determine current visual step for left-panel progress
  const currentStep = recoveryCodes ? 3 : setup ? 2 : 1;

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
    <div className="fixed inset-0 grid lg:grid-cols-2 bg-slate-50">
      <MfaLeftPanel step={currentStep} />

      {/* Right — content */}
      <div className="flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">
        <div className="w-full max-w-md space-y-6">

          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}>
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.644 1.59a.75.75 0 01.712 0l9.75 5.25a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25a.75.75 0 010-1.32l9.75-5.25z" />
              </svg>
            </div>
            <span className="font-bold text-slate-800">EAM Platform</span>
          </div>

          {/* Header */}
          <div className="pt-4">
            <span className="inline-block text-xs font-semibold tracking-widest uppercase mb-3 px-3 py-1 rounded-full"
              style={{ background: 'rgba(249,115,22,0.1)', color: '#f97316' }}>
              Security
            </span>
            <h1 className="text-3xl font-bold text-slate-900">Two-Factor Auth 🔐</h1>
            <p className="text-slate-500 mt-1.5 text-sm">
              Protect your account with an authenticator app such as Google Authenticator or Authy.
            </p>
          </div>

          {/* Setup message */}
          {setupMessage && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <span className="text-amber-500 mt-0.5">ℹ</span>
              <p className="text-sm text-amber-800">{setupMessage}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <span className="text-red-500 mt-0.5">⚠</span>
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* ── Recovery codes screen ── */}
          {recoveryCodes && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <span className="text-green-600 text-lg mt-0.5">✓</span>
                <div>
                  <p className="text-sm font-semibold text-green-800">MFA is now enabled!</p>
                  <p className="text-xs text-green-700 mt-0.5">Save these recovery codes somewhere safe — they won't be shown again.</p>
                </div>
              </div>
              <div className="bg-slate-900 rounded-xl p-5 border border-slate-700">
                <p className="text-xs text-slate-400 mb-3 uppercase font-semibold tracking-widest">Recovery Codes</p>
                <ul className="grid grid-cols-2 gap-2">
                  {recoveryCodes.map((c) => (
                    <li key={c}
                      className="font-mono text-sm text-green-400 bg-slate-800 px-3 py-2 rounded-lg border border-slate-700">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
              <Link
                to={setupOnly ? '/login' : '/account'}
                className="block w-full py-3 rounded-xl text-white text-sm font-semibold text-center transition-all"
                style={{
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  boxShadow: '0 4px 14px rgba(249,115,22,0.35)',
                }}
              >
                {setupOnly ? 'Sign in again' : 'Back to account'}
              </Link>
            </div>
          )}

          {/* ── Disable MFA screen ── */}
          {!recoveryCodes && mfaEnabled && !setup && !setupOnly && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <span className="text-blue-600 text-xl">🔒</span>
                <p className="text-sm text-blue-800 font-medium">MFA is currently <strong>enabled</strong> on your account.</p>
              </div>
              <form onSubmit={disableMfa} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="disable-code" className="block text-sm font-semibold text-slate-700">
                    Authenticator code to disable MFA
                  </label>
                  <input
                    id="disable-code"
                    type="text"
                    inputMode="numeric"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    maxLength={6}
                    placeholder="000000"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm text-center tracking-[0.35em] font-mono placeholder-slate-400 outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 4px 14px rgba(239,68,68,0.3)' }}
                >
                  {loading ? 'Disabling…' : 'Disable MFA'}
                </button>
              </form>
            </div>
          )}

          {/* ── Start setup button ── */}
          {!recoveryCodes && !mfaEnabled && !setup && (
            <div className="space-y-6">
              {/* Feature highlight cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                  <div className="text-xl">&#x1F511;</div>
                  <p className="text-xs font-semibold text-slate-800">One-time codes</p>
                  <p className="text-xs text-slate-500">Fresh 6-digit code every 30 seconds</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                  <div className="text-xl">&#x1F4F1;</div>
                  <p className="text-xs font-semibold text-slate-800">App-based</p>
                  <p className="text-xs text-slate-500">Works offline, no SMS required</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                  <div className="text-xl">&#x1F6E1;</div>
                  <p className="text-xs font-semibold text-slate-800">Phishing-proof</p>
                  <p className="text-xs text-slate-500">Codes cannot be intercepted</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1">
                  <div className="text-xl">&#x1F504;</div>
                  <p className="text-xs font-semibold text-slate-800">Recovery codes</p>
                  <p className="text-xs text-slate-500">Backup access if you lose your device</p>
                </div>
              </div>

              <button
                type="button"
                onClick={startSetup}
                disabled={loading}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: loading ? '#fb923c' : 'linear-gradient(135deg, #f97316, #ea580c)',
                  boxShadow: '0 4px 14px rgba(249,115,22,0.35)',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Starting…
                  </span>
                ) : 'Set up authenticator app'}
              </button>
            </div>
          )}

          {/* ── QR + verify code screen ── */}
          {!recoveryCodes && setup && (
            <form onSubmit={verifySetup} className="space-y-5">
              {/* Step 1: QR */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center gap-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Step 1 — Scan with your app</p>
                <div className="p-2 rounded-xl bg-white border-2 border-orange-100 shadow-sm">
                  <img src={setup.qrDataUri} alt="MFA QR code" className="w-44 h-44 rounded-lg" />
                </div>
                <details className="w-full text-center">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 transition-colors">
                    Can't scan? Show manual key
                  </summary>
                  <p className="font-mono text-xs text-slate-600 mt-2 break-all bg-slate-50 rounded-lg p-2 border border-slate-200">
                    {setup.secret}
                  </p>
                </details>
              </div>

              {/* Step 2: Code entry */}
              <div className="space-y-1.5">
                <label htmlFor="verify-code" className="block text-sm font-semibold text-slate-700">
                  Step 2 — Enter the 6-digit code from your app
                </label>
                <input
                  id="verify-code"
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  maxLength={6}
                  placeholder="000000"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-900 text-sm text-center tracking-[0.35em] font-mono placeholder-slate-400 outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                />
                <p className="text-xs text-slate-400">The code refreshes every 30 seconds.</p>
              </div>

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  boxShadow: '0 4px 14px rgba(249,115,22,0.35)',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Verifying…
                  </span>
                ) : 'Enable MFA'}
              </button>
            </form>
          )}

          {/* Back link */}
          <p className="text-sm text-center text-slate-500">
            <Link to={setupOnly ? '/login' : '/account'} className="no-underline hover:underline" style={{ color: '#f97316' }}>
              {setupOnly ? '← Back to sign in' : '← Back to account'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

