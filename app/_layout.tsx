import { Stack } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { responsiveInset, scaleFont, scaleHeight } from '../constants/responsive';
import { auth } from '../services/firebaseconfig';
import {
  buildResidentNotificationPayload,
  clearResidentPushRegistration,
  ensurePushNotificationChannel,
  getInitialNotificationMessage,
  isNotificationPreferenceEnabled,
  listenForForegroundMessages,
  listenForNotificationOpens,
  listenForTokenRefresh,
  type ResidentNotificationPayload,
  syncResidentPushRegistration,
} from '../services/pushNotificationService';

export default function RootLayout() {
  const previousResidentIdRef = React.useRef<string | null>(null);
  const bannerTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inAppBanner, setInAppBanner] = React.useState<{ title: string; message: string } | null>(null);

  const showInAppBanner = React.useCallback((notification: ResidentNotificationPayload) => {
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
    }

    setInAppBanner({
      title: notification.title,
      message: notification.message,
    });

    bannerTimerRef.current = setTimeout(() => {
      setInAppBanner(null);
    }, 5000);
  }, []);

  React.useEffect(() => {
    const handleIncomingNotification = async (
      remoteMessage: Parameters<typeof buildResidentNotificationPayload>[0]
    ) => {
      if (!(await isNotificationPreferenceEnabled())) {
        return;
      }

      const notification = buildResidentNotificationPayload(remoteMessage);
      if (!notification) {
        return;
      }

      showInAppBanner(notification);
    };

    void ensurePushNotificationChannel().catch((error) => {
      console.error('Notification channel setup failed:', error);
    });

    void getInitialNotificationMessage()
      .then(async (remoteMessage) => {
        if (!remoteMessage) {
          return;
        }

        await handleIncomingNotification(remoteMessage);
      })
      .catch((error) => {
        console.error('Initial notification handling failed:', error);
      });

    const unsubscribeForeground = listenForForegroundMessages((remoteMessage) => {
      void handleIncomingNotification(remoteMessage).catch((error) => {
        console.error('Foreground notification handling failed:', error);
      });
    });

    const unsubscribeOpened = listenForNotificationOpens((remoteMessage) => {
      void handleIncomingNotification(remoteMessage).catch((error) => {
        console.error('Notification-open handling failed:', error);
      });
    });

    let unsubscribeTokenRefresh = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      const previousResidentId = previousResidentIdRef.current;

      unsubscribeTokenRefresh();
      unsubscribeTokenRefresh = () => {};

      if (previousResidentId && previousResidentId !== user?.uid) {
        await clearResidentPushRegistration(previousResidentId).catch((error) => {
          console.error('Failed to clear previous resident FCM token:', error);
        });
      }

      previousResidentIdRef.current = user?.uid ?? null;

      if (!user) {
        return;
      }

      try {
        await syncResidentPushRegistration(user.uid);
        unsubscribeTokenRefresh = listenForTokenRefresh(user.uid);
      } catch (error) {
        console.error('Resident push registration failed:', error);
      }
    });

    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
      }

      unsubscribeTokenRefresh();
      unsubscribeForeground();
      unsubscribeOpened();
      unsubscribeAuth();
    };
  }, [showInAppBanner]);

  return (
    <View style={styles.root}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="mobile-ui/user-log-in-sign-up-screen" />
        <Stack.Screen name="mobile-ui/get-started" />
        <Stack.Screen
          name="mobile-ui/dashboard"
          options={{
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="mobile-ui/profile-screen"
          options={{
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="mobile-ui/reports-screen"
          options={{
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="mobile-ui/reports-tracker-screen"
          options={{
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="mobile-ui/report-tracker-detail"
          options={{
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="mobile-ui/user-form"
          options={{
            gestureEnabled: false,
          }}
        />
      </Stack>

      {inAppBanner && (
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.inAppBanner}
          onPress={() => setInAppBanner(null)}
        >
          <Text style={styles.inAppBannerTitle}>{inAppBanner.title}</Text>
          <Text numberOfLines={2} style={styles.inAppBannerBody}>
            {inAppBanner.message}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  inAppBanner: {
    position: 'absolute',
    top: scaleHeight(52),
    left: responsiveInset.card,
    right: responsiveInset.card,
    backgroundColor: '#274C77',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    zIndex: 999,
    elevation: 8,
  },
  inAppBannerTitle: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: scaleFont(14),
    marginBottom: 2,
  },
  inAppBannerBody: {
    color: '#E5E7EB',
    fontSize: scaleFont(12),
  },
});
