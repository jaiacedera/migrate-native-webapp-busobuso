import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth } from './firebase';

type FirebaseLikeError = {
  code?: string;
  message?: string;
};

function getFriendlyAuthMessage(error: unknown, fallback: string): string {
  const firebaseError = error as FirebaseLikeError;

  switch (firebaseError.code) {
    case 'auth/email-already-in-use':
      return 'That email address is already in use.';
    case 'auth/invalid-email':
      return 'That email address is invalid.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before it finished.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Please allow popups and try again.';
    case 'auth/operation-not-allowed':
      return 'This authentication method is not enabled in Firebase Console yet.';
    default:
      return firebaseError.message || fallback;
  }
}

export async function signInUser(email: string, password: string): Promise<User> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    throw new Error(getFriendlyAuthMessage(error, 'Unable to sign in right now.'));
  }
}

export async function signUpUser(email: string, password: string): Promise<User> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    throw new Error(getFriendlyAuthMessage(error, 'Unable to create your account right now.'));
  }
}

export async function signInWithGooglePopup(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    const userCredential = await signInWithPopup(auth, provider);
    return userCredential.user;
  } catch (error) {
    // TODO: Add a redirect fallback for browsers that consistently block popups.
    throw new Error(getFriendlyAuthMessage(error, 'Unable to continue with Google right now.'));
  }
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}
