import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isLoggedIn, logout } from '../api/client.js';
import { useCurrentUser } from '../hooks/useCurrentUser.js';
import {
  DefaultInformationModal,
  PersonalInformationModal,
  PasswordInformationModal,
  ESignatureModal,
} from './AccountInfoModals.js';

// FIX: Maximo's top-bar profile icon opens a dropdown — Default Information /
// Personal Information / Password Information / Set or Modify E-Signature
// Key — and each one opens as a centered popup over the current page, not
// a page navigation. Previously this used navigate('/account?section=...'),
// which was the wrong interaction model (and the page-level effect driving
// it had a re-render risk that could exhaust the API's 20-req/min rate
// limit). Modals are rendered here, in the global header, so they work
// from any page — not just /account.
type ModalKey = 'default-info' | 'personal-info' | 'password-info' | 'e-signature' | null;

// FIX: "Log out" used to sit outside this dropdown as its own always-
// visible top-bar button. Moved inside, as the last item after "Set or
// Modify E-Signature Key" — a plain menu item like the others, just with
// its own click handler (handleLogout) instead of opening a modal.
const PROFILE_MENU_ITEMS: { key: Exclude<ModalKey, null>; label: string }[] = [
  { key: 'default-info', label: 'Default Information' },
  { key: 'personal-info', label: 'Personal Information' },
  { key: 'password-info', label: 'Password Information' },
  { key: 'e-signature', label: 'Set or Modify E-Signature Key' },
];

export function AuthNav() {
  const navigate = useNavigate();
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const { user } = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [openModal, setOpenModal] = useState<ModalKey>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setLoggedIn(isLoggedIn());
    window.addEventListener('storage', sync);
    window.addEventListener('eam-auth-change', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('eam-auth-change', sync);
    };
  }, []);

  // Close the dropdown on outside click — standard menu behaviour. Escape
  // is handled separately inside each modal (ModalShell), not here.
  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  async function handleLogout() {
    await logout();
    setLoggedIn(false);
    navigate('/login');
  }

  function selectMenuItem(key: Exclude<ModalKey, null>) {
    setMenuOpen(false);
    setOpenModal(key);
  }

  if (loggedIn) {
    return (
      <>
        <div className="flex items-center gap-3">
          {/* User avatar + display name — dropdown trigger, opens modals (no navigation) */}
          {user && (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 text-white/80 hover:text-white transition-colors group bg-transparent border-0 cursor-pointer"
                title="My account"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
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
                <span className="text-sm font-medium hidden sm:block">
                  {user.displayName || user.email}
                </span>
                <span className="text-xs opacity-70">▾</span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-56 bg-white text-gray-800 rounded-md shadow-lg border border-gray-200 py-1 z-50"
                >
                  {PROFILE_MENU_ITEMS.map((item) => (
                    <button
                      key={item.key}
                      role="menuitem"
                      type="button"
                      onClick={() => selectMenuItem(item.key)}
                      className="w-full text-left text-sm px-4 py-2 hover:bg-gray-100 bg-transparent border-0 cursor-pointer"
                    >
                      {item.label}
                    </button>
                  ))}
                  <div className="border-t border-gray-200 my-1" />
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => { setMenuOpen(false); void handleLogout(); }}
                    className="w-full text-left text-sm px-4 py-2 hover:bg-gray-100 bg-transparent border-0 cursor-pointer text-red-600"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modals — rendered once here, available from any page */}
        {openModal === 'default-info' && (
          <DefaultInformationModal onClose={() => setOpenModal(null)} />
        )}
        {openModal === 'personal-info' && (
          <PersonalInformationModal onClose={() => setOpenModal(null)} email={user?.email ?? ''} />
        )}
        {openModal === 'password-info' && (
          <PasswordInformationModal onClose={() => setOpenModal(null)} />
        )}
        {openModal === 'e-signature' && (
          <ESignatureModal onClose={() => setOpenModal(null)} />
        )}
      </>
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
