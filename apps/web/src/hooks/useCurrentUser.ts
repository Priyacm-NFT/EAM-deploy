import { useEffect, useState } from 'react';
import { api, getAccessToken, isLoggedIn } from '../api/client.js';

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
      roles?: string[];
      permissions?: string[];
      mfa_verified?: boolean;
    };

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
  const fromToken = userFromAccessToken();
  try {
    return await api<CurrentUser>('/auth/me');
  } catch {
    return fromToken;
  }
}

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(() =>
    isLoggedIn() ? userFromAccessToken() : null,
  );
  const [loading, setLoading] = useState(isLoggedIn());
  const [authenticated, setAuthenticated] = useState(isLoggedIn());

  useEffect(() => {
    function syncAuthState() {
      const loggedIn = isLoggedIn();
      setAuthenticated(loggedIn);

      if (!loggedIn) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(userFromAccessToken());
      setLoading(true);
      fetchCurrentUser()
        .then(setUser)
        .finally(() => setLoading(false));
    }

    syncAuthState();
    window.addEventListener('eam-auth-change', syncAuthState);
    return () => window.removeEventListener('eam-auth-change', syncAuthState);
  }, []);

  return { user, loading, authenticated };
}
