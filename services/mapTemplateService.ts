export function buildMapHtml(center: [number, number], selectedPin: [number, number] | null) {
  const initialPin = selectedPin
    ? `const selectedPin = [${selectedPin[0]}, ${selectedPin[1]}];`
    : 'const selectedPin = null;';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <link href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" rel="stylesheet" />
    <style>
      html, body, #map {
        height: 100%;
        margin: 0;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
    <script>
      const map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [${center[0]}, ${center[1]}],
        zoom: 14
      });

      ${initialPin}
      let marker = null;

      function postPin(lngLat) {
        const payload = {
          type: 'pin',
          latitude: lngLat.lat,
          longitude: lngLat.lng,
          capturedAt: new Date().toISOString()
        };
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }

      function ensureMarker(lngLat) {
        if (!marker) {
          marker = new maplibregl.Marker({ draggable: true }).setLngLat(lngLat).addTo(map);
          marker.on('dragend', () => {
            postPin(marker.getLngLat());
          });
        } else {
          marker.setLngLat(lngLat);
        }
      }

      map.on('click', (e) => {
        ensureMarker(e.lngLat);
        postPin(e.lngLat);
      });

      map.on('load', () => {
        if (selectedPin) {
          const lngLat = new maplibregl.LngLat(selectedPin[0], selectedPin[1]);
          ensureMarker(lngLat);
        }
      });
    </script>
  </body>
</html>`;
}
