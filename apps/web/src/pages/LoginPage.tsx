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

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const registered = (location.state as { registered?: boolean } | null)?.registered;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

      const data = (await res.json()) as LoginResponse & { error?: string; code?: string };

      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }

      if (data.mfa_setup_required && data.mfa_session_token) {
        navigate('/account/mfa/setup', {
          state: {
            mfa_session_token: data.mfa_session_token,
            message: 'Your role requires MFA. Set it up now, then sign in again.',
          },
        });
        return;
      }

      if (data.mfa_required && data.mfa_session_token) {
        navigate('/login/mfa', { state: { mfa_session_token: data.mfa_session_token } });
        return;
      }

      if (!data.accessToken) {
        setError('Login failed');
        return;
      }

      setTokens(data.accessToken, data.refreshToken);
      navigate('/dashboard');
    } catch {
      setError('Unable to connect to the server. Is the API running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
      <div className="auth-card">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-primary">Sign in</h1>
          <p className="text-sm text-center text-gray-500 mt-1">Enterprise Asset Management</p>
        </div>



        <form onSubmit={handleSubmit} className="space-y-4">
          {registered && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              Account created successfully. Please sign in.
            </p>
          )}
          <div>
            <label htmlFor="email" className="form-label">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="text-sm text-center text-gray-500 mt-4">
          <Link to="/forgot-password" className="font-medium">
            Forgot password?
          </Link>
        </p>

        <p className="text-sm text-center text-gray-500 mt-4">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-medium">
            Register
          </Link>
        </p>

        {ssoProviders.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200 space-y-2">
            <p className="text-xs text-center text-gray-500 uppercase tracking-wide">Or continue with SSO</p>
            {ssoProviders.map((p) => (
              <a
                key={p.id}
                href={`${API_URL}/auth/${p.type === 'SAML' ? 'saml' : 'oidc'}/${p.id}/login`}
                className="block text-center text-sm font-medium border border-primary text-primary rounded py-2 hover:bg-primary hover:text-white transition-colors"
              >
                {p.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
