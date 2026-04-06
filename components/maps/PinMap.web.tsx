import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { type MapLngLatTuple, type PinPayload } from '../../services/mapTemplateService';

type PinMapProps = {
  center: MapLngLatTuple;
  selectedPin: MapLngLatTuple | null;
  style?: StyleProp<ViewStyle>;
  onPinChange?: (payload: PinPayload) => void;
  scrollEnabled?: boolean;
  nestedScrollEnabled?: boolean;
};

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAPLIBRE_CSS_URL = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const MAPLIBRE_JS_URL = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';

type MapLibreGlobal = {
  Map: new (options: Record<string, unknown>) => any;
  Marker: new (options?: Record<string, unknown>) => any;
  NavigationControl: new (options?: Record<string, unknown>) => any;
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

const PinMap = ({
  center,
  selectedPin,
  style,
  onPinChange,
  scrollEnabled = true,
}: PinMapProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const markerRef = useRef<any | null>(null);
  const onPinChangeRef = useRef(onPinChange);
  const hasInitializedPinRef = useRef(false);

  const markerLngLat = useMemo(() => {
    if (!selectedPin) {
      return null;
    }

    return { lng: selectedPin[0], lat: selectedPin[1] };
  }, [selectedPin]);

  useEffect(() => {
    onPinChangeRef.current = onPinChange;
  }, [onPinChange]);

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
        center,
        zoom: 14,
        dragRotate: false,
        touchPitch: false,
      });

      map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      mapRef.current = map;

    const emitPinChange = (lngLat: { lng: number; lat: number }) => {
      const payload: PinPayload = {
        type: 'pin',
        latitude: lngLat.lat,
        longitude: lngLat.lng,
        capturedAt: new Date().toISOString(),
      };

      onPinChangeRef.current?.(payload);
    };

      const ensureMarker = (lngLat: { lng: number; lat: number }) => {
        if (!markerRef.current) {
          const marker = new maplibre.Marker({ draggable: true }).setLngLat(lngLat).addTo(map);
          marker.on('dragend', () => {
            const nextLngLat = marker.getLngLat();
            emitPinChange(nextLngLat);
          });
          markerRef.current = marker;
          return;
        }

        markerRef.current.setLngLat(lngLat);
      };

      map.on('click', (event: { lngLat: { lng: number; lat: number } }) => {
        const lngLat = event.lngLat;
        ensureMarker(lngLat);
        emitPinChange(lngLat);
      });

      map.on('load', () => {
        if (!selectedPin || hasInitializedPinRef.current) {
          return;
        }

        hasInitializedPinRef.current = true;
        const initialLngLat = { lng: selectedPin[0], lat: selectedPin[1] };
        ensureMarker(initialLngLat);
        map.flyTo({ center: selectedPin, zoom: 15, essential: true });
      });
    };

    void initializeMap();

    return () => {
      isDisposed = true;
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      hasInitializedPinRef.current = false;
    };
  }, [center, selectedPin]);

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
    if (!map || !markerLngLat) {
      return;
    }

    const maplibre = getMapLibreGlobal();
    if (!maplibre) {
      return;
    }

    if (!markerRef.current) {
      markerRef.current = new maplibre.Marker({ draggable: true }).setLngLat(markerLngLat).addTo(map);
      markerRef.current.on('dragend', () => {
        const nextLngLat = markerRef.current?.getLngLat();
        if (!nextLngLat) {
          return;
        }

        onPinChangeRef.current?.({
          type: 'pin',
          latitude: nextLngLat.lat,
          longitude: nextLngLat.lng,
          capturedAt: new Date().toISOString(),
        });
      });
    } else {
      markerRef.current.setLngLat(markerLngLat);
    }

    map.easeTo({ center: [markerLngLat.lng, markerLngLat.lat], duration: 250, essential: true });
  }, [markerLngLat]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedPin) {
      return;
    }

    map.easeTo({ center, duration: 300, essential: true });
  }, [center, selectedPin]);

  return (
    <View style={style}>
      <div ref={containerRef} style={styles.mapCanvas} />
    </View>
  );
};

const styles = StyleSheet.create({
  mapCanvas: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
});

export default PinMap;
