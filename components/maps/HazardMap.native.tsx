import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  buildHazardMapHtml,
  type HazardMapCenter,
  type MapCoordinates,
} from '../../services/mapTemplateService';

type HazardMapProps = {
  centers: HazardMapCenter[];
  referenceCoords: MapCoordinates | null;
  selectedCenterId: string | null;
  style?: StyleProp<ViewStyle>;
  scrollEnabled?: boolean;
};

const HazardMap = ({
  centers,
  referenceCoords,
  selectedCenterId,
  style,
  scrollEnabled = true,
}: HazardMapProps) => {
  const html = useMemo(
    () => buildHazardMapHtml(centers, referenceCoords, selectedCenterId),
    [centers, referenceCoords?.latitude, referenceCoords?.longitude, selectedCenterId]
  );

  return (
    <WebView
      source={{ html }}
      originWhitelist={['*']}
      style={style}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={scrollEnabled}
    />
  );
};

export default HazardMap;
