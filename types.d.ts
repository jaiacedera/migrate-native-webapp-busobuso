// Type declarations for modules without built-in types
declare module '@expo/vector-icons';
declare module '@expo/vector-icons/*';
declare module 'expo-router';
declare module 'expo-location' {
  const Location: any;
  export = Location;
}
declare module 'expo-speech-recognition' {
  const SpeechRecognition: any;
  export = SpeechRecognition;
}
declare module 'firebase/firestore';

// Cloudinary upload result type
export type CloudinaryUploadResult = {
  url: string;
  publicId: string;
};
