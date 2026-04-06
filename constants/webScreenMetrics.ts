import { PixelRatio, Platform } from 'react-native';

const BASE_WIDTH = 390;
const BASE_HEIGHT = 844;
const WEB_MIN_WIDTH = 320;
const WEB_MAX_WIDTH = 430;
const WEB_MIN_HEIGHT = 680;
const WEB_MAX_HEIGHT = BASE_HEIGHT;

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

export type ResponsiveScreenMetrics = {
  cardInset: number;
  horizontalInset: number;
  isSmallPhone: boolean;
  isWeb: boolean;
  scaleFont: (size: number) => number;
  scaleHeight: (size: number) => number;
  scaleWidth: (size: number) => number;
  screenHeight: number;
  screenWidth: number;
  viewportHeight: number;
  viewportWidth: number;
};

export const getResponsiveScreenMetrics = (
  viewportWidth: number,
  viewportHeight: number
): ResponsiveScreenMetrics => {
  const isWeb = Platform.OS === 'web';
  const safeViewportWidth = viewportWidth || BASE_WIDTH;
  const safeViewportHeight = viewportHeight || BASE_HEIGHT;
  const screenWidth = isWeb
    ? clamp(safeViewportWidth, WEB_MIN_WIDTH, WEB_MAX_WIDTH)
    : safeViewportWidth;
  const screenHeight = isWeb
    ? clamp(safeViewportHeight, WEB_MIN_HEIGHT, WEB_MAX_HEIGHT)
    : safeViewportHeight;

  const scaleWidth = (size: number): number => {
    return (screenWidth / BASE_WIDTH) * size;
  };

  const scaleHeight = (size: number): number => {
    return (screenHeight / BASE_HEIGHT) * size;
  };

  const moderateScale = (size: number, factor = 0.5): number => {
    const scaled = scaleWidth(size);
    return size + (scaled - size) * factor;
  };

  const scaleFont = (size: number): number => {
    const next = moderateScale(size, 0.35);
    return PixelRatio.roundToNearestPixel(clamp(next, size * 0.9, size * 1.2));
  };

  return {
    cardInset: clamp(scaleWidth(16), 12, 24),
    horizontalInset: clamp(scaleWidth(20), 14, 28),
    isSmallPhone: screenWidth < 360,
    isWeb,
    scaleFont,
    scaleHeight,
    scaleWidth,
    screenHeight,
    screenWidth,
    viewportHeight: safeViewportHeight,
    viewportWidth: safeViewportWidth,
  };
};
