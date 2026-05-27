import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { setTokens } from '../api/client.js';

interface ChallengeResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export function MfaChallengePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const mfaSessionToken =
    (location.state as { mfa_session_token?: string } | null)?.mfa_session_token ?? '';
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!mfaSessionToken) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <div className="auth-card text-center">
          <p className="text-sm text-red-600 mb-4">MFA session expired. Please sign in again.</p>
          <Link to="/login" className="font-medium">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${API_URL}/auth/mfa/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfa_session_token: mfaSessionToken,
          totp_code: useRecovery ? undefined : totpCode,
          recovery_code: useRecovery ? recoveryCode : undefined,
        }),
      });

      const data = (await res.json()) as ChallengeResponse & { error?: string };

      if (!res.ok) {
        setError(data.error ?? 'Verification failed');
        return;
      }

      setTokens(data.accessToken, data.refreshToken);
      navigate('/dashboard');
    } catch {
      setError('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <div className="auth-card">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">Two-factor verification</h1>
          <p className="text-sm text-gray-500 mt-1">Enter the code from your authenticator app</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!useRecovery ? (
            <div>
              <label htmlFor="totp" className="form-label">
                Authenticator code
              </label>
              <input
                id="totp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="form-input text-center tracking-widest"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                maxLength={6}
                placeholder="000000"
              />
            </div>
          ) : (
            <div>
              <label htmlFor="recovery" className="form-label">
                Recovery code
              </label>
              <input
                id="recovery"
                type="text"
                className="form-input font-mono uppercase"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                required
                placeholder="XXXXXXXX"
              />
            </div>
          )}

          <button
            type="button"
            className="text-sm text-accent hover:underline"
            onClick={() => {
              setUseRecovery(!useRecovery);
              setError('');
            }}
          >
            {useRecovery ? 'Use authenticator app instead' : 'Use a recovery code instead'}
          </button>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <p className="text-sm text-center text-gray-500 mt-6">
          <Link to="/login">Cancel and sign in again</Link>
        </p>
      </div>
    </div>
  );
}
