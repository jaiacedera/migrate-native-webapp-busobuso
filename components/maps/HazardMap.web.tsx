import { useMemo } from 'react';
import type { CSSProperties } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
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

const iframeStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  border: '0',
  display: 'block',
  background: '#FFFFFF',
};

const HazardMap = ({
  centers,
  referenceCoords,
  selectedCenterId,
  style,
}: HazardMapProps) => {
  const html = useMemo(
    () => buildHazardMapHtml(centers, referenceCoords, selectedCenterId),
    [centers, referenceCoords?.latitude, referenceCoords?.longitude, selectedCenterId]
  );

  return (
    <View style={style}>
      <iframe
        srcDoc={html}
        title="Hazard and evacuation map"
        style={iframeStyle}
      />
    </View>
  );
};

export default HazardMap;
