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
  View,
  useWindowDimensions,
} from 'react-native';
import {
  getResponsiveScreenMetrics,
  type ResponsiveScreenMetrics,
} from '../../constants/webScreenMetrics';
import {
  consumeGoogleRedirectSignInResult,
  signInUser,
  signInWithGoogleIdToken,
  signInWithGoogleWeb,
  signUpUser,
} from '../../services/authservice';

type ExpoExtraConfig = {
  googleAndroidClientId?: string;
  googleIosClientId?: string;
  googleWebClientId?: string;
};

type GoogleSigninModuleLike = {
  GoogleSignin: {
    configure: (config: {
      webClientId?: string;
      iosClientId?: string;
      offlineAccess: boolean;
    }) => void;
    hasPlayServices: (options: {
      showPlayServicesUpdateDialog: boolean;
    }) => Promise<void>;
    signIn: () => Promise<{ data?: { idToken?: string | null } }>;
    signOut: () => Promise<void>;
  };
  statusCodes?: {
    IN_PROGRESS?: string;
    PLAY_SERVICES_NOT_AVAILABLE?: string;
    SIGN_IN_CANCELLED?: string;
  };
};

const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExpoExtraConfig;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

const createStyles = (metrics: ResponsiveScreenMetrics) =>
  StyleSheet.create({
    activeIndicator: {
      backgroundColor: '#FFFFFF',
      bottom: 0,
      height: 3,
      position: 'absolute',
      width: metrics.scaleWidth(82),
    },
    activeTabText: {
      color: '#F2EFEF',
    },
    appTitle: {
      color: '#FFF',
      fontSize: metrics.scaleFont(20),
      fontWeight: '800',
      letterSpacing: 2.4,
      lineHeight: metrics.scaleFont(24),
      marginBottom: 40,
      textAlign: 'center',
    },
    container: {
      alignItems: metrics.isWeb ? 'center' : undefined,
      backgroundColor: '#1E3A5F',
      flex: 1,
    },
    dividerRow: {
      alignItems: 'center',
      flexDirection: 'row',
      marginVertical: metrics.scaleHeight(14),
    },
    footer: {
      alignItems: 'center',
      marginTop: 'auto',
      paddingHorizontal: metrics.horizontalInset,
      paddingTop: metrics.scaleHeight(20),
      width: '100%',
    },
    footerText: {
      color: '#FFFFFF',
      fontSize: metrics.scaleFont(11),
      letterSpacing: -0.3,
      opacity: 0.8,
      textAlign: 'center',
    },
    formContainer: {
      paddingBottom: metrics.scaleHeight(16),
      paddingHorizontal: Math.min(metrics.scaleWidth(53), metrics.horizontalInset + 32),
      paddingTop: metrics.scaleHeight(18),
    },
    googleBtn: {
      alignItems: 'center',
      backgroundColor: '#FFF',
      borderRadius: 41,
      flexDirection: 'row',
      height: Math.max(metrics.scaleHeight(50), 48),
      justifyContent: 'center',
      marginBottom: 12,
      minHeight: 48,
      position: 'relative',
    },
    googleBtnText: {
      color: '#274C77',
      fontSize: metrics.scaleFont(14),
      fontWeight: '700',
      left: 0,
      position: 'absolute',
      right: 0,
      textAlign: 'center',
    },
    googleIcon: {
      height: metrics.scaleWidth(20),
      left: 14,
      position: 'absolute',
      width: metrics.scaleWidth(20),
    },
    headerContainer: {
      alignItems: 'center',
      backgroundColor: '#274C77',
      borderBottomLeftRadius: 50,
      borderBottomRightRadius: 50,
      borderColor: '#000000',
      borderWidth: 0.5,
      paddingBottom: 0,
      paddingTop: metrics.scaleHeight(75),
    },
    headerShadowContainer: {
      backgroundColor: 'transparent',
      elevation: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.4,
      shadowRadius: 10,
      zIndex: 10,
    },
    inputGroup: {
      borderBottomColor: '#FFFFFF',
      borderBottomWidth: 1,
      paddingBottom: metrics.scaleHeight(10),
    },
    inputLabel: {
      color: 'rgba(255, 255, 255, 0.67)',
      fontSize: metrics.scaleFont(13),
      fontWeight: '600',
      marginBottom: metrics.scaleHeight(10),
    },
    line: {
      backgroundColor: '#FFFFFF',
      flex: 1,
      height: 1,
    },
    logoCircle: {
      alignItems: 'center',
      backgroundColor: '#FFF',
      borderRadius: 999,
      height: Math.min(metrics.scaleWidth(130), metrics.screenWidth * 0.38),
      justifyContent: 'center',
      overflow: 'hidden',
      width: Math.min(metrics.scaleWidth(130), metrics.screenWidth * 0.38),
    },
    logoImage: {
      height: '100%',
      width: '100%',
    },
    logoWrapper: {
      marginBottom: 25,
    },
    mainBtn: {
      alignItems: 'center',
      backgroundColor: '#FFF',
      borderRadius: 33,
      height: Math.max(metrics.scaleHeight(50), 48),
      justifyContent: 'center',
      minHeight: 48,
    },
    mainBtnText: {
      color: '#274C77',
      fontSize: metrics.scaleFont(14),
      fontWeight: '700',
    },
    orText: {
      color: '#FFF',
      fontSize: metrics.scaleFont(13),
      fontWeight: '600',
      paddingHorizontal: 15,
    },
    passwordRow: {
      alignItems: 'center',
      flexDirection: 'row',
    },
    screenFrame: {
      alignSelf: 'center',
      flex: 1,
      maxWidth: metrics.isWeb ? metrics.screenWidth : undefined,
      minHeight: metrics.isWeb ? metrics.viewportHeight : undefined,
      overflow: 'hidden',
      width: '100%',
    },
    scrollContent: {
      flexGrow: 1,
      minHeight: metrics.isWeb ? metrics.viewportHeight : undefined,
      paddingBottom: metrics.scaleHeight(24),
    },
    tabBarContainer: {
      flexDirection: 'row',
      height: metrics.scaleHeight(56),
      justifyContent: 'space-between',
      paddingHorizontal: metrics.horizontalInset + 26,
      width: '100%',
    },
    tabItem: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      position: 'relative',
    },
    tabText: {
      color: 'rgba(242, 239, 239, 0.7)',
      fontSize: metrics.scaleFont(17),
      fontWeight: '700',
      paddingBottom: 5,
    },
    textInput: {
      color: '#FFF',
      fontSize: metrics.scaleFont(16),
      paddingVertical: metrics.scaleHeight(8),
    },
  });

const loadGoogleSigninModule = async (): Promise<GoogleSigninModuleLike | null> => {
  if (Platform.OS === 'web') {
    return null;
  }

  const isExpoGo = Constants.appOwnership === 'expo';
  const hasNativeGoogleSigninModule = Boolean(
    (NativeModules as Record<string, unknown> | undefined)?.RNGoogleSignin
  );

  if (isExpoGo || !hasNativeGoogleSigninModule) {
    return null;
  }

  try {
    const rawModule = (await import('@react-native-google-signin/google-signin')) as
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
  const { height, width } = useWindowDimensions();
  const metrics = getResponsiveScreenMetrics(width, height);
  const styles = createStyles(metrics);
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [isResolvingGoogleRedirect, setIsResolvingGoogleRedirect] = useState(
    Platform.OS === 'web'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const resolvedWebClientId = GOOGLE_WEB_CLIENT_ID || expoExtra.googleWebClientId;
  const resolvedIosClientId =
    GOOGLE_IOS_CLIENT_ID || expoExtra.googleIosClientId || resolvedWebClientId;
  const isBusy = loading || isResolvingGoogleRedirect;

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    void (async () => {
      const googleSigninModule = await loadGoogleSigninModule();
      if (!googleSigninModule || !resolvedWebClientId) {
        return;
      }

      googleSigninModule.GoogleSignin.configure({
        webClientId: resolvedWebClientId,
        iosClientId: resolvedIosClientId,
        offlineAccess: false,
      });
    })();
  }, [resolvedIosClientId, resolvedWebClientId]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setIsResolvingGoogleRedirect(false);
      return;
    }

    let isMounted = true;

    void (async () => {
      try {
        const redirectUser = await consumeGoogleRedirectSignInResult();
        if (redirectUser) {
          router.replace('/mobile-ui/dashboard');
        }
      } finally {
        if (isMounted) {
          setIsResolvingGoogleRedirect(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [router]);

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
        const user = await signInUser(email, password);
        if (user) {
          router.replace('/mobile-ui/dashboard');
        }
      } else {
        const user = await signUpUser(email, password);
        if (user) {
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
    if (Platform.OS !== 'web' && !resolvedWebClientId) {
      Alert.alert(
        'Google Sign-In Not Configured',
        'Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your .env file (or googleWebClientId in app.json expo.extra).'
      );
      return;
    }

    try {
      setLoading(true);

      if (Platform.OS === 'web') {
        const { user } = await signInWithGoogleWeb();

        if (user) {
          router.replace('/mobile-ui/dashboard');
        }

        return;
      }

      const googleSigninModule = await loadGoogleSigninModule();
      if (!googleSigninModule) {
        Alert.alert(
          'Google Sign-In Unavailable',
          'RNGoogleSignin is not available in this build. Use a development build (npx expo run:android / run:ios) instead of Expo Go.'
        );
        return;
      }

      const { GoogleSignin } = googleSigninModule;
      if (!GoogleSignin) {
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
        return;
      }

      const user = await signInWithGoogleIdToken(idToken);

      if (user) {
        router.replace('/mobile-ui/dashboard');
      }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error) {
        const code = String((error as { code?: unknown }).code);

        if (code === 'SIGN_IN_CANCELLED') {
          return;
        }

        if (code === 'IN_PROGRESS') {
          Alert.alert('Google Sign-In', 'Google sign-in is already in progress.');
          return;
        }

        if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
          Alert.alert(
            'Google Play Services',
            'Google Play Services is unavailable or outdated on this device.'
          );
          return;
        }
      }

      console.error('Google sign-in failed:', error);
      Alert.alert('Google Sign-In Error', 'Unable to continue with Google right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={styles.screenFrame}>
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
            <View style={styles.headerShadowContainer}>
              <View style={styles.headerContainer}>
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { borderRadius: 50, overflow: 'hidden' },
                  ]}
                >
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

              <TouchableOpacity
                style={[styles.mainBtn, { marginTop: isLogin ? 30 : 25 }]}
                activeOpacity={0.8}
                onPress={handleSubmit}
                disabled={isBusy}
              >
                {loading ? (
                  <ActivityIndicator color="#274C77" />
                ) : (
                  <Text style={styles.mainBtnText}>{isLogin ? 'Log in' : 'Sign up'}</Text>
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
                disabled={isBusy}
              >
                <Image
                  source={{
                    uri: 'https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.png',
                  }}
                  style={styles.googleIcon}
                />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {'Stay informed. Stay safe. \u00A9 2025 All rights reserved.'}
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </View>
  );
}
