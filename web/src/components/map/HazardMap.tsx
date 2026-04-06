import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

export type HazardMapCoordinates = {
  latitude: number;
  longitude: number;
};

export type HazardMapCenter = {
  id: string;
  name: string;
  legend: string;
  latitude: number;
  longitude: number;
  distanceKm?: number | null;
};

type HazardMapProps = {
  userLocation: HazardMapCoordinates | null;
  centers: HazardMapCenter[];
  selectedCenterId: string | null;
  onSelectCenter: (centerId: string) => void;
  height?: number;
};

const DEFAULT_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_CENTER: [number, number] = [120.947874, 14.024067];
const ROUTING_TIMEOUT_MS = 5000;

const createMarkerElement = (variant: 'user' | 'pickup' | 'evacuation', isSelected = false) => {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = [
    'hazard-marker',
    `hazard-marker--${variant}`,
    isSelected ? 'hazard-marker--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return element;
};

export function HazardMap({
  userLocation,
  centers,
  selectedCenterId,
  onSelectCenter,
  height = 420,
}: HazardMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelectCenter);

  useEffect(() => {
    onSelectRef.current = onSelectCenter;
  }, [onSelectCenter]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: import.meta.env.VITE_MAP_STYLE_URL?.trim() || DEFAULT_MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: 11,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();

    if (userLocation) {
      const marker = new maplibregl.Marker({
        element: createMarkerElement('user'),
      })
        .setLngLat([userLocation.longitude, userLocation.latitude])
        .setPopup(new maplibregl.Popup({ offset: 18 }).setText('Your selected location'))
        .addTo(map);

      markersRef.current.push(marker);
      bounds.extend([userLocation.longitude, userLocation.latitude]);
    }

    centers.forEach((center) => {
      const isPickup = center.legend.toLowerCase().includes('pickup');
      const markerElement = createMarkerElement(
        isPickup ? 'pickup' : 'evacuation',
        center.id === selectedCenterId
      );

      markerElement.addEventListener('click', () => {
        onSelectRef.current(center.id);
      });

      const marker = new maplibregl.Marker({
        element: markerElement,
      })
        .setLngLat([center.longitude, center.latitude])
        .setPopup(
          new maplibregl.Popup({ offset: 18 }).setHTML(
            `<strong>${center.name}</strong><br /><span>${center.legend}</span>`
          )
        )
        .addTo(map);

      markersRef.current.push(marker);
      bounds.extend([center.longitude, center.latitude]);
    });

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 48, maxZoom: userLocation ? 14 : 12 });
    } else {
      map.flyTo({ center: DEFAULT_CENTER, zoom: 11, essential: true });
    }
  }, [centers, selectedCenterId, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    let isCancelled = false;

    const runRoutePlot = () => {
      const setRouteData = (coordinates: [number, number][]) => {
        const existingSource = map.getSource('route-line') as
          | maplibregl.GeoJSONSource
          | undefined;

        if (!existingSource) {
          map.addSource('route-line', {
            type: 'geojson',
            data: {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates,
              },
            },
          });

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

          return;
        }

        existingSource.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates,
          },
        });
      };

      const clearRoute = () => {
        const source = map.getSource('route-line') as maplibregl.GeoJSONSource | undefined;
        if (!source) {
          return;
        }

        source.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [],
          },
        });
      };

      const selectedCenter = centers.find((center) => center.id === selectedCenterId);
      if (!selectedCenter || !userLocation) {
        clearRoute();
        return;
      }

      const plotRoute = async () => {
        const origin: [number, number] = [userLocation.longitude, userLocation.latitude];
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

          if (!response.ok) {
            throw new Error(`OSRM route lookup failed with status ${response.status}`);
          }

          const json = (await response.json()) as {
            routes?: {
              geometry?: {
                coordinates?: [number, number][];
              };
            }[];
          };

          const coordinates = json.routes?.[0]?.geometry?.coordinates;
          if (!isCancelled && coordinates && coordinates.length >= 2) {
            setRouteData(coordinates);
            return;
          }
        } catch {
          // Draw a straight line if routing is unavailable so the intent stays visible.
        } finally {
          window.clearTimeout(timeoutId);
        }

        if (!isCancelled) {
          setRouteData([origin, destination]);
        }
      };

      void plotRoute();
    };

    if (map.isStyleLoaded()) {
      runRoutePlot();
    } else {
      map.once('load', runRoutePlot);
    }

    return () => {
      isCancelled = true;
    };
  }, [centers, selectedCenterId, userLocation]);

  return (
    <div className="map-frame" style={{ height }}>
      <div ref={containerRef} className="map-canvas" />
    </div>
  );
}
