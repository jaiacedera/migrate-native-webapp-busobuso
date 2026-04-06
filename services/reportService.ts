import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    runTransaction,
    serverTimestamp,
    where,
} from 'firebase/firestore';
import { buildApiUrls, getApiBaseUrl, getApiBaseUrlCandidates } from './api';
import { auth, db } from './firebaseconfig';

type BackendUrgencyScores = Record<string, number>;

type BackendReportResponse = {
  success?: boolean;
  message?: string;
  data?: {
    id?: string;
    reportId?: string;
    urgency?: string;
    urgencyConfidence?: number;
    urgencyScores?: BackendUrgencyScores;
  };
};

type SubmittedReportResult = {
  id?: string;
  reportId?: string;
  urgency?: string;
  urgencyConfidence?: number | null;
  urgencyScores?: BackendUrgencyScores | null;
  message?: string;
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
      typeof rawScore === 'number' ? rawScore : typeof rawScore === 'string' ? Number(rawScore) : NaN;

    return Number.isFinite(numericScore) ? [[label, numericScore] as const] : [];
  });

  return numericEntries.length > 0 ? Object.fromEntries(numericEntries) : null;
};

const buildConnectionErrorMessage = (apiBaseUrl: string): string =>
  `Unable to submit your report right now. Make sure the backend server is reachable at ${apiBaseUrl}. If you are using a physical device, set EXPO_PUBLIC_API_BASE_URL to your computer LAN IP instead of localhost.`;

const fetchWithTimeout = async (
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

const saveReportToFirestoreFallback = async ({
  payload,
  reservedReport,
}: {
  payload: {
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
    location: {
      latitude: number;
      longitude: number;
      accuracy: number | null;
      capturedAt: string;
    } | null;
    reportId: string;
    dateKey: string;
    sequence: number;
    createdAt: string;
    uid: string;
    email: string | null;
  };
  reservedReport: {
    reportId: string;
    dateKey: string;
    sequence: number;
  };
}): Promise<SubmittedReportResult> => {
  const createdDoc = await addDoc(collection(db, 'distressReports'), {
    ...payload,
    status: 'submitted',
    fallbackSource: 'firestore',
    createdAt: serverTimestamp(),
    createdAtClient: payload.createdAt,
    updatedAt: serverTimestamp(),
  });

  return {
    id: createdDoc.id,
    reportId: reservedReport.reportId,
    message: 'Report saved via fallback submission.',
  };
};

const getDateKey = (value: Date): string =>
  `${value.getFullYear()}${String(value.getMonth() + 1).padStart(2, '0')}${String(value.getDate()).padStart(2, '0')}`;

const formatReportId = (dateKey: string, sequence: number): string =>
  `IR-${dateKey}-${String(sequence).padStart(4, '0')}`;

const isValidReportId = (value?: string | null): value is string =>
  typeof value === 'string' && REPORT_ID_PATTERN.test(value.trim());

const reserveDailyReportId = async (): Promise<{
  reportId: string;
  dateKey: string;
  sequence: number;
}> => {
  const now = new Date();
  const dateKey = getDateKey(now);
  const counterRef = doc(db, 'incidentReportCounters', dateKey);
  let sequence: number;

  try {
    sequence = await runTransaction(db, async (transaction: any) => {
      const counterSnap = await transaction.get(counterRef);
      const lastSequence = counterSnap.exists()
        ? (counterSnap.data().lastSequence as number | undefined) ?? 0
        : 0;
      const nextSequence = lastSequence + 1;

      transaction.set(
        counterRef,
        {
          dateKey,
          lastSequence: nextSequence,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      return nextSequence;
    });
  } catch {
    try {
      const reportsForDateSnapshot = await getDocs(
        query(collection(db, 'distressReports'), where('dateKey', '==', dateKey))
      );

      let maxSequence = 0;
      reportsForDateSnapshot.forEach((reportDoc) => {
        const reportData = reportDoc.data() as { sequence?: unknown; reportId?: unknown };
        const existingSequence = Number(reportData.sequence);

        if (Number.isFinite(existingSequence) && existingSequence > maxSequence) {
          maxSequence = existingSequence;
          return;
        }

        if (typeof reportData.reportId === 'string') {
          const match = reportData.reportId.match(/^IR-\d{8}-(\d{4})$/);
          const parsedSequence = match ? Number(match[1]) : NaN;

          if (Number.isFinite(parsedSequence) && parsedSequence > maxSequence) {
            maxSequence = parsedSequence;
          }
        }
      });

      sequence = maxSequence + 1;
    } catch {
      sequence = 1;
    }
  }

  return {
    reportId: formatReportId(dateKey, sequence),
    dateKey,
    sequence,
  };
};

export const getReportSubmissionErrorMessage = (error: unknown): string | null =>
  error instanceof ReportSubmissionError ? error.userMessage : null;

export async function copyUserProfile(currentUserUid: string) {
  const profileRef = doc(db, 'residents', currentUserUid);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) {
    return null;
  }
  return profileSnap.data();
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
  currentLocation: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    capturedAt: string;
  } | null;
  imageUrl: string;
  imageUrls?: string[];
}): Promise<SubmittedReportResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new ReportSubmissionError(
      'Current user is missing for report submission.',
      'Session Expired: Please log in again before submitting a report.'
    );
  }

  const trimmedFullName = fullName.trim();
  const trimmedAddress = address.trim();
  const trimmedContactNumber = contactNumber.trim();
  const trimmedReport = report.trim();
  const createdAt = new Date().toISOString();
  const apiBaseUrl = getApiBaseUrl();
  const candidateBaseUrls = getApiBaseUrlCandidates();
  const candidateEndpoints = buildApiUrls('/api/reports');
  const primaryEndpoint = candidateEndpoints[0] ?? `${apiBaseUrl}/api/reports`;
  const imageUrlList = imageUrls?.length ? imageUrls : imageUrl ? [imageUrl] : [];
  const reservedReport = await reserveDailyReportId();
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

  const payload = {
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
    reportId: reservedReport.reportId,
    dateKey: reservedReport.dateKey,
    sequence: reservedReport.sequence,
    createdAt,
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
      });
    }
  }

  if (!response) {
    try {
      console.warn('Backend unreachable. Using Firestore fallback for report save.', {
        triedEndpoints: candidateEndpoints,
      });

      return await saveReportToFirestoreFallback({
        payload,
        reservedReport,
      });
    } catch (fallbackError) {
      console.error('Fallback Firestore report save failed:', {
        error: fallbackError instanceof Error ? fallbackError.message : fallbackError,
      });

      throw new ReportSubmissionError(
        'Unable to reach backend report submission endpoint.',
        `${buildConnectionErrorMessage(apiBaseUrl)} Tried: ${candidateBaseUrls.join(', ')}`
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
      lastNetworkError:
        lastNetworkError instanceof Error ? lastNetworkError.message : lastNetworkError,
    });

    throw new ReportSubmissionError(
      `Backend report submission failed with status ${response.status}.`,
      parsedResponse?.message?.trim() || 'Unable to submit your report right now. Please try again.'
    );
  }

  const responseData = parsedResponse?.data;

  return {
    id: responseData?.id,
    reportId: isValidReportId(responseData?.reportId)
      ? responseData.reportId.trim()
      : reservedReport.reportId,
    urgency: responseData?.urgency,
    urgencyConfidence:
      typeof responseData?.urgencyConfidence === 'number' ? responseData.urgencyConfidence : null,
    urgencyScores: toUrgencyScores(responseData?.urgencyScores),
    message: parsedResponse?.message,
  };
}
