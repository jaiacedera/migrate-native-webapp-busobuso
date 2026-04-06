import { registerBackgroundNotificationHandler } from './services/pushNotificationService';

// Register the background FCM handler before Expo Router boots the app.
registerBackgroundNotificationHandler();

import 'expo-router/entry';
