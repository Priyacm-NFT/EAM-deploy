import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isLoggedIn, logout } from '../api/client.js';
import { useCurrentUser } from '../hooks/useCurrentUser.js';

export function AuthNav() {
  const navigate = useNavigate();
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const { user } = useCurrentUser();

  useEffect(() => {
    const sync = () => setLoggedIn(isLoggedIn());
    window.addEventListener('storage', sync);
    window.addEventListener('eam-auth-change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('eam-auth-change', sync);
    };
  }, []);

  async function handleLogout() {
    await logout();
    setLoggedIn(false);
    navigate('/login');
  }

  if (loggedIn) {
    return (
      <div className="flex items-center gap-3">
        {/* User avatar + display name */}
        {user && (
          <Link
            to="/account"
            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors no-underline group"
            title="My account"
          >
            {/* Avatar circle with initials */}
            <span className="w-8 h-8 rounded-full bg-white/20 group-hover:bg-white/30 flex items-center justify-center text-xs font-bold text-white transition-colors shrink-0">
              {user.displayName
                ? user.displayName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                : user.email[0]?.toUpperCase()}
            </span>
            {/* Display name */}
            <span className="text-sm font-medium hidden sm:block">
              {user.displayName || user.email}
            </span>
          </Link>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="app-btn-logout"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <Link to="/login" className="app-btn-logout">
        Sign in
      </Link>
      <Link
        to="/register"
        className="text-sm font-medium bg-accent hover:bg-accent-dark text-white rounded-md px-4 py-2 transition-colors no-underline"
      >
        Register
      </Link>
    </div>
  );
}
