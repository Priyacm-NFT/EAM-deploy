import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { setTokens } from '../api/client.js';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface SsoProvider {
  id: string;
  name: string;
  type: 'SAML' | 'OIDC';
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  mfa_required?: boolean;
  mfa_setup_required?: boolean;
  mfa_session_token?: string;
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────

function IconMail() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function IconEye({ open }: { open: boolean }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

// ── Left panel (no logo — logo is in the shared top navbar) ───────────────────

function LeftPanel() {
  return (
    <div
      className="hidden lg:flex flex-col justify-between p-10 relative overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #0f2a4a 0%, #1a3f6f 50%, #0d2137 100%)',
      }}
    >
      {/* Decorative glows */}
      <div
        className="absolute -top-16 -right-16 w-64 h-64 opacity-10"
        style={{ background: 'radial-gradient(circle, #f97316, transparent)', borderRadius: 0 }}
      />
      <div
        className="absolute -bottom-20 -left-10 w-80 h-80 opacity-10"
        style={{ background: 'radial-gradient(circle, #3b82f6, transparent)', borderRadius: 0 }}
      />
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 opacity-5"
        style={{ background: 'radial-gradient(circle, #f97316, transparent)', borderRadius: 0 }}
      />

      {/* Main text — vertically centred */}
      <div className="relative z-10 space-y-6 my-auto">
        <div>
          <h2 className="text-4xl font-bold text-white leading-tight">
            Manage Assets.<br />
            <span style={{ color: '#f97316' }}>Drive Efficiency.</span>
          </h2>
          <p className="mt-4 text-blue-200 text-sm leading-relaxed max-w-xs">
            Enterprise-grade asset management — work orders, integrations,
            workflows and reporting in one unified platform.
          </p>
        </div>

        {/* Feature rows */}
        <div className="flex flex-col gap-3">
          {[
            { icon: '⚙️', text: 'Workflow automation' },
            { icon: '📊', text: 'Real-time reporting' },
            { icon: '🔗', text: 'ERP integrations' },
          ].map((f) => (
            <div
              key={f.text}
              className="flex items-center gap-3 px-4 py-3 border border-white/10"
              style={{ background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(8px)' }}
            >
              <span className="text-lg">{f.icon}</span>
              <span className="text-white/85 text-sm font-medium">{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom indicator */}
      <div className="relative z-10 flex gap-2 items-center">
        <div className="w-2 h-2 bg-white/60" />
        <div className="w-5 h-2" style={{ background: '#f97316' }} />
        <div className="w-2 h-2 bg-white/30" />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const registered = (location.state as { registered?: boolean } | null)?.registered;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ssoProviders, setSsoProviders] = useState<SsoProvider[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/auth/sso/providers?tenant=default`)
      .then((r) => r.json())
      .then((data) => setSsoProviders(Array.isArray(data) ? data : []))
      .catch(() => undefined);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as LoginResponse & { error?: string };
      if (!res.ok) { setError(data.error ?? 'Login failed'); return; }
      if (data.mfa_setup_required && data.mfa_session_token) {
        navigate('/account/mfa/setup', { state: { mfa_session_token: data.mfa_session_token, message: 'Your role requires MFA.' } });
        return;
      }
      if (data.mfa_required && data.mfa_session_token) {
        navigate('/login/mfa', { state: { mfa_session_token: data.mfa_session_token } });
        return;
      }
      if (!data.accessToken) { setError('Login failed'); return; }
      setTokens(data.accessToken, data.refreshToken);
      navigate('/dashboard');
    } catch {
      setError('Unable to connect to the server. Is the API running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col">
      {/* ── Shared top navbar ── */}
      <header
        className="flex items-center justify-between px-8 py-4 border-b border-white/10 shrink-0 z-10"
        style={{ background: 'linear-gradient(145deg, #0f2a4a 0%, #1a3f6f 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
          >
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.644 1.59a.75.75 0 01.712 0l9.75 5.25a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25a.75.75 0 010-1.32l9.75-5.25z" />
              <path d="M3.265 10.602l7.668 4.129a2.25 2.25 0 002.134 0l7.668-4.13 1.37.739a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.71 0l-9.75-5.25a.75.75 0 010-1.32l1.37-.738z" />
              <path d="M10.933 19.231l-7.668-4.13-1.37.739a.75.75 0 000 1.32l9.75 5.25c.221.12.489.12.71 0l9.75-5.25a.75.75 0 000-1.32l-1.37-.738-7.668 4.13a2.25 2.25 0 01-2.134-.001z" />
            </svg>
          </div>
          <span className="text-white font-bold text-lg tracking-wide">EAM Platform</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link
            to="/login"
            className="text-white/75 hover:text-white text-sm font-medium px-5 py-2 border border-white/20 hover:border-white/40 transition-all no-underline"
          >
            Sign in
          </Link>
          <Link
            to="/register"
            className="text-white text-sm font-semibold px-5 py-2 transition-all no-underline"
            style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)' }}
          >
            Register
          </Link>
        </nav>
      </header>

      {/* ── Split panel below navbar ── */}
      <div className="flex-1 grid lg:grid-cols-2 min-h-0">
        <LeftPanel />

        {/* Right — form */}
        <div className="flex flex-col items-center justify-center px-6 py-12 overflow-y-auto bg-white">
          <div className="w-full max-w-md space-y-8">

            {/* Header */}
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Welcome back! 👋</h1>
              <p className="text-slate-500 mt-1.5 text-sm">Sign in to continue to your workspace</p>
            </div>

            {/* Success banner */}
            {registered && (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 px-4 py-3">
                <span className="text-green-500 text-lg">✓</span>
                <p className="text-sm text-green-700 font-medium">Account created! Please sign in.</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                  Email address
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <IconMail />
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="Enter your email"
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold no-underline"
                    style={{ color: '#f97316' }}
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <IconLock />
                  </span>
                  <input
                    id="password"
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="w-full pl-10 pr-10 py-3 border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                  >
                    <IconEye open={showPw} />
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 px-4 py-3">
                  <span className="text-red-500 mt-0.5">⚠</span>
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 text-white text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
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
                    Signing in…
                  </span>
                ) : 'Sign In'}
              </button>
            </form>

            {/* SSO */}
            {ssoProviders.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-slate-200" />
                  <span className="text-xs text-slate-400 font-medium">or continue with SSO</span>
                  <div className="flex-1 border-t border-slate-200" />
                </div>
                <div className="grid gap-2">
                  {ssoProviders.map((p) => (
                    <a
                      key={p.id}
                      href={`${API_URL}/auth/${p.type === 'SAML' ? 'saml' : 'oidc'}/${p.id}/login`}
                      className="flex items-center justify-center gap-2 py-2.5 px-4 border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:border-orange-300 hover:bg-orange-50 transition-all no-underline"
                    >
                      {p.name}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Register link */}
            <p className="text-center text-sm text-slate-500">
              Don't have an account?{' '}
              <Link to="/register" className="font-semibold no-underline" style={{ color: '#f97316' }}>
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
