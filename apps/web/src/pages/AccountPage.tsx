import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, getAccessToken, isLoggedIn, logout, refreshSession } from '../api/client.js';

interface MeResponse {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  mfaEnabled: boolean;
  mfaVerified: boolean;
  mfaRequired: boolean;
}

function mfaStatusLabel(user: MeResponse): { text: string; tone: 'ok' | 'warn' | 'neutral' } {
  if (user.mfaEnabled && user.mfaVerified) {
    return { text: 'Enabled and verified this session', tone: 'ok' };
  }
  if (user.mfaEnabled) {
    return { text: 'Enabled — sign out and back in to verify with your authenticator', tone: 'neutral' };
  }
  if (user.mfaRequired) {
    return { text: 'Required by your role — not set up yet', tone: 'warn' };
  }
  return { text: 'Not enabled (optional for your account)', tone: 'neutral' };
}

export function AccountPage() {
  const navigate = useNavigate();
  const [user, setUser]           = useState<MeResponse | null>(null);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [refreshMsg, setRefreshMsg] = useState('');

  // SMS OTP enroll state
  const [phone, setPhone]               = useState('');
  const [smsMsg, setSmsMsg]             = useState('');
  const [smsError, setSmsError]         = useState('');
  const [enrolling, setEnrolling]       = useState(false);
  const [otpSent, setOtpSent]           = useState(false);
  const [otpCode, setOtpCode]           = useState('');
  const [verifying, setVerifying]       = useState(false);
  const [smsEnabled, setSmsEnabled]     = useState(true); // Always show — admin controls via Identity → SMS OTP Config
  const [showSmsEnroll, setShowSmsEnroll] = useState(false);

  async function loadMe() {
    setLoading(true);
    setError('');
    try {
      if (!isLoggedIn()) { navigate('/login'); return; }
      const data = await api<MeResponse>('/auth/me');
      setUser(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function handleRefresh() {
    setRefreshMsg('');
    const ok = await refreshSession();
    setRefreshMsg(ok ? 'Session refreshed — new tokens issued.' : 'Refresh failed — please sign in again.');
    if (ok) await loadMe();
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  // SMS enroll: send OTP to phone
  async function sendSmsOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) { setSmsError('Enter your phone number.'); return; }
    setEnrolling(true); setSmsError(''); setSmsMsg('');
    try {
      // First enroll the phone number
      // Send OTP to phone for verification
      await api('/auth/mfa/sms/send-enrolled', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim() }),
      });
      setOtpSent(true);
      setSmsMsg(`OTP sent to ${phone}. Enter the code below to verify.`);
    } catch (e) {
      setSmsError(e instanceof Error ? e.message : 'Failed to send OTP');
    } finally {
      setEnrolling(false);
    }
  }

  // SMS enroll: verify OTP
  async function verifySmsOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otpCode.trim()) { setSmsError('Enter the OTP code.'); return; }
    setVerifying(true); setSmsError(''); setSmsMsg('');
    try {
      // Use the auth/mfa/sms/verify endpoint with stored redis key
      // Since user is already logged in (not in mfa challenge flow),
      // we verify via a dedicated enrolled-user verify endpoint
      await api('/auth/mfa/sms/verify-enrolled', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), code: otpCode.trim() }),
      });
      setSmsMsg('SMS OTP enrolled successfully! You can now use SMS as your MFA method.');
      setOtpSent(false);
      setOtpCode('');
      setShowSmsEnroll(false);
      loadMe();
    } catch (e) {
      setSmsError(e instanceof Error ? e.message : 'Invalid OTP code');
    } finally {
      setVerifying(false);
    }
  }

  if (loading) return <p className="text-gray-500">Loading account…</p>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="auth-card">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">My account</h1>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {user && (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-accent">Name</dt>
              <dd className="text-gray-700">{user.displayName}</dd>
            </div>
            <div>
              <dt className="font-medium text-accent">Email</dt>
              <dd className="text-gray-700">{user.email}</dd>
            </div>
            <div>
              <dt className="font-medium text-accent">Roles</dt>
              <dd className="text-gray-700">{user.roles.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="font-medium text-accent">Permissions</dt>
              <dd className="text-gray-700 break-all">{user.permissions.join(', ') || '—'}</dd>
            </div>

            {/* ── MFA section ─────────────────────────────────────────────── */}
            <div>
              <dt className="font-medium text-accent">Two-factor authentication (MFA)</dt>
              {(() => {
                const status = mfaStatusLabel(user);
                const toneClass =
                  status.tone === 'ok'
                    ? 'text-green-700 bg-green-50 border-green-200'
                    : status.tone === 'warn'
                    ? 'text-amber-800 bg-amber-50 border-amber-200'
                    : 'text-gray-700 bg-gray-50 border-gray-200';
                return (
                  <>
                    <dd className={`text-sm rounded border px-3 py-2 mt-1 ${toneClass}`}>
                      {status.text}
                    </dd>
                    <dd className="text-xs text-gray-500 mt-2 space-y-1">
                      <p><strong>mfaEnabled</strong> — authenticator is registered on this account ({user.mfaEnabled ? 'true' : 'false'}).</p>
                      <p><strong>mfaVerified</strong> — this login session completed MFA ({user.mfaVerified ? 'true' : 'false'}).</p>
                      <p><strong>mfaRequired</strong> — at least one assigned role mandates MFA ({user.mfaRequired ? 'true' : 'false'}).</p>
                    </dd>
                  </>
                );
              })()}

              {/* Authenticator app link */}
              <dd className="mt-3">
                <Link to="/account/mfa/setup" className="text-sm font-medium text-accent">
                  {user.mfaEnabled ? 'Manage MFA (Authenticator app)' : 'Set up MFA'}
                </Link>
              </dd>

              {/* SMS OTP enroll — only shown if admin has configured SMS provider */}
              {smsEnabled && (
                <dd className="mt-3 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    className="text-sm font-medium text-accent hover:underline"
                    onClick={() => { setShowSmsEnroll((v) => !v); setSmsError(''); setSmsMsg(''); setOtpSent(false); setOtpCode(''); }}
                  >
                    {showSmsEnroll ? '▲ Hide' : '▼ Enroll SMS OTP'}
                  </button>

                  {showSmsEnroll && (
                    <div className="mt-3 space-y-3 bg-gray-50 border border-gray-200 rounded p-3">
                      <p className="text-xs text-gray-500">
                        Register your mobile number to receive one-time passwords via SMS as your MFA method.
                      </p>

                      {smsMsg && (
                        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
                          {smsMsg}
                        </p>
                      )}
                      {smsError && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                          {smsError}
                        </p>
                      )}

                      {!otpSent ? (
                        <form onSubmit={sendSmsOtp} className="space-y-2">
                          <label htmlFor="sms-phone" className="text-xs font-medium text-gray-600 block">
                            Mobile number (E.164 format)
                          </label>
                          <input
                            id="sms-phone"
                            type="tel"
                            className="form-input text-sm"
                            placeholder="+919876543210"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                          />
                          <p className="text-xs text-gray-400">Include country code e.g. +91 for India</p>
                          <button type="submit" className="btn-primary !w-auto px-4 text-sm" disabled={enrolling}>
                            {enrolling ? 'Sending…' : 'Send OTP'}
                          </button>
                        </form>
                      ) : (
                        <form onSubmit={verifySmsOtp} className="space-y-2">
                          <label htmlFor="sms-otp" className="text-xs font-medium text-gray-600 block">
                            Enter the 6-digit OTP sent to {phone}
                          </label>
                          <input
                            id="sms-otp"
                            type="text"
                            inputMode="numeric"
                            className="form-input text-center tracking-widest text-sm"
                            placeholder="000000"
                            maxLength={6}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            required
                          />
                          <div className="flex gap-2">
                            <button type="submit" className="btn-primary !w-auto px-4 text-sm" disabled={verifying}>
                              {verifying ? 'Verifying…' : 'Verify & enroll'}
                            </button>
                            <button
                              type="button"
                              className="text-xs text-gray-500 hover:underline"
                              onClick={() => { setOtpSent(false); setOtpCode(''); setSmsError(''); }}
                            >
                              Change number
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </dd>
              )}

              {user.mfaRequired && !user.mfaEnabled && (
                <dd className="text-xs text-amber-700 mt-2">
                  Your role requires MFA. Use the link above to scan the QR code with an authenticator app, then sign in again.
                </dd>
              )}
            </div>

            {/* ── Session ─────────────────────────────────────────────────── */}
            <div>
              <dt className="font-medium text-accent">Active session</dt>
              <dd className="text-gray-500 text-xs break-all font-mono">
                {getAccessToken()?.slice(0, 40)}…
              </dd>
              <dd className="text-xs text-gray-400 mt-1">
                Temporary login credential — not your password. Created when you sign in.
              </dd>
            </div>
          </dl>
        )}

        {refreshMsg && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mt-4">
            {refreshMsg}
          </p>
        )}

        <div className="flex flex-wrap gap-3 mt-6">
          <button type="button" onClick={handleRefresh} className="btn-primary !w-auto px-4">
            Refresh session
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl px-4 py-2.5 transition-colors"
          >
            Log out
          </button>
        </div>

        <p className="text-sm text-center text-gray-500 mt-6">
          <Link to="/forgot-password">Change password</Link>
        </p>
      </div>
    </div>
  );
}
