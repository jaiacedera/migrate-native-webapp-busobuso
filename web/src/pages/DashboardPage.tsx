import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logoImage from '../../../assets/images/busobuso_logo.png';
import {
  HazardMap,
  type HazardMapCenter,
  type HazardMapCoordinates,
} from '../components/map/HazardMap';
import { getLocation } from '../services/api';
import { auth, db } from '../services/firebase';
import { toDateValue } from '../services/reportTracker';

type AlertItem = {
  id: string;
  level: string;
  message: string;
  timestamp: Date | null;
  priority?: number;
  source: 'alerts' | 'activeAlerts';
};

type EvacuationCenterItem = HazardMapCenter & {
  distanceMultiplier: number;
};

type CenterWithDistance = HazardMapCenter & {
  distanceKm: number | null;
  distanceMode: 'route' | 'straightLine' | 'unavailable';
  distanceMultiplier: number;
};

type LocationSource = 'device' | 'profile';

const THEME_BLUE = '#274C77';
const EARTH_RADIUS_KM = 6371;
const ROUTING_TIMEOUT_MS = 5000;

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

const mergeCentersWithDefaults = (adminCenters: EvacuationCenterItem[]): EvacuationCenterItem[] => {
  const normalizedAdmin = new Map(
    adminCenters.map((center) => [center.name.trim().toLowerCase(), center] as const)
  );

  const mergedDefaults = CSV_FALLBACK_CENTERS.map((center) => {
    const override = normalizedAdmin.get(center.name.trim().toLowerCase());
    return override ?? center;
  });

  const defaultNames = new Set(mergedDefaults.map((center) => center.name.trim().toLowerCase()));
  const extraAdminCenters = adminCenters.filter(
    (center) => !defaultNames.has(center.name.trim().toLowerCase())
  );

  return [...mergedDefaults, ...extraAdminCenters];
};

const fetchRoadDistanceKm = async (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number
): Promise<number | null> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ROUTING_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${fromLongitude},${fromLatitude};${toLongitude},${toLatitude}?overview=false&alternatives=false&steps=false`,
      {
        signal: controller.signal,
      }
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
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const formatCenterDistance = (center: CenterWithDistance): string => {
  if (center.distanceKm === null) {
    return 'Distance unavailable';
  }

  return center.distanceMode === 'straightLine'
    ? `Approx. ${center.distanceKm.toFixed(1)} km away`
    : `${center.distanceKm.toFixed(1)} km away`;
};

const toRadians = (value: number): number => (value * Math.PI) / 180;

const calculateStraightLineDistanceKm = (
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number
): number => {
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const startLatitude = toRadians(fromLatitude);
  const endLatitude = toRadians(toLatitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
};

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
  if (normalizedLevel.includes('critical')) return '#b42318';
  if (normalizedLevel.includes('high')) return '#c2410c';
  if (normalizedLevel.includes('emergency')) return '#c2410c';
  if (normalizedLevel.includes('caution')) return '#b08a00';
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

const getFirebaseErrorCode = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : '';

const loadBrowserCoordinates = async (): Promise<HazardMapCoordinates | null> => {
  if (!navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [evacuationCenters, setEvacuationCenters] =
    useState<EvacuationCenterItem[]>(CSV_FALLBACK_CENTERS);
  const [deviceCoords, setDeviceCoords] = useState<HazardMapCoordinates | null>(null);
  const [profileCoords, setProfileCoords] = useState<HazardMapCoordinates | null>(null);
  const [locationSource, setLocationSource] = useState<LocationSource>('device');
  const [roadDistanceByCenterId, setRoadDistanceByCenterId] = useState<Record<string, number>>({});
  const [selectedCenterId, setSelectedCenterId] = useState<string | null>(null);
  const [dashboardNotice, setDashboardNotice] = useState('');
  const [alertsNotice, setAlertsNotice] = useState('');

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const browserCoords = await loadBrowserCoordinates();

      if (browserCoords && isMounted) {
        setDeviceCoords(browserCoords);
        return;
      }

      const [longitude, latitude] = await getLocation();
      if (isMounted) {
        setDeviceCoords({ latitude, longitude });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      return;
    }

    void (async () => {
      try {
        const profileRef = doc(db, 'residents', currentUser.uid);
        const profileSnapshot = await getDoc(profileRef);
        const profileData = profileSnapshot.data() as
          | {
              location?: {
                latitude?: unknown;
                longitude?: unknown;
              };
            }
          | undefined;
        const latitude = Number(profileData?.location?.latitude);
        const longitude = Number(profileData?.location?.longitude);

        if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
          setProfileCoords({ latitude, longitude });
        }
      } catch (error) {
        console.error('Failed to fetch saved resident location:', error);
      }
    })();
  }, []);

  const referenceCoords =
    locationSource === 'profile' ? profileCoords ?? deviceCoords : deviceCoords ?? profileCoords;
  const referenceLabel =
    locationSource === 'profile'
      ? profileCoords
        ? 'Saved user-form location'
        : 'Device fallback'
      : deviceCoords
        ? 'Current device location'
        : 'Saved user-form fallback';

  useEffect(() => {
    if (!referenceCoords || evacuationCenters.length === 0) {
      setRoadDistanceByCenterId({});
      return;
    }

    let isActive = true;

    void (async () => {
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

          return [center.id, baseKm * center.distanceMultiplier] as const;
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
    const evacuationRef = collection(db, 'evacuationCenters');

    const unsubscribe = onSnapshot(
      evacuationRef,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const nextCenters: EvacuationCenterItem[] = [];

        snapshot.docs.forEach((document) => {
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
              Number.isFinite(distanceMultiplier) && distanceMultiplier > 0 ? distanceMultiplier : 1,
          });
        });

        if (nextCenters.length > 0) {
          setEvacuationCenters(mergeCentersWithDefaults(nextCenters));
          setDashboardNotice('');
        } else {
          setEvacuationCenters(CSV_FALLBACK_CENTERS);
        }
      },
      (error) => {
        const firebaseCode = getFirebaseErrorCode(error);

        if (firebaseCode === 'permission-denied') {
          setDashboardNotice(
            'Live evacuation centers are blocked by Firestore rules, so the dashboard is showing the built-in fallback list.'
          );
        } else {
          console.error('Failed to fetch evacuation centers:', error);
        }

        setEvacuationCenters(CSV_FALLBACK_CENTERS);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
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
      (snapshot: QuerySnapshot<DocumentData>) => {
        latestAlerts = snapshot.docs
          .map((document) => {
            const data = document.data() as {
              level?: string;
              title?: string;
              message?: string;
              alertMessage?: string;
              timestamp?: unknown;
              createdAt?: unknown;
            };
            const timestamp = toDateValue(data.timestamp) ?? toDateValue(data.createdAt);

            return {
              id: document.id,
              level: (data.level ?? 'ADVISORY').toString(),
              message: buildAlertMessage(data),
              timestamp,
              source: 'alerts' as const,
            };
          })
          .filter((alert) => alert.timestamp !== null) as AlertItem[];

        updateAlerts();
        setAlertsNotice('');
      },
      (error) => {
        console.error('Failed to fetch alerts:', error);
        latestAlerts = [];
        const firebaseCode = getFirebaseErrorCode(error);
        setAlertsNotice(
          firebaseCode === 'permission-denied'
            ? 'Recent alerts are hidden by Firestore rules for this account.'
            : 'Recent alerts could not be loaded right now.'
        );
        updateAlerts();
      }
    );

    const unsubscribeActiveAlerts = onSnapshot(
      activeAlertsRef,
      (snapshot: QuerySnapshot<DocumentData>) => {
        latestActiveAlerts = snapshot.docs.reduce<AlertItem[]>((items, document) => {
          const data = document.data() as {
            severity?: string;
            level?: string;
            type?: string;
            title?: string;
            message?: string;
            alertMessage?: string;
            priority?: string | number;
            timestamp?: unknown;
            createdAt?: unknown;
            updatedAt?: unknown;
            isActive?: boolean;
          };

          if (data.isActive === false) {
            return items;
          }

          const timestamp =
            toDateValue(data.updatedAt) ?? toDateValue(data.timestamp) ?? toDateValue(data.createdAt);

          items.push({
            id: `active-${document.id}`,
            level: (data.severity ?? data.level ?? data.type ?? 'ADVISORY').toString(),
            message: buildAlertMessage(data),
            timestamp,
            priority: parseAlertPriority(data.priority),
            source: 'activeAlerts',
          });

          return items;
        }, []);

        updateAlerts();
        setAlertsNotice('');
      },
      (error) => {
        console.error('Failed to fetch active alerts:', error);
        latestActiveAlerts = [];
        const firebaseCode = getFirebaseErrorCode(error);
        setAlertsNotice(
          firebaseCode === 'permission-denied'
            ? 'Active alerts are hidden by Firestore rules for this account.'
            : 'Active alerts could not be loaded right now.'
        );
        updateAlerts();
      }
    );

    return () => {
      unsubscribeAlerts();
      unsubscribeActiveAlerts();
    };
  }, []);

  const nearbyEvacuationCenters = useMemo<CenterWithDistance[]>(() => {
    return evacuationCenters
      .map((center) => {
        if (!referenceCoords) {
          return {
            ...center,
            distanceKm: null,
            distanceMode: 'unavailable' as const,
          };
        }

        const routeDistance = roadDistanceByCenterId[center.id];
        if (typeof routeDistance === 'number') {
          return {
            ...center,
            distanceKm: routeDistance,
            distanceMode: 'route' as const,
          };
        }

        return {
          ...center,
          distanceKm: calculateStraightLineDistanceKm(
            referenceCoords.latitude,
            referenceCoords.longitude,
            center.latitude,
            center.longitude
          ),
          distanceMode: 'straightLine' as const,
        };
      })
      .sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) return 0;
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      })
      .slice(0, 5);
  }, [evacuationCenters, referenceCoords, roadDistanceByCenterId]);

  useEffect(() => {
    if (nearbyEvacuationCenters.length === 0) {
      setSelectedCenterId(null);
      return;
    }

    setSelectedCenterId((current) =>
      current && nearbyEvacuationCenters.some((center) => center.id === current)
        ? current
        : nearbyEvacuationCenters[0].id
    );
  }, [nearbyEvacuationCenters]);

  return (
    <div className="dashboard-stack">
      <section className="page-card dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Resident dashboard</p>
          <h1 className="section-title">Emergency overview for Barangay Buso-Buso</h1>
          <p className="text-muted">
            This web dashboard keeps the same resident flow from the Expo app: view the latest
            alerts, check nearby evacuation centers, and jump straight into incident reporting or
            your report tracker.
          </p>

          <div className="btn-row">
            <button type="button" className="btn btn--primary" onClick={() => navigate('/reports')}>
              Submit a report
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => navigate('/reports/tracker')}
            >
              Open tracker
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/profile')}>
              Profile
            </button>
          </div>
        </div>

        <div className="dashboard-brand-tile">
          <img src={logoImage} alt="BusoBuso logo" />
          <strong>Resident EOC</strong>
          <span>Phase 1 web migration is now using live Firestore data and a native browser map.</span>
        </div>
      </section>

      <section className="dashboard-summary-grid">
        <article className="status-card">
          <span className="status-chip">Alerts</span>
          <strong className="metric-value">{alerts.length}</strong>
          <p className="text-muted">Recent alerts surfaced from `alerts` and `activeAlerts`.</p>
        </article>

        <article className="status-card">
          <span className="status-chip">Evacuation</span>
          <strong className="metric-value">{nearbyEvacuationCenters.length}</strong>
          <p className="text-muted">Closest pickup or evacuation centers ranked by route distance.</p>
        </article>

        <article className="status-card">
          <span className="status-chip">Location source</span>
          <strong className="metric-value">{referenceLabel}</strong>
          <div className="toggle-group">
            <button
              type="button"
              className={locationSource === 'device' ? 'toggle-pill active' : 'toggle-pill'}
              onClick={() => setLocationSource('device')}
              disabled={!deviceCoords}
            >
              Device
            </button>
            <button
              type="button"
              className={locationSource === 'profile' ? 'toggle-pill active' : 'toggle-pill'}
              onClick={() => setLocationSource('profile')}
              disabled={!profileCoords}
            >
              User form
            </button>
          </div>
        </article>
      </section>

      {dashboardNotice ? <div className="alert">{dashboardNotice}</div> : null}
      {alertsNotice ? <div className="alert">{alertsNotice}</div> : null}

      <section className="dashboard-grid">
        <article className="page-card">
          <div className="section-header">
            <p className="eyebrow">Latest alerts</p>
            <h2 className="section-title">Situation snapshot</h2>
          </div>

          {alerts.length === 0 ? (
            <p className="text-muted">No recent alerts are available right now.</p>
          ) : (
            <div className="alert-list">
              {alerts.map((alert) => (
                <article key={alert.id} className="alert-card">
                  <div className="alert-card-top">
                    <span
                      className="status-chip"
                      style={{
                        background: `${getLevelColor(alert.level)}1a`,
                        color: getLevelColor(alert.level),
                      }}
                    >
                      {alert.level}
                    </span>
                    <span className="small-muted">{formatRelativeTime(alert.timestamp)}</span>
                  </div>
                  <p>{alert.message}</p>
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="page-card">
          <div className="section-header">
            <p className="eyebrow">Assistant status</p>
            <h2 className="section-title">Pyro assistant is paused on web</h2>
            <p className="text-muted">
              The Expo app used an OpenAI-backed assistant directly from the client. For the web app,
              that flow is intentionally deferred until it is moved behind a Vercel serverless
              function.
            </p>
          </div>

          <div className="note-banner">
            <strong>Phase 2 TODO</strong>
            <p className="text-muted">
              Add a `/api/chat` Vercel function and reconnect the assistant without exposing private
              API keys in the browser bundle.
            </p>
          </div>
        </article>
      </section>

      <section className="page-card dashboard-map-panel">
        <div className="section-header">
          <p className="eyebrow">Hazard map</p>
          <h2 className="section-title">Nearby evacuation centers</h2>
          <p className="text-muted">
            Select a center to highlight it on the map. When a location is available, the web app
            will also plot a route line using the same OSRM approach as the Expo dashboard.
          </p>
        </div>

        <div className="map-toolbar">
          <span className="map-source-chip">{referenceLabel}</span>
          <div className="map-legend">
            <span><i className="legend-dot legend-dot--user" />You</span>
            <span><i className="legend-dot legend-dot--pickup" />Pickup</span>
            <span><i className="legend-dot legend-dot--evacuation" />Evacuation</span>
          </div>
        </div>

        <div className="dashboard-map-layout">
          <HazardMap
            userLocation={referenceCoords}
            centers={nearbyEvacuationCenters}
            selectedCenterId={selectedCenterId}
            onSelectCenter={setSelectedCenterId}
          />

          <div className="center-list">
            {nearbyEvacuationCenters.map((center, index) => (
              <button
                key={center.id}
                type="button"
                className={selectedCenterId === center.id ? 'center-card active' : 'center-card'}
                onClick={() => setSelectedCenterId(center.id)}
              >
                <span className="small-muted">
                  {index === 0 ? 'Closest option' : `Option ${index + 1}`} | {center.legend}
                </span>
                <strong>{center.name}</strong>
                <span className="text-muted">{formatCenterDistance(center)}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
