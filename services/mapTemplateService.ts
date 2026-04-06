export type MapLngLatTuple = [number, number];

export type MapCoordinates = {
  latitude: number;
  longitude: number;
};

export type PinPayload = {
  type: 'pin';
  latitude: number;
  longitude: number;
  capturedAt: string;
};

export type HazardMapCenter = {
  id: string;
  name: string;
  legend: string;
  latitude: number;
  longitude: number;
};

const MAPLIBRE_CSS_URL = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const MAPLIBRE_JS_URL = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEFAULT_HAZARD_MAP_CENTER: MapLngLatTuple = [120.947874, 14.024067];

const serializeForInlineScript = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const buildHtmlDocument = ({
  extraStyles = '',
  script,
}: {
  extraStyles?: string;
  script: string;
}): string => `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <link href="${MAPLIBRE_CSS_URL}" rel="stylesheet" />
    <style>
      html, body, #map {
        height: 100%;
        width: 100%;
        margin: 0;
        padding: 0;
      }

      body {
        overflow: hidden;
        background: #ffffff;
      }

      ${extraStyles}
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="${MAPLIBRE_JS_URL}"></script>
    <script>
      ${script}
    </script>
  </body>
</html>`;

const mapBridgeScript = `
function emitBridgeMessage(payload) {
  const serializedPayload = JSON.stringify(payload);

  if (
    window.ReactNativeWebView &&
    typeof window.ReactNativeWebView.postMessage === 'function'
  ) {
    window.ReactNativeWebView.postMessage(serializedPayload);
  }

  if (
    window.parent &&
    window.parent !== window &&
    typeof window.parent.postMessage === 'function'
  ) {
    window.parent.postMessage(serializedPayload, '*');
  }
}
`;

const normalizeCapturedAt = (value: unknown): string => {
  if (typeof value !== 'string') {
    return new Date().toISOString();
  }

  const parsedValue = new Date(value);
  return Number.isNaN(parsedValue.getTime()) ? new Date().toISOString() : parsedValue.toISOString();
};

export const parsePinPayload = (value: unknown): PinPayload | null => {
  let parsedValue = value;

  if (typeof value === 'string') {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!parsedValue || typeof parsedValue !== 'object') {
    return null;
  }

  const candidate = parsedValue as Partial<PinPayload>;
  const latitude = Number(candidate.latitude);
  const longitude = Number(candidate.longitude);

  if (candidate.type !== 'pin' || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }

  return {
    type: 'pin',
    latitude,
    longitude,
    capturedAt: normalizeCapturedAt(candidate.capturedAt),
  };
};

export function buildPinMapHtml(
  center: MapLngLatTuple,
  selectedPin: MapLngLatTuple | null
): string {
  const serializedCenter = serializeForInlineScript(center);
  const serializedSelectedPin = serializeForInlineScript(selectedPin);

  return buildHtmlDocument({
    script: `
      const center = ${serializedCenter};
      const selectedPin = ${serializedSelectedPin};

      ${mapBridgeScript}

      const map = new maplibregl.Map({
        container: 'map',
        style: '${MAP_STYLE_URL}',
        center,
        zoom: 14
      });

      let marker = null;

      function postPin(lngLat) {
        emitBridgeMessage({
          type: 'pin',
          latitude: lngLat.lat,
          longitude: lngLat.lng,
          capturedAt: new Date().toISOString()
        });
      }

      function ensureMarker(lngLat) {
        if (!marker) {
          marker = new maplibregl.Marker({ draggable: true }).setLngLat(lngLat).addTo(map);
          marker.on('dragend', () => {
            postPin(marker.getLngLat());
          });
          return;
        }

        marker.setLngLat(lngLat);
      }

      map.on('click', (event) => {
        ensureMarker(event.lngLat);
        postPin(event.lngLat);
      });

      map.on('load', () => {
        if (!selectedPin) {
          return;
        }

        ensureMarker(selectedPin);
        map.flyTo({ center: selectedPin, zoom: 15 });
      });
    `,
  });
}

export const buildMapHtml = buildPinMapHtml;

export function buildHazardMapHtml(
  centers: HazardMapCenter[],
  referenceCoords: MapCoordinates | null,
  selectedCenterId: string | null
): string {
  const serializedCenters = serializeForInlineScript(
    centers.map((center) => ({
      id: center.id,
      name: center.name,
      legend: center.legend,
      latitude: center.latitude,
      longitude: center.longitude,
    }))
  );
  const serializedReferenceCoords = serializeForInlineScript(referenceCoords);
  const serializedSelectedCenterId = serializeForInlineScript(selectedCenterId);

  return buildHtmlDocument({
    extraStyles: `
      .popup-title {
        font-size: 13px;
        font-weight: 700;
        margin: 0;
      }

      .popup-sub {
        font-size: 11px;
        color: #4b5563;
        margin: 4px 0 0;
      }

      .marker {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
      }

      .marker.pickup {
        background: #2563eb;
      }

      .marker.evacuation {
        background: #c62828;
      }
    `,
    script: `
      const centers = ${serializedCenters};
      const referenceCoords = ${serializedReferenceCoords};
      const selectedCenterId = ${serializedSelectedCenterId};

      const map = new maplibregl.Map({
        container: 'map',
        style: '${MAP_STYLE_URL}',
        center: ${serializeForInlineScript(DEFAULT_HAZARD_MAP_CENTER)},
        zoom: 11
      });

      const bounds = new maplibregl.LngLatBounds();

      function getReferenceLngLat() {
        if (!referenceCoords) {
          return null;
        }

        return [referenceCoords.longitude, referenceCoords.latitude];
      }

      function ensureRouteLayer() {
        if (map.getSource('route-line')) {
          return;
        }

        map.addSource('route-line', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: []
            },
            properties: {}
          }
        });

        map.addLayer({
          id: 'route-line-layer',
          type: 'line',
          source: 'route-line',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#1d4ed8',
            'line-width': 5,
            'line-opacity': 0.9
          }
        });
      }

      function setRouteCoordinates(coordinates) {
        const routeSource = map.getSource('route-line');
        if (!routeSource) {
          return;
        }

        routeSource.setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates
          },
          properties: {}
        });
      }

      async function plotRouteToCenter(center) {
        const from = getReferenceLngLat();
        if (!from) {
          return;
        }

        ensureRouteLayer();

        const destination = [center.longitude, center.latitude];

        try {
          const response = await fetch(
            'https://router.project-osrm.org/route/v1/driving/' +
              from[0] + ',' + from[1] + ';' + destination[0] + ',' + destination[1] +
              '?overview=full&geometries=geojson&alternatives=false&steps=false'
          );

          if (response.ok) {
            const json = await response.json();
            const routeCoordinates = json && json.routes && json.routes[0] && json.routes[0].geometry
              ? json.routes[0].geometry.coordinates
              : null;

            if (routeCoordinates && routeCoordinates.length >= 2) {
              setRouteCoordinates(routeCoordinates);

              const routeBounds = new maplibregl.LngLatBounds();
              routeCoordinates.forEach((point) => routeBounds.extend(point));
              map.fitBounds(routeBounds, { padding: 40, maxZoom: 15 });
              return;
            }
          }
        } catch {
          // Keep the map usable even if the routing service is unavailable.
        }

        const fallbackCoordinates = [from, destination];
        setRouteCoordinates(fallbackCoordinates);

        const fallbackBounds = new maplibregl.LngLatBounds();
        fallbackCoordinates.forEach((point) => fallbackBounds.extend(point));
        map.fitBounds(fallbackBounds, { padding: 40, maxZoom: 14 });
      }

      const currentReferenceLngLat = getReferenceLngLat();
      if (currentReferenceLngLat) {
        bounds.extend(currentReferenceLngLat);

        const userMarkerElement = document.createElement('div');
        userMarkerElement.className = 'marker pickup';
        userMarkerElement.style.background = '#16a34a';

        new maplibregl.Marker({ element: userMarkerElement })
          .setLngLat(currentReferenceLngLat)
          .setPopup(
            new maplibregl.Popup({ offset: 20 }).setHTML(
              '<p class="popup-title">Your current location</p>'
            )
          )
          .addTo(map);
      }

      centers.forEach((center) => {
        const lngLat = [center.longitude, center.latitude];
        bounds.extend(lngLat);

        const legendText = (center.legend || '').toLowerCase();
        const markerKind = legendText.includes('pickup') ? 'pickup' : 'evacuation';
        const markerElement = document.createElement('div');
        markerElement.className = 'marker ' + markerKind;

        const popupHtml =
          '<p class="popup-title">' + center.name + '</p>' +
          '<p class="popup-sub">' + center.legend + '</p>';

        const marker = new maplibregl.Marker({ element: markerElement })
          .setLngLat(lngLat)
          .setPopup(new maplibregl.Popup({ offset: 20 }).setHTML(popupHtml))
          .addTo(map);

        marker.getElement().addEventListener('click', () => {
          plotRouteToCenter(center);
        });
      });

      map.on('load', () => {
        ensureRouteLayer();

        if (centers.length > 1) {
          map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
        } else if (centers.length === 1) {
          map.flyTo({ center: [centers[0].longitude, centers[0].latitude], zoom: 14 });
        }

        if (!selectedCenterId) {
          return;
        }

        const selectedCenter = centers.find((center) => center.id === selectedCenterId);
        if (!selectedCenter) {
          return;
        }

        setTimeout(() => {
          plotRouteToCenter(selectedCenter);
        }, 150);
      });
    `,
  });
}
