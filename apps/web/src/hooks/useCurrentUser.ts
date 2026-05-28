import { useEffect, useState } from 'react';
import { api, getAccessToken, isLoggedIn, clearTokens, refreshSession } from '../api/client.js';

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  mfaEnabled: boolean;
  mfaVerified: boolean;
  mfaRequired: boolean;
}

export function hasPermission(user: CurrentUser | null, permission: string): boolean {
  return Boolean(user?.permissions.includes(permission));
}

function userFromAccessToken(): CurrentUser | null {
  const token = getAccessToken();
  if (!token) return null;

  try {
    const segment = token.split('.')[1];
    if (!segment) return null;
    const payload = JSON.parse(
      atob(segment.replace(/-/g, '+').replace(/_/g, '/')),
    ) as {
      sub?: string;
      email?: string;
      exp?: number;
      roles?: string[];
      permissions?: string[];
      mfa_verified?: boolean;
    };

    // If the access token itself is expired, don't trust it
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }

    return {
      id: payload.sub ?? '',
      email: payload.email ?? '',
      displayName: '',
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
      mfaEnabled: false,
      mfaVerified: payload.mfa_verified ?? false,
      mfaRequired: false,
    };
  } catch {
    return null;
  }
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await api<CurrentUser>('/auth/me');
  } catch {
    // api() already handles 401 by clearing tokens + redirecting.
    // Any other error (network down etc.) — fall back to token payload.
    return userFromAccessToken();
  }
}

export function useCurrentUser() {
  // On first render, if the stored access token is expired, try a refresh
  // before committing to "not logged in". This prevents the sidebar from
  // flashing as empty on a page reload when the token just needs refreshing.
  const [user, setUser] = useState<CurrentUser | null>(() =>
    isLoggedIn() ? userFromAccessToken() : null,
  );
  const [loading, setLoading] = useState(isLoggedIn());
  const [authenticated, setAuthenticated] = useState(isLoggedIn());

  useEffect(() => {
    let cancelled = false;

    async function syncAuthState() {
      const loggedIn = isLoggedIn();

      if (!loggedIn) {
        // No tokens at all — check if there's a refresh token we can use
        const hasRefresh = Boolean(localStorage.getItem('eam_refresh_token'));
        if (hasRefresh) {
          const ok = await refreshSession();
          if (!ok) {
            clearTokens();
            if (!cancelled) { setUser(null); setAuthenticated(false); setLoading(false); }
            return;
          }
          // Refreshed — fall through to the fetch below
        } else {
          if (!cancelled) { setUser(null); setAuthenticated(false); setLoading(false); }
          return;
        }
      }

      // We have (possibly just-refreshed) tokens — set optimistic state
      const fromToken = userFromAccessToken();
      if (!cancelled) {
        setAuthenticated(true);
        setUser(fromToken);
        setLoading(true);
      }

      // Fetch authoritative user data (this also re-reads permissions from DB)
      const fetched = await fetchCurrentUser();
      if (!cancelled) {
        if (fetched) {
          setUser(fetched);
          setAuthenticated(true);
        } else {
          // fetchCurrentUser returning null means tokens were cleared by api()
          setUser(null);
          setAuthenticated(false);
        }
        setLoading(false);
      }
    }

    void syncAuthState();
    window.addEventListener('eam-auth-change', () => { void syncAuthState(); });
    return () => {
      cancelled = true;
      window.removeEventListener('eam-auth-change', () => { void syncAuthState(); });
    };
  }, []);

  return { user, loading, authenticated };
}
