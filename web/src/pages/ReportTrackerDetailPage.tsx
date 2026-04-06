import { collection, documentId, onSnapshot, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { auth, db } from '../services/firebase';
import {
  buildTrackerSteps,
  type DistressReportDoc,
  toDateValue,
} from '../services/reportTracker';

export function ReportTrackerDetailPage() {
  const { reportDocId } = useParams<{ reportDocId: string }>();
  const [reportData, setReportData] = useState<DistressReportDoc | null>(null);
  const [createdAtDate, setCreatedAtDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!reportDocId) {
      setIsLoading(false);
      setReportData(null);
      setErrorMessage('A report reference is required to open this page.');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setIsLoading(false);
      setReportData(null);
      setErrorMessage('Please sign in again before opening report details.');
      return;
    }

    const reportQuery = query(
      collection(db, 'distressReports'),
      where(documentId(), '==', reportDocId),
      where('uid', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      reportQuery,
      (snapshot) => {
        const reportDoc = snapshot.docs[0];

        if (!reportDoc) {
          setReportData(null);
          setCreatedAtDate(null);
          setErrorMessage('This report could not be found or you no longer have access to it.');
          setIsLoading(false);
          return;
        }

        const data = reportDoc.data() as DistressReportDoc;
        setReportData(data);
        setCreatedAtDate(toDateValue(data.createdAt));
        setErrorMessage('');
        setIsLoading(false);
      },
      (error) => {
        console.error('Failed to load report tracker details:', error);
        setReportData(null);
        setCreatedAtDate(null);
        setErrorMessage('Unable to load this report right now. Please try again in a moment.');
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [reportDocId]);

  const trackerSteps = useMemo(
    () =>
      reportData
        ? buildTrackerSteps({
            reportData,
            createdAtDate,
          })
        : [],
    [createdAtDate, reportData]
  );

  const visibleTrackerSteps = useMemo(
    () => trackerSteps.filter((step) => step.state !== 'pending'),
    [trackerSteps]
  );

  const reporterName = reportData?.fullName || reportData?.name || 'Not provided';
  const reportedAddress = reportData?.address || 'Not provided';
  const reportedContactNumber = reportData?.contactNumber || reportData?.phone || 'Not provided';

  return (
    <section className="page-card tracker-detail-layout">
      <div className="section-header">
        <p className="eyebrow">Tracker detail</p>
        <h1 className="section-title">Report progress</h1>
        <div className="btn-row">
          <Link to="/reports/tracker" className="btn btn--ghost">
            Back to tracker
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="status-card">
          <span className="status-chip">Loading</span>
          <p className="text-muted">Loading the latest responder progress.</p>
        </div>
      ) : !reportData ? (
        <div className="empty-state">
          <strong>Report unavailable</strong>
          <p className="text-muted">
            {errorMessage || 'This report could not be found or is no longer available.'}
          </p>
        </div>
      ) : (
        <>
          <div className="info-grid">
            <div className="info-tile">
              <span className="small-muted">Name</span>
              <strong>{reporterName}</strong>
            </div>
            <div className="info-tile">
              <span className="small-muted">Address</span>
              <strong>{reportedAddress}</strong>
            </div>
            <div className="info-tile">
              <span className="small-muted">Contact</span>
              <strong>{reportedContactNumber}</strong>
            </div>
            <div className="info-tile">
              <span className="small-muted">Report reference</span>
              <strong>{reportData.reportId ?? reportDocId ?? 'Unknown report'}</strong>
            </div>
          </div>

          <article className="report-summary-card">
            <span className="small-muted">Report summary</span>
            <p>{reportData.report || 'No report details were saved.'}</p>
          </article>

          <div className="timeline">
            {visibleTrackerSteps.map((step) => (
              <article key={step.key} className={`timeline-item timeline-item--${step.state}`}>
                <div className="timeline-marker" />
                <div className="timeline-body">
                  <strong>{step.title}</strong>
                  {step.details.length > 0 ? (
                    step.details.map((detail, index) => (
                      <p key={`${step.key}-${index}`} className="text-muted">
                        {detail}
                      </p>
                    ))
                  ) : (
                    <p className="text-muted">Waiting for the next tracker update.</p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
