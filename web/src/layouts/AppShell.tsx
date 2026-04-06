import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { onAuthStateChanged, type User } from 'firebase/auth';
import logoImage from '../../../assets/images/busobuso_logo.png';
import { signOutUser } from '../services/auth';
import { auth } from '../services/firebase';

export default function AppShell() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setCurrentUser);
    return unsubscribe;
  }, []);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOutUser();
      navigate('/auth', { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="shell-header">
        <div className="shell-inner shell-header-row">
          <NavLink to="/" className="brand">
            <img src={logoImage} alt="BusoBuso logo" />
            <span className="brand-copy">
              <small>Resident EOC</small>
              <span>BusoBuso Web</span>
            </span>
          </NavLink>

          <nav className="shell-nav" aria-label="Primary">
            <NavLink to="/" end>
              Home
            </NavLink>
            {currentUser ? (
              <>
                <NavLink to="/dashboard">Dashboard</NavLink>
                <NavLink to="/reports">Reports</NavLink>
                <NavLink to="/reports/tracker">Tracker</NavLink>
                <NavLink to="/profile">Profile</NavLink>
                <NavLink to="/user-form">User Form</NavLink>
              </>
            ) : (
              <NavLink to="/auth">Auth</NavLink>
            )}
            {currentUser ? (
              <button type="button" onClick={handleSignOut} disabled={isSigningOut}>
                {isSigningOut ? 'Signing out...' : 'Log out'}
              </button>
            ) : null}
          </nav>
        </div>
      </header>

      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
