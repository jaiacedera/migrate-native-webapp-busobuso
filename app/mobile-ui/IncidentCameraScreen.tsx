import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import type { JSX } from "react";
import { useRef, useState } from "react";
import {
    Alert,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface IncidentCameraScreenProps {
  onCapture: (photoUri: string) => void;
  onClose: () => void;
}

export default function IncidentCameraScreen({
  onCapture,
  onClose,
}: IncidentCameraScreenProps): JSX.Element {
  const [permission, requestPermission] = useCameraPermissions();
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flashMode, setFlashMode] = useState<'off' | 'on'>('off');
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  const handleFlipCamera = (): void => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const handleToggleFlash = (): void => {
    setFlashMode((current) => (current === 'off' ? 'on' : 'off'));
  };

  const handleTakePhoto = async (): Promise<void> => {
    try {
      if (!cameraRef.current || isTakingPhoto) return;

      setIsTakingPhoto(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
      });

      if (photo?.uri) {
        setCapturedPhotoUri(photo.uri);
      }
    } catch (error) {
      Alert.alert(
        "Camera Error",
        error instanceof Error ? error.message : "Failed to capture photo."
      );
    } finally {
      setIsTakingPhoto(false);
    }
  };

  const handlePickFromGallery = async (): Promise<void> => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("Permission Needed", "Please allow photo library access to choose an image.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.7,
      });

      if (!result.canceled && result.assets?.length) {
        if (result.assets.length === 1 && result.assets[0]?.uri) {
          setCapturedPhotoUri(result.assets[0].uri);
          return;
        }

        // For multi-select, attach all selected photos immediately.
        result.assets.forEach((asset) => {
          if (asset.uri) {
            onCapture(asset.uri);
          }
        });
        onClose();
      }
    } catch (error) {
      Alert.alert(
        "Gallery Error",
        error instanceof Error ? error.message : "Failed to open image gallery."
      );
    }
  };

  if (!permission) {
    return <View style={styles.center}><Text>Loading camera...</Text></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>
          Camera permission is required to report an incident.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
          <Text style={styles.secondaryButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleRetake = (): void => {
    setCapturedPhotoUri(null);
  };

  const handleSaveToReport = (): void => {
    if (!capturedPhotoUri) return;
    onCapture(capturedPhotoUri);
  };

  if (capturedPhotoUri) {
    return (
      <View style={styles.container}>
        <Image source={{ uri: capturedPhotoUri }} style={styles.previewImage} resizeMode="contain" />

        <TouchableOpacity style={styles.previewCloseButton} onPress={onClose}>
          <Ionicons name="close" size={24} color="white" />
        </TouchableOpacity>

        <View style={styles.previewActions}>
          <TouchableOpacity style={styles.previewActionButton} onPress={handleRetake}>
            <Ionicons name="camera-reverse" size={20} color="white" />
            <Text style={styles.previewActionText}>Retake</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.previewActionButton, styles.previewSaveButton]} onPress={handleSaveToReport}>
            <Ionicons name="checkmark-circle" size={20} color="white" />
            <Text style={styles.previewActionText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.cameraFrame}>
        <CameraView ref={cameraRef} style={styles.camera} facing={facing} flash={flashMode} />
      </View>

      <TouchableOpacity style={styles.captureCloseButton} onPress={onClose}>
        <Ionicons name="close" size={24} color="white" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.captureFlashButton} onPress={handleToggleFlash}>
        <Ionicons name={flashMode === 'on' ? "flash" : "flash-off"} size={22} color="white" />
      </TouchableOpacity>

      <View style={styles.controls}>
        <TouchableOpacity style={styles.iconButton} onPress={handlePickFromGallery}>
          <Ionicons name="images" size={22} color="white" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.captureButton} onPress={handleTakePhoto}>
          <View style={styles.captureInner} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.iconButton} onPress={handleFlipCamera}>
          <Ionicons name="camera-reverse" size={22} color="white" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
    paddingTop: 30,
    paddingBottom: 24,
    paddingHorizontal: 16,
    justifyContent: "space-between",
  },
  cameraFrame: {
    width: "100%",
    flex: 1,
    marginTop: 70,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#111111",
    maxHeight: "74%",
    alignSelf: "center",
  },
  camera: {
    flex: 1,
  },
  controls: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  captureCloseButton: {
    position: "absolute",
    top: 46,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
    elevation: 20,
  },
  captureFlashButton: {
    position: "absolute",
    top: 46,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
    elevation: 20,
  },
  captureButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "white",
  },
  previewImage: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "black",
  },
  previewCloseButton: {
    position: "absolute",
    top: 30,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
    elevation: 20,
  },
  previewActions: {
    position: "absolute",
    bottom: 30,
    left: 20,
    right: 20,
    flexDirection: "row",
    gap: 12,
  },
  previewActionButton: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  previewSaveButton: {
    backgroundColor: "#274C77",
  },
  previewActionText: {
    color: "white",
    fontWeight: "700",
    fontSize: 15,
  },
  button: {
    backgroundColor: "#274C77",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  secondaryButtonText: {
    color: "white",
    fontWeight: "600",
  },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  permissionText: {
    textAlign: "center",
    fontSize: 16,
  },
});