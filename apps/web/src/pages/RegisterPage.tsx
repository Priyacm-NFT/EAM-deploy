import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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

function IconUser() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
    </svg>
  );
}

function IconEye({ open }: { open: boolean }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}

// ── Feature badge — sharp, no rounded ────────────────────────────────────────

function FeatureBadge({ icon, label, sub }: { icon: React.ReactNode; label: string; sub: string }) {
  return (
    <div
      className="flex items-center gap-4 px-5 py-4 border border-white/10 transition-all duration-300 hover:bg-white/10"
      style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="w-11 h-11 flex items-center justify-center shrink-0"
        style={{ background: 'rgba(249,115,22,0.18)' }}
      >
        {icon}
      </div>
      <div>
        <p className="text-white text-sm font-semibold">{label}</p>
        <p className="text-blue-100/60 text-xs mt-1">{sub}</p>
      </div>
    </div>
  );
}

// ── Left panel (no logo — logo is in the shared top navbar) ───────────────────

function LeftPanel() {
  return (
    <div
      className="hidden lg:flex flex-col justify-between px-12 py-10 relative overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #0f2a4a 0%, #1a3f6f 50%, #0d2137 100%)' }}
    >
      {/* Background effects */}
      <div className="absolute -top-16 -right-16 w-64 h-64 opacity-10" style={{ background: 'radial-gradient(circle, #f97316, transparent)' }} />
      <div className="absolute -bottom-20 -left-10 w-80 h-80 opacity-10" style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 opacity-5" style={{ background: 'radial-gradient(circle, #f97316, transparent)' }} />

      {/* Main Content — vertically centred */}
      <div className="relative z-10 space-y-7 my-auto">
        <div className="max-w-md">
          <h2 className="text-4xl font-bold text-white leading-tight">
            Enterprise Asset
            <br />
            <span className="text-orange-500">Management</span>
          </h2>
          <p className="mt-5 text-blue-100 text-base leading-relaxed">
            Streamline operations, monitor asset health, and manage enterprise
            maintenance workflows from one centralized platform.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-2">
          <FeatureBadge
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75M5.25 21h13.5A2.25 2.25 0 0021 18.75V7.5l-4.5-4.5H5.25A2.25 2.25 0 003 5.25v13.5A2.25 2.25 0 005.25 21z" /></svg>}
            label="Work Order Tracking"
            sub="Manage maintenance tasks & inspections"
          />
          <FeatureBadge
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>}
            label="Real-time Analytics"
            sub="Track uptime, performance & operational costs"
          />
          <FeatureBadge
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            label="Preventive Maintenance"
            sub="Schedule recurring maintenance automatically"
          />
          <FeatureBadge
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="#f97316" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>}
            label="Inventory Management"
            sub="Monitor spare parts & stock availability"
          />
        </div>
      </div>

      {/* Bottom indicator */}
      <div className="relative z-10 flex gap-2 items-center">
        <div className="w-2 h-2 bg-white/30" />
        <div className="w-5 h-2 bg-orange-500" />
        <div className="w-2 h-2 bg-white/60" />
      </div>
    </div>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!agreed) { setError('Please accept the terms to continue.'); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName: name,
          username: email.split('@')[0] ?? email,
        }),
      });
      const data = (await res.json()) as { error?: string; errors?: string[] };
      if (!res.ok) {
        setError(data.errors?.length ? data.errors.join('. ') : data.error ?? 'Registration failed');
        return;
      }
      navigate('/login', { state: { registered: true } });
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

        {/* Right Side */}
        <div className="flex flex-col items-center justify-center px-6 py-10 overflow-y-auto bg-white">
          <div className="w-full max-w-md space-y-6">

            {/* Header */}
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Create Account</h1>
              <p className="text-slate-500 mt-2 text-sm">Join your organisation's EAM workspace</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full name */}
              <div className="space-y-1.5">
                <label htmlFor="name" className="block text-sm font-semibold text-slate-700">Full name</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconUser /></span>
                  <input
                    id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                    required autoComplete="name" placeholder="Enter your full name"
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-semibold text-slate-700">Email address</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconMail /></span>
                  <input
                    id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    required autoComplete="email" placeholder="Enter your email"
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label htmlFor="password" className="block text-sm font-semibold text-slate-700">Password</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconLock /></span>
                  <input
                    id="password" type={showPw ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password"
                    minLength={10} placeholder="Create a password"
                    className="w-full pl-10 pr-10 py-3 border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
                    <IconEye open={showPw} />
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-700">Confirm password</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><IconLock /></span>
                  <input
                    id="confirmPassword" type={showConfirmPw ? 'text' : 'password'} value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password"
                    placeholder="Confirm your password"
                    className="w-full pl-10 pr-10 py-3 border border-slate-200 bg-white text-slate-900 text-sm placeholder-slate-400 outline-none transition-all focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  />
                  <button type="button" onClick={() => setShowConfirmPw((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors" tabIndex={-1}>
                    <IconEye open={showConfirmPw} />
                  </button>
                </div>
              </div>

              {/* Terms */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1" />
                <span className="text-sm text-slate-600">
                  I agree to the{' '}
                  <span className="font-semibold text-orange-500">Terms of Service</span>{' '}
                  and{' '}
                  <span className="font-semibold text-orange-500">Privacy Policy</span>
                </span>
              </label>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">{error}</div>
              )}

              {/* Submit */}
              <button
                type="submit" disabled={loading}
                className="w-full py-3 text-white text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', boxShadow: '0 4px 14px rgba(249,115,22,0.35)' }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Creating account…
                  </span>
                ) : 'Create Account'}
              </button>
            </form>

            <p className="text-center text-sm text-slate-500">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-orange-500 no-underline">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}