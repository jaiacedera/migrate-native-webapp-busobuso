import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { WebView } from 'react-native-webview';
import { responsiveInset, scaleFont, scaleHeight, scaleWidth, screen } from '../../constants/responsive';
import { uploadImageToCloudinary } from '../../services/cloudinaryUpload';
import { buildMapHtml } from '../../services/mapTemplateService';
import {
  copyUserProfile,
  getReportSubmissionErrorMessage,
  submitIncidentReport,
} from '../../services/reportService';
import IncidentCameraScreen from './IncidentCameraScreen';

type SpeechRecognitionModule = {
  addListener: (eventName: string, listener: (event?: any) => void) => { remove: () => void };
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  isRecognitionAvailable: () => boolean;
  start: (options: { lang: string; interimResults?: boolean; addsPunctuation?: boolean }) => void;
  stop: () => void;
};

const THEME_BLUE = '#274C77';
const DEFAULT_MAP_CENTER: [number, number] = [120.9842, 14.5995];
const APP_BAR_TOP = Math.max(scaleHeight(12), (StatusBar.currentHeight ?? 0) + scaleHeight(6));

const formatReverseGeocodeAddress = (geocode?: Location.LocationGeocodedAddress | null): string => {
  if (!geocode) {
    return '';
  }

  const isPlusCode = (value?: string | null): boolean => {
    const text = value?.trim() ?? '';
    return /^[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}$/i.test(text);
  };

  const streetLine = [geocode.streetNumber?.trim(), geocode.street?.trim()]
    .filter(Boolean)
    .join(' ')
    .trim();

  const barangay = geocode.district?.trim() || geocode.subregion?.trim() || '';

  const parts = [
    streetLine,
    barangay,
    geocode.city,
    isPlusCode(geocode.name) ? '' : geocode.name,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));

  return Array.from(new Set(parts)).join(', ');
};

const hasStreetOrHouseNumber = (entry?: Location.LocationGeocodedAddress | null): boolean => {
  if (!entry) {
    return false;
  }

  return Boolean(entry.streetNumber?.trim() || entry.street?.trim());
};

const hasAreaDetails = (entry?: Location.LocationGeocodedAddress | null): boolean => {
  if (!entry) {
    return false;
  }

  return Boolean(entry.district?.trim() || entry.subregion?.trim() || entry.city?.trim());
};


const ReportsScreen = () => {
  const router = useRouter();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [photoPreviewModalVisible, setPhotoPreviewModalVisible] = useState(false);
  const [incidentPhotoUris, setIncidentPhotoUris] = useState<string[]>([]);
  const [selectedPreviewPhotoUri, setSelectedPreviewPhotoUri] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [report, setReport] = useState('');
  const [isCopyingProfile, setIsCopyingProfile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportId, setReportId] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
    capturedAt: string;
  } | null>(null);
  const [isPinningLocation, setIsPinningLocation] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER);
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [isSubmitConfirmVisible, setIsSubmitConfirmVisible] = useState(false);
  const speechModuleRef = useRef<SpeechRecognitionModule | null>(null);
  const speechSubscriptionsRef = useRef<{ remove: () => void }[]>([]);
  const RootContainer = Platform.OS === 'ios' ? KeyboardAvoidingView : View;

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      return true; // Prevent back navigation
    });

    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
          return;
        }

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        setMapCenter([currentPosition.coords.longitude, currentPosition.coords.latitude]);
      } catch (error) {
        console.error('Failed to initialize report map location:', error);
      }
    })();
  }, []);

  const mapHtml = useMemo(() => {
    const selectedPin = currentLocation
      ? ([currentLocation.longitude, currentLocation.latitude] as [number, number])
      : null;
    return buildMapHtml(mapCenter, selectedPin);
  }, [mapCenter, currentLocation]);

  useEffect(() => {
    return () => {
      speechSubscriptionsRef.current.forEach((subscription: any) => subscription.remove());
      speechSubscriptionsRef.current = [];
    };
  }, []);

  const handleMapMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const payload = JSON.parse(event.nativeEvent.data);
      if (payload?.type !== 'pin') {
        return;
      }

      const latitude = Number(payload.latitude);
      const longitude = Number(payload.longitude);

      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return;
      }

      setCurrentLocation({
        latitude,
        longitude,
        accuracy: null,
        capturedAt: payload.capturedAt ?? new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to parse map pin payload:', error);
    }
  };

  const handlePinCurrentLocation = async () => {
    try {
      setIsPinningLocation(true);
      const permission = await Location.requestForegroundPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow location permission to pin your current location.');
        return;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const nextLocation = {
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
        accuracy: currentPosition.coords.accuracy ?? null,
        capturedAt: new Date().toISOString(),
      };

      setCurrentLocation(nextLocation);
      setMapCenter([nextLocation.longitude, nextLocation.latitude]);

      const geocodeResults = await Location.reverseGeocodeAsync({
        latitude: nextLocation.latitude,
        longitude: nextLocation.longitude,
      });

      const bestGeocode =
        geocodeResults?.find((entry: Location.LocationGeocodedAddress) => hasStreetOrHouseNumber(entry)) ??
        geocodeResults?.find((entry: Location.LocationGeocodedAddress) => hasAreaDetails(entry)) ??
        geocodeResults?.[0] ??
        null;

      const formattedAddress = formatReverseGeocodeAddress(bestGeocode);
      if (formattedAddress) {
        setAddress(formattedAddress);
      }

      Alert.alert('Location Pinned', 'Your report location was pinned successfully.');
    } catch (error) {
      console.error('Failed to pin current location:', error);
      Alert.alert('Location Error', 'Unable to pin your current location right now.');
    } finally {
      setIsPinningLocation(false);
    }
  };

  const handleOpenFullscreenMap = () => {
    setIsMapFullscreen(true);
  };

  const handleCloseFullscreenMap = () => {
    setIsMapFullscreen(false);
  };

  const handleOpenSubmitConfirm = () => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitConfirmVisible(true);
  };

  const handleCancelSubmitConfirm = () => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitConfirmVisible(false);
  };

  const loadSpeechModule = async (): Promise<SpeechRecognitionModule | null> => {
    if (speechModuleRef.current) {
      return speechModuleRef.current;
    }

    try {
      // Dynamically import only when needed
      const speechPackage = (await import('expo-speech-recognition')) as {
        ExpoSpeechRecognitionModule?: SpeechRecognitionModule;
      };
      const speechModule = speechPackage.ExpoSpeechRecognitionModule;

      if (!speechModule) {
        return null;
      }

      const startSub = speechModule.addListener('start', () => {
        setIsRecording(true);
      });

      const endSub = speechModule.addListener('end', () => {
        setIsRecording(false);
      });

      const resultSub = speechModule.addListener('result', (event?: any) => {
        const recognizedText = event?.results?.[0]?.transcript?.trim();
        if (!recognizedText) {
          return;
        }
        setReport((prev: string) => (prev ? `${prev} ${recognizedText}` : recognizedText));
      });

      const errorSub = speechModule.addListener('error', (event?: any) => {
        console.error('Speech error:', event);
        setIsRecording(false);

        if (event?.error === 'aborted' || event?.error === 'no-speech') {
          return;
        }

        Alert.alert('Voice Input Error', event?.message || 'Could not recognize speech. Please try again.');
      });

      speechSubscriptionsRef.current = [startSub, endSub, resultSub, errorSub];
      speechModuleRef.current = speechModule;
      return speechModule;
    } catch (error: any) {
      // Silently handle the native module error in Expo Go
      if (error?.message?.includes('Cannot find native module')) {
        return null;
      }
      console.warn('Speech module load error:', error);
      return null;
    }
  };

  const handleMicPress = async () => {
    try {
      const speechModule = await loadSpeechModule();

      if (!speechModule) {
        Alert.alert(
          'Voice Input Unavailable',
          'Speech-to-text needs a development build. Use npx expo run:android, then test the mic again.'
        );
        return;
      }

      if (isRecording) {
        speechModule.stop();
        return;
      }

      const permission = await speechModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Needed', 'Please allow microphone and speech recognition permissions.');
        return;
      }

      if (!speechModule.isRecognitionAvailable()) {
        Alert.alert('Voice Input Unavailable', 'Speech recognition is not available on this device.');
        return;
      }

      speechModule.start({
        lang: 'en-US',
        interimResults: true,
        addsPunctuation: true,
      });
    } catch (error) {
      console.error('Voice error:', error);
      setIsRecording(false);
      Alert.alert(
        'Voice Input Error',
        'Unable to start voice recognition. Please check microphone permissions.',
        [{ text: 'OK', style: 'default' }]
      );
    }
  };

  const handleCameraPress = () => {
    setCameraModalVisible(true);
  };

  const handleIncidentPhotoCapture = (photoUri: string) => {
    setIncidentPhotoUris((previous) => [...previous, photoUri]);
    setCameraModalVisible(false);
    // You can handle the captured photo URI here (e.g., upload, display, etc.)
  };

  const handleIncidentCameraClose = () => {
    setCameraModalVisible(false);
  };

  const handleOpenPhotoPreview = (photoUri: string) => {
    if (!photoUri) {
      return;
    }

    setSelectedPreviewPhotoUri(photoUri);
    setPhotoPreviewModalVisible(true);
  };

  const handleClosePhotoPreview = () => {
    setPhotoPreviewModalVisible(false);
    setSelectedPreviewPhotoUri(null);
  };

  const handleRemoveIncidentPhoto = (photoUri: string) => {
    setIncidentPhotoUris((previous) => previous.filter((uri) => uri !== photoUri));

    if (selectedPreviewPhotoUri === photoUri) {
      setPhotoPreviewModalVisible(false);
      setSelectedPreviewPhotoUri(null);
    }
  };

  const handleCopyProfile = async () => {
    const currentUser = (await import('../../services/firebaseconfig')).auth.currentUser;
    if (!currentUser) {
      Alert.alert('Profile Error', 'Please log in again to copy your profile data.');
      return;
    }
    try {
      setIsCopyingProfile(true);
      const data = await copyUserProfile(currentUser.uid);
      if (!data) {
        Alert.alert('Profile Not Found', 'No saved profile data found. Please complete your user form first.');
        return;
      }
      const composedName = [
        data.firstName?.trim(),
        data.middleInitial?.trim() ? `${data.middleInitial.trim()}.` : '',
        data.lastName?.trim(),
      ]
        .filter(Boolean)
        .join(' ');
      setFullName(composedName);
      setContactNumber(data.contactNumber?.trim() ?? '');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Location Permission Needed',
          'Please allow location access so we can use your current location as the report address.'
        );
        return;
      }
      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const latitude = currentPosition.coords.latitude;
      const longitude = currentPosition.coords.longitude;
      setCurrentLocation({
        latitude,
        longitude,
        accuracy: currentPosition.coords.accuracy ?? null,
        capturedAt: new Date().toISOString(),
      });
      setMapCenter([longitude, latitude]);
    } catch (error) {
      console.error('Failed to copy profile data:', error);
      Alert.alert('Profile Error', 'Unable to copy profile data right now.');
    } finally {
      setIsCopyingProfile(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitConfirmVisible(false);

    if (!fullName.trim() || !address.trim() || !contactNumber.trim() || !report.trim()) {
      Alert.alert('Missing Fields', 'Please complete all required fields before submitting.');
      return;
    }
    if (!currentLocation) {
      Alert.alert('Missing Location Pin', 'Please pin your location on the map before submitting.');
      return;
    }
    try {
      setIsSubmitting(true);
      setReportId('');
      // Upload all attached photos to Cloudinary.
      let imageUrls: string[] = [];
       
       
      try {
        const uploadResults = await Promise.all(
          incidentPhotoUris.map((photoUri) => uploadImageToCloudinary(photoUri))
        );
        imageUrls = uploadResults.map((result) => result.url);
      } catch (error: any) {
        console.error('Photo upload error:', error);
        Alert.alert(
          'Photo Upload Error',
          error?.message || 'Failed to upload one or more photos. Please try again.'
        );
        setIsSubmitting(false);
        return;
      }
      const submittedReport = await submitIncidentReport({
        fullName,
        address,
        contactNumber,
        report,
        currentLocation,
        imageUrl: imageUrls[0] ?? '',
        imageUrls,
      });
      setReportId(submittedReport.reportId ?? submittedReport.id ?? '');
      setIsSubmitted(true);
    } catch (error: any) {
      console.error('Failed to submit report via backend:', error);
      const userMessage = getReportSubmissionErrorMessage(error);

      if (userMessage) {
        Alert.alert('Submit Error', userMessage);
      } else {
        Alert.alert('Submit Error', 'Unable to submit your report right now. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- SUB-COMPONENT: PROGRESS BAR ---
  const ProgressBar = ({ progress }: { progress: 'step2' | 'step3' }) => (
    <View style={styles.progressContainer}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: progress === 'step2' ? '50%' : '100%' }]} />
        {/* Circle Markers */}
        <View style={[styles.dot, { left: 0 }]} />
        <View style={[styles.dot, { left: '50%', marginLeft: -5 }]} />
        <View style={[styles.dot, { right: 0, backgroundColor: progress === 'step3' ? THEME_BLUE : '#D1D5DB' }]} />
      </View>
    </View>
  );

  // --- VIEW 1: THE REPORT FORM ---
  const renderReportForm = () => (
    <ScrollView
      contentContainerStyle={styles.formScroll}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.center}>
        <ProgressBar progress="step2" />
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Report Information</Text>

        <FormInput
          label="Full Name"
          placeholder="Enter your full name"
          value={fullName}
          onChangeText={setFullName}
        />
        <FormInput
          label="Address (House No. / Street)"
          placeholder="Enter house no. and street (e.g., 123 Mabini St)"
          value={address}
          onChangeText={setAddress}
        />

        <Text style={styles.inputLabel}>Pin Exact Report Location</Text>
        <View style={styles.mapCard}>
          <WebView
            source={{ html: mapHtml }}
            originWhitelist={['*']}
            style={styles.mapWebView}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            onMessage={handleMapMessage}
          />
          <View style={styles.mapFooter}>
            <View style={styles.mapControlsRow}>
              <TouchableOpacity
                style={styles.pinNowBtn}
                activeOpacity={0.8}
                onPress={handlePinCurrentLocation}
                disabled={isPinningLocation}
              >
                <Text style={styles.pinNowBtnText}>{isPinningLocation ? 'Pinning...' : 'Pin Current Location'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.mapFullscreenBtn}
                activeOpacity={0.8}
                onPress={handleOpenFullscreenMap}
                accessibilityRole="button"
                accessibilityLabel="Open fullscreen map"
              >
                <Ionicons name="expand-outline" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <Text style={styles.mapHint}>
              {currentLocation
                ? `Pinned: ${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`
                : 'Tap the map or use Pin Current Location'}
            </Text>
          </View>
        </View>
        <FormInput
          label="Contact Number"
          placeholder="Enter your contact number"
          value={contactNumber}
          onChangeText={setContactNumber}
        />

        <TouchableOpacity
          style={styles.copyBtn}
          activeOpacity={0.7}
          onPress={handleCopyProfile}
          disabled={isCopyingProfile}
        >
          <Text style={styles.copyBtnText}>{isCopyingProfile ? 'Copying...' : 'Copy Profile'}</Text>
        </TouchableOpacity>

        <FormInput 
          label="Report" 
          placeholder="Enter your report" 
          value={report}
          onChangeText={setReport}
          multiline 
          numberOfLines={6} 
        />

        {incidentPhotoUris.length > 0 && (
          <View style={styles.reportPhotoSection}>
            <Text style={styles.reportPhotoLabel}>Attached Photos ({incidentPhotoUris.length})</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.reportPhotosScroller}
              contentContainerStyle={styles.reportPhotosScrollerContent}
            >
              {incidentPhotoUris.map((photoUri, index) => (
                <View key={`${photoUri}-${index}`} style={styles.photoPreviewThumbContainer}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleOpenPhotoPreview(photoUri)}
                    style={{ borderWidth: 1, borderColor: '#274C77', borderRadius: 8, overflow: 'hidden' }}
                  >
                    <Image source={{ uri: photoUri }} style={{ width: 74, height: 74 }} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.photoRemoveButton}
                    activeOpacity={0.85}
                    onPress={() => handleRemoveIncidentPhoto(photoUri)}
                  >
                    <Ionicons name="close" size={12} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.footerRow}>
          <View style={styles.mediaActionsRow}>
            <TouchableOpacity 
              style={[styles.micBtn, isRecording && styles.micBtnRecording]}
              onPress={handleMicPress}
              activeOpacity={0.7}
            >
              <Ionicons name={isRecording ? "mic-off" : "mic"} size={24} color="white" />
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.cameraBtn}
              onPress={handleCameraPress}
              activeOpacity={0.7}
            >
              <Ionicons name="camera" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {isRecording && <Text style={styles.recordingText}>Recording...</Text>}

          <TouchableOpacity 
            style={styles.submitBtn} 
            onPress={handleOpenSubmitConfirm}
            disabled={isSubmitting}
            activeOpacity={0.7}
          >
            <Text style={styles.submitBtnText}>Submit</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );

  // --- VIEW 2: THE SUCCESS SCREEN ---
  const renderSuccessScreen = () => (
    <View style={styles.successContainer}>
      <View style={styles.successProgressTop}>
        <ProgressBar progress="step3" />
      </View>

      <View style={styles.successBody}>
        <View style={styles.rippleContainer}>
          <View style={[styles.ripple, { width: scaleWidth(180), height: scaleWidth(180), opacity: 0.1 }]} />
          <View style={[styles.ripple, { width: scaleWidth(140), height: scaleWidth(140), opacity: 0.2 }]} />
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={60} color={THEME_BLUE} />
          </View>
        </View>

        <Text style={styles.successTitle}>Report Successful</Text>
        <Text style={styles.successSub}>
          Your incident report has{"\n"}successfully submitted.
        </Text>

        <View style={styles.submissionDetailsCard}>
          <View style={styles.submissionDetailRow}>
            <Text style={styles.submissionDetailLabel}>Name</Text>
            <Text style={styles.submissionDetailValue}>{fullName || '-'}</Text>
          </View>
          <View style={styles.submissionDetailRow}>
            <Text style={styles.submissionDetailLabel}>Address</Text>
            <Text style={styles.submissionDetailValue}>{address || '-'}</Text>
          </View>
          <View style={styles.submissionDetailRow}>
            <Text style={styles.submissionDetailLabel}>Contact Number</Text>
            <Text style={styles.submissionDetailValue}>{contactNumber || '-'}</Text>
          </View>
          <View style={styles.submissionDetailRow}>
            <Text style={styles.submissionDetailLabel}>Report ID</Text>
            <Text style={styles.submissionDetailValue}>{reportId || '-'}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <RootContainer
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <StatusBar barStyle="dark-content" />
      
      {/* Custom AppBar */}
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={THEME_BLUE} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Incident Reports</Text>
      </View>

      {isSubmitted ? renderSuccessScreen() : renderReportForm()}

      <Modal
        visible={isSubmitConfirmVisible}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={handleCancelSubmitConfirm}
      >
        <View style={styles.submitConfirmOverlay}>
          <View style={styles.submitConfirmCard}>
            <Text style={styles.submitConfirmTitle}>Are you sure you want to submit?</Text>

            <View style={styles.submitConfirmActions}>
              <TouchableOpacity
                style={[styles.submitConfirmBtn, styles.submitConfirmNoBtn]}
                activeOpacity={0.8}
                onPress={handleCancelSubmitConfirm}
                disabled={isSubmitting}
              >
                <Text style={[styles.submitConfirmBtnText, styles.submitConfirmNoBtnText]}>No</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitConfirmBtn, styles.submitConfirmYesBtn]}
                activeOpacity={0.8}
                onPress={handleSubmit}
                disabled={isSubmitting}
              >
                <Text style={styles.submitConfirmBtnText}>{isSubmitting ? 'Submitting...' : 'Yes'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={cameraModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={handleIncidentCameraClose}
      >
        <View style={styles.cameraModalContainer}>
          <IncidentCameraScreen
            onCapture={handleIncidentPhotoCapture}
            onClose={handleIncidentCameraClose}
          />
        </View>
      </Modal>

      <Modal
        visible={photoPreviewModalVisible}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={handleClosePhotoPreview}
      >
        <View style={styles.photoPreviewModalContainer}>
          <TouchableOpacity
            style={styles.photoPreviewCloseButton}
            activeOpacity={0.8}
            onPress={handleClosePhotoPreview}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          {selectedPreviewPhotoUri && (
            <Image
              source={{ uri: selectedPreviewPhotoUri }}
              style={styles.photoPreviewImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={isMapFullscreen}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={handleCloseFullscreenMap}
      >
        <View style={styles.fullscreenMapContainer}>
          <WebView
            source={{ html: mapHtml }}
            originWhitelist={['*']}
            style={styles.fullscreenMapWebView}
            javaScriptEnabled
            domStorageEnabled
            onMessage={handleMapMessage}
          />

          <View style={styles.fullscreenMapTopActions}>
            <TouchableOpacity
              style={styles.fullscreenMapIconBtn}
              activeOpacity={0.85}
              onPress={handleCloseFullscreenMap}
              accessibilityRole="button"
              accessibilityLabel="Close fullscreen map"
            >
              <Ionicons name="contract-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.fullscreenMapBottomActions}>
            <TouchableOpacity
              style={styles.pinNowBtn}
              activeOpacity={0.85}
              onPress={handlePinCurrentLocation}
              disabled={isPinningLocation}
            >
              <Text style={styles.pinNowBtnText}>{isPinningLocation ? 'Pinning...' : 'Pin Current Location'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </RootContainer>
  );
};

// Reusable Input Component
type FormInputProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  multiline?: boolean;
  numberOfLines?: number;
};

const FormInput = ({
  label,
  placeholder,
  value,
  onChangeText,
  multiline = false,
  numberOfLines = 1,
}: FormInputProps) => (
  <View style={styles.inputGroup}>
    <Text style={styles.inputLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && { minHeight: scaleHeight(110), height: scaleHeight(120), textAlignVertical: 'top' }]}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      numberOfLines={numberOfLines}
    />
  </View>
);

export default ReportsScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#E8E8E8' },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: responsiveInset.horizontal,
    paddingTop: APP_BAR_TOP,
    paddingBottom: 10,
  },
  appBarTitle: {
    fontSize: scaleFont(18),
    fontWeight: 'bold',
    color: THEME_BLUE,
    marginLeft: scaleWidth(10),
  },
  formScroll: { flexGrow: 1, paddingHorizontal: responsiveInset.card, paddingTop: scaleHeight(36), paddingBottom: scaleHeight(44) },
  card: {
    backgroundColor: '#F5F5F5',
    borderRadius: 25,
    padding: responsiveInset.card,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  center: { alignItems: 'center', marginBottom: scaleHeight(24), marginTop: -12 },
  sectionTitle: { fontSize: scaleFont(18), fontWeight: 'bold', color: THEME_BLUE, marginBottom: 20 },
  inputGroup: { marginBottom: 15 },
  inputLabel: { fontSize: scaleFont(14), color: THEME_BLUE, marginBottom: 5, fontWeight: '500' },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: THEME_BLUE,
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: '#1F2937',
  },
  copyBtn: {
    alignSelf: 'flex-end',
    backgroundColor: THEME_BLUE,
    paddingHorizontal: scaleWidth(15),
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 10,
  },
  copyBtnText: { color: 'white', fontSize: scaleFont(12) },
  mapCard: {
    borderWidth: 1,
    borderColor: THEME_BLUE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
  },
  mapWebView: {
    width: '100%',
    height: Math.max(scaleHeight(200), screen.isSmallPhone ? 180 : 200),
    backgroundColor: '#FFFFFF',
  },
  mapFooter: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  mapControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 10,
  },
  pinNowBtn: {
    alignSelf: 'flex-start',
    backgroundColor: THEME_BLUE,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginBottom: 6,
  },
  pinNowBtnText: {
    color: 'white',
    fontSize: scaleFont(12),
    fontWeight: '600',
  },
  mapFullscreenBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: THEME_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapHint: {
    fontSize: scaleFont(11),
    color: '#4B5563',
    marginTop: 6,
  },
  reportPhotoSection: {
    marginTop: 4,
    marginBottom: 10,
    alignItems: 'flex-start',
    width: '100%',
  },
  reportPhotoLabel: {
    fontSize: scaleFont(12),
    color: THEME_BLUE,
    marginBottom: 6,
    fontWeight: '600',
  },
  reportPhotosScroller: {
    width: '100%',
  },
  reportPhotosScrollerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
    paddingRight: 4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginTop: 10,
  },
  mediaActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cameraModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  photoPreviewModalContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: responsiveInset.horizontal,
  },
  photoPreviewCloseButton: {
    position: 'absolute',
    top: APP_BAR_TOP,
    right: responsiveInset.horizontal,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  photoPreviewImage: {
    width: '100%',
    height: '88%',
  },
  fullscreenMapContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  fullscreenMapWebView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  fullscreenMapTopActions: {
    position: 'absolute',
    top: APP_BAR_TOP,
    right: responsiveInset.horizontal,
  },
  fullscreenMapBottomActions: {
    position: 'absolute',
    left: responsiveInset.horizontal,
    right: responsiveInset.horizontal,
    bottom: scaleHeight(28),
    alignItems: 'flex-start',
  },
  fullscreenMapIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(39, 76, 119, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPreviewThumbContainer: {
    position: 'relative',
  },
  photoRemoveButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#6B7280',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  micBtn: {
    width: scaleWidth(48),
    height: scaleWidth(48),
    borderRadius: scaleWidth(24),
    backgroundColor: THEME_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micBtnRecording: {
    backgroundColor: '#DC2626',
  },
  cameraBtn: {
    width: scaleWidth(48),
    height: scaleWidth(48),
    borderRadius: scaleWidth(24),
    backgroundColor: THEME_BLUE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingText: {
    fontSize: scaleFont(12),
    color: THEME_BLUE,
    fontStyle: 'italic',
    marginLeft: 8,
  },
  submitBtn: {
    backgroundColor: THEME_BLUE,
    paddingHorizontal: scaleWidth(36),
    paddingVertical: 12,
    borderRadius: 25,
    marginLeft: 'auto',
  },
  submitBtnText: { color: 'white', fontWeight: 'bold' },
  submitConfirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: responsiveInset.horizontal,
  },
  submitConfirmCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  submitConfirmTitle: {
    fontSize: scaleFont(15),
    color: '#111827',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 14,
  },
  submitConfirmActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    columnGap: 10,
  },
  submitConfirmBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitConfirmYesBtn: {
    backgroundColor: THEME_BLUE,
  },
  submitConfirmNoBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  submitConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: scaleFont(13),
    fontWeight: '700',
  },
  submitConfirmNoBtnText: {
    color: '#374151',
  },
  // Success Screen Styles
  successContainer: { flex: 1, paddingHorizontal: responsiveInset.horizontal, paddingTop: scaleHeight(18) },
  successProgressTop: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: scaleHeight(22),
  },
  successBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -20 }],
  },
  rippleContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 40 },
  ripple: { position: 'absolute', borderRadius: 100, backgroundColor: THEME_BLUE },
  checkCircle: {
    width: scaleWidth(96),
    height: scaleWidth(96),
    borderRadius: scaleWidth(48),
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  successTitle: { fontSize: scaleFont(24), fontWeight: 'bold', color: THEME_BLUE, marginTop: 20 },
  successSub: { fontSize: scaleFont(16), color: THEME_BLUE, textAlign: 'center', marginTop: 10, lineHeight: scaleHeight(24) },
  submissionDetailsCard: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    borderRadius: 16,
    marginTop: 26,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    rowGap: 10,
  },
  submissionDetailRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  submissionDetailLabel: {
    fontSize: scaleFont(12),
    color: '#6B7280',
    marginBottom: 2,
    fontWeight: '600',
  },
  submissionDetailValue: {
    fontSize: scaleFont(13),
    color: '#111827',
    fontWeight: '500',
  },
  // Progress Bar Helper
  progressContainer: { width: scaleWidth(200), height: scaleHeight(10), justifyContent: 'center' },
  track: { width: '100%', height: 4, backgroundColor: '#E5E7EB', borderRadius: 2 },
  fill: { height: '100%', backgroundColor: THEME_BLUE, borderRadius: 2 },
  dot: {
    position: 'absolute',
    top: -3,
    width: scaleWidth(10),
    height: scaleWidth(10),
    borderRadius: 5,
    backgroundColor: THEME_BLUE,
  },
});
