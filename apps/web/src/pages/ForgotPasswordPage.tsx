import { useState } from 'react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/password/reset-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Request failed');
        return;
      }

      setSent(true);
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
          <h1 className="text-2xl font-bold text-primary">Forgot password</h1>
          <p className="text-sm text-gray-500 mt-1">POST /auth/password/reset-request</p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              If an account exists for that email, a reset link was generated.
            </p>
            <div className="text-sm text-gray-600 bg-gray-50 border rounded px-3 py-3 space-y-2">
              <p className="font-medium text-primary">Where to find the link in dev:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>
                  Start Mailhog:{' '}
                  <code className="text-xs bg-white px-1 rounded">
                    docker compose -f docker/docker-compose.dev.yml up -d mailhog
                  </code>
                </li>
                <li>
                  Open{' '}
                  <a href="http://localhost:8025" target="_blank" rel="noreferrer" className="underline">
                    http://localhost:8025
                  </a>{' '}
                  to read the email
                </li>
                <li>
                  Or check the <strong>API terminal</strong> — the reset URL is printed there if Mailhog is not
                  running
                </li>
              </ol>
            </div>
            <Link to="/login" className="block text-center text-sm font-medium">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <p className="text-sm text-center text-gray-500">
              <Link to="/login">Back to sign in</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
