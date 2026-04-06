import {
  collection,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../services/firebase';
import {
  type DistressReportDoc,
  getTrackerStageLabel,
  toDateValue,
} from '../services/reportTracker';

type TrackedReport = {
  id: string;
  reportId: string;
  report: string;
  status: string;
  createdAtText: string;
  createdAtMillis: number;
  rawData: DistressReportDoc;
};

export function ReportTrackerPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<TrackedReport[]>([]);
  const [searchText, setSearchText] = useState('');
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setReports([]);
      setIsLoadingReports(false);
      setLoadError('Please sign in again to load your reports.');
      return;
    }

    const reportsRef = collection(db, 'distressReports');
    const reportsQuery = query(reportsRef, where('uid', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      reportsQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const mappedReports = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() as DistressReportDoc;
          const createdAtDate = toDateValue(data.createdAt);

          return {
            id: docSnap.id,
            reportId: data.reportId ?? 'No Report ID',
            report: data.report ?? '',
            status: data.status ?? 'submitted',
            createdAtText: createdAtDate ? createdAtDate.toLocaleDateString() : 'No date',
            createdAtMillis: createdAtDate?.getTime() ?? 0,
            rawData: data,
          };
        });

        mappedReports.sort((a, b) => b.createdAtMillis - a.createdAtMillis);
        setReports(mappedReports);
        setLoadError('');
        setIsLoadingReports(false);
      },
      (error) => {
        console.error('Failed to load reports:', error);
        setReports([]);
        setLoadError('Unable to load your report tracker right now. Please refresh and try again.');
        setIsLoadingReports(false);
      }
    );

    return unsubscribe;
  }, []);

  const filteredReports = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) {
      return reports;
    }

    return reports.filter((item) => {
      return (
        item.reportId.toLowerCase().includes(keyword) ||
        item.report.toLowerCase().includes(keyword) ||
        item.status.toLowerCase().includes(keyword) ||
        item.createdAtText.toLowerCase().includes(keyword)
      );
    });
  }, [reports, searchText]);

  return (
    <section className="page-card tracker-layout">
      <div className="section-header">
        <p className="eyebrow">Report tracking</p>
        <h1 className="section-title">Track your submitted reports</h1>
        <p className="text-muted">
          This page keeps the Expo tracker flow intact with a Firestore listener scoped to the
          signed-in resident.
        </p>
      </div>

      <div className="field">
        <label htmlFor="tracker-search">Search your reports</label>
        <input
          id="tracker-search"
          value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by report reference, status, or report text"
          />
        </div>

      {isLoadingReports ? (
        <div className="status-card">
          <span className="status-chip">Loading</span>
          <p className="text-muted">Loading your recent reports from Firestore.</p>
        </div>
      ) : loadError ? (
        <div className="empty-state">
          <strong>Tracker unavailable</strong>
          <p className="text-muted">{loadError}</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="empty-state">
          <strong>No reports found</strong>
          <p className="text-muted">Try another keyword or submit a new incident report first.</p>
        </div>
      ) : (
        <div className="tracker-list">
          {filteredReports.map((item) => (
            <button
              key={item.id}
              type="button"
              className="report-list-card"
              onClick={() => navigate(`/reports/${item.id}`)}
            >
              <div className="report-list-card-header">
                <strong>{item.reportId}</strong>
                <span className="status-chip">{getTrackerStageLabel(item.rawData)}</span>
              </div>
              <span className="small-muted">{item.createdAtText}</span>
              <p className="text-muted">{item.report || 'No report details'}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
