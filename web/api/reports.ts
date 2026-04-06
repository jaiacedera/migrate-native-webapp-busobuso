import { Timestamp } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from './_lib/firebaseAdmin';
import {
  assertAllowedOrigin,
  buildIdempotencyKey,
  buildIdempotencyRecord,
  buildJsonResponse,
  buildOptionsResponse,
  buildReportDocument,
  buildResponseData,
  ExistingRequestRecord,
  extractBearerToken,
  formatReportId,
  getDateKey,
  hashMaterialPayload,
  HttpError,
  normalizeReportSubmission,
  parseJsonBody,
  type ReportResponseBody,
  type ReportResponseData,
} from './_lib/reportSubmission';

const REPORTS_COLLECTION = 'distressReports';
const COUNTERS_COLLECTION = 'incidentReportCounters';
const REQUESTS_COLLECTION = 'incidentReportRequests';

export const runtime = 'nodejs';

const successResponse = ({
  message,
  data,
}: {
  message: string;
  data: ReportResponseData;
}): ReportResponseBody => ({
  success: true,
  message,
  data,
});

const errorResponse = (message: string): ReportResponseBody => ({
  success: false,
  message,
});

const isFirebaseAuthError = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as { code?: unknown }).code === 'string' &&
      String((error as { code: string }).code).startsWith('auth/')
  );

export function OPTIONS(request: Request): Response {
  return buildOptionsResponse(request);
}

export function GET(request: Request): Response {
  return buildJsonResponse(request, 405, errorResponse('Method not allowed.'));
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertAllowedOrigin(request);
    const idToken = extractBearerToken(request.headers.get('authorization'));

    if (!idToken) {
      return buildJsonResponse(request, 401, errorResponse('Missing Firebase ID token.'));
    }

    const decodedToken = await adminAuth().verifyIdToken(idToken);
    const requestBody = await parseJsonBody(request);
    const submission = normalizeReportSubmission(requestBody);

    if (decodedToken.uid !== submission.uid) {
      return buildJsonResponse(
        request,
        403,
        errorResponse('Authenticated user does not match the submitted uid.')
      );
    }

    const db = adminDb();
    const dateKey = getDateKey(new Date());
    const createdAt = Timestamp.now();
    const createdAtIso = createdAt.toDate().toISOString();
    const materialPayloadHash = hashMaterialPayload(submission.materialPayload);
    const requestDocId = buildIdempotencyKey(submission.uid, submission.clientRequestId);
    const requestRef = db.collection(REQUESTS_COLLECTION).doc(requestDocId);
    const counterRef = db.collection(COUNTERS_COLLECTION).doc(dateKey);
    const reportRef = db.collection(REPORTS_COLLECTION).doc();
    const outcome = await db.runTransaction(async (transaction) => {
      const existingRequestSnap = await transaction.get(requestRef);

      if (existingRequestSnap.exists) {
        const existingRequest = existingRequestSnap.data() as ExistingRequestRecord;

        if (existingRequest.materialPayloadHash !== materialPayloadHash) {
          throw new HttpError(
            409,
            'This clientRequestId has already been used for a different report payload.'
          );
        }

        const existingResponse = existingRequest.response as ReportResponseData | undefined;

        if (!existingResponse?.id || !existingResponse.reportId) {
          throw new HttpError(
            500,
            'The existing idempotent report record is incomplete. Please contact support.'
          );
        }

        return {
          status: 200,
          body: successResponse({
            message: 'Report already submitted for this clientRequestId.',
            data: existingResponse,
          }),
        };
      }

      const counterSnap = await transaction.get(counterRef);
      const lastSequenceRaw = counterSnap.data()?.lastSequence;
      const lastSequence =
        typeof lastSequenceRaw === 'number' && Number.isFinite(lastSequenceRaw) && lastSequenceRaw > 0
          ? lastSequenceRaw
          : 0;
      const nextSequence = lastSequence + 1;
      const reportId = formatReportId(dateKey, nextSequence);
      const responseData = buildResponseData({
        id: reportRef.id,
        reportId,
        status: 'submitted',
        createdAt: createdAtIso,
      });

      transaction.set(
        counterRef,
        {
          dateKey,
          lastSequence: nextSequence,
          updatedAt: createdAt,
        },
        { merge: true }
      );
      transaction.set(
        reportRef,
        buildReportDocument({
          submission,
          reportId,
          dateKey,
          sequence: nextSequence,
          createdAt,
          createdAtIso,
          materialPayloadHash,
        })
      );
      transaction.set(
        requestRef,
        buildIdempotencyRecord({
          uid: submission.uid,
          clientRequestId: submission.clientRequestId,
          materialPayloadHash,
          reportDocId: reportRef.id,
          response: responseData,
          createdAt,
        })
      );

      return {
        status: 201,
        body: successResponse({
          message: 'Report submitted successfully.',
          data: responseData,
        }),
      };
    });

    return buildJsonResponse(request, outcome.status, outcome.body);
  } catch (error) {
    if (error instanceof HttpError) {
      return buildJsonResponse(request, error.status, errorResponse(error.message));
    }

    if (isFirebaseAuthError(error)) {
      return buildJsonResponse(request, 401, errorResponse('Invalid Firebase ID token.'));
    }

    console.error('Unhandled /api/reports error:', error);
    return buildJsonResponse(
      request,
      500,
      errorResponse('Unable to submit your report right now. Please try again.')
    );
  }
}
