import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
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

const iframeStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  border: '0',
  display: 'block',
  background: '#FFFFFF',
};

const PinMap = ({ center, selectedPin, style, onPinChange }: PinMapProps) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(
    () => buildPinMapHtml(center, selectedPin),
    [center[0], center[1], selectedPin?.[0], selectedPin?.[1]]
  );

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }

      const payload = parsePinPayload(event.data);
      if (!payload) {
        return;
      }

      onPinChange?.(payload);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onPinChange]);

  return (
    <View style={style}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        title="Pin location map"
        style={iframeStyle}
      />
    </View>
  );
};

export default PinMap;
