type LocationResponse = {
  success?: boolean;
  latitude?: number;
  longitude?: number;
};

type ReverseGeocodeResponse = {
  display_name?: string;
  address?: {
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    village?: string;
    municipality?: string;
    town?: string;
    city?: string;
    county?: string;
    state?: string;
  };
};

const DEFAULT_API_BASE_URL = 'http://localhost:4000';
const DEFAULT_FALLBACK_LOCATION: [number, number] = [121.774, 12.8797];
const PUBLIC_API_TIMEOUT_MS = 5000;

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

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
  return stripTrailingSlash(import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL);
}

export function getApiBaseUrlCandidates(): string[] {
  return toUnique([getApiBaseUrl(), DEFAULT_API_BASE_URL]);
}

export function buildApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

export function buildApiUrls(path: string): string[] {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return getApiBaseUrlCandidates().map((baseUrl) => `${baseUrl}${normalizedPath}`);
}

const fetchJsonWithTimeout = async <T>(input: string): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), PUBLIC_API_TIMEOUT_MS);

  try {
    const response = await fetch(input, {
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

export async function getLocation(): Promise<[number, number]> {
  try {
    const json = await fetchJsonWithTimeout<LocationResponse>('https://ipwho.is/');

    if (
      json.success !== false &&
      typeof json.latitude === 'number' &&
      typeof json.longitude === 'number'
    ) {
      return [json.longitude, json.latitude];
    }
  } catch {
    // Keep the UI usable even when approximate location lookup fails.
  }

  return DEFAULT_FALLBACK_LOCATION;
}

const formatReverseGeocodeFallback = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

export async function reverseGeocodeCoordinates(
  latitude: number,
  longitude: number
): Promise<string> {
  try {
    const search = new URLSearchParams({
      format: 'jsonv2',
      lat: String(latitude),
      lon: String(longitude),
      addressdetails: '1',
    });

    const result = await fetchJsonWithTimeout<ReverseGeocodeResponse>(
      `https://nominatim.openstreetmap.org/reverse?${search.toString()}`
    );
    const address = result.address;

    const line = [
      address?.road,
      address?.neighbourhood,
      address?.suburb,
      address?.village,
      address?.municipality,
      address?.town,
      address?.city,
      address?.county,
      address?.state,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    if (line.length > 0) {
      return Array.from(new Set(line)).join(', ');
    }

    if (typeof result.display_name === 'string' && result.display_name.trim()) {
      return result.display_name.trim();
    }
  } catch {
    // Reverse geocoding is optional for phase 1.
  }

  return formatReverseGeocodeFallback(latitude, longitude);
}
