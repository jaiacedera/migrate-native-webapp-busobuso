import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FirebaseMessagingTypes, Messaging } from '@react-native-firebase/messaging';
import Constants from 'expo-constants';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { NativeModules, Platform } from 'react-native';

import {
    NOTIFICATION_DISABLED_VALUE,
    NOTIFICATION_ENABLED_VALUE,
    NOTIFICATION_PREFERENCE_KEY,
} from '../constants/notification-settings';
import { db } from './firebaseconfig';

export const RESIDENTS_TOPIC = 'residents_buso_buso';
export const RESIDENTS_NOTIFICATION_CHANNEL_ID = 'alerts';
const DEFAULT_NOTIFICATION_TITLE = 'Buso-Buso Alert';

const NATIVE_FCM_UNAVAILABLE_MESSAGE =
  'Firebase Messaging is not available in this build. Rebuild the app with npx expo run:android or an installed APK instead of Expo Go.';

let backgroundHandlerRegistered = false;
let notificationsRuntime: NotificationsRuntime | null | undefined;

export type ResidentNotificationPayload = {
  title: string;
  message: string;
  data: Record<string, string>;
};

type MessagingRuntime = {
  api: typeof import('@react-native-firebase/messaging');
  messaging: Messaging;
};

type NotificationsRuntime = typeof import('expo-notifications');

const noop = () => {};

function hasRequiredNativeFirebaseModules(): boolean {
  const nativeModules = NativeModules as Record<string, unknown> | undefined;

  return Boolean(nativeModules?.RNFBAppModule && nativeModules?.RNFBMessagingModule);
}

function isExpoGoAndroid(): boolean {
  return Platform.OS === 'android' && Constants.executionEnvironment === 'storeClient';
}

function getNotificationsRuntime(): NotificationsRuntime | null {
  if (isExpoGoAndroid()) {
    return null;
  }

  if (notificationsRuntime !== undefined) {
    return notificationsRuntime;
  }

  try {
    notificationsRuntime = require('expo-notifications') as NotificationsRuntime;
  } catch {
    notificationsRuntime = null;
  }

  return notificationsRuntime;
}

export function isNativeMessagingAvailable(): boolean {
  return Platform.OS !== 'web' && hasRequiredNativeFirebaseModules();
}

function getMessagingRuntime(): MessagingRuntime {
  if (!isNativeMessagingAvailable()) {
    throw new Error(NATIVE_FCM_UNAVAILABLE_MESSAGE);
  }

  const appModule = require('@react-native-firebase/app') as typeof import('@react-native-firebase/app');
  const messagingModule =
    require('@react-native-firebase/messaging') as typeof import('@react-native-firebase/messaging');

  return {
    api: messagingModule,
    messaging: messagingModule.getMessaging(appModule.getApp()),
  };
}

function normalizeText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  return '';
}

function normalizeDataRecord(
  data: Record<string, string | object> | undefined
): Record<string, string> {
  if (!data) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => {
      if (typeof value === 'string') {
        return [key, value];
      }

      return [key, JSON.stringify(value)];
    })
  );
}

export async function isNotificationPreferenceEnabled(): Promise<boolean> {
  const preference = await AsyncStorage.getItem(NOTIFICATION_PREFERENCE_KEY);
  return !preference || preference === NOTIFICATION_ENABLED_VALUE;
}

async function setNotificationPreference(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(
    NOTIFICATION_PREFERENCE_KEY,
    enabled ? NOTIFICATION_ENABLED_VALUE : NOTIFICATION_DISABLED_VALUE
  );
}

export async function ensurePushNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const notifications = getNotificationsRuntime();
  if (!notifications) {
    return;
  }

  await notifications.setNotificationChannelAsync(RESIDENTS_NOTIFICATION_CHANNEL_ID, {
    name: 'Emergency Alerts',
    importance: notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF231F7C',
    lockscreenVisibility: notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  const notifications = getNotificationsRuntime();
  if (!notifications) {
    return false;
  }

  await ensurePushNotificationChannel();

  const permissionResponse = await notifications.getPermissionsAsync();
  let finalStatus = permissionResponse.status;

  if (finalStatus !== 'granted') {
    const requestResponse = await notifications.requestPermissionsAsync();
    finalStatus = requestResponse.status;
  }

  return finalStatus === 'granted';
}

export function buildResidentNotificationPayload(
  remoteMessage: FirebaseMessagingTypes.RemoteMessage
): ResidentNotificationPayload | null {
  const title =
    normalizeText(remoteMessage.notification?.title) ||
    normalizeText(remoteMessage.data?.title) ||
    DEFAULT_NOTIFICATION_TITLE;

  const message =
    normalizeText(remoteMessage.notification?.body) ||
    normalizeText(remoteMessage.data?.message) ||
    normalizeText(remoteMessage.data?.body);

  if (!title && !message) {
    return null;
  }

  return {
    title,
    message,
    data: normalizeDataRecord(remoteMessage.data),
  };
}

export async function saveResidentFcmToken(
  residentId: string,
  fcmToken: string | null
): Promise<void> {
  await setDoc(
    doc(db, 'residents', residentId),
    {
      residentId,
      fcmToken,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function syncResidentPushRegistration(residentId: string): Promise<string | null> {
  if (!(await isNotificationPreferenceEnabled())) {
    return null;
  }

  if (!isNativeMessagingAvailable()) {
    return null;
  }

  const { api, messaging } = getMessagingRuntime();

  const permissionGranted = await requestNotificationPermission();
  if (!permissionGranted) {
    await setNotificationPreference(false);
    return null;
  }

  await api.registerDeviceForRemoteMessages(messaging).catch(() => undefined);

  const token = await api.getToken(messaging);
  await saveResidentFcmToken(residentId, token);
  await api.subscribeToTopic(messaging, RESIDENTS_TOPIC);

  return token;
}

export async function enableResidentPushNotifications(
  residentId: string
): Promise<string | null> {
  await setNotificationPreference(true);

  try {
    const token = await syncResidentPushRegistration(residentId);

    if (!token) {
      await setNotificationPreference(false);
    }

    return token;
  } catch (error) {
    await setNotificationPreference(false);
    throw error;
  }
}

export async function disableResidentPushNotifications(residentId: string): Promise<void> {
  await setNotificationPreference(false);

  if (isNativeMessagingAvailable()) {
    const { api, messaging } = getMessagingRuntime();
    await api.unsubscribeFromTopic(messaging, RESIDENTS_TOPIC).catch(() => undefined);
  }

  await saveResidentFcmToken(residentId, null);
}

export async function clearResidentPushRegistration(residentId: string): Promise<void> {
  if (isNativeMessagingAvailable()) {
    const { api, messaging } = getMessagingRuntime();
    await api.unsubscribeFromTopic(messaging, RESIDENTS_TOPIC).catch(() => undefined);
  }

  await saveResidentFcmToken(residentId, null);
}

export function registerBackgroundNotificationHandler(): void {
  if (backgroundHandlerRegistered || !isNativeMessagingAvailable()) {
    return;
  }

  const { api, messaging } = getMessagingRuntime();

  api.setBackgroundMessageHandler(messaging, async (remoteMessage) => {
    const notification = buildResidentNotificationPayload(remoteMessage);

    if (!notification) {
      return;
    }

    console.log('[FCM][background]', notification.title, notification.message);
  });

  backgroundHandlerRegistered = true;
}

export function listenForForegroundMessages(
  listener: (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => void | Promise<void>
): () => void {
  if (!isNativeMessagingAvailable()) {
    return noop;
  }

  const { api, messaging } = getMessagingRuntime();
  return api.onMessage(messaging, listener);
}

export function listenForNotificationOpens(
  listener: (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => void | Promise<void>
): () => void {
  if (!isNativeMessagingAvailable()) {
    return noop;
  }

  const { api, messaging } = getMessagingRuntime();
  return api.onNotificationOpenedApp(messaging, listener);
}

export async function getInitialNotificationMessage(): Promise<FirebaseMessagingTypes.RemoteMessage | null> {
  if (!isNativeMessagingAvailable()) {
    return null;
  }

  const { api, messaging } = getMessagingRuntime();
  return api.getInitialNotification(messaging);
}

export function listenForTokenRefresh(residentId: string): () => void {
  if (!isNativeMessagingAvailable()) {
    return noop;
  }

  const { api, messaging } = getMessagingRuntime();

  return api.onTokenRefresh(messaging, async (token) => {
    if (!(await isNotificationPreferenceEnabled())) {
      return;
    }

    await saveResidentFcmToken(residentId, token);
    await api.subscribeToTopic(messaging, RESIDENTS_TOPIC);
  });
}
