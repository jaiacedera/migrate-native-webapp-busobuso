import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  User
} from 'firebase/auth';
import { Alert } from 'react-native';
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