import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { responsiveInset, scaleFont, scaleHeight, scaleWidth } from '../../constants/responsive';
import { auth, db } from '../../services/firebaseconfig';
import {
  DistressReportDoc,
  getTrackerStageLabel,
  toDateValue,
} from '../../services/reportTracker';

const THEME_BLUE = '#274C77';
const APP_BAR_TOP = Math.max(scaleHeight(12), (StatusBar.currentHeight ?? 0) + scaleHeight(6));

type TrackedReport = {
  id: string;
  reportId: string;
  report: string;
  status: string;
  createdAtText: string;
  createdAtMillis: number;
  rawData: DistressReportDoc;
};

type DistressReportSnapshot = {
  docs: {
    id: string;
    data: () => DistressReportDoc;
  }[];
};

const ReportTrackerScreen = () => {
  const router = useRouter();
  const [reports, setReports] = useState<TrackedReport[]>([]);
  const [searchText, setSearchText] = useState('');
  const [isLoadingReports, setIsLoadingReports] = useState(true);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setReports([]);
      setIsLoadingReports(false);
      return;
    }

    const reportsRef = collection(db, 'distressReports');
    const reportsQuery = query(reportsRef, where('uid', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      reportsQuery,
      (snapshot: DistressReportSnapshot) => {
        const mappedReports = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const createdAtDate = toDateValue(data.createdAt);

          return {
            id: docSnap.id,
            reportId: data.reportId ?? 'No Report ID',
            report: data.report ?? '',
            status: data.status ?? 'submitted',
            createdAtText: createdAtDate ? createdAtDate.toLocaleDateString() : 'No date',
            createdAtMillis: createdAtDate?.getTime() ?? 0,
            rawData: data,
          };
        });

        mappedReports.sort((a, b) => b.createdAtMillis - a.createdAtMillis);
        setReports(mappedReports);
        setIsLoadingReports(false);
      },
      (error: unknown) => {
        console.error('Failed to load reports:', error);
        setReports([]);
        setIsLoadingReports(false);
      }
    );

    return unsubscribe;
  }, []);

  const filteredReports = reports.filter((item) => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) {
      return true;
    }

    return (
      item.reportId.toLowerCase().includes(keyword) ||
      item.report.toLowerCase().includes(keyword) ||
      item.status.toLowerCase().includes(keyword) ||
      item.createdAtText.toLowerCase().includes(keyword)
    );
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={THEME_BLUE} />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Report Tracking</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Report Tracking</Text>

          <TextInput
            style={styles.searchInput}
            placeholder="Search your reports"
            placeholderTextColor="#94A3B8"
            value={searchText}
            onChangeText={setSearchText}
          />

          {isLoadingReports ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={THEME_BLUE} />
              <Text style={styles.loadingText}>Loading reports...</Text>
            </View>
          ) : filteredReports.length === 0 ? (
            <Text style={styles.placeholderText}>No matching reports found.</Text>
          ) : (
            filteredReports.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.88}
                style={styles.reportCard}
                onPress={() =>
                  router.push({
                    pathname: '/mobile-ui/report-tracker-detail' as never,
                    params: {
                      reportDocId: item.id,
                      reportId: item.reportId,
                    },
                  })
                }
              >
                <View style={styles.reportTopRow}>
                  <Text style={styles.reportIdText}>{item.reportId}</Text>
                  <Text style={styles.reportStatusText}>{getTrackerStageLabel(item.rawData)}</Text>
                </View>
                <Text style={styles.reportDateText}>{item.createdAtText}</Text>
                <Text style={styles.reportBodyText} numberOfLines={2}>
                  {item.report || 'No report details'}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default ReportTrackerScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
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
    marginLeft: scaleWidth(12),
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: responsiveInset.horizontal,
    paddingTop: 10,
    paddingBottom: scaleHeight(24),
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: responsiveInset.card,
  },
  sectionTitle: {
    color: THEME_BLUE,
    fontWeight: 'bold',
    fontSize: scaleFont(16),
    marginBottom: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#1F2937',
    marginBottom: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: '#64748B',
  },
  reportCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#F8FAFC',
  },
  reportTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportIdText: {
    color: THEME_BLUE,
    fontWeight: '700',
    fontSize: scaleFont(13),
  },
  reportStatusText: {
    color: '#475569',
    fontSize: scaleFont(12),
  },
  reportDateText: {
    color: '#64748B',
    fontSize: scaleFont(12),
    marginTop: 4,
  },
  reportBodyText: {
    color: '#334155',
    fontSize: scaleFont(13),
    marginTop: 6,
  },
  placeholderText: {
    color: '#64748B',
    fontStyle: 'italic',
  },
});
