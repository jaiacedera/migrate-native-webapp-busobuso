import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import logoImage from '../../../assets/images/busobuso_logo.png';
import { readStringStorage, writeStringStorage } from '../lib/storage';
import {
  signInUser,
  signInWithGooglePopup,
  signUpUser,
} from '../services/auth';

type AuthMode = 'login' | 'signup';

const AUTH_MODE_STORAGE_KEY = 'busobuso:web:auth-mode';

function getInitialMode(): AuthMode {
  return readStringStorage(AUTH_MODE_STORAGE_KEY, 'login') === 'signup' ? 'signup' : 'login';
}

export function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>(getInitialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const pageTitle = useMemo(
    () => (mode === 'login' ? 'Welcome back' : 'Create your resident account'),
    [mode]
  );

  const pageSummary = useMemo(
    () =>
      mode === 'login'
        ? 'Sign in to continue to the resident dashboard and your reporting tools.'
        : 'Create your account first. You will complete your resident profile on the next screen.',
    [mode]
  );

  const handleModeChange = (nextMode: AuthMode) => {
    setMode(nextMode);
    writeStringStorage(AUTH_MODE_STORAGE_KEY, nextMode);
    setErrorMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter your email address and password.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'login') {
        await signInUser(email.trim(), password);
        navigate('/dashboard', { replace: true });
      } else {
        await signUpUser(email.trim(), password);
        navigate('/user-form', { replace: true });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setIsLoading(true);

    try {
      await signInWithGooglePopup();
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Google sign-in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="auth-grid">
      <article className="page-card auth-card">
        <div className="section-header">
          <p className="eyebrow">Resident access</p>
          <h1 className="section-title">{pageTitle}</h1>
          <p className="text-muted">{pageSummary}</p>
        </div>

        <div className="pill-tabs" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === 'login' ? 'active' : undefined}
            onClick={() => handleModeChange('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === 'signup' ? 'active' : undefined}
            onClick={() => handleModeChange('signup')}
          >
            Sign up
          </button>
        </div>

        {errorMessage ? <div className="alert">{errorMessage}</div> : null}

        <form className="form-stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="resident@example.com"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
            />
          </div>

          {mode === 'signup' ? (
            <div className="field">
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your password"
              />
            </div>
          ) : null}

          <div className="btn-row">
            <button type="submit" className="btn btn--primary" disabled={isLoading}>
              {isLoading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
            </button>
            <button
              type="button"
              className="btn btn--subtle"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
            >
              Continue with Google
            </button>
          </div>
        </form>
      </article>

      <aside className="page-card auth-aside">
        <div>
          <div className="hero__brand">
            <div className="hero__logo-shell">
              <img src={logoImage} alt="BusoBuso logo" />
            </div>
            <div className="hero__brand-copy">
              <strong>BusoBuso Web</strong>
              <span>Resident onboarding now starts in the browser.</span>
            </div>
          </div>

          <h2>What this first migration slice already preserves</h2>
          <ul className="bullet-list">
            <li>Email/password account creation and login via Firebase Auth.</li>
            <li>Google sign-in adapted from native to a browser popup flow.</li>
            <li>The same user journey as the Expo app: sign up first, then complete the resident form.</li>
          </ul>
        </div>

        <p className="text-muted">
          Firebase auth provider settings still need to be enabled in the same
          project for Email/Password and Google.
        </p>
      </aside>
    </section>
  );
}
