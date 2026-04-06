import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { responsiveInset, scaleFont, scaleHeight, scaleWidth } from '../../constants/responsive';
import { db } from '../../services/firebaseconfig';
import {
  buildTrackerSteps,
  DistressReportDoc,
  toDateValue,
} from '../../services/reportTracker';

const THEME_BLUE = '#274C77';
const MUTED_BLUE = '#8AA0BC';
const APP_BAR_TOP = Math.max(scaleHeight(12), (StatusBar.currentHeight ?? 0) + scaleHeight(6));

const ReportTrackerDetailScreen = () => {
  const router = useRouter();
  const { reportDocId, reportId } = useLocalSearchParams<{
    reportDocId?: string | string[];
    reportId?: string | string[];
  }>();
  const [reportData, setReportData] = useState<DistressReportDoc | null>(null);
  const [createdAtDate, setCreatedAtDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const pulseValue = useState(new Animated.Value(1))[0];

  const resolvedDocId = Array.isArray(reportDocId) ? reportDocId[0] : reportDocId;
  const resolvedReportId = Array.isArray(reportId) ? reportId[0] : reportId;
  const trackerSteps = useMemo(
    () =>
      reportData
        ? buildTrackerSteps({
            reportData,
            createdAtDate,
          })
        : [],
    [createdAtDate, reportData]
  );
  const visibleTrackerSteps = useMemo(
    () => trackerSteps.filter((step) => step.state !== 'pending'),
    [trackerSteps]
  );
  const reporterName =
    reportData?.fullName ||
    reportData?.name ||
    'Not provided';
  const reportedAddress = reportData?.address || 'Not provided';
  const reportedContactNumber =
    reportData?.contactNumber ||
    reportData?.phone ||
    'Not provided';

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      router.back();
      return true;
    });

    return () => backHandler.remove();
  }, [router]);

  useEffect(() => {
    if (!resolvedDocId) {
      setIsLoading(false);
      setReportData(null);
      return;
    }

    const reportRef = doc(db, 'distressReports', resolvedDocId);
    const unsubscribe = onSnapshot(
      reportRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setReportData(null);
          setCreatedAtDate(null);
          setIsLoading(false);
          return;
        }

        const data = snapshot.data() as DistressReportDoc;
        setReportData(data);
        setCreatedAtDate(toDateValue(data.createdAt));
        setIsLoading(false);
      },
      (error: unknown) => {
        console.error('Failed to load report tracker details:', error);
        setReportData(null);
        setCreatedAtDate(null);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [resolvedDocId]);

  useEffect(() => {
    const hasActiveStep = visibleTrackerSteps.some((step) => step.state === 'active');

    if (!hasActiveStep) {
      pulseValue.stopAnimation();
      pulseValue.setValue(1);
      return;
    }

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, {
          toValue: 1.08,
          duration: 850,
          useNativeDriver: true,
        }),
        Animated.timing(pulseValue, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnimation.start();

    return () => {
      pulseAnimation.stop();
      pulseValue.setValue(1);
    };
  }, [pulseValue, visibleTrackerSteps]);

  const pulseOpacity = pulseValue.interpolate({
    inputRange: [1, 1.08],
    outputRange: [0.8, 1],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.appBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={THEME_BLUE} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Report Tracker</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.trackerCard}>
          <Text style={styles.trackerTitle}>Report Details</Text>

          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={THEME_BLUE} />
              <Text style={styles.loadingText}>Loading tracker...</Text>
            </View>
          ) : !reportData ? (
            <Text style={styles.emptyText}>Report details are unavailable.</Text>
          ) : (
            <>
              <View style={styles.infoSection}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Name</Text>
                  <Text style={styles.infoValue}>{reporterName}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Reported Address</Text>
                  <Text style={styles.infoValue}>{reportedAddress}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Contact Number</Text>
                  <Text style={styles.infoValue}>{reportedContactNumber}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Report</Text>
                  <Text style={styles.infoValue}>{reportData.report || 'Not provided'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Report ID</Text>
                  <Text style={styles.infoValue}>{reportData?.reportId ?? resolvedReportId ?? 'Unknown Report'}</Text>
                </View>
              </View>

              <View style={styles.timelineList}>
                {visibleTrackerSteps.map((step, index) => {
                  const isLastStep = index === visibleTrackerSteps.length - 1;
                  const isSubmittedStep = step.key === 'submitted';
                  const isCompleted = step.state === 'done';
                  const isActive = step.state === 'active';
                  const animatedCircleStyle = isActive
                    ? {
                        opacity: pulseOpacity,
                        transform: [{ scale: pulseValue }],
                      }
                    : undefined;

                  return (
                    <View
                      key={step.key}
                      style={[styles.timelineRow, isSubmittedStep && styles.timelineRowSubmitted]}
                    >
                      <View
                        style={[
                          styles.timelineMarkerColumn,
                          isSubmittedStep && styles.timelineMarkerColumnSubmitted,
                        ]}
                      >
                        <Animated.View
                          style={[
                            styles.timelineCircle,
                            isSubmittedStep && styles.timelineCircleSubmitted,
                            isCompleted && styles.timelineCircleDone,
                            isActive && styles.timelineCircleActive,
                            step.state === 'pending' && styles.timelineCirclePending,
                            animatedCircleStyle,
                          ]}
                        >
                          {(isCompleted || isActive) ? (
                            <Ionicons
                              name="checkmark"
                              size={isSubmittedStep ? 26 : 20}
                              color={isCompleted ? '#FFFFFF' : THEME_BLUE}
                            />
                          ) : null}
                        </Animated.View>
                        {!isLastStep ? (
                          <View
                            style={[
                              styles.timelineConnector,
                              isSubmittedStep && styles.timelineConnectorSubmitted,
                            ]}
                          />
                        ) : null}
                      </View>

                      <View
                        style={[
                          styles.timelineContent,
                          isSubmittedStep && styles.timelineContentSubmitted,
                        ]}
                      >
                        <Text
                          style={[
                            styles.timelineTitle,
                            isSubmittedStep && styles.timelineTitleSubmitted,
                            step.state === 'pending' && styles.timelineTitlePending,
                          ]}
                        >
                          {step.title}
                        </Text>
                        {step.details.map((detail, detailIndex) => (
                          <Text key={`${step.key}-${detailIndex}`} style={styles.timelineDetail}>
                            {detail}
                          </Text>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default ReportTrackerDetailScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF3F9',
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: responsiveInset.horizontal,
    paddingTop: APP_BAR_TOP,
    paddingBottom: 10,
  },
  backButton: {
    height: scaleWidth(28),
    justifyContent: 'center',
  },
  appBarTitle: {
    fontSize: scaleFont(18),
    fontWeight: 'bold',
    color: THEME_BLUE,
    marginLeft: scaleWidth(10),
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: responsiveInset.horizontal,
    paddingTop: 8,
    paddingBottom: scaleHeight(24),
  },
  trackerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    marginTop: scaleHeight(55),
    paddingHorizontal: scaleWidth(18),
    paddingVertical: scaleHeight(20),
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  trackerTitle: {
    color: THEME_BLUE,
    fontWeight: '800',
    fontSize: scaleFont(18),
    textAlign: 'center',
    marginBottom: 14,
  },
  reportIdText: {
    marginTop: 4,
    color: MUTED_BLUE,
    fontWeight: '600',
    fontSize: scaleFont(11.5),
  },
  reportSummary: {
    marginTop: 14,
    color: '#334155',
    fontSize: scaleFont(12.2),
    lineHeight: scaleFont(16.5),
  },
  infoSection: {
    marginTop: 0,
    borderWidth: 1,
    borderColor: '#D9E3EE',
    borderRadius: 12,
    backgroundColor: '#F8FBFF',
    overflow: 'hidden',
  },
  infoRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5ECF4',
  },
  infoLabel: {
    color: '#5B728D',
    fontSize: scaleFont(11.5),
    fontWeight: '700',
    marginBottom: 2,
  },
  infoValue: {
    color: '#1F3A57',
    fontSize: scaleFont(13),
    fontWeight: '600',
  },
  reportDate: {
    marginTop: 6,
    color: '#70859D',
    fontSize: scaleFont(11.25),
  },
  loadingRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#64748B',
  },
  emptyText: {
    marginTop: 20,
    color: '#64748B',
  },
  timelineList: {
    marginTop: 28,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  timelineRowSubmitted: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  timelineMarkerColumn: {
    width: scaleWidth(38),
    alignItems: 'center',
  },
  timelineMarkerColumnSubmitted: {
    width: '100%',
  },
  timelineCircle: {
    width: scaleWidth(30),
    height: scaleWidth(30),
    borderRadius: scaleWidth(15),
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineCircleSubmitted: {
    width: scaleWidth(46),
    height: scaleWidth(46),
    borderRadius: scaleWidth(23),
  },
  timelineCircleDone: {
    backgroundColor: THEME_BLUE,
    borderColor: THEME_BLUE,
  },
  timelineCircleActive: {
    backgroundColor: '#FFFFFF',
    borderColor: THEME_BLUE,
    shadowColor: THEME_BLUE,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  timelineCirclePending: {
    backgroundColor: '#FFFFFF',
    borderColor: '#A6B7CB',
  },
  timelineConnector: {
    width: 2,
    flex: 1,
    marginTop: 6,
    marginBottom: 2,
    borderRadius: 999,
    backgroundColor: '#D8E2EE',
  },
  timelineConnectorSubmitted: {
    flex: 0,
    height: scaleHeight(42),
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 18,
    paddingLeft: 8,
  },
  timelineContentSubmitted: {
    alignItems: 'center',
    paddingLeft: 0,
    paddingBottom: 22,
  },
  timelineTitle: {
    color: THEME_BLUE,
    fontSize: scaleFont(14.2),
    fontWeight: '800',
  },
  timelineTitleSubmitted: {
    marginTop: scaleHeight(6),
  },
  timelineTitlePending: {
    color: '#95A6B9',
  },
  timelineDetail: {
    marginTop: 3,
    color: '#70859D',
    fontSize: scaleFont(11.5),
    lineHeight: scaleFont(15.5),
  },
});
