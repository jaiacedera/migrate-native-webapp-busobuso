import { useMemo } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  buildPinMapHtml,
  parsePinPayload,
  type MapLngLatTuple,
  type PinPayload,
} from '../../services/mapTemplateService';

type PinMapProps = {
  center: MapLngLatTuple;
  selectedPin: MapLngLatTuple | null;
  style?: StyleProp<ViewStyle>;
  onPinChange?: (payload: PinPayload) => void;
  scrollEnabled?: boolean;
  nestedScrollEnabled?: boolean;
};

const PinMap = ({
  center,
  selectedPin,
  style,
  onPinChange,
  scrollEnabled = true,
  nestedScrollEnabled = false,
}: PinMapProps) => {
  const html = useMemo(
    () => buildPinMapHtml(center, selectedPin),
    [center[0], center[1], selectedPin?.[0], selectedPin?.[1]]
  );

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    const payload = parsePinPayload(event.nativeEvent.data);
    if (!payload) {
      return;
    }

    onPinChange?.(payload);
  };

  return (
    <WebView
      source={{ html }}
      originWhitelist={['*']}
      style={style}
      onMessage={handleMessage}
      javaScriptEnabled
      domStorageEnabled
      nestedScrollEnabled={nestedScrollEnabled}
      scrollEnabled={scrollEnabled}
    />
  );
};

export default PinMap;
