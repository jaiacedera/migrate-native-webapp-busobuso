import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { responsiveInset, scaleFont, scaleHeight } from '../constants/responsive';

type AboutModalProps = {
  visible: boolean;
  onClose: () => void;
};

const APP_NAME = 'BusoBusoMobileApp';
const APP_VERSION = '1.0.0';
const APP_CREATOR = 'Buso-Buso Development Team';
const APP_ABOUT =
  'BusoBusoMobileApp helps residents stay prepared during emergencies through alerts, evacuation tracking, address pinning, and quick access to community information.';

export default function AboutModal({ visible, onClose }: AboutModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.aboutModalCard}>
          <Text style={styles.title}>About</Text>
          <Text style={styles.aboutAppName}>{APP_NAME}</Text>
          <Text style={styles.aboutText}>Version: {APP_VERSION}</Text>
          <Text style={styles.aboutText}>{APP_ABOUT}</Text>
          <Text style={styles.aboutCreatorText}>Created by: {APP_CREATOR}</Text>

          <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aboutModalCard: {
    width: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: responsiveInset.card,
    gap: 8,
  },
  title: {
    fontSize: scaleFont(18),
    fontWeight: '700',
    color: '#274C77',
    marginBottom: 12,
  },
  aboutAppName: {
    color: '#274C77',
    fontWeight: '700',
    fontSize: scaleFont(16),
  },
  aboutText: {
    color: '#334155',
    fontSize: scaleFont(14),
    lineHeight: scaleHeight(20),
  },
  aboutCreatorText: {
    color: '#1E293B',
    fontWeight: '600',
    fontSize: scaleFont(14),
    marginTop: 4,
  },
  closeButton: {
    marginTop: 16,
    backgroundColor: '#274C77',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
