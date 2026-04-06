import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { middleOfUSA } from '../constants/location';

type ExpoExtraConfig = {
  apiBaseUrl?: string;
};

interface LocationResponse {
  latitude?: number;
  longitude?: number;
}

const expoExtra = (Constants.expoConfig?.extra ?? {}) as ExpoExtraConfig;
const DEFAULT_API_BASE_URL = 'http://localhost:4000';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const isLoopbackHost = (value?: string | null): boolean =>
  value ? LOOPBACK_HOSTS.has(value.trim().toLowerCase()) : false;

const extractHostFromUriLike = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  const normalizedValue =
    trimmedValue.includes('://') || trimmedValue.startsWith('//')
      ? trimmedValue
      : `http://${trimmedValue}`;

  try {
    const parsedValue = new URL(normalizedValue);
    return isLoopbackHost(parsedValue.hostname) ? null : parsedValue.hostname;
  } catch {
    return null;
  }
};

const getBundlerHost = (): string | null => {
  const manifestHostCandidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    Constants.linkingUri,
    Constants.experienceUrl,
  ];

  for (const candidate of manifestHostCandidates) {
    const resolvedHost = extractHostFromUriLike(candidate);
    if (resolvedHost) {
      return resolvedHost;
    }
  }

  try {
    const sourceCodeModule = require('react-native/Libraries/NativeModules/specs/NativeSourceCode') as {
      default?: {
        getConstants?: () => {
          scriptURL?: string;
        };
      };
    };
    const scriptUrl = sourceCodeModule.default?.getConstants?.().scriptURL;
    return extractHostFromUriLike(scriptUrl);
  } catch {
    return null;
  }
};

const getConfiguredApiBaseUrl = (): string =>
  stripTrailingSlash(
    (
      process.env.EXPO_PUBLIC_API_BASE_URL ||
      expoExtra.apiBaseUrl ||
      DEFAULT_API_BASE_URL
    ).trim()
  );

const withHost = (baseUrl: string, host: string): string | null => {
  try {
    const parsed = new URL(baseUrl);
    parsed.hostname = host;
    return stripTrailingSlash(parsed.toString());
  } catch {
    return null;
  }
};

const toUnique = (values: Array<string | null | undefined>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalizedValue = value?.trim();
    if (!normalizedValue || seen.has(normalizedValue)) {
      continue;
    }

    seen.add(normalizedValue);
    result.push(normalizedValue);
  }

  return result;
};

export function getApiBaseUrl(): string {
  const trimmedBaseUrl = getConfiguredApiBaseUrl();

  try {
    const parsedBaseUrl = new URL(trimmedBaseUrl);

    if (!isLoopbackHost(parsedBaseUrl.hostname)) {
      return stripTrailingSlash(parsedBaseUrl.toString());
    }

    const bundlerHost = getBundlerHost();
    if (bundlerHost) {
      parsedBaseUrl.hostname = bundlerHost;
      return stripTrailingSlash(parsedBaseUrl.toString());
    }

    if (Platform.OS === 'android') {
      parsedBaseUrl.hostname = '10.0.2.2';
      return stripTrailingSlash(parsedBaseUrl.toString());
    }

    return trimmedBaseUrl;
  } catch {
    return trimmedBaseUrl;
  }
}

export function getApiBaseUrlCandidates(): string[] {
  const primaryBaseUrl = getApiBaseUrl();
  const configuredBaseUrl = getConfiguredApiBaseUrl();
  const bundlerHost = getBundlerHost();

  try {
    const parsedPrimary = new URL(primaryBaseUrl);
    const candidateValues: Array<string | null> = [primaryBaseUrl, configuredBaseUrl];

    if (bundlerHost && parsedPrimary.hostname !== bundlerHost) {
      candidateValues.push(withHost(primaryBaseUrl, bundlerHost));
      candidateValues.push(withHost(configuredBaseUrl, bundlerHost));
    }

    if (Platform.OS === 'android' && !isLoopbackHost(parsedPrimary.hostname)) {
      candidateValues.push(withHost(primaryBaseUrl, '10.0.2.2'));
    }

    return toUnique(candidateValues);
  } catch {
    return toUnique([primaryBaseUrl, configuredBaseUrl]);
  }
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

export function buildApiUrls(path: string): string[] {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return getApiBaseUrlCandidates().map((baseUrl) => `${baseUrl}${normalizedPath}`);
}

export async function getLocation(): Promise<[number, number]> {
  try {
    const response = await fetch('https://ipwho.is/');
    const json = (await response.json()) as LocationResponse;
    if (typeof json.latitude === 'number' && typeof json.longitude === 'number') {
      return [json.longitude, json.latitude];
    }
  } catch {
    // Fallback keeps the app usable when geolocation lookup fails.
  }

  return middleOfUSA;
}
