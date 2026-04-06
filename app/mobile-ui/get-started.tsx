import { useRouter } from 'expo-router';
import {
  Image,
  ImageBackground,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { getResponsiveScreenMetrics, type ResponsiveScreenMetrics } from '../../constants/webScreenMetrics';

const createStyles = (metrics: ResponsiveScreenMetrics) =>
  StyleSheet.create({
    background: {
      flex: 1,
    },
    bottomSection: {
      alignItems: 'center',
      flexShrink: 0,
      width: '100%',
    },
    button: {
      alignItems: 'center',
      backgroundColor: 'white',
      borderRadius: 25,
      elevation: 4,
      height: metrics.isSmallPhone ? 46 : 50,
      justifyContent: 'center',
      marginBottom: 15,
      minHeight: 46,
      width: metrics.screenWidth * 0.6,
    },
    buttonText: {
      color: '#274C77',
      fontSize: metrics.scaleFont(16),
      fontWeight: '900',
    },
    circle: {
      alignItems: 'center',
      aspectRatio: 1,
      backgroundColor: 'white',
      borderRadius: (metrics.screenWidth * 0.5) / 2,
      elevation: 10,
      height: metrics.screenWidth * 0.5,
      justifyContent: 'center',
      marginBottom: metrics.isSmallPhone ? 14 : 20,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.3,
      shadowRadius: 5,
      width: metrics.screenWidth * 0.5,
    },
    container: {
      alignSelf: 'center',
      flex: 1,
      maxWidth: metrics.isWeb ? metrics.screenWidth : undefined,
      minHeight: metrics.isWeb ? metrics.viewportHeight : undefined,
      overflow: 'hidden',
      width: '100%',
    },
    logoImage: {
      height: '100%',
      width: '100%',
    },
    mainContent: {
      alignItems: 'center',
      flexShrink: 0,
      width: '100%',
    },
    mainTitle: {
      color: '#FFFFFF',
      fontSize: metrics.scaleFont(metrics.screenWidth * 0.065),
      fontWeight: '900',
      lineHeight: metrics.scaleFont(metrics.screenWidth * 0.09),
      textAlign: 'center',
      textShadowColor: 'rgba(0, 0, 0, 0.5)',
      textShadowOffset: { width: 1, height: 1 },
      textShadowRadius: 5,
    },
    overlay: {
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.2)',
      flex: 1,
      justifyContent: 'space-between',
      paddingBottom: metrics.screenHeight * 0.05,
    },
    root: {
      alignItems: metrics.isWeb ? 'center' : undefined,
      backgroundColor: '#112032',
      flex: 1,
    },
    subTitle: {
      color: '#F2EFEF',
      fontSize: metrics.scaleFont(metrics.screenWidth * 0.04),
      marginTop: 8,
      textAlign: 'center',
    },
    textContainer: {
      alignItems: 'center',
      paddingHorizontal: metrics.horizontalInset,
    },
  });

const GetStartedScreen = () => {
  const router = useRouter();
  const { height, width } = useWindowDimensions();
  const metrics = getResponsiveScreenMetrics(width, height);
  const styles = createStyles(metrics);

  const handleGetStarted = () => {
    router.replace('/mobile-ui/user-log-in-sign-up-screen');
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <View style={styles.container}>
        <ImageBackground
          source={require('../../assets/images/getstarted_background.jpg')}
          style={styles.background}
          resizeMode="cover"
        >
          <View style={styles.overlay}>
            <View style={{ flex: 1.1 }} />

            <View style={styles.mainContent}>
              <View style={styles.circle}>
                <Image
                  source={require('../../assets/images/busobuso_logo.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.textContainer}>
                <Text style={styles.mainTitle}>
                  {'BARANGAY BUSO-BUSO\nRESIDENT EOC APP'}
                </Text>
                <Text style={styles.subTitle}>
                  Your guide to safety and preparedness
                </Text>
              </View>
            </View>

            <View style={{ flex: 0.8 }} />

            <View style={styles.bottomSection}>
              <TouchableOpacity
                style={styles.button}
                activeOpacity={0.8}
                onPress={handleGetStarted}
              >
                <Text style={styles.buttonText}>GET STARTED</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ImageBackground>
      </View>
    </View>
  );
};

export default GetStartedScreen;
