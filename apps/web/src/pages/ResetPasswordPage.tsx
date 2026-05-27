import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromUrl = searchParams.get('token') ?? '';

  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = (await res.json()) as { error?: string; errors?: string[] };

      if (!res.ok) {
        if (data.errors?.length) setError(data.errors.join('. '));
        else setError(data.error ?? 'Reset failed');
        return;
      }

      navigate('/login', { state: { registered: true } });
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
          <h1 className="text-2xl font-bold text-primary">Reset password</h1>
          <p className="text-sm text-gray-500 mt-1">POST /auth/password/reset</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="token" className="form-label">
              Reset token
            </label>
            <input
              id="token"
              type="text"
              className="form-input font-mono text-xs"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              placeholder="Paste token from reset email"
            />
          </div>

          <div>
            <label htmlFor="password" className="form-label">
              New password
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
            />
            <p className="text-xs text-gray-400 mt-1">
              At least 10 characters with uppercase, number, and special character.
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Resetting…' : 'Reset password'}
          </button>

          <p className="text-sm text-center text-gray-500">
            <Link to="/login">Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
