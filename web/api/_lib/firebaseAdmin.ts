import process from 'node:process';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const getServiceAccount = () => ({
  projectId: requireEnv('FIREBASE_ADMIN_PROJECT_ID'),
  clientEmail: requireEnv('FIREBASE_ADMIN_CLIENT_EMAIL'),
  privateKey: requireEnv('FIREBASE_ADMIN_PRIVATE_KEY').replace(/\\n/g, '\n'),
});

const getFirebaseAdminApp = () => {
  if (getApps().length > 0) {
    return getApp();
  }

  const serviceAccount = getServiceAccount();

  return initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.projectId,
  });
};

export const adminAuth = () => getAuth(getFirebaseAdminApp());

export const adminDb = () => getFirestore(getFirebaseAdminApp());
