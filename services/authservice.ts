import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  User
} from 'firebase/auth';
import { Alert, Platform } from 'react-native';
// Fixed: Relative path for files in the same directory
import { auth } from './firebaseconfig';

interface FirebaseError {
  code: string;
  message: string;
}

function isFirebaseError(error: unknown): error is FirebaseError {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as any).code === 'string'
  );
}

type GoogleWebSignInResult = {
  user: User | null;
  pendingRedirect: boolean;
};

const GOOGLE_REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
]);

const GOOGLE_SILENT_CANCEL_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
]);

const createGoogleProvider = (): GoogleAuthProvider => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  return provider;
};

const handleGoogleSignInError = (error: unknown): void => {
  if (isFirebaseError(error)) {
    if (GOOGLE_SILENT_CANCEL_CODES.has(error.code)) {
      return;
    }

    if (error.code === 'auth/operation-not-allowed') {
      Alert.alert(
        'Google Sign-In Disabled',
        'Google provider is not enabled in Firebase Authentication for this project.'
      );
      return;
    }

    Alert.alert('Google Sign-In Error', error.message);
    return;
  }

  Alert.alert('Google Sign-In Error', 'Unable to continue with Google right now.');
};

// --- Logic for Creating New Accounts ---
export const signUpUser = async (
  email: string, 
  password: string
): Promise<User | null> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: unknown) {
    if (isFirebaseError(error)) {
      if (error.code === 'auth/email-already-in-use') {
        Alert.alert('Error', 'That email address is already in use!');
      } else if (error.code === 'auth/invalid-email') {
        Alert.alert('Error', 'That email address is invalid!');
      } else if (error.code === 'auth/operation-not-allowed') {
        Alert.alert(
          'Sign Up Disabled',
          'Email/Password sign-up is not enabled in Firebase Console for this project.'
        );
      } else {
        Alert.alert('Sign Up Error', error.message);
      }
    }
    return null;
  }
};

// --- Logic for Logging In Existing Users ---
export const signInUser = async (
  email: string, 
  password: string
): Promise<User | null> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error: unknown) {
    if (isFirebaseError(error)) {
      // Handles standard and modern Firebase security codes
      if (
        error.code === 'auth/user-not-found' || 
        error.code === 'auth/wrong-password' || 
        error.code === 'auth/invalid-credential'
      ) {
        Alert.alert('Error', 'Invalid email or password');
      } else if (error.code === 'auth/operation-not-allowed') {
        Alert.alert(
          'Login Disabled',
          'Email/Password sign-in is not enabled in Firebase Console for this project.'
        );
      } else {
        Alert.alert('Login Error', error.message);
      }
    }
    return null;
  }
};

export const signInWithGoogleIdToken = async (
  idToken: string
): Promise<User | null> => {
  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);
    return userCredential.user;
  } catch (error: unknown) {
    if (isFirebaseError(error)) {
      if (error.code === 'auth/operation-not-allowed') {
        Alert.alert(
          'Google Sign-In Disabled',
          'Google provider is not enabled in Firebase Authentication for this project.'
        );
      } else {
        Alert.alert('Google Sign-In Error', error.message);
      }
    }
    return null;
  }
};

export const signInWithGoogleWeb = async (): Promise<GoogleWebSignInResult> => {
  if (Platform.OS !== 'web') {
    return { user: null, pendingRedirect: false };
  }

  const provider = createGoogleProvider();
  const canUsePopup = typeof window !== 'undefined' && typeof window.open === 'function';

  if (!canUsePopup) {
    await signInWithRedirect(auth, provider);
    return { user: null, pendingRedirect: true };
  }

  try {
    const userCredential = await signInWithPopup(auth, provider);
    return {
      user: userCredential.user,
      pendingRedirect: false,
    };
  } catch (error: unknown) {
    if (isFirebaseError(error) && GOOGLE_REDIRECT_FALLBACK_CODES.has(error.code)) {
      await signInWithRedirect(auth, provider);
      return { user: null, pendingRedirect: true };
    }

    handleGoogleSignInError(error);
    return { user: null, pendingRedirect: false };
  }
};

export const consumeGoogleRedirectSignInResult = async (): Promise<User | null> => {
  if (Platform.OS !== 'web') {
    return null;
  }

  try {
    const redirectResult = await getRedirectResult(auth);
    return redirectResult?.user ?? null;
  } catch (error: unknown) {
    handleGoogleSignInError(error);
    return null;
  }
};
