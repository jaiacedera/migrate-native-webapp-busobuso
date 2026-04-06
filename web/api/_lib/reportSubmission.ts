import { createHash } from 'node:crypto';
import process from 'node:process';
import { Timestamp } from 'firebase-admin/firestore';

const MAX_CLIENT_REQUEST_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 160;
const MAX_CONTACT_LENGTH = 64;
const MAX_ADDRESS_LENGTH = 500;
const MAX_REPORT_LENGTH = 4000;
const MAX_IMAGE_URLS = 4;
const MAX_IMAGE_URL_LENGTH = 2048;
const REPORT_ID_TIME_ZONE = 'Asia/Manila';

type ReportLanguage = 'tl' | 'en';

type RawLocationInput = {
  latitude?: unknown;
  longitude?: unknown;
  accuracy?: unknown;
  capturedAt?: unknown;
};

export type ReportResponseData = {
  id: string;
  reportId: string;
  status: string;
  createdAt: string;
  urgency?: string;
  urgencyConfidence?: number;
  urgencyScores?: Record<string, number>;
};

export type ReportResponseBody = {
  success: boolean;
  message: string;
  data?: ReportResponseData;
};

export type NormalizedReportLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
};

export type MaterialPayload = {
  uid: string;
  email: string | null;
  fullName: string;
  contactNumber: string;
  address: string;
  report: string;
  language: ReportLanguage;
  latitude: number;
  longitude: number;
  location: NormalizedReportLocation;
  imageUrls: string[];
  createdAtClient: string;
};

export type NormalizedReportSubmission = {
  uid: string;
  email: string | null;
  clientRequestId: string;
  fullName: string;
  contactNumber: string;
  address: string;
  report: string;
  language: ReportLanguage;
  latitude: number;
  longitude: number;
  location: NormalizedReportLocation;
  imageUrl: string | null;
  imageUrls: string[];
  createdAtClient: string;
  materialPayload: MaterialPayload;
};

export type ExistingRequestRecord = {
  uid?: unknown;
  clientRequestId?: unknown;
  materialPayloadHash?: unknown;
  response?: unknown;
};

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const normalizeString = ({
  value,
  field,
  maxLength,
  optional = false,
}: {
  value: unknown;
  field: string;
  maxLength: number;
  optional?: boolean;
}): string | null => {
  if (value === null || value === undefined) {
    if (optional) {
      return null;
    }

    throw new HttpError(400, `${field} is required.`);
  }

  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} must be a string.`);
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    if (optional) {
      return null;
    }

    throw new HttpError(400, `${field} is required.`);
  }

  if (trimmedValue.length > maxLength) {
    throw new HttpError(400, `${field} is too long.`);
  }

  return trimmedValue;
};

const normalizeNullableNumber = (value: unknown, field: string): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, `${field} must be a finite number.`);
  }

  return value;
};

const normalizeIsoDate = (value: unknown, field: string): string => {
  const normalizedValue = normalizeString({
    value,
    field,
    maxLength: 64,
  });

  if (normalizedValue === null) {
    throw new HttpError(400, `${field} is required.`);
  }

  const parsedDate = new Date(normalizedValue);

  if (Number.isNaN(parsedDate.valueOf())) {
    throw new HttpError(400, `${field} must be a valid ISO date string.`);
  }

  return parsedDate.toISOString();
};

const normalizeImageUrls = (value: unknown, fallbackImageUrl: string | null): string[] => {
  const rawItems = Array.isArray(value)
    ? value
    : fallbackImageUrl
      ? [fallbackImageUrl]
      : [];

  if (rawItems.length > MAX_IMAGE_URLS) {
    throw new HttpError(400, `imageUrls cannot contain more than ${MAX_IMAGE_URLS} items.`);
  }

  const seen = new Set<string>();
  const normalizedItems: string[] = [];

  for (const item of rawItems) {
    const normalizedItem = normalizeString({
      value: item,
      field: 'imageUrls[]',
      maxLength: MAX_IMAGE_URL_LENGTH,
    });

    if (normalizedItem === null) {
      throw new HttpError(400, 'imageUrls[] is required.');
    }

    if (seen.has(normalizedItem)) {
      continue;
    }

    seen.add(normalizedItem);
    normalizedItems.push(normalizedItem);
  }

  return normalizedItems;
};

const inferReportLanguage = (value: string): ReportLanguage => {
  const normalizedValue = ` ${value.trim().toLowerCase()} `;
  const tagalogSignals = [' ang ', ' mga ', ' baha', ' tulong', ' kami ', ' nasa ', ' kailangan '];
  const englishSignals = [' help ', ' flood ', ' trapped ', ' injured ', ' medical ', ' urgent '];

  const tagalogScore = tagalogSignals.reduce(
    (score, signal) => score + (normalizedValue.includes(signal) ? 1 : 0),
    0
  );
  const englishScore = englishSignals.reduce(
    (score, signal) => score + (normalizedValue.includes(signal) ? 1 : 0),
    0
  );

  return englishScore > tagalogScore ? 'en' : 'tl';
};

const normalizeLanguage = (value: unknown, report: string): ReportLanguage => {
  if (value === 'tl' || value === 'en') {
    return value;
  }

  return inferReportLanguage(report);
};

const normalizeLocation = ({
  location,
  latitude,
  longitude,
}: {
  location: unknown;
  latitude: number | null;
  longitude: number | null;
}): NormalizedReportLocation => {
  const rawLocation = location as RawLocationInput | null | undefined;
  const locationLatitude = normalizeNullableNumber(rawLocation?.latitude, 'location.latitude');
  const locationLongitude = normalizeNullableNumber(rawLocation?.longitude, 'location.longitude');
  const resolvedLatitude = locationLatitude ?? latitude;
  const resolvedLongitude = locationLongitude ?? longitude;

  if (resolvedLatitude === null || resolvedLongitude === null) {
    throw new HttpError(400, 'location with latitude and longitude is required.');
  }

  if (latitude !== null && Math.abs(latitude - resolvedLatitude) > 0.000001) {
    throw new HttpError(400, 'latitude does not match location.latitude.');
  }

  if (longitude !== null && Math.abs(longitude - resolvedLongitude) > 0.000001) {
    throw new HttpError(400, 'longitude does not match location.longitude.');
  }

  return {
    latitude: resolvedLatitude,
    longitude: resolvedLongitude,
    accuracy: normalizeNullableNumber(rawLocation?.accuracy, 'location.accuracy'),
    capturedAt: normalizeIsoDate(rawLocation?.capturedAt ?? new Date().toISOString(), 'location.capturedAt'),
  };
};

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey)
  );

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
    .join(',')}}`;
};

const getAllowedOrigins = (): string[] =>
  (process.env.REPORTS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

export const buildCorsHeaders = (request: Request): Record<string, string> => {
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = request.headers.get('origin')?.trim();
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'OPTIONS, POST',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (!requestOrigin) {
    headers['Access-Control-Allow-Origin'] = '*';
    return headers;
  }

  if (allowedOrigins.length === 0) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
    return headers;
  }

  if (allowedOrigins.includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin;
  }

  return headers;
};

export const assertAllowedOrigin = (request: Request): void => {
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = request.headers.get('origin')?.trim();

  if (!requestOrigin || allowedOrigins.length === 0) {
    return;
  }

  if (!allowedOrigins.includes(requestOrigin)) {
    throw new HttpError(403, 'Origin is not allowed.');
  }
};

export const buildJsonResponse = (
  request: Request,
  status: number,
  body: ReportResponseBody
): Response => {
  const headers = buildCorsHeaders(request);
  return Response.json(body, {
    status,
    headers,
  });
};

export const buildOptionsResponse = (request: Request): Response =>
  new Response(null, {
    status: 204,
    headers: buildCorsHeaders(request),
  });

export const extractBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

  if (scheme?.toLowerCase() !== 'bearer' || !token?.trim()) {
    return null;
  }

  return token.trim();
};

export const parseJsonBody = async (request: Request): Promise<unknown> => {
  const contentType = request.headers.get('content-type') || '';

  if (!contentType.toLowerCase().includes('application/json')) {
    throw new HttpError(400, 'Content-Type must be application/json.');
  }

  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
};

export const normalizeReportSubmission = (value: unknown): NormalizedReportSubmission => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const payload = value as Record<string, unknown>;
  const fullName =
    normalizeString({
      value: payload.fullName ?? payload.name,
      field: 'fullName',
      maxLength: MAX_NAME_LENGTH,
    }) || '';
  const contactNumber =
    normalizeString({
      value: payload.contactNumber ?? payload.phone,
      field: 'contactNumber',
      maxLength: MAX_CONTACT_LENGTH,
    }) || '';
  const address =
    normalizeString({
      value: payload.address,
      field: 'address',
      maxLength: MAX_ADDRESS_LENGTH,
    }) || '';
  const report =
    normalizeString({
      value: payload.report,
      field: 'report',
      maxLength: MAX_REPORT_LENGTH,
    }) || '';
  const uid =
    normalizeString({
      value: payload.uid,
      field: 'uid',
      maxLength: MAX_NAME_LENGTH,
    }) || '';
  const email = normalizeString({
    value: payload.email,
    field: 'email',
    maxLength: MAX_NAME_LENGTH,
    optional: true,
  });
  const clientRequestId =
    normalizeString({
      value: payload.clientRequestId,
      field: 'clientRequestId',
      maxLength: MAX_CLIENT_REQUEST_ID_LENGTH,
    }) || '';
  const createdAtClient = normalizeIsoDate(payload.createdAtClient, 'createdAtClient');
  const latitude = normalizeNullableNumber(payload.latitude, 'latitude');
  const longitude = normalizeNullableNumber(payload.longitude, 'longitude');
  const location = normalizeLocation({
    location: payload.location,
    latitude,
    longitude,
  });
  const imageUrl = normalizeString({
    value: payload.imageUrl,
    field: 'imageUrl',
    maxLength: MAX_IMAGE_URL_LENGTH,
    optional: true,
  });
  const imageUrls = normalizeImageUrls(payload.imageUrls, imageUrl);
  const normalizedLanguage = normalizeLanguage(payload.language, report);

  const materialPayload: MaterialPayload = {
    uid,
    email,
    fullName,
    contactNumber,
    address,
    report,
    language: normalizedLanguage,
    latitude: location.latitude,
    longitude: location.longitude,
    location,
    imageUrls,
    createdAtClient,
  };

  return {
    uid,
    email,
    clientRequestId,
    fullName,
    contactNumber,
    address,
    report,
    language: normalizedLanguage,
    latitude: location.latitude,
    longitude: location.longitude,
    location,
    imageUrl: imageUrls[0] ?? imageUrl,
    imageUrls,
    createdAtClient,
    materialPayload,
  };
};

export const hashMaterialPayload = (payload: MaterialPayload): string =>
  createHash('sha256').update(stableStringify(payload)).digest('hex');

export const buildIdempotencyKey = (uid: string, clientRequestId: string): string =>
  createHash('sha256').update(`${uid}:${clientRequestId}`).digest('hex');

export const getDateKey = (value: Date): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_ID_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';

  return `${year}${month}${day}`;
};

export const formatReportId = (dateKey: string, sequence: number): string =>
  `IR-${dateKey}-${String(sequence).padStart(4, '0')}`;

export const buildResponseData = ({
  id,
  reportId,
  status,
  createdAt,
}: {
  id: string;
  reportId: string;
  status: string;
  createdAt: string;
}): ReportResponseData => ({
  id,
  reportId,
  status,
  createdAt,
});

export const buildReportDocument = ({
  submission,
  reportId,
  dateKey,
  sequence,
  createdAt,
  createdAtIso,
  materialPayloadHash,
}: {
  submission: NormalizedReportSubmission;
  reportId: string;
  dateKey: string;
  sequence: number;
  createdAt: Timestamp;
  createdAtIso: string;
  materialPayloadHash: string;
}) => ({
  uid: submission.uid,
  email: submission.email,
  reportId,
  reportIdSource: 'canonical',
  fullName: submission.fullName,
  name: submission.fullName,
  address: submission.address,
  contactNumber: submission.contactNumber,
  phone: submission.contactNumber,
  report: submission.report,
  language: submission.language,
  latitude: submission.latitude,
  longitude: submission.longitude,
  location: submission.location,
  imageUrl: submission.imageUrl,
  imageUrls: submission.imageUrls,
  clientRequestId: submission.clientRequestId,
  materialPayloadHash,
  dateKey,
  sequence,
  status: 'submitted',
  submissionSource: 'vercel-api',
  createdAt,
  createdAtIso,
  createdAtClient: submission.createdAtClient,
  updatedAt: createdAt,
});

export const buildIdempotencyRecord = ({
  uid,
  clientRequestId,
  materialPayloadHash,
  reportDocId,
  response,
  createdAt,
}: {
  uid: string;
  clientRequestId: string;
  materialPayloadHash: string;
  reportDocId: string;
  response: ReportResponseData;
  createdAt: Timestamp;
}) => ({
  uid,
  clientRequestId,
  materialPayloadHash,
  reportDocId,
  reportId: response.reportId,
  status: response.status,
  createdAt,
  response,
});
