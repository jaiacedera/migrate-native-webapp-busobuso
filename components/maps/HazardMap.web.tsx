import { useEffect, useMemo, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { type HazardMapCenter, type MapCoordinates } from '../../services/mapTemplateService';

type HazardMapProps = {
  centers: HazardMapCenter[];
  referenceCoords: MapCoordinates | null;
  selectedCenterId: string | null;
  style?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
};

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAPLIBRE_CSS_URL = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const MAPLIBRE_JS_URL = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const DEFAULT_HAZARD_MAP_CENTER: [number, number] = [120.947874, 14.024067];
const ROUTING_TIMEOUT_MS = 5000;

type MapLibreMap = any;
type MapLibreGlobal = {
  Map: new (options: Record<string, unknown>) => MapLibreMap;
  Marker: new (options?: Record<string, unknown>) => any;
  Popup: new (options?: Record<string, unknown>) => any;
  NavigationControl: new (options?: Record<string, unknown>) => any;
  LngLatBounds: new () => any;
};

let mapLibreCssLoaded = false;
let mapLibreScriptLoadingPromise: Promise<MapLibreGlobal> | null = null;

const getMapLibreGlobal = (): MapLibreGlobal | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  return (window as Window & { maplibregl?: MapLibreGlobal }).maplibregl ?? null;
};

const ensureMapLibreCss = () => {
  if (mapLibreCssLoaded || typeof document === 'undefined') {
    return;
  }

  const existingTag = document.querySelector('link[data-maplibre-css="true"]');
  if (existingTag) {
    mapLibreCssLoaded = true;
    return;
  }

  const linkTag = document.createElement('link');
  linkTag.rel = 'stylesheet';
  linkTag.href = MAPLIBRE_CSS_URL;
  linkTag.setAttribute('data-maplibre-css', 'true');
  document.head.appendChild(linkTag);
  mapLibreCssLoaded = true;
};

const ensureMapLibreScript = async (): Promise<MapLibreGlobal> => {
  const existingGlobal = getMapLibreGlobal();
  if (existingGlobal) {
    return existingGlobal;
  }

  if (mapLibreScriptLoadingPromise) {
    return mapLibreScriptLoadingPromise;
  }

  mapLibreScriptLoadingPromise = new Promise<MapLibreGlobal>((resolve, reject) => {
    const existingScript = document.querySelector('script[data-maplibre-js="true"]') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        const loadedGlobal = getMapLibreGlobal();
        if (!loadedGlobal) {
          reject(new Error('MapLibre global not found after script load.'));
          return;
        }

        resolve(loadedGlobal);
      });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load MapLibre script.')));
      return;
    }

    const scriptTag = document.createElement('script');
    scriptTag.src = MAPLIBRE_JS_URL;
    scriptTag.async = true;
    scriptTag.setAttribute('data-maplibre-js', 'true');
    scriptTag.onload = () => {
      const loadedGlobal = getMapLibreGlobal();
      if (!loadedGlobal) {
        reject(new Error('MapLibre global not found after script load.'));
        return;
      }

      resolve(loadedGlobal);
    };
    scriptTag.onerror = () => reject(new Error('Failed to load MapLibre script.'));
    document.head.appendChild(scriptTag);
  });

  return mapLibreScriptLoadingPromise;
};

const createMarkerElement = (
  variant: 'user' | 'pickup' | 'evacuation',
  isSelected = false
): HTMLDivElement => {
  const markerElement = document.createElement('div');
  markerElement.style.width = isSelected ? '26px' : '22px';
  markerElement.style.height = isSelected ? '26px' : '22px';
  markerElement.style.borderRadius = '999px';
  markerElement.style.border = isSelected ? '3px solid #facc15' : '2px solid #ffffff';
  markerElement.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.35)';
  markerElement.style.cursor = 'pointer';

  if (variant === 'user') {
    markerElement.style.backgroundColor = '#16a34a';
  } else if (variant === 'pickup') {
    markerElement.style.backgroundColor = '#2563eb';
  } else {
    markerElement.style.backgroundColor = '#c62828';
  }

  return markerElement;
};

const HazardMap = ({
  centers,
  referenceCoords,
  selectedCenterId,
  style,
  scrollEnabled = true,
}: HazardMapProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<any[]>([]);

  const normalizedCenters = useMemo(
    () =>
      centers.map((center) => ({
        id: center.id,
        name: center.name,
        legend: center.legend,
        latitude: center.latitude,
        longitude: center.longitude,
      })),
    [centers]
  );

  useEffect(() => {
    let isDisposed = false;

    const initializeMap = async () => {
      ensureMapLibreCss();

      if (!containerRef.current || mapRef.current) {
        return;
      }

      const maplibre = await ensureMapLibreScript();
      if (isDisposed || !containerRef.current || mapRef.current) {
        return;
      }

      const map = new maplibre.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: DEFAULT_HAZARD_MAP_CENTER,
        zoom: 11,
        dragRotate: false,
        touchPitch: false,
      });

      map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;
    };

    void initializeMap();

    return () => {
      isDisposed = true;
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.scrollZoom[scrollEnabled ? 'enable' : 'disable']();
    map.dragPan[scrollEnabled ? 'enable' : 'disable']();
    map.doubleClickZoom[scrollEnabled ? 'enable' : 'disable']();
    map.touchZoomRotate[scrollEnabled ? 'enable' : 'disable']();
  }, [scrollEnabled]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = getMapLibreGlobal();
    if (!map || !maplibre) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const bounds = new maplibre.LngLatBounds();

    if (referenceCoords) {
      const referenceLngLat: [number, number] = [referenceCoords.longitude, referenceCoords.latitude];
      bounds.extend(referenceLngLat);

      const userMarker = new maplibre.Marker({ element: createMarkerElement('user') })
        .setLngLat(referenceLngLat)
        .setPopup(new maplibre.Popup({ offset: 18 }).setText('Your current location'))
        .addTo(map);

      markersRef.current.push(userMarker);
    }

    normalizedCenters.forEach((center) => {
      const centerLngLat: [number, number] = [center.longitude, center.latitude];
      bounds.extend(centerLngLat);

      const markerVariant = center.legend.toLowerCase().includes('pickup') ? 'pickup' : 'evacuation';
      const markerElement = createMarkerElement(markerVariant, center.id === selectedCenterId);
      const marker = new maplibre.Marker({ element: markerElement })
        .setLngLat(centerLngLat)
        .setPopup(
          new maplibre.Popup({ offset: 18 }).setHTML(
            '<p style="margin:0;font-size:13px;font-weight:700;">' + center.name + '</p>' +
              '<p style="margin:4px 0 0;font-size:11px;color:#4b5563;">' + center.legend + '</p>'
          )
        )
        .addTo(map);

      marker.getElement().addEventListener('click', () => {
        void plotRouteToCenter(map, normalizedCenters, referenceCoords, center.id);
      });

      markersRef.current.push(marker);
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 40, maxZoom: referenceCoords ? 14 : 12, duration: 200 });
      return;
    }

    map.easeTo({ center: DEFAULT_HAZARD_MAP_CENTER, zoom: 11, duration: 200, essential: true });
  }, [normalizedCenters, referenceCoords, selectedCenterId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    let isCancelled = false;

    const runPlot = () => {
      void plotRouteToCenter(map, normalizedCenters, referenceCoords, selectedCenterId, isCancelled);
    };

    if (map.isStyleLoaded()) {
      runPlot();
    } else {
      map.once('load', runPlot);
    }

    return () => {
      isCancelled = true;
    };
  }, [normalizedCenters, referenceCoords, selectedCenterId]);

  return (
    <View style={style}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#FFFFFF' }} />
    </View>
  );
};

const ensureRouteLayer = (map: MapLibreMap) => {
  if (!map.isStyleLoaded()) {
    return;
  }

  if (!map.getSource('route-line')) {
    map.addSource('route-line', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [],
        },
      },
    });
  }

  if (!map.getLayer('route-line-layer')) {
    map.addLayer({
      id: 'route-line-layer',
      type: 'line',
      source: 'route-line',
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#1f5fae',
        'line-width': 4,
        'line-opacity': 0.82,
      },
    });
  }
};

const setRouteData = (map: MapLibreMap, coordinates: [number, number][]) => {
  ensureRouteLayer(map);

  const routeSource = map.getSource('route-line');
  if (!routeSource) {
    return;
  }

  routeSource.setData({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates,
    },
  });
};

const plotRouteToCenter = async (
  map: MapLibreMap,
  centers: HazardMapCenter[],
  referenceCoords: MapCoordinates | null,
  selectedCenterId: string | null,
  isCancelled = false
) => {
  const selectedCenter = centers.find((center) => center.id === selectedCenterId);

  if (!selectedCenter || !referenceCoords) {
    setRouteData(map, []);
    return;
  }

  const origin: [number, number] = [referenceCoords.longitude, referenceCoords.latitude];
  const destination: [number, number] = [selectedCenter.longitude, selectedCenter.latitude];
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), ROUTING_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?overview=full&geometries=geojson&alternatives=false&steps=false`,
      {
        signal: controller.signal,
      }
    );

    if (response.ok) {
      const json = (await response.json()) as {
        routes?: {
          geometry?: {
            coordinates?: [number, number][];
          };
        }[];
      };

      const coordinates = json.routes?.[0]?.geometry?.coordinates;
      if (!isCancelled && coordinates && coordinates.length >= 2) {
        setRouteData(map, coordinates);
        return;
      }
    }
  } catch {
    // Use a direct line fallback to keep route intent visible when OSRM is unavailable.
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!isCancelled) {
    setRouteData(map, [origin, destination]);
  }
};

export default HazardMap;
