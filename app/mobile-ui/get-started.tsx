import { useRouter } from 'expo-router';
import {
  Image,
  ImageBackground,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { responsiveInset, scaleFont, screen } from '../../constants/responsive';

const SCREEN_WIDTH = screen.width;
const SCREEN_HEIGHT = screen.height;

const GetStartedScreen = () => {
  const router = useRouter();

  const handleGetStarted = () => {
    router.replace('/mobile-ui/user-log-in-sign-up-screen');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      
      <ImageBackground 
        source={require('../../assets/images/getstarted_background.jpg')} 
        style={styles.background}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          
          {/* Vertical Spacer to push content down */}
          <View style={{ flex: 1.1 }} /> 

          <View style={styles.mainContent}>
            {/* LOGO CONTAINER */}
            <View style={styles.circle}>
              <Image 
                source={require('../../assets/images/busobuso_logo.png')} 
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>

            <View style={styles.textContainer}>
              <Text style={styles.mainTitle}>
                {"BARANGAY BUSO-BUSO\nRESIDENT EOC APP"}
              </Text>
              <Text style={styles.subTitle}>
                Your guide to safety and preparedness
              </Text>
            </View>
          </View>

          {/* Bottom Spacer */}
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
  );
};

export default GetStartedScreen;

const styles = StyleSheet.create({
  container: { 
    flex: 1 
  },
  background: { 
    flex: 1 
  },
  overlay: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.2)', 
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: SCREEN_HEIGHT * 0.05,
  },
  mainContent: {
    alignItems: 'center',
    width: '100%',
    flexShrink: 0,
  },
  circle: {
    width: SCREEN_WIDTH * 0.5,
    height: SCREEN_WIDTH * 0.5,
    // Math fix: Radius must be exactly half of width/height
    borderRadius: (SCREEN_WIDTH * 0.5) / 2, 
    backgroundColor: 'white',
    justifyContent: 'center', 
    alignItems: 'center', 
    // Ensure the container truly clips its children to the rounded shape on Android
    overflow: 'hidden',
    // Keep 1:1 aspect ratio as a safeguard
    aspectRatio: 1,
    elevation: 10,
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 5 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 5, 
    marginBottom: screen.isSmallPhone ? 14 : 20,
  },
  logoImage: { 
    // 100% gives the logo a small white border inside the circle
    width: '100%', 
    height: '100%' 
  },
  textContainer: { 
    alignItems: 'center',
    paddingHorizontal: responsiveInset.horizontal,
  },
  mainTitle: { 
    fontWeight: '900', 
    fontSize: scaleFont(SCREEN_WIDTH * 0.065), 
    color: '#FFFFFF', 
    textAlign: 'center',
    lineHeight: scaleFont(SCREEN_WIDTH * 0.09),
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5,
  },
  subTitle: { 
    fontSize: scaleFont(SCREEN_WIDTH * 0.04), 
    color: '#F2EFEF', 
    textAlign: 'center', 
    marginTop: 8,
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    flexShrink: 0,
  },
  button: {
    // Smaller responsive width
    width: SCREEN_WIDTH * 0.6, 
    minHeight: 46,
    height: screen.isSmallPhone ? 46 : 50,
    backgroundColor: 'white', 
    borderRadius: 25, 
    justifyContent: 'center', 
    alignItems: 'center',
    marginBottom: 15,
    elevation: 4,
  },
  buttonText: { 
    color: '#274C77', 
    fontWeight: '900', 
    fontSize: scaleFont(16),
  }
});