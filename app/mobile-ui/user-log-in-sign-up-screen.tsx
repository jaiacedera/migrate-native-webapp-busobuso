import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    NativeModules,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { responsiveInset, scaleFont, scaleHeight, scaleWidth, screen } from '../../constants/responsive';
import {
    signInUser,
    signInWithGoogleIdToken,
    signUpUser,
} from '../../services/authservice';

type ExpoExtraConfig = {
  googleWebClientId?: string;
  googleAndroidClientId?: string;
  googleIosClientId?: string;
};

const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExpoExtraConfig;

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

type GoogleSigninModuleLike = {
  GoogleSignin: {
    configure: (config: { webClientId?: string; iosClientId?: string; offlineAccess: boolean }) => void;
    hasPlayServices: (options: { showPlayServicesUpdateDialog: boolean }) => Promise<void>;
    signOut: () => Promise<void>;
    signIn: () => Promise<{ data?: { idToken?: string | null } }>;
  };
  statusCodes?: {
    SIGN_IN_CANCELLED?: string;
    IN_PROGRESS?: string;
    PLAY_SERVICES_NOT_AVAILABLE?: string;
  };
};

const loadGoogleSigninModule = async (): Promise<GoogleSigninModuleLike | null> => {
  // Avoid loading the package in Expo Go or any binary that does not include RNGoogleSignin.
  const isExpoGo = Constants.appOwnership === 'expo';
  const hasNativeGoogleSigninModule = Boolean(
    (NativeModules as Record<string, unknown> | undefined)?.RNGoogleSignin
  );

  if (isExpoGo || !hasNativeGoogleSigninModule) {
    return null;
  }

  try {
    const rawModule = (await import('@react-native-google-signin/google-signin')) as unknown as
      | GoogleSigninModuleLike
      | { default?: GoogleSigninModuleLike };

    const candidate =
      (rawModule as GoogleSigninModuleLike).GoogleSignin
        ? (rawModule as GoogleSigninModuleLike)
        : (rawModule as { default?: GoogleSigninModuleLike }).default ?? null;

    if (!candidate?.GoogleSignin) {
      return null;
    }

    return candidate;
  } catch {
    return null;
  }
};

export default function UserLogInSignUp() {
  const router = useRouter(); 
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const resolvedWebClientId = GOOGLE_WEB_CLIENT_ID || expoExtra.googleWebClientId;
  const resolvedIosClientId =
    GOOGLE_IOS_CLIENT_ID || expoExtra.googleIosClientId || resolvedWebClientId;

  useEffect(() => {
    void (async () => {
      const googleSigninModule = await loadGoogleSigninModule();
      if (!googleSigninModule) {
        return;
      }

      googleSigninModule.GoogleSignin.configure({
      webClientId: resolvedWebClientId,
      iosClientId: resolvedIosClientId,
      offlineAccess: false,
    });
    })();
  }, [resolvedWebClientId, resolvedIosClientId]);

  const handleTabToggle = (toLogin: boolean) => {
    setIsLogin(toLogin);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        // --- LOGIN LOGIC ---
        const user = await signInUser(email, password);
        if (user) {
          // Navigate to Dashboard on successful login
          router.replace('/mobile-ui/dashboard');
        }
      } else {
        // --- SIGNUP LOGIC ---
        const user = await signUpUser(email, password);
        if (user) {
          // Navigate to UserForm on successful signup
          router.replace('/mobile-ui/user-form');
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!resolvedWebClientId) {
      Alert.alert(
        'Google Sign-In Not Configured',
        'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your .env file (or googleWebClientId in app.json expo.extra).'
      );
      return;
    }

    try {
      setLoading(true);

      const googleSigninModule = await loadGoogleSigninModule();
      if (!googleSigninModule) {
        setLoading(false);
        Alert.alert(
          'Google Sign-In Unavailable',
          'RNGoogleSignin is not available in this build. Use a development build (npx expo run:android / run:ios) instead of Expo Go.'
        );
        return;
      }

      const { GoogleSignin } = googleSigninModule;
      if (!GoogleSignin) {
        setLoading(false);
        Alert.alert(
          'Google Sign-In Unavailable',
          'Google sign-in module is not initialized in this build. Rebuild with npx expo run:android or npx expo run:ios.'
        );
        return;
      }

      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }

      await GoogleSignin.signOut();
      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken;

      if (!idToken) {
        Alert.alert('Google Sign-In Error', 'Google authentication token was not received.');
        setLoading(false);
        return;
      }

      const user = await signInWithGoogleIdToken(idToken);
      setLoading(false);

      if (user) {
        router.replace('/mobile-ui/dashboard');
      }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = String((error as { code?: unknown }).code);

        if (code === 'SIGN_IN_CANCELLED') {
          setLoading(false);
          return;
        }

        if (code === 'IN_PROGRESS') {
          setLoading(false);
          Alert.alert('Google Sign-In', 'Google sign-in is already in progress.');
          return;
        }

        if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
          setLoading(false);
          Alert.alert('Google Play Services', 'Google Play Services is unavailable or outdated on this device.');
          return;
        }
      }

      console.error('Google sign-in failed:', error);
      setLoading(false);
      Alert.alert('Google Sign-In Error', 'Unable to continue with Google right now.');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* 1. Background Layer */}
      <View style={StyleSheet.absoluteFill}>
        <Image
          source={require('../../assets/images/getstarted_background.jpg')}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
        <LinearGradient
          colors={[
            'rgba(72, 141, 221, 0)',
            'rgba(56, 109, 170, 0.5)',
            'rgba(39, 76, 119, 0.96)',
          ]}
          locations={[0, 0.0001, 0.5385]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* 2. Top Header Section */}
          <View style={styles.headerShadowContainer}>
            <View style={styles.headerContainer}>
              <View style={[StyleSheet.absoluteFill, { borderRadius: 50, overflow: 'hidden' }]}>
                <LinearGradient
                  colors={[
                    'rgba(72, 141, 221, 0)',
                    'rgba(56, 109, 170, 0.5)',
                    'rgba(39, 76, 119, 0.96)',
                  ]}
                  style={StyleSheet.absoluteFill}
                />
              </View>

              <View style={styles.logoWrapper}>
                <View style={styles.logoCircle}>
                  <Image
                    source={require('../../assets/images/busobuso_logo.png')}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                </View>
              </View>

              <Text style={styles.appTitle}>
                BARANGAY BUSO-BUSO{'\n'}RESIDENT EOC APP
              </Text>

              <View style={styles.tabBarContainer}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => handleTabToggle(true)}
                  style={styles.tabItem}
                >
                  <Text style={[styles.tabText, isLogin && styles.activeTabText]}>Log in</Text>
                  {isLogin && <View style={styles.activeIndicator} />}
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => handleTabToggle(false)}
                  style={styles.tabItem}
                >
                  <Text style={[styles.tabText, !isLogin && styles.activeTabText]}>Sign up</Text>
                  {!isLogin && <View style={styles.activeIndicator} />}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* 3. Form Section */}
          <View style={[styles.formContainer, { paddingBottom: isLogin ? 30 : 8 }]}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email address</Text>
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                cursorColor="#FFF"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={[styles.inputGroup, { marginTop: isLogin ? 10 : 3 }]}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.textInput, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  cursorColor="#FFF"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color="rgba(255, 255, 255, 0.7)"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {!isLogin && (
              <View style={[styles.inputGroup, { marginTop: 3 }]}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    style={[styles.textInput, { flex: 1 }]}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    cursorColor="#FFF"
                  />
                  <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                    <MaterialIcons
                      name={showConfirmPassword ? 'visibility' : 'visibility-off'}
                      size={20}
                      color="rgba(255, 255, 255, 0.7)"
                    />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Submit Button handles both Login and Signup navigation after auth */}
            {/* Sign Up button when isLogin is false */}
            <TouchableOpacity 
              style={[styles.mainBtn, { marginTop: isLogin ? 30 : 25 }]}
              activeOpacity={0.8}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#274C77" />
              ) : (
                <Text style={styles.mainBtnText}>
                  {isLogin ? 'Log in' : 'Sign up'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={[styles.dividerRow, { marginVertical: isLogin ? 20 : 12 }]}>
              <View style={styles.line} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.line} />
            </View>

            <TouchableOpacity
              style={[styles.googleBtn, { marginBottom: isLogin ? 30 : 8 }]}
              onPress={handleGoogleSignIn}
              disabled={loading}
            >
              <Image
                source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.png' }}
                style={styles.googleIcon}
              />
              <Text style={styles.googleBtnText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Stay informed. Stay safe. © 2025 All rights reserved.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#1E3A5F' 
  },
  scrollContent: { 
    flexGrow: 1,
    paddingBottom: scaleHeight(24),
  },
  headerShadowContainer: {
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 20,
    zIndex: 10,
  },
  headerContainer: {
    backgroundColor: '#274C77',
    borderBottomLeftRadius: 50,
    borderBottomRightRadius: 50,
    borderWidth: 0.5,
    borderColor: '#000000',
    paddingTop: scaleHeight(75),
    paddingBottom: 0,
    alignItems: 'center',
  },
  logoWrapper: { 
    marginBottom: 25 
  },
  logoCircle: {
    width: Math.min(scaleWidth(130), screen.width * 0.38), 
    height: Math.min(scaleWidth(130), screen.width * 0.38),
    backgroundColor: '#FFF', 
    borderRadius: 999,
    justifyContent: 'center', 
    alignItems: 'center',
    // Ensure image is clipped to the rounded container
    overflow: 'hidden',
  },
  logoImage: { 
    // Fill the entire circle container
    width: '100%', 
    height: '100%' 
  },
  appTitle: {
    color: '#FFF', 
    fontSize: scaleFont(20), 
    fontWeight: '800', 
    textAlign: 'center',
    lineHeight: scaleFont(24), 
    letterSpacing: 2.4, 
    marginBottom: 40,
  },
  tabBarContainer: {
    flexDirection: 'row', 
    width: '100%', 
    height: scaleHeight(56),
    paddingHorizontal: responsiveInset.horizontal + 26, 
    justifyContent: 'space-between',
  },
  tabItem: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    position: 'relative' 
  },
  tabText: { 
    fontSize: scaleFont(17), 
    color: 'rgba(242, 239, 239, 0.7)', 
    fontWeight: '700', 
    paddingBottom: 5 
  },
  activeTabText: { 
    color: '#F2EFEF' 
  },
  activeIndicator: { 
    position: 'absolute', 
    bottom: 0, 
    width: scaleWidth(82), 
    height: 3, 
    backgroundColor: '#FFFFFF' 
  },
  formContainer: { 
    paddingHorizontal: Math.min(scaleWidth(53), responsiveInset.horizontal + 32), 
    paddingTop: scaleHeight(18),
    // minimal bottom padding to fit all content
    paddingBottom: scaleHeight(16),
  },
  inputGroup: { 
    borderBottomWidth: 1, 
    borderBottomColor: '#FFFFFF', 
    paddingBottom: scaleHeight(10) 
  },
  inputLabel: { 
    color: 'rgba(255, 255, 255, 0.67)', 
    fontSize: scaleFont(13), 
    fontWeight: '600', 
    marginBottom: scaleHeight(10) 
  },
  textInput: { 
    color: '#FFF', 
    fontSize: scaleFont(16), 
    paddingVertical: scaleHeight(8) 
  },
  passwordRow: { 
    flexDirection: 'row', 
    alignItems: 'center' 
  },
  mainBtn: { 
    backgroundColor: '#FFF', 
    borderRadius: 33, 
    minHeight: 48,
    height: Math.max(scaleHeight(50), 48), 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  mainBtnText: { 
    color: '#274C77', 
    fontWeight: '700', 
    fontSize: scaleFont(14) 
  },
  dividerRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginVertical: scaleHeight(14) 
  },
  line: { 
    flex: 1, 
    height: 1, 
    backgroundColor: '#FFFFFF' 
  },
  orText: { 
    color: '#FFF', 
    paddingHorizontal: 15, 
    fontSize: scaleFont(13), 
    fontWeight: '600' 
  },
  googleBtn: { 
    backgroundColor: '#FFF', 
    borderRadius: 41, 
    minHeight: 48,
    height: Math.max(scaleHeight(50), 48), 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center',
    // keep position relative so we can absolutely position children
    position: 'relative',
    // tighten spacing below the Google button
    marginBottom: 12,
  },
  googleIcon: { 
    width: scaleWidth(20), 
    height: scaleWidth(20),
    // position on the left side of the button
    position: 'absolute',
    left: 14,
  },
  googleBtnText: { 
    color: '#274C77', 
    fontWeight: '700', 
    fontSize: scaleFont(14),
    // center text within the button regardless of icon
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center'
  },
  footer: { 
    marginTop: 'auto',
    paddingTop: scaleHeight(20),
    width: '100%', 
    alignItems: 'center' 
  },
  footerText: { 
    color: '#FFFFFF', 
    fontSize: scaleFont(11), 
    textAlign: 'center',
    opacity: 0.8,
    // compress letters for tight appearance
    letterSpacing: -0.3
  },
});