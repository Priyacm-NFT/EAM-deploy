const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

let accessToken: string | null = localStorage.getItem('eam_access_token');

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem('eam_access_token', token);
  else localStorage.removeItem('eam_access_token');
}

export function getAccessToken(): string | null {
  return accessToken ?? localStorage.getItem('eam_access_token');
}

export async function api<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
