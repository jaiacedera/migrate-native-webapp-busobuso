import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import {
    collection,
    doc,
    getDoc,
    onSnapshot,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    BackHandler,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import HazardMap from '../../components/maps/HazardMap';
import { responsiveInset, scaleFont, scaleHeight, scaleWidth, screen } from '../../constants/responsive';
import { auth, db } from '../../services/firebaseconfig';
import { sendChatbotMessage } from '../../services/openaiChatService';
const THEME_BLUE = '#274C77';
const BG_COLOR = '#F0F4F8';

type AlertItem = {
  id: string;
  level: string;
  message: string;
  timestamp: Date | null;
  priority?: number;
  source: 'alerts' | 'activeAlerts';
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type FirestoreDateLike = {
  toDate: () => Date;
};

type AlertsSnapshot = {
  docs: {
    id: string;
    data: () => {
      level?: string;
      severity?: string;
      type?: string;
      title?: string;
      alertMessage?: string;
      message?: string;
      timestamp?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
      isActive?: boolean;
      priority?: number | string;
    };
  }[];
};

type EvacuationSnapshot = {
  docs: {
    id: string;
    data: () => Record<string, unknown>;
  }[];
};

type EvacuationCenterItem = {
  id: string;
  name: string;
  legend: string;
  latitude: number;
  longitude: number;
  distanceMultiplier: number;
};

type CenterWithDistance = EvacuationCenterItem & {
  distanceKm: number | null;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type LocationSource = 'device' | 'profile';

const isLocationUnavailableError = (error: unknown): boolean => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message)
      : '';

  return (
    code === 'E_LOCATION_UNAVAILABLE' ||
    message.toLowerCase().includes('current location is unavailable')
  );
};

const toCoordinates = (
  location: Pick<Location.LocationObject, 'coords'> | Location.LocationObject | null
): Coordinates | null => {
  if (!location) {
    return null;
  }

  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  };
};

const fetchBestAvailableDeviceCoords = async (): Promise<Coordinates | null> => {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const hasServicesEnabled = await Location.hasServicesEnabledAsync();
  if (!hasServicesEnabled) {
    const lastKnown = await Location.getLastKnownPositionAsync();
    return toCoordinates(lastKnown);
  }

  try {
    const currentPosition = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return toCoordinates(currentPosition);
  } catch (error) {
    if (!isLocationUnavailableError(error)) {
      throw error;
    }

    const lastKnown = await Location.getLastKnownPositionAsync();
    return toCoordinates(lastKnown);
  }
};

const CSV_FALLBACK_CENTERS: EvacuationCenterItem[] = [
  {
    id: 'pickup-brgy-hall-busobuso',
    legend: 'Pickup Point',
    name: 'Brgy Hall BusoBuso',
    latitude: 14.024067,
    longitude: 120.947874,
    distanceMultiplier: 1,
  },
  {
    id: 'evac-cpf-san-gabriel-elementary-school',
    legend: 'Evacuation Center',
    name: 'CPF San Gabriel Elementary School',
    latitude: 14.048929,
    longitude: 120.916125,
    distanceMultiplier: 1,
  },
  {
    id: 'evac-cpf-ticub-elementary-school',
    legend: 'Evacuation Center',
    name: 'CPF Ticub Elementary School',
    latitude: 14.031257,
    longitude: 120.910508,
    distanceMultiplier: 1,
  },
  {
    id: 'evac-cpf-san-gregorio-integrated-school',
    legend: 'Evacuation Center',
    name: 'CPF San Gregorio Integrated School',
    latitude: 14.0293692,
    longitude: 120.8847892,
    distanceMultiplier: 1,
  },
  {
    id: 'evac-cpf-as-is-evacuation-center',
    legend: 'Evacuation Center',
    name: 'CPF As-is Evacuation Center',
    latitude: 14.05566,
    longitude: 120.920008,
    distanceMultiplier: 1,
  },
];

function mergeCentersWithDefaults(adminCenters: EvacuationCenterItem[]): EvacuationCenterItem[] {
  const normalizedAdmin = new Map(
    adminCenters.map((center) => [center.name.trim().toLowerCase(), center] as const)
  );

  const mergedDefaults = CSV_FALLBACK_CENTERS.map((center) => {
    const override = normalizedAdmin.get(center.name.trim().toLowerCase());
    return override ?? center;
  });

  const defaultNames = new Set(mergedDefaults.map((center) => center.name.trim().toLowerCase()));
  const extraAdminCenters = adminCenters.filter((center) => !defaultNames.has(center.name.trim().toLowerCase()));

  return [...mergedDefaults, ...extraAdminCenters];
}

async function fetchRoadDistanceKm(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number
): Promise<number | null> {
  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${fromLongitude},${fromLatitude};${toLongitude},${toLatitude}?overview=false&alternatives=false&steps=false`
    );

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as {
      routes?: {
        distance?: number;
      }[];
    };

    const meters = json.routes?.[0]?.distance;
    if (typeof meters !== 'number' || Number.isNaN(meters)) {
      return null;
    }

    return meters / 1000;
  } catch {
    return null;
  }
}

function formatDistance(km: number | null): string {
  if (km === null) {
    return 'Distance unavailable';
  }
  return `${km.toFixed(1)} km away`;
}

const formatRelativeTime = (date: Date | null): string => {
  if (!date) {
    return 'Unknown time';
  }

  const diffMs = Date.now() - date.getTime();
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) {
    return 'Just now';
  }
  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.floor(diffMs / minuteMs));
    return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
  }
  if (diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs);
    return `${hours} hr${hours > 1 ? 's' : ''} ago`;
  }
  const days = Math.floor(diffMs / dayMs);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

const getLevelColor = (level: string): string => {
  const normalizedLevel = level.toLowerCase();
  if (normalizedLevel.includes('critical')) return 'red';
  if (normalizedLevel.includes('high')) return 'orange';
  if (normalizedLevel.includes('emergency')) return 'orange';
  if (normalizedLevel.includes('caution')) return '#e6db00';
  return THEME_BLUE;
};

const buildAlertMessage = ({
  title,
  message,
  alertMessage,
}: {
  title?: string;
  message?: string;
  alertMessage?: string;
}): string => {
  const headline = title?.trim();
  const details = (alertMessage ?? message)?.trim();

  if (headline && details && headline.toLowerCase() !== details.toLowerCase()) {
    return `${headline}: ${details}`;
  }

  return details ?? headline ?? 'No alert message provided.';
};

const parseAlertPriority = (value: number | string | undefined): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : undefined;
  }

  return undefined;
};

const sortAlerts = (first: AlertItem, second: AlertItem): number => {
  const firstPriority = first.priority ?? Number.MAX_SAFE_INTEGER;
  const secondPriority = second.priority ?? Number.MAX_SAFE_INTEGER;

  if (firstPriority !== secondPriority) {
    return firstPriority - secondPriority;
  }

  const firstMs = first.timestamp?.getTime() ?? 0;
  const secondMs = second.timestamp?.getTime() ?? 0;
  return secondMs - firstMs;
};

const toDateValue = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object') {
    const timestampLike = value as FirestoreDateLike & {
      seconds?: number;
      nanoseconds?: number;
    };

    if (typeof timestampLike.toDate === 'function') {
      const parsedDate = timestampLike.toDate();
      return parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
    }

    if (typeof timestampLike.seconds === 'number') {
      const milliseconds = timestampLike.seconds * 1000;
      const nanos = typeof timestampLike.nanoseconds === 'number'
        ? Math.floor(timestampLike.nanoseconds / 1_000_000)
        : 0;

      return new Date(milliseconds + nanos);
    }
  }

  return null;
};

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  // Modal states
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [chatbotVisible, setChatbotVisible] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [evacuationCenters, setEvacuationCenters] = useState<EvacuationCenterItem[]>(CSV_FALLBACK_CENTERS);
  const [deviceCoords, setDeviceCoords] = useState<Coordinates | null>(null);
  const [profileCoords, setProfileCoords] = useState<Coordinates | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource>('device');
  const [locationPreferenceVisible, setLocationPreferenceVisible] = useState(false);
  const [roadDistanceByCenterId, setRoadDistanceByCenterId] = useState<Record<string, number>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'assistant-welcome',
      role: 'assistant',
      text: 'How can I help you today?',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatSending, setIsChatSending] = useState(false);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      return true; // Prevent back navigation
    });

    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const bestCoords = await fetchBestAvailableDeviceCoords();
        if (bestCoords) {
          setDeviceCoords(bestCoords);
        }
      } catch (error) {
        console.warn('Unable to resolve device location for evacuation centers. Using profile/default fallback.', error);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        return;
      }

      try {
        const profileRef = doc(db, 'residents', currentUser.uid);
        const profileSnapshot = await getDoc(profileRef);
        const profileData = profileSnapshot.data() as { location?: unknown } | undefined;
        const location = profileData?.location as { latitude?: unknown; longitude?: unknown } | undefined;

        const latitude = Number(location?.latitude);
        const longitude = Number(location?.longitude);

        if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
          setProfileCoords({ latitude, longitude });
        }
      } catch (error) {
        console.error('Failed to fetch saved user-form location:', error);
      }
    })();
  }, []);

  const handleSelectLocationSource = (source: LocationSource) => {
    setLocationSource(source);
    setLocationPreferenceVisible(false);
  };

  const referenceCoords =
    locationSource === 'profile'
      ? profileCoords ?? deviceCoords
      : deviceCoords ?? profileCoords;

  useEffect(() => {
    if (!referenceCoords || evacuationCenters.length === 0) {
      setRoadDistanceByCenterId({});
      return;
    }

    let isActive = true;

    (async () => {
      const pairs = await Promise.all(
        evacuationCenters.map(async (center) => {
          const baseKm = await fetchRoadDistanceKm(
            referenceCoords.latitude,
            referenceCoords.longitude,
            center.latitude,
            center.longitude
          );

          if (baseKm === null) {
            return null;
          }

          const km = baseKm * center.distanceMultiplier;

          return [center.id, km] as const;
        })
      );

      if (!isActive) {
        return;
      }

      const nextRoadDistances: Record<string, number> = {};
      pairs.forEach((pair) => {
        if (!pair) {
          return;
        }

        nextRoadDistances[pair[0]] = pair[1];
      });

      setRoadDistanceByCenterId(nextRoadDistances);
    })();

    return () => {
      isActive = false;
    };
  }, [evacuationCenters, referenceCoords]);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setEvacuationCenters(CSV_FALLBACK_CENTERS);
      return;
    }

    const evacuationRef = collection(db, 'evacuationCenters');

    const unsubscribe = onSnapshot(
      evacuationRef,
      (snapshot: EvacuationSnapshot) => {
        const nextCenters: EvacuationCenterItem[] = [];

        snapshot.docs.forEach((document: { id: string; data: () => Record<string, unknown> }) => {
            const data = document.data();
            const name = (data.place ?? data.name ?? '').toString().trim();
            const legend = (data.legend ?? 'Evacuation Center').toString();
            const latitude = Number(data.latitude);
            const longitude = Number(data.longitude);
            const distanceMultiplier = Number(data.distanceMultiplier);

            if (!name || Number.isNaN(latitude) || Number.isNaN(longitude)) {
              return;
            }

            nextCenters.push({
              id: document.id,
              name,
              legend,
              latitude,
              longitude,
              distanceMultiplier:
                Number.isFinite(distanceMultiplier) && distanceMultiplier > 0
                  ? distanceMultiplier
                  : 1,
            });
          });

        if (nextCenters.length > 0) {
          setEvacuationCenters(mergeCentersWithDefaults(nextCenters));
        } else {
          setEvacuationCenters(CSV_FALLBACK_CENTERS);
        }
      },
      (error: unknown) => {
        const firebaseCode =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code?: unknown }).code)
            : '';

        if (firebaseCode === 'permission-denied') {
          console.warn('Evacuation centers are not readable with current Firestore rules. Showing defaults.');
        } else {
          console.error('Failed to fetch evacuation centers:', error);
        }

        setEvacuationCenters(CSV_FALLBACK_CENTERS);
      }
    );

    return unsubscribe;
  }, []);

  const nearbyEvacuationCenters = useMemo(() => {
    const withDistance: CenterWithDistance[] = evacuationCenters.map((center) => {
      const hasReference = referenceCoords !== null;
      const km = hasReference ? roadDistanceByCenterId[center.id] ?? null : null;

      return {
        ...center,
        distanceKm: km,
      };
    });

    return withDistance
      .sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return 0;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      })
      .slice(0, 5);
  }, [evacuationCenters, referenceCoords, roadDistanceByCenterId]);

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setAlerts([]);
      return;
    }

    const alertsRef = collection(db, 'alerts');
    const activeAlertsRef = collection(db, 'activeAlerts');
    let latestAlerts: AlertItem[] = [];
    let latestActiveAlerts: AlertItem[] = [];

    const updateAlerts = () => {
      const twoDaysMs = 2 * 24 * 60 * 60 * 1000;
      const nowMs = Date.now();

      const mergedAlerts = [...latestActiveAlerts, ...latestAlerts]
        .filter((alert) => {
          if (alert.source === 'activeAlerts') {
            return true;
          }

          if (!alert.timestamp) {
            return false;
          }

          return nowMs - alert.timestamp.getTime() <= twoDaysMs;
        })
        .sort(sortAlerts)
        .slice(0, 3);

      setAlerts(mergedAlerts);
    };

    const unsubscribeAlerts = onSnapshot(
      alertsRef,
      (snapshot: AlertsSnapshot) => {
        latestAlerts = snapshot.docs
          .map((document) => {
            const data = document.data();
            const timestamp = toDateValue(data.timestamp) ?? toDateValue(data.createdAt);

            return {
              id: document.id,
              level: (data.level ?? 'ADVISORY').toString(),
              message: buildAlertMessage(data),
              timestamp,
              source: 'alerts' as const,
            };
          })
          .filter((alert: AlertItem) => alert.timestamp !== null);

        updateAlerts();
      },
      (error: unknown) => {
        console.error('Failed to fetch alerts:', error);
        latestAlerts = [];
        updateAlerts();
      }
    );

    const unsubscribeActiveAlerts = onSnapshot(
      activeAlertsRef,
      (snapshot: AlertsSnapshot) => {
        latestActiveAlerts = snapshot.docs.reduce<AlertItem[]>((items, document) => {
            const data = document.data();

            if (data.isActive === false) {
              return items;
            }

            const timestamp =
              toDateValue(data.updatedAt) ??
              toDateValue(data.timestamp) ??
              toDateValue(data.createdAt);

            items.push({
              id: `active-${document.id}`,
              level: (data.severity ?? data.level ?? data.type ?? 'ADVISORY').toString(),
              message: buildAlertMessage(data),
              timestamp,
              priority: parseAlertPriority(data.priority),
              source: 'activeAlerts' as const,
            });

            return items;
          }, []);

        updateAlerts();
      },
      (error: unknown) => {
        console.error('Failed to fetch active alerts:', error);
        latestActiveAlerts = [];
        updateAlerts();
      }
    );

    return () => {
      unsubscribeAlerts();
      unsubscribeActiveAlerts();
    };
  }, []);

  const handleSendChat = async () => {
    const trimmedInput = chatInput.trim();

    if (!trimmedInput || isChatSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmedInput,
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    setIsChatSending(true);

    try {
      const assistantReply = await sendChatbotMessage(trimmedInput);

      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: assistantReply,
        },
      ]);
    } catch (error) {
      console.error('Chatbot request failed:', error);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          text: 'Sorry, I could not get a response right now. Please try again.',
        },
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.container}>
        
        {/* APP BAR */}
        <View style={styles.appBar}>
          <View style={styles.appBarLeft}>
            <Image 
              source={require('../../assets/images/busobuso_logo.png')} 
              style={styles.logoImage} 
              resizeMode="contain"
            />
            <Text style={styles.appBarTitle}>Dashboard</Text>
          </View>
          <TouchableOpacity onPress={() => {}}>
            <MaterialIcons name="search" size={28} color={THEME_BLUE} />
          </TouchableOpacity>
        </View>

        {/* MAIN CONTENT AREA */}
        <View style={styles.body}>
          <HomeContent
            alerts={alerts}
            evacuationCenters={nearbyEvacuationCenters}
            referenceCoords={referenceCoords}
            locationSource={locationSource}
            onChangeLocationSourcePress={() => setLocationPreferenceVisible(true)}
          />
          
          {/* CHATBOT FLOATING BUTTON */}
          <TouchableOpacity 
            style={[styles.chatbotFab, { bottom: scaleHeight(68) + insets.bottom }]} 
            onPress={() => setChatbotVisible(true)}
            activeOpacity={0.8}
          >
            <Image 
              source={require('../../assets/images/pyro_logo.png')} 
              style={styles.chatbotImage} 
              resizeMode="contain"
            />
          </TouchableOpacity>
        </View>

        {/* CUSTOM BOTTOM NAVIGATION */}
        <View style={[styles.bottomNavContainer, { height: scaleHeight(70) + insets.bottom }]}>
          <View style={[styles.bottomNav, { height: scaleHeight(70), paddingBottom: insets.bottom }]}>
            <TouchableOpacity 
              style={styles.navItem} 
              onPress={() => router.replace('/mobile-ui/dashboard')}
            >
              <MaterialIcons 
                name="home" 
                size={30} 
                color="white" 
              />
            </TouchableOpacity>

            {/* Empty space for FAB cutout */}
            <View style={styles.navItemSpace} />

            <TouchableOpacity 
              style={styles.navItem} 
              onPress={() => router.replace('/mobile-ui/profile-screen')}
            >
              <MaterialIcons 
                name="person-outline" 
                size={30} 
                color="rgba(255,255,255,0.54)" 
              />
            </TouchableOpacity>
          </View>

          {/* CENTER FAB BUTTON */}
          <TouchableOpacity
            style={styles.centerFab}
            activeOpacity={0.9}
            onPress={() => setActionMenuVisible(true)}
          >
            <MaterialIcons name="add" size={35} color="white" />
          </TouchableOpacity>
        </View>

        {/* --- MODALS --- */}

        {/* 1. Action Menu Modal */}
        <Modal visible={actionMenuVisible} transparent animationType="none">
          <TouchableOpacity 
            style={styles.modalOverlay} 
            activeOpacity={1} 
            onPress={() => setActionMenuVisible(false)}
          >
            <View style={styles.actionMenuContainer}>
              <View style={styles.menuHandle} />
              
              <TouchableOpacity 
                style={styles.menuItem} 
                onPress={() => {
                  setActionMenuVisible(false);
                  router.push('/mobile-ui/reports-screen');
                }}
              >
                <MaterialIcons name="report-problem" size={24} color="red" />
                <Text style={styles.menuItemText}>Make an Incident Report</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* 2. Location Source Modal */}
        <Modal visible={locationPreferenceVisible} transparent animationType="fade">
          <View style={styles.preferenceOverlay}>
            <View style={styles.preferenceCard}>
              <Text style={styles.preferenceTitle}>Use Which Location?</Text>
              <Text style={styles.preferenceSubtitle}>
                Choose which location the hazard map and nearby distances will use.
              </Text>

              <TouchableOpacity
                style={[
                  styles.preferenceOption,
                  !deviceCoords && styles.preferenceOptionDisabled,
                  locationSource === 'device' && deviceCoords && styles.preferenceOptionSelected,
                ]}
                onPress={() => handleSelectLocationSource('device')}
                disabled={!deviceCoords}
              >
                <Text style={styles.preferenceOptionTitle}>Current device location</Text>
                <Text style={styles.preferenceOptionCaption}>
                  {deviceCoords ? 'Live GPS from this phone' : 'Unavailable right now'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.preferenceOption,
                  !profileCoords && styles.preferenceOptionDisabled,
                  locationSource === 'profile' && profileCoords && styles.preferenceOptionSelected,
                ]}
                onPress={() => handleSelectLocationSource('profile')}
                disabled={!profileCoords}
              >
                <Text style={styles.preferenceOptionTitle}>Saved user-form location</Text>
                <Text style={styles.preferenceOptionCaption}>
                  {profileCoords ? 'Pinned location from your user form' : 'No saved pinned location yet'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.preferenceCloseButton}
                onPress={() => setLocationPreferenceVisible(false)}
              >
                <Text style={styles.preferenceCloseText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 3. Chatbot Modal */}
        <Modal visible={chatbotVisible} transparent animationType="slide">
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <TouchableOpacity 
              style={{ flex: 1, width: '100%' }} 
              activeOpacity={1} 
              onPress={() => setChatbotVisible(false)} 
            />
            
            <View style={styles.chatbotContainer}>
              <View style={styles.menuHandle} />
              <Text style={styles.chatbotTitle}>Pyro Assistant</Text>
              <View style={styles.divider} />
              
              <View style={styles.chatbotBody}>
                <ScrollView
                  style={styles.chatMessagesScroll}
                  contentContainerStyle={styles.chatMessagesContent}
                  showsVerticalScrollIndicator={false}
                >
                  {chatMessages.map((message) => (
                    <View
                      key={message.id}
                      style={[
                        styles.chatBubble,
                        message.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chatBubbleText,
                          message.role === 'user' ? styles.chatBubbleTextUser : styles.chatBubbleTextAssistant,
                        ]}
                      >
                        {message.text}
                      </Text>
                    </View>
                  ))}

                  {isChatSending && (
                    <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
                      <ActivityIndicator size="small" color={THEME_BLUE} />
                    </View>
                  )}
                </ScrollView>
              </View>

              <View style={styles.chatbotInputContainer}>
                <TextInput 
                  style={styles.chatbotInput} 
                  placeholder="Type a message..."
                  placeholderTextColor="grey"
                  value={chatInput}
                  onChangeText={setChatInput}
                  onSubmitEditing={handleSendChat}
                  editable={!isChatSending}
                />
                <TouchableOpacity
                  style={styles.sendButton}
                  onPress={handleSendChat}
                  disabled={isChatSending || !chatInput.trim()}
                >
                  <MaterialIcons name="send" size={24} color={THEME_BLUE} />
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </View>
    </SafeAreaView>
  );
}

// --- HOME CONTENT COMPONENT ---
const HomeContent = ({
  alerts,
  evacuationCenters,
  referenceCoords,
  locationSource,
  onChangeLocationSourcePress,
}: {
  alerts: AlertItem[];
  evacuationCenters: CenterWithDistance[];
  referenceCoords: Coordinates | null;
  locationSource: LocationSource;
  onChangeLocationSourcePress: () => void;
}) => {
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);

  return (
    <ScrollView contentContainerStyle={styles.homeScrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionTitle}>Emergency News & Updates</Text>

      {alerts.length > 0 ? (
        alerts.map((alert) => (
          <NewsCard
            key={alert.id}
            tag={alert.level}
            tagColor={getLevelColor(alert.level)}
            title={alert.message}
            time={formatRelativeTime(alert.timestamp)}
          />
        ))
      ) : (
        <View style={styles.emptyNewsCard}>
          <Text style={styles.emptyNewsText}>No emergency alerts available right now.</Text>
        </View>
      )}

      <View style={{ height: scaleHeight(22) }} />
      <Text style={styles.sectionTitle}>Hazard Map</Text>
      <MapSection
        centers={evacuationCenters}
        referenceCoords={referenceCoords}
        locationSource={locationSource}
        selectedCenterId={selectedCenterId}
        onChangeLocationSourcePress={onChangeLocationSourcePress}
      />

      <View style={{ height: scaleHeight(22) }} />
      <Text style={styles.sectionTitle}>Nearby Evacuation Centers</Text>
      {evacuationCenters.map((center, index) => (
        <EvacuationCard
          key={center.id}
          name={`${index + 1}. ${center.name}`}
          distance={formatDistance(center.distanceKm)}
          legend={center.legend}
          onPress={() => setSelectedCenterId(center.id)}
        />
      ))}
      {evacuationCenters.length === 0 && (
        <View style={styles.emptyNewsCard}>
          <Text style={styles.emptyNewsText}>No evacuation centers available right now.</Text>
        </View>
      )}
      
      {/* Keep a small buffer above bottom nav */}
      <View style={{ height: scaleHeight(24) }} /> 
    </ScrollView>
  );
};

// --- REUSABLE UI COMPONENTS ---
const NewsCard = ({ tag, tagColor, title, time }: { tag: string, tagColor: string, title: string, time: string }) => (
  <View style={styles.newsCard}>
    <View style={styles.tagWrapper}>
      <View style={[styles.tag, { backgroundColor: tagColor }]}>
        <Text style={styles.tagText}>{tag}</Text>
      </View>
    </View>
    <Text style={styles.newsTitle}>{title}</Text>
    <Text style={styles.newsTime}>{time}</Text>
  </View>
);

const MapSection = ({
  centers,
  referenceCoords,
  locationSource,
  selectedCenterId,
  onChangeLocationSourcePress,
}: {
  centers: CenterWithDistance[];
  referenceCoords: Coordinates | null;
  locationSource: LocationSource;
  selectedCenterId: string | null;
  onChangeLocationSourcePress: () => void;
}) => {
  const sourceLabel = locationSource === 'profile' ? 'Saved form location' : 'Device location';

  return (
    <View style={styles.mapCard}>
      <HazardMap
        centers={centers}
        referenceCoords={referenceCoords}
        selectedCenterId={selectedCenterId}
        style={styles.mapWebView}
        scrollEnabled={false}
      />
      <View style={styles.mapButton}>
        <MaterialIcons name="place" size={18} color={THEME_BLUE} />
        <Text style={styles.mapButtonText}>{centers.length} evacuation center(s) plotted • {sourceLabel}</Text>
        <TouchableOpacity style={styles.mapSourceButton} onPress={onChangeLocationSourcePress}>
          <Text style={styles.mapSourceButtonText}>Change source</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const EvacuationCard = ({
  name,
  distance,
  legend,
  onPress,
}: {
  name: string;
  distance: string;
  legend: string;
  onPress: () => void;
}) => (
  <TouchableOpacity style={styles.evacCard} activeOpacity={0.9} onPress={onPress}>
    <View style={styles.evacInfo}>
      <Text style={styles.evacLegend}>{legend}</Text>
      <Text style={styles.evacName}>{name}</Text>
    </View>
    <View style={styles.evacDistanceRow}>
      <MaterialIcons name="directions-walk" size={18} color="green" />
      <Text style={styles.evacDistanceText}>{distance}</Text>
    </View>
  </TouchableOpacity>
);

// --- STYLES ---
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'white', // Matches AppBar
  },
  container: {
    flex: 1,
    backgroundColor: BG_COLOR,
  },
  // App Bar
  appBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: responsiveInset.card,
    paddingVertical: 10,
    elevation: 2, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    zIndex: 10,
  },
  appBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoImage: {
    width: scaleWidth(34),
    height: scaleWidth(34),
    marginRight: 10,
  },
  appBarTitle: {
    color: THEME_BLUE,
    fontWeight: 'bold',
    fontSize: scaleFont(22),
  },
  // Body Layout
  body: {
    flex: 1,
    position: 'relative',
  },
  homeScrollContent: {
    flexGrow: 1,
    paddingHorizontal: responsiveInset.horizontal,
    paddingTop: 10,
    paddingBottom: scaleHeight(100),
  },
  sectionTitle: {
    fontSize: scaleFont(16),
    fontWeight: 'bold',
    color: THEME_BLUE,
    marginBottom: 12,
  },
  // Chatbot Button
  chatbotFab: {
    position: 'absolute',
    bottom: scaleHeight(68),
    right: responsiveInset.horizontal,
    width: scaleWidth(62),
    height: scaleWidth(62),
    zIndex: 100,
  },
  chatbotImage: {
    // Adjust chatbot image size/placement here (height, width, and position offsets)
    width: '100%',
    height: '100%',
  },
  // Bottom Nav
  bottomNavContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: scaleHeight(70),
    justifyContent: 'flex-end',
  },
  bottomNav: {
    backgroundColor: THEME_BLUE,
    height: scaleHeight(70),
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  navItemSpace: {
    flex: 0.5, // Creates the gap for the FAB
  },
  centerFab: {
    position: 'absolute',
    alignSelf: 'center',
    top: -scaleHeight(20), // Elevates the FAB above the nav bar
    backgroundColor: THEME_BLUE,
    width: scaleWidth(64),
    height: scaleWidth(64),
    borderRadius: scaleWidth(32),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 5,
    borderColor: BG_COLOR, // Fakes the notch cutout effect
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  // Modals
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  preferenceOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: responsiveInset.horizontal,
  },
  preferenceCard: {
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 16,
  },
  preferenceTitle: {
    fontSize: scaleFont(18),
    fontWeight: '700',
    color: THEME_BLUE,
  },
  preferenceSubtitle: {
    marginTop: 6,
    marginBottom: 14,
    fontSize: scaleFont(13),
    color: '#4B5563',
  },
  preferenceOption: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  preferenceOptionSelected: {
    borderColor: THEME_BLUE,
    backgroundColor: '#EEF4FB',
  },
  preferenceOptionDisabled: {
    opacity: 0.55,
  },
  preferenceOptionTitle: {
    fontSize: scaleFont(14),
    fontWeight: '700',
    color: '#111827',
  },
  preferenceOptionCaption: {
    marginTop: 3,
    fontSize: scaleFont(12),
    color: '#6B7280',
  },
  preferenceCloseButton: {
    marginTop: 6,
    backgroundColor: THEME_BLUE,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  preferenceCloseText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  menuHandle: {
    width: 40,
    height: 5,
    backgroundColor: '#E0E0E0',
    borderRadius: 5,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  actionMenuContainer: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 20,
    paddingBottom: 20,
    elevation: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
  },
  menuItemText: {
    fontWeight: 'bold',
    marginLeft: 15,
    fontSize: scaleFont(16),
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEEEEE',
  },
  chatbotContainer: {
    backgroundColor: 'white',
    height: '70%',
    minHeight: scaleHeight(320),
    maxHeight: scaleHeight(560),
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  chatbotTitle: {
    color: THEME_BLUE,
    fontWeight: 'bold',
    fontSize: scaleFont(18),
    padding: 20,
    paddingTop: 10,
  },
  chatbotBody: {
    flex: 1,
    paddingHorizontal: 12,
  },
  chatMessagesScroll: {
    flex: 1,
    width: '100%',
  },
  chatMessagesContent: {
    paddingVertical: 10,
  },
  chatBubble: {
    maxWidth: '85%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: THEME_BLUE,
  },
  chatBubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8EEF5',
  },
  chatBubbleText: {
    fontSize: scaleFont(14),
  },
  chatBubbleTextUser: {
    color: 'white',
  },
  chatBubbleTextAssistant: {
    color: '#1F2937',
  },
  chatbotInputContainer: {
    flexDirection: 'row',
    padding: 20,
    alignItems: 'center',
  },
  chatbotInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginRight: 10,
    color: 'black',
  },
  sendButton: {
    padding: 10,
  },
  // Cards
  newsCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 15,
    marginBottom: 12,
  },
  tagWrapper: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  tagText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  newsTitle: {
    fontWeight: 'bold',
    fontSize: scaleFont(14),
    color: THEME_BLUE,
    marginBottom: 8,
  },
  newsTime: {
    alignSelf: 'flex-end',
    color: 'grey',
    fontSize: scaleFont(11),
  },
  emptyNewsCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 15,
    marginBottom: 12,
  },
  emptyNewsText: {
    color: '#666',
    fontSize: scaleFont(13),
  },
  mapCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    overflow: 'hidden',
  },
  mapWebView: {
    width: '100%',
    height: Math.max(scaleHeight(200), screen.isSmallPhone ? 185 : 200),
    backgroundColor: '#FFFFFF',
  },
  mapButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
  },
  mapButtonText: {
    color: THEME_BLUE,
    fontWeight: 'bold',
    fontSize: scaleFont(13),
    marginLeft: 8,
  },
  mapSourceButton: {
    marginLeft: 10,
    borderWidth: 1,
    borderColor: THEME_BLUE,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mapSourceButtonText: {
    color: THEME_BLUE,
    fontSize: scaleFont(11),
    fontWeight: '700',
  },
  evacCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 15,
    paddingHorizontal: responsiveInset.card,
    paddingVertical: 15,
    marginBottom: 10,
  },
  evacName: {
    fontWeight: 'bold',
    color: THEME_BLUE,
    flex: 1,
  },
  evacInfo: {
    flex: 1,
    marginRight: 12,
  },
  evacLegend: {
    color: '#6B7280',
    fontSize: scaleFont(11),
    marginBottom: 3,
    fontWeight: '600',
  },
  evacDistanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  evacDistanceText: {
    color: 'grey',
    fontSize: scaleFont(12),
    marginLeft: 4,
  },
});
