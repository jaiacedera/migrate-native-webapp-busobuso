import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import backgroundImage from '../../../assets/images/getstarted_background.jpg';
import logoImage from '../../../assets/images/busobuso_logo.png';

export function GetStartedPage() {
  const navigate = useNavigate();

  const heroStyle = {
    '--hero-image': `url(${backgroundImage})`,
  } as CSSProperties;

  return (
    <main className="hero" style={heroStyle}>
      <div className="hero__content">
        <section className="hero__panel">
          <div className="hero__brand">
            <div className="hero__logo-shell">
              <img src={logoImage} alt="BusoBuso logo" />
            </div>

            <div className="hero__brand-copy">
              <strong>Barangay Buso-Buso</strong>
              <span>Resident Emergency Operations Center</span>
            </div>
          </div>

          <p className="eyebrow">Web migration scaffold</p>
          <h1 className="hero__title">Stay prepared and reach help faster.</h1>
          <p className="hero__summary">
            This first web build keeps the same resident onboarding flow from the
            Expo app while moving authentication and profile setup into a browser
            friendly foundation that can later become a full PWA.
          </p>

          <div className="hero__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate('/auth')}
            >
              Get Started
            </button>
            <a className="btn btn--secondary" href="#web-highlights">
              View Highlights
            </a>
          </div>
        </section>

        <section id="web-highlights" className="hero__panel">
          <p className="eyebrow">What is ready now</p>
          <div className="feature-grid">
            <article className="feature-card">
              <strong>Resident access</strong>
              <p>Email/password auth is ready, and Google sign-in now uses the Firebase web flow.</p>
            </article>

            <article className="feature-card">
              <strong>Browser persistence</strong>
              <p>Sessions are restored with Firebase browser storage so users stay signed in on reload.</p>
            </article>

            <article className="feature-card">
              <strong>Profile setup</strong>
              <p>The resident user form is already migrated so onboarding can continue on the web.</p>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}
