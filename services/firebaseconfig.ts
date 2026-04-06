import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import {
  getAuth,
  initializeAuth,
  type Auth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
//hingin kay llyne say ang config 
const firebaseConfig = {
  apiKey: "AIzaSyATJc7J7Jzvhiq6k7rN5VrIXUfDRUDPjf8",
  authDomain: "buso-busowebdashboard.firebaseapp.com",
  projectId: "buso-busowebdashboard",
  storageBucket: "buso-busowebdashboard.firebasestorage.app",
  messagingSenderId: "964264919257",
  appId: "1:964264919257:web:13696fd17a2765f3b5fec8",
  measurementId: "G-FFRSENZKC6"
};

// Initialize Firebase once
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Initialize Firebase Auth with persisted state in React Native
let authInstance: Auth;
const getReactNativePersistence = (
  FirebaseAuth as unknown as {
    getReactNativePersistence?: (storage: typeof AsyncStorage) => unknown;
  }
).getReactNativePersistence;

try {
  if (getReactNativePersistence) {
    authInstance = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage) as any,
    });
  } else {
    authInstance = getAuth(app);
  }
} catch {
  authInstance = getAuth(app);
}

export const auth = authInstance;