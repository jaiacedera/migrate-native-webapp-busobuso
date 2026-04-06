import { getApp, getApps, initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  console.warn(
    `Firebase is missing the following Vite env vars: ${missingKeys.join(', ')}. ` +
      'The app will compile, but auth and Firestore will not work until they are supplied.'
  );
}

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const appCheckSiteKey = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY?.trim() || '';

if (appCheckSiteKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.error('Failed to initialize Firebase App Check:', error);
  }
} else {
  console.warn(
    'Firebase App Check is not configured for the web app. Set VITE_FIREBASE_APPCHECK_SITE_KEY before enforcing App Check in production.'
  );
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

void setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Failed to enable Firebase browser persistence:', error);
});
