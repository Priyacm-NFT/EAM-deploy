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
  const [user, setUser] = useState<MeResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshMsg, setRefreshMsg] = useState('');

  async function loadMe() {
    setLoading(true);
    setError('');
    try {
      if (!isLoggedIn()) {
        navigate('/login');
        return;
      }
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

  if (loading) {
    return <p className="text-gray-500">Loading account…</p>;
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="auth-card">
        <h1 className="text-2xl font-bold text-primary mb-6">My account</h1>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
            {error}
          </p>
        )}

        {user && (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-primary">Name</dt>
              <dd className="text-gray-700">{user.displayName}</dd>
            </div>
            <div>
              <dt className="font-medium text-primary">Email</dt>
              <dd className="text-gray-700">{user.email}</dd>
            </div>
            <div>
              <dt className="font-medium text-primary">Roles</dt>
              <dd className="text-gray-700">{user.roles.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="font-medium text-primary">Permissions</dt>
              <dd className="text-gray-700 break-all">{user.permissions.join(', ') || '—'}</dd>
            </div>
            <div>
              <dt className="font-medium text-primary">Two-factor authentication (MFA)</dt>
              {user && (() => {
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
                      <p>
                        <strong>mfaEnabled</strong> — authenticator is registered on this account (
                        {user.mfaEnabled ? 'true' : 'false'}).
                      </p>
                      <p>
                        <strong>mfaVerified</strong> — this login session completed MFA (
                        {user.mfaVerified ? 'true' : 'false'}).
                      </p>
                      <p>
                        <strong>mfaRequired</strong> — at least one assigned role mandates MFA (
                        {user.mfaRequired ? 'true' : 'false'}).
                      </p>
                    </dd>
                  </>
                );
              })()}
              <dd className="mt-3">
                <Link to="/account/mfa/setup" className="text-sm font-medium text-accent">
                  {user.mfaEnabled ? 'Manage MFA' : 'Set up MFA'}
                </Link>
              </dd>
              {user.mfaRequired && !user.mfaEnabled && (
                <dd className="text-xs text-amber-700 mt-2">
                  Your role requires MFA. Use the link above to scan the QR code with an authenticator
                  app, then sign in again.
                </dd>
              )}
            </div>
            <div>
              <dt className="font-medium text-primary">Active session</dt>
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
            className="text-sm font-medium border border-primary text-primary hover:bg-primary hover:text-white rounded px-4 py-2.5 transition-colors"
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
