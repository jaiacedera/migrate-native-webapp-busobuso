import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { onAuthStateChanged, type User } from 'firebase/auth';
import AppShell from '../layouts/AppShell';
import { GetStartedPage } from '../pages/GetStartedPage';
import { AuthPage } from '../pages/AuthPage';
import { UserFormPage } from '../pages/UserFormPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ReportsPage } from '../pages/ReportsPage';
import { ReportTrackerPage } from '../pages/ReportTrackerPage';
import { ReportTrackerDetailPage } from '../pages/ReportTrackerDetailPage';
import { ProfilePage } from '../pages/ProfilePage';
import { auth } from '../services/firebase';

const AUTH_LOADING_TIMEOUT_MS = 4000;

type AuthState = {
  loading: boolean;
  user: User | null;
};

function useAuthState(): AuthState {
  const [state, setState] = useState<AuthState>({
    loading: true,
    user: auth.currentUser,
  });

  useEffect(() => {
    let isMounted = true;
    let hasResolvedInitialState = false;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      hasResolvedInitialState = true;

      if (!isMounted) {
        return;
      }

      setState({
        loading: false,
        user,
      });
    });

    const authWithReady = auth as typeof auth & {
      authStateReady?: () => Promise<void>;
    };

    if (typeof authWithReady.authStateReady === 'function') {
      void authWithReady
        .authStateReady()
        .then(() => {
          if (!isMounted || hasResolvedInitialState) {
            return;
          }

          hasResolvedInitialState = true;
          setState({
            loading: false,
            user: auth.currentUser,
          });
        })
        .catch((error) => {
          console.error('Initial Firebase auth state resolution failed:', error);

          if (!isMounted || hasResolvedInitialState) {
            return;
          }

          hasResolvedInitialState = true;
          setState({
            loading: false,
            user: auth.currentUser,
          });
        });
    }

    const timeoutId = window.setTimeout(() => {
      if (!isMounted || hasResolvedInitialState) {
        return;
      }

      hasResolvedInitialState = true;
      setState({
        loading: false,
        user: auth.currentUser,
      });
    }, AUTH_LOADING_TIMEOUT_MS);

    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, []);

  return state;
}

function RouteGate({
  children,
  requiresAuth,
}: {
  children: ReactNode;
  requiresAuth: boolean;
}) {
  const { loading, user } = useAuthState();

  if (loading) {
    return (
      <section className="page-card route-status-card">
        <p className="eyebrow">Checking session</p>
        <h1 className="section-title">Preparing your workspace</h1>
        <p className="text-muted">
          We are restoring your saved session with Firebase browser persistence.
        </p>
      </section>
    );
  }

  if (requiresAuth && !user) {
    return <Navigate to="/auth" replace />;
  }

  if (!requiresAuth && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <GetStartedPage />,
  },
  {
    element: <AppShell />,
    children: [
      {
        path: '/auth',
        element: (
          <RouteGate requiresAuth={false}>
            <AuthPage />
          </RouteGate>
        ),
      },
      {
        path: '/user-form',
        element: (
          <RouteGate requiresAuth>
            <UserFormPage />
          </RouteGate>
        ),
      },
      {
        path: '/dashboard',
        element: (
          <RouteGate requiresAuth>
            <DashboardPage />
          </RouteGate>
        ),
      },
      {
        path: '/reports',
        element: (
          <RouteGate requiresAuth>
            <ReportsPage />
          </RouteGate>
        ),
      },
      {
        path: '/reports/tracker',
        element: (
          <RouteGate requiresAuth>
            <ReportTrackerPage />
          </RouteGate>
        ),
      },
      {
        path: '/reports/:reportDocId',
        element: (
          <RouteGate requiresAuth>
            <ReportTrackerDetailPage />
          </RouteGate>
        ),
      },
      {
        path: '/profile',
        element: (
          <RouteGate requiresAuth>
            <ProfilePage />
          </RouteGate>
        ),
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);
