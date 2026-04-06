import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { buildApiUrls, getApiBaseUrl, getApiBaseUrlCandidates } from './api';
import { auth, db } from './firebase';

export type BackendUrgencyScores = Record<string, number>;

type BackendReportResponse = {
  success?: boolean;
  message?: string;
  data?: {
    id?: string;
    reportId?: string;
    status?: string;
    urgency?: string;
    urgencyConfidence?: number;
    urgencyScores?: BackendUrgencyScores;
    createdAt?: string;
  };
};

export type SubmittedReportResult = {
  id?: string;
  reportId?: string;
  referenceType: 'canonical' | 'temporary';
  storedBy: 'backend' | 'firestore-fallback';
  clientRequestId: string;
  urgency?: string;
  urgencyConfidence?: number | null;
  urgencyScores?: BackendUrgencyScores | null;
  message?: string;
};

export type ResidentProfileRecord = {
  firstName?: string;
  middleInitial?: string;
  lastName?: string;
  address?: string;
  contactNumber?: string;
  emergencyContact?: string;
  profileImageUrl?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    accuracy?: number | null;
    capturedAt?: string;
  };
};

export type ReportLocationInput = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
} | null;

type FirebaseLikeError = {
  code?: string;
  message?: string;
};

type IncidentReportSubmissionPayload = {
  clientRequestId: string;
  name: string;
  fullName: string;
  phone: string;
  contactNumber: string;
  address: string;
  report: string;
  language: 'tl' | 'en';
  latitude: number | null;
  longitude: number | null;
  imageUrl: string | null;
  imageUrls: string[];
  location: ReportLocationInput;
  createdAtClient: string;
  uid: string;
  email: string | null;
};

class ReportSubmissionError extends Error {
  userMessage: string;

  constructor(message: string, userMessage: string) {
    super(message);
    this.name = 'ReportSubmissionError';
    this.userMessage = userMessage;
  }
}

const REPORT_SUBMISSION_FETCH_TIMEOUT_MS = 5000;
const REPORT_ID_PATTERN = /^IR-\d{8}-\d{4}$/;
const TEMPORARY_REPORT_ID_PATTERN = /^WEB-\d{8}-[A-Z0-9]{6,12}$/;

const inferReportLanguage = (value: string): 'tl' | 'en' => {
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

const toUrgencyScores = (value: unknown): BackendUrgencyScores | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const numericEntries = Object.entries(value).flatMap(([label, rawScore]) => {
    const numericScore =
      typeof rawScore === 'number'
        ? rawScore
        : typeof rawScore === 'string'
          ? Number(rawScore)
          : Number.NaN;

    return Number.isFinite(numericScore) ? [[label, numericScore] as const] : [];
  });

  return numericEntries.length > 0 ? Object.fromEntries(numericEntries) : null;
};

const buildConnectionErrorMessage = (apiBaseUrl: string): string =>
  `Unable to submit your report right now. Make sure the backend server is reachable at ${apiBaseUrl}. If the web app is deployed separately, set VITE_API_BASE_URL to your public backend URL.`;

const fetchWithTimeout = async (
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const getDateKey = (value: Date): string =>
  `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, '0')}${String(
    value.getDate()
  ).padStart(2, '0')}`;

const generateClientRequestId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const buildTemporaryReportId = (): string => {
  const dateKey = getDateKey(new Date());
  const rawSuffix =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `WEB-${dateKey}-${rawSuffix.toUpperCase()}`;
};

const isValidCanonicalReportId = (value?: string | null): value is string =>
  typeof value === 'string' && REPORT_ID_PATTERN.test(value.trim());

const isTemporaryReportId = (value?: string | null): value is string =>
  typeof value === 'string' && TEMPORARY_REPORT_ID_PATTERN.test(value.trim());

const buildTemporaryFallbackPayload = ({
  payload,
  temporaryReportId,
}: {
  payload: IncidentReportSubmissionPayload;
  temporaryReportId: string;
}) => ({
  ...payload,
  reportId: temporaryReportId,
  reportIdSource: 'temporary' as const,
  status: 'submitted',
  fallbackSource: 'firestore' as const,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});

const saveReportToFirestoreFallback = async ({
  payload,
  temporaryReportId,
}: {
  payload: IncidentReportSubmissionPayload;
  temporaryReportId: string;
}): Promise<SubmittedReportResult> => {
  const createdDoc = await addDoc(
    collection(db, 'distressReports'),
    buildTemporaryFallbackPayload({
      payload,
      temporaryReportId,
    })
  );

  return {
    id: createdDoc.id,
    reportId: temporaryReportId,
    referenceType: 'temporary',
    storedBy: 'firestore-fallback',
    clientRequestId: payload.clientRequestId,
    message: 'Report saved via fallback submission.',
  };
};

const toBackendFailureUserMessage = (
  responseStatus: number,
  backendMessage: string | undefined
): string => {
  if (backendMessage?.trim()) {
    return backendMessage.trim();
  }

  if (responseStatus === 401) {
    return 'Your session expired. Please sign in again before submitting a report.';
  }

  if (responseStatus === 403) {
    return 'You are not allowed to submit a report from this account right now.';
  }

  if (responseStatus === 413) {
    return 'The report payload is too large. Please remove some attachments and try again.';
  }

  if (responseStatus === 429) {
    return 'Too many report attempts were made in a short time. Please wait a moment and try again.';
  }

  return 'Unable to submit your report right now. Please try again.';
};

export const getReportSubmissionErrorMessage = (error: unknown): string | null =>
  error instanceof ReportSubmissionError ? error.userMessage : null;

export async function copyUserProfile(currentUserUid: string): Promise<ResidentProfileRecord | null> {
  const profileRef = doc(db, 'residents', currentUserUid);
  const profileSnap = await getDoc(profileRef);

  if (!profileSnap.exists()) {
    return null;
  }

  return profileSnap.data() as ResidentProfileRecord;
}

export async function submitIncidentReport({
  fullName,
  address,
  contactNumber,
  report,
  currentLocation,
  imageUrl,
  imageUrls,
}: {
  fullName: string;
  address: string;
  contactNumber: string;
  report: string;
  currentLocation: ReportLocationInput;
  imageUrl: string;
  imageUrls?: string[];
}): Promise<SubmittedReportResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new ReportSubmissionError(
      'Current user is missing for report submission.',
      'Session expired. Please log in again before submitting a report.'
    );
  }

  const trimmedFullName = fullName.trim();
  const trimmedAddress = address.trim();
  const trimmedContactNumber = contactNumber.trim();
  const trimmedReport = report.trim();
  const createdAtClient = new Date().toISOString();
  const clientRequestId = generateClientRequestId();
  const apiBaseUrl = getApiBaseUrl();
  const candidateBaseUrls = getApiBaseUrlCandidates();
  const candidateEndpoints = buildApiUrls('/api/reports');
  const primaryEndpoint = candidateEndpoints[0] ?? `${apiBaseUrl}/api/reports`;
  const imageUrlList = imageUrls?.length ? imageUrls : imageUrl ? [imageUrl] : [];
  let idToken: string | null = null;

  try {
    idToken = await currentUser.getIdToken();
  } catch {
    idToken = null;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (idToken) {
    headers.Authorization = `Bearer ${idToken}`;
  }

  const payload: IncidentReportSubmissionPayload = {
    clientRequestId,
    name: trimmedFullName,
    fullName: trimmedFullName,
    phone: trimmedContactNumber,
    contactNumber: trimmedContactNumber,
    address: trimmedAddress,
    report: trimmedReport,
    language: inferReportLanguage(trimmedReport),
    latitude: currentLocation?.latitude ?? null,
    longitude: currentLocation?.longitude ?? null,
    imageUrl: imageUrl || null,
    imageUrls: imageUrlList,
    location: currentLocation
      ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracy: currentLocation.accuracy,
          capturedAt: currentLocation.capturedAt,
        }
      : null,
    createdAtClient,
    uid: currentUser.uid,
    email: currentUser.email ?? null,
  };

  let response: Response | null = null;
  let responseEndpoint = primaryEndpoint;
  let lastNetworkError: unknown = null;

  for (const endpoint of candidateEndpoints) {
    try {
      response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        },
        REPORT_SUBMISSION_FETCH_TIMEOUT_MS
      );
      responseEndpoint = endpoint;
      break;
    } catch (error) {
      lastNetworkError = error;
      console.warn('Report backend submission attempt failed:', {
        endpoint,
        timeoutMs: REPORT_SUBMISSION_FETCH_TIMEOUT_MS,
        error: error instanceof Error ? error.message : error,
        clientRequestId,
      });
    }
  }

  if (!response) {
    const temporaryReportId = buildTemporaryReportId();

    try {
      console.warn('Backend unreachable. Using Firestore fallback for report save.', {
        triedEndpoints: candidateEndpoints,
        clientRequestId,
        temporaryReportId,
      });

      return await saveReportToFirestoreFallback({
        payload,
        temporaryReportId,
      });
    } catch (fallbackError) {
      const firebaseFallbackError = fallbackError as FirebaseLikeError;

      console.error('Fallback Firestore report save failed:', {
        error: fallbackError instanceof Error ? fallbackError.message : fallbackError,
        code: firebaseFallbackError.code,
        clientRequestId,
        temporaryReportId,
      });

      throw new ReportSubmissionError(
        'Unable to reach backend report submission endpoint.',
        firebaseFallbackError.code === 'permission-denied'
          ? `The backend could not be reached, and the locked-down Firestore fallback was denied. ${buildConnectionErrorMessage(apiBaseUrl)}`
          : `${buildConnectionErrorMessage(apiBaseUrl)} Tried: ${candidateBaseUrls.join(', ')}`
      );
    }
  }

  const responseText = await response.text();
  let parsedResponse: BackendReportResponse | null = null;

  if (responseText) {
    try {
      parsedResponse = JSON.parse(responseText) as BackendReportResponse;
    } catch {
      parsedResponse = null;
    }
  }

  if (!response.ok || parsedResponse?.success === false) {
    console.error('Report backend submission failed:', {
      endpoint: responseEndpoint,
      status: response.status,
      statusText: response.statusText,
      responseBody: responseText,
      lastNetworkError: lastNetworkError instanceof Error ? lastNetworkError.message : lastNetworkError,
      clientRequestId,
    });

    throw new ReportSubmissionError(
      `Backend report submission failed with status ${response.status}.`,
      toBackendFailureUserMessage(response.status, parsedResponse?.message)
    );
  }

  const responseData = parsedResponse?.data;
  const canonicalReportId = isValidCanonicalReportId(responseData?.reportId)
    ? responseData.reportId.trim()
    : null;

  if (!canonicalReportId) {
    console.error('Backend report submission returned an invalid canonical report ID.', {
      endpoint: responseEndpoint,
      responseBody: responseText,
      parsedResponse,
      clientRequestId,
    });

    throw new ReportSubmissionError(
      'Backend report submission did not return a canonical report ID.',
      'Your report could not be confirmed because the server did not return a valid report ID. Please try again.'
    );
  }

  return {
    id: responseData?.id,
    reportId: canonicalReportId,
    referenceType: 'canonical',
    storedBy: 'backend',
    clientRequestId,
    urgency: responseData?.urgency,
    urgencyConfidence:
      typeof responseData?.urgencyConfidence === 'number' ? responseData.urgencyConfidence : null,
    urgencyScores: toUrgencyScores(responseData?.urgencyScores),
    message: parsedResponse?.message,
  };
}
