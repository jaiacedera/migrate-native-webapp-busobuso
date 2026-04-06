import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { philippinesCenter } from '../../constants/location';
import { responsiveInset, scaleFont, scaleHeight, scaleWidth, screen } from '../../constants/responsive';
import { getLocation } from '../../services/api';
import { buildMapHtml } from '../../services/mapTemplateService';
import { saveUserProfile } from '../../services/userProfileService';

const THEME_BLUE = '#274C77';

const UserForm = () => {
  const router = useRouter();

  // State for form fields
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    middleInitial: '',
    address: '',
    contactNumber: '',
    emergencyContact: '',
  });

  // State for errors
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isPinningLocation, setIsPinningLocation] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>(philippinesCenter);
  const [pinnedLocation, setPinnedLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number | null;
    capturedAt: string;
  } | null>(null);

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
          const ipLocation = await getLocation();
          setMapCenter(ipLocation);
          return;
        }

        const currentPosition = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        setMapCenter([currentPosition.coords.longitude, currentPosition.coords.latitude]);
      } catch (error) {
        console.error('Failed to initialize map location:', error);
        const ipLocation = await getLocation();
        setMapCenter(ipLocation);
      }
    })();
  }, []);

  const mapHtml = useMemo(() => {
    const selectedPin = pinnedLocation
      ? ([pinnedLocation.longitude, pinnedLocation.latitude] as [number, number])
      : null;
    return buildMapHtml(mapCenter, selectedPin);
  }, [mapCenter, pinnedLocation]);

  const validate = () => {
    let newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) newErrors.firstName = 'Please enter your first name';
    if (!formData.lastName.trim()) newErrors.lastName = 'Please enter your last name';
    if (!formData.address.trim()) newErrors.address = 'Please enter your address';
    
    if (!formData.contactNumber.trim()) {
      newErrors.contactNumber = 'Please enter your contact number';
    } else if (formData.contactNumber.length < 11) {
      newErrors.contactNumber = 'Please enter a valid 11-digit number';
    }

    if (!formData.emergencyContact.trim()) newErrors.emergencyContact = 'Please enter emergency contact';
    if (!pinnedLocation) newErrors.currentLocation = 'Please pin your exact location on the map';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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

      setPinnedLocation(nextLocation);
      setMapCenter([nextLocation.longitude, nextLocation.latitude]);
      setErrors((prev) => {
        const next = { ...prev };
        delete next.currentLocation;
        return next;
      });
      Alert.alert('Location Pinned', 'Your current location was successfully pinned.');
    } catch (error) {
      console.error('Failed to pin location:', error);
      Alert.alert('Location Error', 'Unable to get your current location. Please try again.');
    } finally {
      setIsPinningLocation(false);
    }
  };

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

      setPinnedLocation({
        latitude,
        longitude,
        accuracy: null,
        capturedAt: payload.capturedAt ?? new Date().toISOString(),
      });
      setErrors((prev) => {
        const next = { ...prev };
        delete next.currentLocation;
        return next;
      });
    } catch (error) {
      console.error('Failed to parse map message:', error);
    }
  };

  const handleSave = async () => {
    if (!validate()) {
      return;
    }

    try {
      setIsSaving(true);
      await saveUserProfile({
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        middleInitial: formData.middleInitial.trim(),
        address: formData.address.trim(),
        contactNumber: formData.contactNumber.trim(),
        emergencyContact: formData.emergencyContact.trim(),
        location: pinnedLocation as {
          latitude: number;
          longitude: number;
          accuracy: number | null;
          capturedAt: string;
        },
      });

      Alert.alert('Success', 'Profile information saved successfully.', [
        { text: 'OK', onPress: () => router.replace('/mobile-ui/dashboard') },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to save profile right now.';
      Alert.alert('Save Error', message);
    } finally {
      setIsSaving(false);
    }
  };

  const renderInputLabel = (label: string) => (
    <Text style={styles.inputLabel}>{label}</Text>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Custom Header / AppBar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={{ color: THEME_BLUE, fontSize: scaleFont(18) }}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Personal Information</Text>
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.welcomeText}>Complete your Profile</Text>
          <Text style={styles.subText}>
            This information helps emergency responders locate and assist you faster.
          </Text>

          {/* First Name */}
          {renderInputLabel("First Name")}
          <TextInput
            style={[styles.input, errors.firstName && styles.inputError]}
            placeholder="Enter your first name"
            placeholderTextColor="#FFFFFF99"
            value={formData.firstName}
            onChangeText={(text) => setFormData({...formData, firstName: text})}
          />
          {errors.firstName && <Text style={styles.errorText}>{errors.firstName}</Text>}

          {/* Row for Last Name and M.I. */}
          <View style={styles.row}>
            <View style={{ flex: 3 }}>
              {renderInputLabel("Last Name")}
              <TextInput
                style={[styles.input, errors.lastName && styles.inputError]}
                placeholder="Enter last name"
                placeholderTextColor="#FFFFFF99"
                value={formData.lastName}
                onChangeText={(text) => setFormData({...formData, lastName: text})}
              />
              {errors.lastName && <Text style={styles.errorText}>{errors.lastName}</Text>}
            </View>
            
            <View style={{ width: scaleWidth(12) }} />

            <View style={{ flex: 1 }}>
              {renderInputLabel("M.I.")}
              <TextInput
                style={styles.input}
                placeholder="M.I."
                placeholderTextColor="#FFFFFF99"
                value={formData.middleInitial}
                onChangeText={(text) => setFormData({...formData, middleInitial: text})}
                maxLength={2}
              />
            </View>
          </View>

          {/* Address */}
          {renderInputLabel("Complete Address")}
          <TextInput
            style={[styles.input, errors.address && styles.inputError]}
            placeholder="Street, House No., Purok"
            placeholderTextColor="#FFFFFF99"
            value={formData.address}
            onChangeText={(text) => setFormData({...formData, address: text})}
          />
          {errors.address && <Text style={styles.errorText}>{errors.address}</Text>}

          {renderInputLabel("Current Location Pin")}
          <Text style={styles.mapHintText}>Tap anywhere on the map to drop your pin.</Text>
          <View style={styles.mapContainer}>
            <WebView
              source={{ html: mapHtml }}
              originWhitelist={['*']}
              style={styles.mapWebView}
              onMessage={handleMapMessage}
              javaScriptEnabled
              domStorageEnabled
              nestedScrollEnabled
              scrollEnabled={false}
            />
          </View>
          <TouchableOpacity
            style={[styles.pinButton, isPinningLocation && styles.buttonDisabled]}
            onPress={handlePinCurrentLocation}
            disabled={isPinningLocation}
          >
            {isPinningLocation ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.pinButtonText}>
                {pinnedLocation ? 'RE-PIN CURRENT LOCATION' : 'PIN CURRENT LOCATION'}
              </Text>
            )}
          </TouchableOpacity>
          {pinnedLocation && (
            <Text style={styles.locationPinnedText}>
              Pinned: {pinnedLocation.latitude.toFixed(6)}, {pinnedLocation.longitude.toFixed(6)}
            </Text>
          )}
          {errors.currentLocation && <Text style={styles.errorText}>{errors.currentLocation}</Text>}

          {/* Contact Number */}
          {renderInputLabel("Contact Number")}
          <TextInput
            style={[styles.input, errors.contactNumber && styles.inputError]}
            placeholder="09XXXXXXXXX"
            placeholderTextColor="#FFFFFF99"
            keyboardType="phone-pad"
            value={formData.contactNumber}
            onChangeText={(text) => setFormData({...formData, contactNumber: text})}
          />
          {errors.contactNumber && <Text style={styles.errorText}>{errors.contactNumber}</Text>}

          {/* Emergency Contact */}
          {renderInputLabel("Emergency Contact Person")}
          <TextInput
            style={[styles.input, errors.emergencyContact && styles.inputError]}
            placeholder="Name of person to contact"
            placeholderTextColor="#FFFFFF99"
            value={formData.emergencyContact}
            onChangeText={(text) => setFormData({...formData, emergencyContact: text})}
          />
          {errors.emergencyContact && <Text style={styles.errorText}>{errors.emergencyContact}</Text>}

          <TouchableOpacity
            style={[styles.button, isSaving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>SAVE AND CONTINUE</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default UserForm;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: responsiveInset.horizontal,
    minHeight: 56,
    height: scaleHeight(60),
  },
  backButton: {
    paddingRight: 15,
  },
  headerTitle: {
    fontSize: scaleFont(18),
    fontWeight: 'bold',
    color: THEME_BLUE,
  },
  scrollContent: {
    flexGrow: 1,
    padding: responsiveInset.horizontal,
    paddingBottom: scaleHeight(50),
  },
  welcomeText: {
    fontSize: scaleFont(24),
    fontWeight: 'bold',
    color: THEME_BLUE,
  },
  subText: {
    fontSize: scaleFont(14),
    color: '#666',
    marginTop: 8,
    marginBottom: 30,
  },
  inputLabel: {
    color: THEME_BLUE,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    backgroundColor: THEME_BLUE,
    borderRadius: 10,
    minHeight: 46,
    height: scaleHeight(50),
    paddingHorizontal: 15,
    color: '#FFFFFF',
    fontSize: scaleFont(16),
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#FF5252',
  },
  row: {
    flexDirection: 'row',
    width: '100%',
  },
  errorText: {
    color: '#FF5252',
    fontSize: scaleFont(12),
    marginTop: 5,
  },
  button: {
    backgroundColor: THEME_BLUE,
    minHeight: 48,
    height: scaleHeight(55),
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 40,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: scaleFont(16),
  },
  pinButton: {
    backgroundColor: THEME_BLUE,
    borderRadius: 10,
    minHeight: 44,
    height: scaleHeight(48),
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  pinButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: scaleFont(14),
  },
  locationPinnedText: {
    color: THEME_BLUE,
    marginTop: 8,
    fontSize: scaleFont(12),
  },
  mapHintText: {
    color: '#3D5A80',
    fontSize: scaleFont(12),
    marginBottom: 8,
  },
  mapContainer: {
    height: Math.max(scaleHeight(220), screen.isSmallPhone ? 190 : 210),
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D6E0EE',
  },
  mapWebView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
});
