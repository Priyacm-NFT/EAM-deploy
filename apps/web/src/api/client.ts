const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

let accessToken: string | null = localStorage.getItem('eam_access_token');

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem('eam_access_token', token);
  else localStorage.removeItem('eam_access_token');
}

export function setTokens(access: string | null, refresh?: string | null) {
  setAccessToken(access);
  if (refresh) localStorage.setItem('eam_refresh_token', refresh);
  else localStorage.removeItem('eam_refresh_token');
  window.dispatchEvent(new Event('eam-auth-change'));
}

export function getAccessToken(): string | null {
  return accessToken ?? localStorage.getItem('eam_access_token');
}

export function getRefreshToken(): string | null {
  return localStorage.getItem('eam_refresh_token');
}

export function clearTokens() {
  setTokens(null, null);
}

export function isLoggedIn(): boolean {
  return Boolean(getAccessToken());
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

export async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return false;
    }

    const data = (await res.json()) as TokenResponse;
    setTokens(data.accessToken, data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } finally {
    clearTokens();
  }
}

/**
 * Whether an error from the API means the session is dead and the user
 * should be silently redirected to /login rather than shown an error message.
 */
export function isSessionExpiredError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const msg = e.message.toLowerCase();
  return (
    msg.includes('session expired') ||
    msg.includes('unauthorized') ||
    msg.includes('jwt') ||
    msg.includes('token')
  );
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const method = (opts.method ?? 'GET').toUpperCase();
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const body = opts.body ?? (needsBody ? JSON.stringify({}) : undefined);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res = await fetch(`${API_URL}${path}`, { ...opts, headers, body });

  if (res.status === 401) {
    // Try to refresh once
    if (getRefreshToken()) {
      const refreshed = await refreshSession();
      if (refreshed) {
        headers.Authorization = `Bearer ${getAccessToken()}`;
        res = await fetch(`${API_URL}${path}`, { ...opts, headers, body });
      }
    }
    // If still 401 after refresh attempt, tokens are dead — clear and redirect
    if (res.status === 401) {
      clearTokens();
      window.location.replace('/login');
      // Return a never-resolving promise so calling code doesn't run
      return new Promise(() => {});
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const payload = err as { error?: string; message?: string } & Record<string, unknown>;
    const thrown = new Error(payload.error ?? payload.message ?? res.statusText);
    // FIX (P1-1 UI work): some endpoints (e.g. the CONTINUOUS-meter
    // rollback check) return extra structured fields alongside `error`
    // — currentReading/submittedReading, or bulk-import's per-row
    // `errors` array. Previously those were silently dropped since only
    // `.message` was ever kept; attaching the raw payload lets calling
    // code branch on it (e.g. show a "confirm rollover" checkbox) without
    // every caller having to re-parse the response itself.
    Object.assign(thrown, payload);
    throw thrown;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function authFetch(path: string, opts: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const method = (opts.method ?? 'GET').toUpperCase();
  const needsBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const body = opts.body ?? (needsBody ? JSON.stringify({}) : undefined);
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res = await fetch(`${API_URL}${path}`, { ...opts, headers, body });

  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await refreshSession();
    if (refreshed) {
      headers.Authorization = `Bearer ${getAccessToken()}`;
      res = await fetch(`${API_URL}${path}`, { ...opts, headers, body });
    }
    if (res.status === 401) {
      clearTokens();
      window.location.replace('/login');
    }
  }

  return res;
}
