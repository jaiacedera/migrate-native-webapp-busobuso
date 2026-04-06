import { Dimensions, PixelRatio, Platform } from 'react-native';

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;

const { width: viewportWidth, height: viewportHeight } = Dimensions.get('window');

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const isWeb = Platform.OS === 'web';

// Prevent desktop web windows from inflating mobile-oriented spacing/size scales.
const scaledViewportWidth = isWeb ? clamp(viewportWidth, 320, BASE_WIDTH) : viewportWidth;
const scaledViewportHeight = isWeb ? clamp(viewportHeight, 680, BASE_HEIGHT) : viewportHeight;

export const screen = {
  width: scaledViewportWidth,
  height: scaledViewportHeight,
  isSmallPhone: scaledViewportWidth < 360,
  isTallPhone: scaledViewportHeight >= 800,
};

export const scaleWidth = (size: number): number => {
  return (scaledViewportWidth / BASE_WIDTH) * size;
};

export const scaleHeight = (size: number): number => {
  return (scaledViewportHeight / BASE_HEIGHT) * size;
};

export const moderateScale = (size: number, factor = 0.5): number => {
  const scaled = scaleWidth(size);
  return size + (scaled - size) * factor;
};

export const scaleFont = (size: number): number => {
  const next = moderateScale(size, 0.35);
  return PixelRatio.roundToNearestPixel(clamp(next, size * 0.9, size * 1.2));
};

export const responsiveInset = {
  horizontal: clamp(scaleWidth(20), 14, 28),
  card: clamp(scaleWidth(16), 12, 24),
};
