import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    BackHandler,
    FlatList,
    Image,
    ImageBackground,
    KeyboardAvoidingView,
    Modal,
    PanResponder,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AboutModal from '../../components/about-modal';
import PinMap from '../../components/maps/PinMap';
import { philippinesCenter } from '../../constants/location';
import {
    NOTIFICATION_ENABLED_VALUE,
    NOTIFICATION_PREFERENCE_KEY,
} from '../../constants/notification-settings';
import { responsiveInset, scaleFont, scaleHeight, scaleWidth, screen } from '../../constants/responsive';
import { getLocation } from '../../services/api';
import { auth, db } from '../../services/firebaseconfig';
import {
    disableResidentPushNotifications,
    enableResidentPushNotifications,
} from '../../services/pushNotificationService';

const THEME_BLUE = '#274C77';
const LOCAL_PROFILE_IMAGE_KEY_PREFIX = 'local_profile_image_uri';

const getLocalProfileImageKey = (uid: string): string => `${LOCAL_PROFILE_IMAGE_KEY_PREFIX}:${uid}`;

const formatReverseGeocodeAddress = (geocode?: Location.LocationGeocodedAddress | null): string => {
  if (!geocode) {
    return '';
  }

  const isPlusCode = (value?: string | null): boolean => {
    const text = value?.trim() ?? '';
    return /^[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}$/i.test(text);
  };

  const parts = [
    geocode.street,
    geocode.district,
    geocode.subregion,
    geocode.city,
    isPlusCode(geocode.name) ? '' : geocode.name,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return Array.from(new Set(parts)).join(', ');
};

type ResidentProfile = {
  firstName?: string;
  middleInitial?: string;
  lastName?: string;
  address?: string;
  contactNumber?: string;
  emergencyContact?: string;
  profileImageUrl?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number | null;
    capturedAt?: string;
  };
};

type ProfileSnapshot = {
  exists: () => boolean;
  data: () => unknown;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type MenuItem = {
  id: string;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  isLogout?: boolean;
  isNotification?: boolean;
};

type ProfileSectionBoundaryProps = {
  children: React.ReactNode;
  fallbackTitle: string;
  fallbackMessage: string;
  resetKey: string;
};

type ProfileSectionBoundaryState = {
  hasError: boolean;
};

class ProfileSectionBoundary extends React.Component<
  ProfileSectionBoundaryProps,
  ProfileSectionBoundaryState
> {
  state: ProfileSectionBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ProfileSectionBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('Profile section crashed:', error);
  }

  componentDidUpdate(prevProps: ProfileSectionBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.sectionFallbackCard}>
          <MaterialIcons name="error-outline" size={28} color="#B45309" />
          <Text style={styles.sectionFallbackTitle}>{this.props.fallbackTitle}</Text>
          <Text style={styles.sectionFallbackMessage}>{this.props.fallbackMessage}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const ProfileScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWebPlatform = Platform.OS === 'web';
  const chatInputRef = useRef<TextInput | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isAuthResolved, setIsAuthResolved] = useState(Boolean(auth.currentUser));
  const [displayName, setDisplayName] = useState<string>();
  const [profileData, setProfileData] = useState<ResidentProfile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [showPersonalInfoModal, setShowPersonalInfoModal] = useState(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [editableAddress, setEditableAddress] = useState('');
  const [mapCenter, setMapCenter] = useState<[number, number]>(philippinesCenter);
  const [pinnedLocation, setPinnedLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
    capturedAt: string;
  } | null>(null);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isPinningLocation, setIsPinningLocation] = useState(false);
  const [chatbotVisible, setChatbotVisible] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      text: 'How can I help you today?',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isNotificationEnabled, setIsNotificationEnabled] = useState(true);
  const [isNotificationLoading, setIsNotificationLoading] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [localProfileImageUri, setLocalProfileImageUri] = useState<string | null>(null);
  const [addressMapError, setAddressMapError] = useState<string | null>(null);
  const [isWebAddressMapReady, setIsWebAddressMapReady] = useState(Platform.OS !== 'web');
  const chatSheetTranslateY = useState(new Animated.Value(0))[0];

  const closeChatbotSheet = () => {
    chatInputRef.current?.blur();
    Animated.timing(chatSheetTranslateY, {
      toValue: 500,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      chatSheetTranslateY.setValue(0);
      setChatbotVisible(false);
    });
  };

  const chatbotPanResponder = useState(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 1 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onMoveShouldSetPanResponderCapture: (_, gestureState) =>
        gestureState.dy > 1 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => {
        chatSheetTranslateY.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          chatSheetTranslateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 70 || gestureState.vy > 0.5) {
          closeChatbotSheet();
        } else {
          Animated.spring(chatSheetTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(chatSheetTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }).start();
      },
    })
  )[0];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        setCurrentUser(user);
        setIsAuthResolved(true);
      },
      (error) => {
        console.error('Failed to resolve profile auth state:', error);
        setCurrentUser(null);
        setIsAuthResolved(true);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      return true; // Prevent back navigation
    });

    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    if (chatbotVisible) {
      chatSheetTranslateY.setValue(0);
    }
  }, [chatbotVisible, chatSheetTranslateY]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    if (!showAddressModal) {
      setIsWebAddressMapReady(false);
      return;
    }

    setIsWebAddressMapReady(false);
    const timeoutId = setTimeout(() => {
      setIsWebAddressMapReady(true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [showAddressModal]);

  useEffect(() => {
    if (!showAddressModal) {
      return;
    }

    let isActive = true;
    const existingAddress = profileData?.address ?? '';
    const existingLocation = profileData?.location;
    setEditableAddress(existingAddress);
    setAddressMapError(null);

    if (
      typeof existingLocation?.latitude === 'number' &&
      typeof existingLocation?.longitude === 'number'
    ) {
      setPinnedLocation({
        latitude: existingLocation.latitude,
        longitude: existingLocation.longitude,
        accuracy: existingLocation.accuracy ?? null,
        capturedAt: existingLocation.capturedAt ?? new Date().toISOString(),
      });
      setMapCenter([existingLocation.longitude, existingLocation.latitude]);
      return;
    }

    setPinnedLocation(null);

    const applyFallbackMapCenter = async () => {
      try {
        const ipLocation = await getLocation();
        if (isActive) {
          setMapCenter(ipLocation);
        }
      } catch (error) {
        console.error('Failed to resolve fallback address map center:', error);
        if (isActive) {
          setMapCenter(philippinesCenter);
          setAddressMapError('Map location fallback is unavailable right now. You can still type your address and pin manually once the map loads.');
        }
      }
    };

    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          await applyFallbackMapCenter();
          return;
        }

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (isActive) {
          setMapCenter([currentPosition.coords.longitude, currentPosition.coords.latitude]);
        }
      } catch (error) {
        console.error('Failed to initialize address map location:', error);
        await applyFallbackMapCenter();
      }
    })();

    return () => {
      isActive = false;
    };
  }, [showAddressModal, profileData]);

  useEffect(() => {
    const loadNotificationPreference = async () => {
      try {
        const savedValue = await AsyncStorage.getItem(NOTIFICATION_PREFERENCE_KEY);
        if (!savedValue || savedValue === NOTIFICATION_ENABLED_VALUE) {
          setIsNotificationEnabled(true);
          return;
        }

        setIsNotificationEnabled(false);
      } catch (error) {
        console.error('Failed to load notification preference:', error);
      } finally {
        setIsNotificationLoading(false);
      }
    };

    loadNotificationPreference();
  }, []);

  useEffect(() => {
    if (!isAuthResolved) {
      setIsProfileLoading(true);
      return;
    }

    if (!currentUser) {
      setDisplayName(undefined);
      setProfileData(null);
      setLocalProfileImageUri(null);
      setIsProfileLoading(false);
      setProfileLoadError(null);
      return;
    }

    setIsProfileLoading(true);

    if (!isWebPlatform) {
      (async () => {
        try {
          const savedLocalImageUri = await AsyncStorage.getItem(getLocalProfileImageKey(currentUser.uid));
          setLocalProfileImageUri(savedLocalImageUri);
        } catch (error) {
          console.error('Failed to load local profile image URI:', error);
        }
      })();
    }

    const profileRef = doc(db, 'residents', currentUser.uid);
    const fallbackAuthName =
      currentUser.displayName?.trim() ||
      currentUser.email?.split('@')[0]?.trim() ||
      'Resident';

    const unsubscribe = onSnapshot(
      profileRef,
      (profileSnap: ProfileSnapshot) => {
        if (!profileSnap.exists()) {
          setDisplayName(fallbackAuthName);
          setProfileData(null);
          setIsProfileLoading(false);
          setProfileLoadError(null);
          return;
        }

        const data = profileSnap.data() as ResidentProfile;

        setProfileData(data);
        setIsProfileLoading(false);
        setProfileLoadError(null);

        const fullName = [
          data.firstName?.trim(),
          data.middleInitial?.trim() ? `${data.middleInitial.trim()}.` : '',
          data.lastName?.trim(),
        ]
          .filter(Boolean)
          .join(' ');

        setDisplayName(fullName || fallbackAuthName);
      },
      (error: unknown) => {
        console.error('Failed to listen to profile name:', error);
        setIsProfileLoading(false);
        setProfileLoadError('Your profile could not be loaded right now. The screen will keep rendering with safe fallbacks.');
      }
    );

    return unsubscribe;
  }, [currentUser, isAuthResolved, isWebPlatform]);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await signOut(auth);
      router.replace('/mobile-ui/user-log-in-sign-up-screen');
    } catch (error) {
      console.error('Failed to log out resident:', error);
      Alert.alert('Logout Failed', 'Unable to log out right now. Please try again.');
    } finally {
      setIsLoggingOut(false);
    }
  };

  const menuItems = [
    { id: '1', title: 'Personal Information', icon: 'person' },
    { id: '2', title: 'Upload New Picture', icon: 'create' },
    { id: '3', title: 'Edit Address', icon: 'location' },
    { id: '4', title: 'Report Tracker', icon: 'analytics' },
    { id: '5', title: 'Log Out', icon: 'log-out', isLogout: true },
  ] as MenuItem[];

  const handleToggleNotification = async (nextValue: boolean) => {
    if (!currentUser) {
      Alert.alert('Session Expired', 'Please log in again to update notification settings.');
      return;
    }

    const previousValue = isNotificationEnabled;

    try {
      setIsNotificationLoading(true);

      if (nextValue) {
        const token = await enableResidentPushNotifications(currentUser.uid);

        if (!token) {
          setIsNotificationEnabled(false);
          Alert.alert('Notifications Disabled', 'Permission was not granted for notifications.');
          return;
        }

        setIsNotificationEnabled(true);
        return;
      }

      await disableResidentPushNotifications(currentUser.uid);
      setIsNotificationEnabled(false);
    } catch (error) {
      console.error('Failed to update notification preference:', error);
      setIsNotificationEnabled(previousValue);

      const errorMessage =
        error instanceof Error ? error.message : 'Could not update notification preference right now.';

      Alert.alert('Update Failed', errorMessage);
    } finally {
      setIsNotificationLoading(false);
    }
  };

  const handlePress = (item: MenuItem) => {
    if (item.isLogout) {
      handleLogout();
    } else if (item.isNotification) {
      handleToggleNotification(!isNotificationEnabled);
    } else if (item.title === 'Upload New Picture') {
      handleCustomizeProfilePhoto();
    } else if (item.title === 'Personal Information') {
      setShowPersonalInfoModal(true);
    } else if (item.title === 'Edit Address') {
      setShowAddressModal(true);
    } else if (item.title === 'Report Tracker') {
      router.push('/mobile-ui/reports-tracker-screen');
    } else {
      console.log(`Tapped on ${item.title}`);
    }
  };

  const handleAddressMapPinChange = (payload: {
    latitude: number;
    longitude: number;
    capturedAt: string;
  }) => {
    setPinnedLocation({
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: null,
      capturedAt: payload.capturedAt,
    });
  };

  const handlePinCurrentAddressLocation = async () => {
    try {
      setIsPinningLocation(true);
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow location permission to pin your current location.');
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

      const nextLocation = {
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
        accuracy: currentPosition.coords.accuracy ?? null,
        capturedAt: new Date().toISOString(),
      };

      setPinnedLocation(nextLocation);
      setMapCenter([nextLocation.longitude, nextLocation.latitude]);

      const geocodeResults = await Location.reverseGeocodeAsync({
        latitude: nextLocation.latitude,
        longitude: nextLocation.longitude,
      });

      const hasStreetOrBarangay = (entry?: Location.LocationGeocodedAddress | null): boolean => {
        if (!entry) {
          return false;
        }

        return Boolean(entry.street?.trim() || entry.district?.trim() || entry.subregion?.trim());
      };

      const bestGeocode =
        geocodeResults?.find((entry: Location.LocationGeocodedAddress) => hasStreetOrBarangay(entry)) ?? geocodeResults?.[0] ?? null;
      const formattedAddress = formatReverseGeocodeAddress(bestGeocode);

      if (formattedAddress) {
        setEditableAddress(formattedAddress);
      } else if (!editableAddress.trim()) {
        setEditableAddress(`${nextLocation.latitude.toFixed(6)}, ${nextLocation.longitude.toFixed(6)}`);
      } else {
        Alert.alert('Address Hint', 'Street/barangay is unavailable for this pin. You can keep or edit the address manually.');
      }
    } catch (error) {
      console.error('Failed to pin current address location:', error);
      Alert.alert('Location Error', 'Unable to get your current location. Please try again.');
    } finally {
      setIsPinningLocation(false);
    }
  };

  const handleSaveAddress = async () => {
    if (!currentUser) {
      Alert.alert('Session Expired', 'Please log in again to update your address.');
      return;
    }

    const nextAddress = editableAddress.trim();
    if (!nextAddress) {
      Alert.alert('Validation Error', 'Please enter your address.');
      return;
    }

    if (!pinnedLocation) {
      Alert.alert('Validation Error', 'Please pin your exact location on the map.');
      return;
    }

    try {
      setIsSavingAddress(true);
      await setDoc(
        doc(db, 'residents', currentUser.uid),
        {
          address: nextAddress,
          location: pinnedLocation,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setShowAddressModal(false);
      Alert.alert('Saved', 'Address and location updated successfully.');
    } catch (error) {
      console.error('Failed to save address and location:', error);
      Alert.alert('Save Error', 'Unable to update address right now. Please try again.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleCustomizeProfilePhoto = async () => {
    if (!currentUser) {
      Alert.alert('Session Expired', 'Please log in again to update your profile picture.');
      return;
    }

    try {
      setIsUploadingProfilePhoto(true);

      const permission = isWebPlatform
        ? { granted: true }
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow photo library access to set a profile picture.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (pickerResult.canceled || !pickerResult.assets?.length) {
        return;
      }

      const selectedAsset = pickerResult.assets[0];

      if (isWebPlatform) {
        if (!selectedAsset.uri) {
          Alert.alert('Upload Failed', 'Selected image is unavailable in this browser.');
          return;
        }

        setLocalProfileImageUri(selectedAsset.uri);
        Alert.alert('Profile Updated', 'Your profile picture has been updated for this browser session.');
        return;
      }

      let imageBase64 = selectedAsset.base64 ?? '';

      if (!imageBase64) {
        imageBase64 = await LegacyFileSystem.readAsStringAsync(selectedAsset.uri, {
          encoding: 'base64',
        });
      }

      if (!imageBase64.trim()) {
        Alert.alert('Upload Failed', 'Selected image is empty. Please choose another photo.');
        return;
      }

      const documentDirectory = FileSystem.Paths.document.uri;
      if (!documentDirectory) {
        Alert.alert('Upload Failed', 'Local file storage is not available on this device.');
        return;
      }

      const normalizedMimeType = selectedAsset.mimeType?.toLowerCase();
      const inferredExtension = selectedAsset.uri.split('.').pop()?.toLowerCase();
      const fileExtension = normalizedMimeType?.includes('png') || inferredExtension === 'png' ? 'png' : 'jpg';
      const profileImagesDir = `${documentDirectory}profile-images/`;
      const localImageKey = getLocalProfileImageKey(currentUser.uid);

      await LegacyFileSystem.makeDirectoryAsync(profileImagesDir, { intermediates: true });

      const previousUri = await AsyncStorage.getItem(localImageKey);
      if (previousUri && previousUri.startsWith(documentDirectory)) {
        await LegacyFileSystem.deleteAsync(previousUri, { idempotent: true });
      }

      const destinationUri = `${profileImagesDir}${currentUser.uid}-${Date.now()}.${fileExtension}`;
      await LegacyFileSystem.copyAsync({
        from: selectedAsset.uri,
        to: destinationUri,
      });

      await AsyncStorage.setItem(localImageKey, destinationUri);
      setLocalProfileImageUri(destinationUri);

      Alert.alert('Profile Updated', 'Your profile picture has been saved on this device.');
    } catch (error) {
      console.error('Failed to save local profile photo:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unable to save selected image on this device.';
      Alert.alert('Upload Failed', errorMessage);
    } finally {
      setIsUploadingProfilePhoto(false);
    }
  };

  const renderItem = ({ item }: { item: MenuItem }) => (
    <TouchableOpacity 
      style={styles.menuItem} 
      onPress={() => handlePress(item)}
      activeOpacity={0.6}
      disabled={item.isNotification && isNotificationLoading}
    >
      <View style={styles.iconContainer}>
        <Ionicons name={item.icon} size={24} color="white" />
      </View>
      <Text style={styles.menuText}>{item.title}</Text>
      {item.isNotification && (
        <View style={styles.notificationControlRow}>
          <Text style={styles.notificationStateText}>{isNotificationEnabled ? 'ON' : 'OFF'}</Text>
          <Switch
            value={isNotificationEnabled}
            onValueChange={handleToggleNotification}
            disabled={isNotificationLoading}
            trackColor={{ false: '#CBD5E1', true: '#4F46E5' }}
            thumbColor="#FFFFFF"
          />
        </View>
      )}
    </TouchableOpacity>
  );

  const handleClearLocalProfilePhoto = async () => {
    if (!currentUser) {
      Alert.alert('Session Expired', 'Please log in again.');
      return;
    }

    if (isWebPlatform) {
      setLocalProfileImageUri(null);
      Alert.alert('Removed', 'Browser-session profile photo preview cleared.');
      return;
    }

    try {
      const documentDirectory = FileSystem.Paths.document.uri;
      const localImageKey = getLocalProfileImageKey(currentUser.uid);
      const savedUri = await AsyncStorage.getItem(localImageKey);

      if (savedUri && documentDirectory && savedUri.startsWith(documentDirectory)) {
        await LegacyFileSystem.deleteAsync(savedUri, { idempotent: true });
      }

      await AsyncStorage.removeItem(localImageKey);
      setLocalProfileImageUri(null);
      Alert.alert('Removed', 'Local profile photo has been removed from this device.');
    } catch (error) {
      console.error('Failed to clear local profile photo:', error);
      Alert.alert('Error', 'Unable to clear local profile photo right now.');
    }
  };

  const handleOpenAboutFromSettings = () => {
    setShowSettingsModal(false);
    setTimeout(() => {
      setShowAboutModal(true);
    }, 120);
  };

  const handleSendChat = async () => {
    const trimmedInput = chatInput.trim();

    if (!trimmedInput || isChatSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmedInput,
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    setIsChatSending(true);
    setChatError(null);

    try {
      const { sendChatbotMessage } = await import('../../services/openaiChatService');
      const assistantReply = await sendChatbotMessage(trimmedInput);

      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: assistantReply,
        },
      ]);
    } catch (error) {
      console.error('Chatbot request failed:', error);
      const details = error instanceof Error ? error.message : 'Unable to send your message right now.';
      setChatError(details);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          text: 'Sorry, I could not get a response right now. Please try again.',
        },
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  const profileBootMessage = useMemo(() => {
    if (!isAuthResolved) {
      return 'Finalizing your profile session...';
    }

    if (!currentUser) {
      return 'Your profile session is not ready yet. Please sign in again to continue.';
    }

    return null;
  }, [currentUser, isAuthResolved]);

  const screenResetKey = `${currentUser?.uid ?? 'guest'}-${String(showAddressModal)}-${String(isWebAddressMapReady)}`;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {profileBootMessage ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={THEME_BLUE} />
          <Text style={styles.centerStateTitle}>Loading profile</Text>
          <Text style={styles.centerStateMessage}>{profileBootMessage}</Text>
          {isAuthResolved && !currentUser ? (
            <TouchableOpacity
              style={styles.primaryActionButton}
              onPress={() => router.replace('/mobile-ui/user-log-in-sign-up-screen')}
            >
              <Text style={styles.primaryActionButtonText}>Back to sign in</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <ProfileSectionBoundary
          fallbackTitle="Profile unavailable"
          fallbackMessage="A profile section crashed on web, so a safe fallback is shown instead of a blank screen."
          resetKey={screenResetKey}
        >
          <View style={styles.screenContent}>
      {/* 1. TOP SECTION (Header Background & Avatar) */}
      <View style={styles.headerContainer}>
        <ImageBackground
          source={require('../../assets/images/getstarted_background.jpg')}
          imageStyle={styles.bgImageAsset}
          style={[
            styles.bgImage,
            {
              marginTop: -insets.top,
              paddingTop: insets.top + scaleHeight(8),
            },
          ]}
          resizeMode="cover"
        >
          <TouchableOpacity style={styles.settingsBtn} onPress={() => setShowSettingsModal(true)}>
            <Ionicons name="settings" size={24} color={THEME_BLUE} />
          </TouchableOpacity>
        </ImageBackground>

        <View style={styles.headerBottomCurve} pointerEvents="none" />

        {/* Circular notch — traces the top half of the profile picture */}
        <View style={styles.avatarNotchMask} pointerEvents="none" />

        {/* Avatar Stack */}
        <View style={styles.avatarWrapper}>
          <View style={styles.outerCircle}>
            <Image
              source={
                localProfileImageUri
                  ? { uri: localProfileImageUri }
                  : profileData?.profileImageUrl
                    ? { uri: profileData.profileImageUrl }
                  : require('../../assets/images/default_image.jpg')
              }
              style={styles.avatar}
              key={localProfileImageUri || profileData?.profileImageUrl || 'default'}
            />
            {isUploadingProfilePhoto && (
              <View style={styles.profileUploadOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.userNameSlot} pointerEvents="none">
          <Text style={styles.userName}>{displayName || 'Resident'}</Text>
        </View>

        {profileLoadError ? <StatusCard text={profileLoadError} /> : null}

        {/* 2. MENU LIST */}
        <FlatList
          style={styles.menuList}
          data={menuItems}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={[styles.listPadding, { paddingBottom: scaleHeight(108) + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled
        />
      </View>

      <TouchableOpacity
        style={[styles.chatbotFab, { bottom: scaleHeight(68) + insets.bottom }]}
        onPress={() => setChatbotVisible(true)}
        activeOpacity={0.8}
      >
        <Image
          source={require('../../assets/images/pyro_logo.png')}
          style={styles.chatbotImage}
          resizeMode="contain"
        />
      </TouchableOpacity>

      <View style={[styles.bottomNavContainer, { height: scaleHeight(70) + insets.bottom }]}>
        <View style={[styles.bottomNav, { height: scaleHeight(70), paddingBottom: insets.bottom }]}>
          <TouchableOpacity
            style={styles.navItem}
            onPress={() => router.replace('/mobile-ui/dashboard')}
          >
            <MaterialIcons name="home" size={30} color="rgba(255,255,255,0.54)" />
          </TouchableOpacity>

          <View style={styles.navItemSpace} />

          <TouchableOpacity
            style={styles.navItem}
            onPress={() => router.replace('/mobile-ui/profile-screen')}
          >
            <MaterialIcons name="person-outline" size={30} color="white" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.centerFab}
          activeOpacity={0.9}
          onPress={() => setActionMenuVisible(true)}
        >
          <MaterialIcons name="add" size={35} color="white" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={actionMenuVisible}
        transparent
        animationType="none"
        onRequestClose={() => setActionMenuVisible(false)}
      >
        <View style={styles.actionMenuOverlay}>
          <TouchableOpacity
            style={{ flex: 1, width: '100%' }}
            activeOpacity={1}
            onPress={() => setActionMenuVisible(false)}
          />

          <View style={styles.actionMenuContainer}>
            <View style={styles.menuHandle} />

            <TouchableOpacity
              style={styles.actionMenuItem}
              onPress={() => {
                setActionMenuVisible(false);
                router.push('/mobile-ui/reports-screen');
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="report-problem" size={24} color="red" />
              <Text style={styles.actionMenuItemText}>Make an Incident Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 3. LOGOUT MODAL (Mirroring Flutter Dialog) */}
      <Modal visible={isLoggingOut} transparent animationType="none">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color={THEME_BLUE} />
            <Text style={styles.logoutText}>Logging out...</Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={chatbotVisible}
        transparent
        animationType="slide"
        onRequestClose={closeChatbotSheet}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
          style={styles.chatbotOverlay}
        >
          <TouchableOpacity
            style={{ flex: 1, width: '100%' }}
            activeOpacity={1}
            onPress={closeChatbotSheet}
          />

          <Animated.View
            style={[
              styles.chatbotContainer,
              {
                transform: [{ translateY: chatSheetTranslateY }],
              },
            ]}
          >
            <View style={styles.chatDragHeader} {...chatbotPanResponder.panHandlers}>
              <View style={styles.menuHandle} />
              <Text style={styles.chatbotTitle}>Buso-Buso Assistant</Text>
            </View>
            <View style={styles.divider} />

            <View style={styles.chatbotBody}>
              <ScrollView
                style={styles.chatMessagesScroll}
                contentContainerStyle={styles.chatMessagesContent}
                showsVerticalScrollIndicator={false}
              >
                {chatMessages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.chatBubble,
                      message.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chatBubbleText,
                        message.role === 'user' ? styles.chatBubbleTextUser : styles.chatBubbleTextAssistant,
                      ]}
                    >
                      {message.text}
                    </Text>
                  </View>
                ))}

                {isChatSending && (
                  <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
                    <ActivityIndicator size="small" color={THEME_BLUE} />
                  </View>
                )}

                {chatError ? (
                  <View style={styles.chatErrorCard}>
                    <Text style={styles.chatErrorText}>{chatError}</Text>
                  </View>
                ) : null}
              </ScrollView>
            </View>

            <View style={styles.chatbotInputContainer}>
              <TextInput
                ref={chatInputRef}
                style={[styles.chatbotInput, isWebPlatform && styles.webTextInput]}
                placeholder="Type a message..."
                placeholderTextColor="grey"
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={handleSendChat}
                editable={!isChatSending}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleSendChat}
                disabled={isChatSending || !chatInput.trim()}
              >
                <MaterialIcons name="send" size={24} color={THEME_BLUE} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showSettingsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.settingsModalCard}>
            <Text style={styles.personalInfoTitle}>Settings</Text>

            <View style={styles.settingsRow}>
              <Text style={styles.settingsLabel}>Notifications</Text>
              <Switch
                value={isNotificationEnabled}
                onValueChange={handleToggleNotification}
                disabled={isNotificationLoading}
                trackColor={{ false: '#CBD5E1', true: '#4F46E5' }}
                thumbColor="#FFFFFF"
              />
            </View>

            <TouchableOpacity
              style={styles.settingsActionButton}
              onPress={handleClearLocalProfilePhoto}
              activeOpacity={0.8}
            >
              <Text style={styles.settingsActionButtonText}>Clear Local Profile Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingsActionButton}
              onPress={handleOpenAboutFromSettings}
              activeOpacity={0.8}
            >
              <Text style={styles.settingsActionButtonText}>About</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeInfoButton}
              onPress={() => setShowSettingsModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.closeInfoButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <AboutModal visible={showAboutModal} onClose={() => setShowAboutModal(false)} />

      <Modal
        visible={showPersonalInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPersonalInfoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.personalInfoModalCard}>
            <Text style={styles.personalInfoTitle}>Personal Information</Text>

            {isProfileLoading ? (
              <ActivityIndicator size="small" color={THEME_BLUE} />
            ) : !profileData ? (
              <Text style={styles.emptyInfoText}>No saved personal information found.</Text>
            ) : (
              <View style={styles.personalInfoList}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>First Name</Text>
                  <Text style={styles.infoValue}>{profileData.firstName || '-'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Last Name</Text>
                  <Text style={styles.infoValue}>{profileData.lastName || '-'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Middle Initial</Text>
                  <Text style={styles.infoValue}>{profileData.middleInitial || '-'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Address</Text>
                  <Text style={styles.infoValue}>{profileData.address || '-'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Contact Number</Text>
                  <Text style={styles.infoValue}>{profileData.contactNumber || '-'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Emergency Contact</Text>
                  <Text style={styles.infoValue}>{profileData.emergencyContact || '-'}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={styles.closeInfoButton}
              onPress={() => setShowPersonalInfoModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.closeInfoButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showAddressModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddressModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.addressModalCard}>
            <Text style={styles.personalInfoTitle}>Edit Address</Text>

            <Text style={styles.addressLabel}>Complete Address</Text>
            <TextInput
              style={[styles.addressInput, isWebPlatform && styles.webTextInput]}
              placeholder="Street, House No., Purok"
              placeholderTextColor="#64748B"
              value={editableAddress}
              onChangeText={setEditableAddress}
            />

            <Text style={styles.addressLabel}>Pin Exact Location</Text>
            <Text style={styles.addressHint}>Tap the map to pin your location.</Text>
            <View style={styles.addressMapContainer}>
              {!isWebAddressMapReady && isWebPlatform ? (
                <View style={[styles.addressMapWebView, styles.mapFallbackCard]}>
                  <ActivityIndicator size="small" color={THEME_BLUE} />
                  <Text style={styles.mapFallbackTitle}>Preparing map</Text>
                  <Text style={styles.mapFallbackMessage}>
                    The map is waiting for the web view to finish mounting.
                  </Text>
                </View>
              ) : (
                <ProfileSectionBoundary
                  fallbackTitle="Map unavailable"
                  fallbackMessage="The address map hit a web-only runtime problem. You can still close this sheet and retry safely."
                  resetKey={`${screenResetKey}-${String(showAddressModal)}`}
                >
                  <PinMap
                    center={mapCenter}
                    selectedPin={pinnedLocation ? [pinnedLocation.longitude, pinnedLocation.latitude] : null}
                    style={styles.addressMapWebView}
                    onPinChange={handleAddressMapPinChange}
                    scrollEnabled={false}
                  />
                </ProfileSectionBoundary>
              )}
            </View>

            {addressMapError ? <StatusCard text={addressMapError} /> : null}

            <TouchableOpacity
              style={[styles.addressPinButton, isPinningLocation && styles.addressButtonDisabled]}
              onPress={handlePinCurrentAddressLocation}
              disabled={isPinningLocation}
            >
              {isPinningLocation ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.addressPinButtonText}>
                  {pinnedLocation ? 'RE-PIN CURRENT LOCATION' : 'PIN CURRENT LOCATION'}
                </Text>
              )}
            </TouchableOpacity>

            {pinnedLocation && (
              <Text style={styles.addressPinnedText}>
                Pinned: {pinnedLocation.latitude.toFixed(6)}, {pinnedLocation.longitude.toFixed(6)}
              </Text>
            )}

            <View style={styles.addressActionRow}>
              <TouchableOpacity
                style={styles.addressSecondaryButton}
                onPress={() => setShowAddressModal(false)}
                activeOpacity={0.8}
                disabled={isSavingAddress}
              >
                <Text style={styles.addressSecondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.addressPrimaryButton, isSavingAddress && styles.addressButtonDisabled]}
                onPress={handleSaveAddress}
                activeOpacity={0.8}
                disabled={isSavingAddress}
              >
                {isSavingAddress ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.addressPrimaryButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
          </View>
        </ProfileSectionBoundary>
      )}
    </SafeAreaView>
  );
};

const StatusCard = ({ text }: { text: string }) => (
  <View style={styles.statusCard}>
    <MaterialIcons name="info-outline" size={18} color="#92400E" />
    <Text style={styles.statusCardText}>{text}</Text>
  </View>
);

export default ProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: responsiveInset.horizontal,
  },
  centerStateTitle: {
    marginTop: 14,
    fontSize: scaleFont(18),
    fontWeight: '700',
    color: THEME_BLUE,
  },
  centerStateMessage: {
    marginTop: 8,
    fontSize: scaleFont(13),
    color: '#475569',
    textAlign: 'center',
    lineHeight: scaleFont(18),
  },
  primaryActionButton: {
    marginTop: 18,
    backgroundColor: THEME_BLUE,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryActionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: scaleFont(14),
  },
  screenContent: {
    flex: 1,
  },
  headerContainer: {
    minHeight: scaleHeight(344),
    width: '100%',
    flexShrink: 0,
    zIndex: 1,
    // Formal drop shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 1,
  },
  bgImage: {
    flex: 1,
    minHeight: scaleHeight(322),
    paddingRight: 20,
    alignItems: 'flex-end',
    overflow: 'hidden',
    zIndex: 1,
  },
  bgImageAsset: {
    transform: [
      { scaleX: 1.18 },
      { scaleY: 1.34 },
      { translateX: -scaleWidth(24) },
      { translateY: -scaleHeight(110) },
    ],
  },
  headerBottomCurve: {
    position: 'absolute',
    left: -scaleWidth(44),
    right: -scaleWidth(44),
    bottom: scaleHeight(8),
    height: scaleHeight(108),
    backgroundColor: '#F0F4F8',
    borderTopLeftRadius: scaleWidth(150),
    borderTopRightRadius: scaleWidth(150),
    zIndex: 2,
    elevation: 0,
  },
  // Circular notch mask — same BG colour as page, slightly larger than outerCircle,
  // centred on the avatar so the top half carves a smooth semicircle into the header.
  avatarNotchMask: {
    position: 'absolute',
    alignSelf: 'center',
    width: scaleWidth(168),
    height: scaleWidth(168),
    borderRadius: scaleWidth(84),
    backgroundColor: '#F0F4F8',
    // bottom = avatarWrapper.bottom - 4 dp (half of extra 8 dp radius)
    bottom: scaleHeight(68) - scaleWidth(4),
    zIndex: 3,
  },
  settingsBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    width: scaleWidth(40),
    height: scaleWidth(40),
    borderRadius: scaleWidth(20),
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarWrapper: {
    position: 'absolute',
    bottom: scaleHeight(68),
    alignSelf: 'center',
    zIndex: 4,
  },
  outerCircle: {
    width: scaleWidth(160),
    height: scaleWidth(160),
    borderRadius: scaleWidth(80),
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  avatar: {
    width: scaleWidth(150),
    height: scaleWidth(150),
    borderRadius: scaleWidth(75),
  },
  profileUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: scaleWidth(75),
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    width: '100%',
    position: 'relative',
    zIndex: 5,
    elevation: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: -scaleHeight(56),
    paddingTop: 0,
  },
  menuList: {
    width: '100%',
    flex: 1,
  },
  statusCard: {
    width: Math.min(scaleWidth(320), screen.width - responsiveInset.horizontal * 2),
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  statusCardText: {
    flex: 1,
    color: '#9A3412',
    fontSize: scaleFont(12),
    lineHeight: scaleFont(16),
  },
  userNameSlot: {
    width: '100%',
    height: scaleHeight(32),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
    elevation: 30,
  },
  userName: {
    position: 'relative',
    zIndex: 31,
    elevation: 31,
    fontSize: scaleFont(22),
    fontWeight: 'bold',
    color: THEME_BLUE,
    marginTop: scaleHeight(6),
    marginBottom: 0,
  },
  listPadding: {
    flexGrow: 1,
    paddingHorizontal: responsiveInset.horizontal,
    paddingBottom: scaleHeight(108),
    marginTop: 2,
    alignItems: 'center',
    paddingLeft: 0,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: Math.min(scaleWidth(320), screen.width - responsiveInset.horizontal * 2),
    paddingVertical: 14,
    marginBottom: scaleHeight(10),
  },
  iconContainer: {
    width: scaleWidth(48),
    height: scaleWidth(48),
    borderRadius: scaleWidth(24),
    backgroundColor: THEME_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 18,
  },
  menuText: {
    fontSize: scaleFont(18),
    fontWeight: '500',
    color: THEME_BLUE,
  },
  notificationControlRow: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationStateText: {
    color: THEME_BLUE,
    fontWeight: '700',
    fontSize: scaleFont(12),
  },
  chatbotFab: {
    position: 'absolute',
    bottom: scaleHeight(68),
    right: responsiveInset.horizontal,
    width: scaleWidth(62),
    height: scaleWidth(62),
    zIndex: 100,
  },
  chatbotImage: {
    width: '100%',
    height: '100%',
  },
  bottomNavContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: scaleHeight(70),
    justifyContent: 'flex-end',
    zIndex: 40,
    elevation: 40,
  },
  bottomNav: {
    backgroundColor: THEME_BLUE,
    height: scaleHeight(70),
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  navItemSpace: {
    flex: 0.5,
  },
  centerFab: {
    position: 'absolute',
    alignSelf: 'center',
    top: -scaleHeight(20),
    backgroundColor: THEME_BLUE,
    width: scaleWidth(64),
    height: scaleWidth(64),
    borderRadius: scaleWidth(32),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 5,
    borderColor: '#F0F4F8',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  actionMenuOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  actionMenuContainer: {
    backgroundColor: 'white',
    margin: responsiveInset.horizontal,
    borderRadius: 20,
    paddingBottom: 18,
    elevation: 10,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  actionMenuItemText: {
    fontWeight: 'bold',
    marginLeft: 15,
    fontSize: scaleFont(16),
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutText: {
    marginTop: 20,
    fontSize: scaleFont(16),
    fontWeight: 'bold',
    color: 'white',
  },
  personalInfoModalCard: {
    width: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
  },
  settingsModalCard: {
    width: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsLabel: {
    color: '#1E293B',
    fontWeight: '600',
    fontSize: scaleFont(15),
  },
  settingsActionButton: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  settingsActionButtonText: {
    color: '#334155',
    fontWeight: '600',
  },
  personalInfoTitle: {
    fontSize: scaleFont(18),
    fontWeight: '700',
    color: THEME_BLUE,
    marginBottom: 12,
  },
  personalInfoList: {
    gap: 8,
  },
  infoRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 8,
  },
  infoLabel: {
    color: '#64748B',
    fontSize: scaleFont(12),
    marginBottom: 2,
  },
  infoValue: {
    color: '#1E293B',
    fontSize: scaleFont(14),
    fontWeight: '500',
  },
  emptyInfoText: {
    color: '#64748B',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  closeInfoButton: {
    marginTop: 16,
    backgroundColor: THEME_BLUE,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeInfoButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  addressModalCard: {
    width: '92%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  addressLabel: {
    color: THEME_BLUE,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 6,
  },
  addressHint: {
    color: '#64748B',
    fontSize: scaleFont(12),
    marginBottom: 8,
  },
  addressInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
  },
  webTextInput: {
    fontSize: 16,
    lineHeight: 20,
  },
  addressMapContainer: {
    height: Math.max(scaleHeight(190), screen.isSmallPhone ? 170 : 190),
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  addressMapWebView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  mapFallbackCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
  },
  mapFallbackTitle: {
    marginTop: 10,
    color: THEME_BLUE,
    fontSize: scaleFont(14),
    fontWeight: '700',
    textAlign: 'center',
  },
  mapFallbackMessage: {
    marginTop: 6,
    color: '#475569',
    fontSize: scaleFont(12),
    lineHeight: scaleFont(16),
    textAlign: 'center',
  },
  addressPinButton: {
    marginTop: 10,
    backgroundColor: THEME_BLUE,
    borderRadius: 10,
    minHeight: 42,
    height: scaleHeight(44),
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressPinButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: scaleFont(13),
  },
  addressPinnedText: {
    marginTop: 8,
    color: THEME_BLUE,
    fontSize: scaleFont(12),
  },
  addressActionRow: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  addressSecondaryButton: {
    flex: 1,
    minHeight: 40,
    height: scaleHeight(42),
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressSecondaryButtonText: {
    color: '#334155',
    fontWeight: '600',
  },
  addressPrimaryButton: {
    flex: 1,
    minHeight: 40,
    height: scaleHeight(42),
    borderRadius: 10,
    backgroundColor: THEME_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addressPrimaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  addressButtonDisabled: {
    opacity: 0.7,
  },
  chatbotOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  menuHandle: {
    width: scaleWidth(40),
    height: scaleHeight(5),
    backgroundColor: '#E0E0E0',
    borderRadius: 5,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  chatDragHeader: {
    alignItems: 'center',
    paddingTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#EEEEEE',
  },
  chatbotContainer: {
    backgroundColor: 'white',
    height: '50%',
    minHeight: scaleHeight(260),
    maxHeight: scaleHeight(420),
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  chatbotTitle: {
    color: THEME_BLUE,
    fontWeight: 'bold',
    fontSize: scaleFont(18),
    padding: 20,
    paddingTop: 10,
  },
  chatbotBody: {
    flex: 1,
    paddingHorizontal: 12,
  },
  chatMessagesScroll: {
    flex: 1,
    width: '100%',
  },
  chatMessagesContent: {
    paddingVertical: 10,
  },
  chatBubble: {
    maxWidth: '85%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: THEME_BLUE,
  },
  chatBubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8EEF5',
  },
  chatBubbleText: {
    fontSize: scaleFont(14),
  },
  chatBubbleTextUser: {
    color: 'white',
  },
  chatBubbleTextAssistant: {
    color: '#1F2937',
  },
  chatbotInputContainer: {
    flexDirection: 'row',
    padding: 20,
    alignItems: 'center',
  },
  chatbotInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 10,
    color: 'black',
  },
  chatErrorCard: {
    alignSelf: 'stretch',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 10,
    marginTop: 4,
    marginBottom: 8,
  },
  chatErrorText: {
    color: '#991B1B',
    fontSize: scaleFont(12),
    lineHeight: scaleFont(16),
  },
  sendButton: {
    padding: 10,
  },
  sectionFallbackCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    margin: responsiveInset.horizontal,
  },
  sectionFallbackTitle: {
    marginTop: 10,
    fontSize: scaleFont(16),
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
  },
  sectionFallbackMessage: {
    marginTop: 8,
    fontSize: scaleFont(13),
    color: '#78350F',
    textAlign: 'center',
    lineHeight: scaleFont(18),
  },
});
