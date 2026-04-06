import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

export type MapLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
};

type MapPickerProps = {
  center: [number, number];
  selectedLocation: MapLocation | null;
  onSelectLocation: (location: MapLocation) => void;
  height?: number;
};

const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const createPinElement = (): HTMLDivElement => {
  const element = document.createElement('div');
  element.className = 'pin-marker';
  element.innerHTML = '<span></span>';
  return element;
};

export function MapPicker({
  center,
  selectedLocation,
  onSelectLocation,
  height = 320,
}: MapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelectLocation);

  useEffect(() => {
    onSelectRef.current = onSelectLocation;
  }, [onSelectLocation]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: import.meta.env.VITE_MAP_STYLE_URL?.trim() || DEFAULT_MAP_STYLE,
      center,
      zoom: 13,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const placeMarker = (longitude: number, latitude: number, accuracy: number | null = null) => {
      const location: MapLocation = {
        latitude,
        longitude,
        accuracy,
        capturedAt: new Date().toISOString(),
      };

      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({
          draggable: true,
          element: createPinElement(),
        })
          .setLngLat([longitude, latitude])
          .addTo(map);

        markerRef.current.on('dragend', () => {
          const lngLat = markerRef.current?.getLngLat();
          if (!lngLat) {
            return;
          }

          onSelectRef.current({
            latitude: lngLat.lat,
            longitude: lngLat.lng,
            accuracy: null,
            capturedAt: new Date().toISOString(),
          });
        });
      } else {
        markerRef.current.setLngLat([longitude, latitude]);
      }

      onSelectRef.current(location);
    };

    map.on('click', (event) => {
      placeMarker(event.lngLat.lng, event.lngLat.lat);
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.flyTo({
      center,
      zoom: selectedLocation ? Math.max(map.getZoom(), 13) : 12,
      essential: true,
    });
  }, [center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedLocation) {
      return;
    }

    if (!markerRef.current) {
      markerRef.current = new maplibregl.Marker({
        draggable: true,
        element: createPinElement(),
      })
        .setLngLat([selectedLocation.longitude, selectedLocation.latitude])
        .addTo(map);

      markerRef.current.on('dragend', () => {
        const lngLat = markerRef.current?.getLngLat();
        if (!lngLat) {
          return;
        }

        onSelectRef.current({
          latitude: lngLat.lat,
          longitude: lngLat.lng,
          accuracy: null,
          capturedAt: new Date().toISOString(),
        });
      });
    } else {
      markerRef.current.setLngLat([selectedLocation.longitude, selectedLocation.latitude]);
    }

    map.flyTo({
      center: [selectedLocation.longitude, selectedLocation.latitude],
      zoom: Math.max(map.getZoom(), 14),
      essential: true,
    });
  }, [selectedLocation]);

  return (
    <div className="map-frame" style={{ height }}>
      <div ref={containerRef} className="map-canvas" />
    </div>
  );
}
