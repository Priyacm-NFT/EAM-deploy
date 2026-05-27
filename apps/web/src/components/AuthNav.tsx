import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isLoggedIn, logout } from '../api/client.js';
export function AuthNav() {
  const navigate = useNavigate();
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());

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
      <button
        type="button"
        onClick={handleLogout}
        className="app-btn-logout"
      >
        Log out
      </button>
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
  );}
