import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MapPicker, type MapLocation } from '../components/map/MapPicker';
import { reverseGeocodeCoordinates } from '../services/api';
import {
  MAX_CLOUDINARY_IMAGE_SIZE_MB,
  uploadImageToCloudinary,
  validateImageUploadFile,
} from '../services/cloudinaryUpload';
import { auth } from '../services/firebase';
import {
  copyUserProfile,
  getReportSubmissionErrorMessage,
  submitIncidentReport,
} from '../services/reportService';

const DEFAULT_REPORT_CENTER: [number, number] = [120.947874, 14.024067];
const MAX_REPORT_ATTACHMENTS = 4;

const composeResidentName = (profile: {
  firstName?: string;
  middleInitial?: string;
  lastName?: string;
}) =>
  [
    profile.firstName?.trim(),
    profile.middleInitial?.trim() ? `${profile.middleInitial.trim()}.` : '',
    profile.lastName?.trim(),
  ]
    .filter(Boolean)
    .join(' ');

const loadBrowserLocation = async (): Promise<MapLocation | null> => {
  if (!navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
          capturedAt: new Date().toISOString(),
        });
      },
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
};

const getFileFingerprint = (file: File): string => `${file.name}-${file.lastModified}-${file.size}`;

export function ReportsPage() {
  const [fullName, setFullName] = useState('');
  const [address, setAddress] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [reportText, setReportText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isCopyingProfile, setIsCopyingProfile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportId, setReportId] = useState('');
  const [reportReferenceType, setReportReferenceType] = useState<'canonical' | 'temporary'>(
    'canonical'
  );
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<MapLocation | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_REPORT_CENTER);
  const [isPinningLocation, setIsPinningLocation] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const location = await loadBrowserLocation();
      if (!location || !isMounted) {
        return;
      }

      setMapCenter([location.longitude, location.latitude]);
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const filePreviewUrls = useMemo(
    () => selectedFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [selectedFiles]
  );

  useEffect(() => {
    return () => {
      filePreviewUrls.forEach(({ url }) => URL.revokeObjectURL(url));
    };
  }, [filePreviewUrls]);

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    const validFiles: File[] = [];
    const issues: string[] = [];

    files.forEach((file) => {
      try {
        validateImageUploadFile(file);
        validFiles.push(file);
      } catch (error) {
        issues.push(error instanceof Error ? `${file.name}: ${error.message}` : file.name);
      }
    });

    if (validFiles.length > MAX_REPORT_ATTACHMENTS) {
      validFiles.length = MAX_REPORT_ATTACHMENTS;
      issues.push(`Only ${MAX_REPORT_ATTACHMENTS} images can be attached to a single report.`);
    }

    setSelectedFiles(validFiles);
    setStatusMessage('');
    setErrorMessage(issues[0] ?? '');
    event.target.value = '';
  };

  const handleRemoveFile = (fileFingerprint: string) => {
    setSelectedFiles((current) =>
      current.filter((file) => getFileFingerprint(file) !== fileFingerprint)
    );
  };

  const handleCopyProfile = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setErrorMessage('Please sign in again before copying your profile data.');
      return;
    }

    try {
      setIsCopyingProfile(true);
      setErrorMessage('');
      setStatusMessage('');

      const data = await copyUserProfile(currentUser.uid);
      if (!data) {
        setErrorMessage('No saved resident profile was found. Please finish your user form first.');
        return;
      }

      const composedName = composeResidentName(data);
      setFullName(composedName);
      setContactNumber(data.contactNumber?.trim() ?? '');

      if (data.address?.trim()) {
        setAddress(data.address.trim());
      }

      if (
        typeof data.location?.latitude === 'number' &&
        typeof data.location?.longitude === 'number'
      ) {
        const nextLocation: MapLocation = {
          latitude: data.location.latitude,
          longitude: data.location.longitude,
          accuracy: data.location.accuracy ?? null,
          capturedAt: data.location.capturedAt ?? new Date().toISOString(),
        };

        setCurrentLocation(nextLocation);
        setMapCenter([nextLocation.longitude, nextLocation.latitude]);
        setStatusMessage('Profile data copied. The saved user-form location is now pinned on the map.');
      } else {
        setStatusMessage('Profile data copied. Pin the exact report location before submitting.');
      }
    } catch (error) {
      console.error('Failed to copy profile data:', error);
      setErrorMessage('Unable to copy your profile data right now.');
    } finally {
      setIsCopyingProfile(false);
    }
  };

  const handlePinCurrentLocation = async () => {
    try {
      setIsPinningLocation(true);
      setErrorMessage('');
      const location = await loadBrowserLocation();

      if (!location) {
        setErrorMessage('Location permission was denied or the browser could not resolve your position.');
        return;
      }

      setCurrentLocation(location);
      setMapCenter([location.longitude, location.latitude]);
      setStatusMessage('Current browser location pinned successfully.');

      if (!address.trim()) {
        const resolvedAddress = await reverseGeocodeCoordinates(location.latitude, location.longitude);
        setAddress(resolvedAddress);
      }
    } catch (error) {
      console.error('Failed to pin browser location:', error);
      setErrorMessage('Unable to pin your current location right now.');
    } finally {
      setIsPinningLocation(false);
    }
  };

  const handleMapLocationChange = (location: MapLocation) => {
    setCurrentLocation(location);
    setMapCenter([location.longitude, location.latitude]);
    setStatusMessage('Map pin updated.');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setStatusMessage('');

    if (!fullName.trim() || !address.trim() || !contactNumber.trim() || !reportText.trim()) {
      setErrorMessage('Please complete all required fields before submitting.');
      return;
    }

    if (!currentLocation) {
      setErrorMessage('Please pin your report location on the map before submitting.');
      return;
    }

    try {
      setIsSubmitting(true);
      setReportId('');
      setReportReferenceType('canonical');

      const uploadResults = await Promise.all(
        selectedFiles.map((file) => uploadImageToCloudinary(file))
      );
      const imageUrls = uploadResults.map((result) => result.url);

      const submittedReport = await submitIncidentReport({
        fullName,
        address,
        contactNumber,
        report: reportText,
        currentLocation,
        imageUrl: imageUrls[0] ?? '',
        imageUrls,
      });

      setReportId(submittedReport.reportId ?? submittedReport.id ?? '');
      setReportReferenceType(submittedReport.referenceType);
      setIsSubmitted(true);
      setStatusMessage(
        submittedReport.referenceType === 'temporary'
          ? 'The backend could not be reached, so your report was saved with a temporary web reference.'
          : 'Your incident report was submitted and assigned a canonical report ID.'
      );
    } catch (error) {
      console.error('Failed to submit incident report:', error);
      const userMessage = getReportSubmissionErrorMessage(error);
      setErrorMessage(userMessage ?? 'Unable to submit your report right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <section className="page-card report-success">
        <p className="eyebrow">Report submitted</p>
        <h1 className="section-title">Your report is now in the system</h1>
        <p className="text-muted">
          The preferred path is now backend-owned report creation, with a Firestore fallback only if
          the backend cannot be reached.
        </p>

        <div className="meta-grid">
          <div className="meta-card">
            <strong>{reportReferenceType === 'temporary' ? 'Temporary reference' : 'Report ID'}</strong>
            <p className="text-muted">{reportId || 'Pending assignment'}</p>
          </div>
          <div className="meta-card">
            <strong>Next step</strong>
            <p className="text-muted">
              {reportReferenceType === 'temporary'
                ? 'Open the tracker page to monitor the saved report while the backend-issued report ID is still pending.'
                : 'Open the tracker page to monitor assignment and responder progress.'}
            </p>
          </div>
        </div>

        <div className="btn-row">
          <Link to="/reports/tracker" className="btn btn--primary">
            Open tracker
          </Link>
          <Link to="/dashboard" className="btn btn--ghost">
            Back to dashboard
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="page-card report-layout">
      <div className="section-header">
        <p className="eyebrow">Incident reports</p>
        <h1 className="section-title">Submit a resident report</h1>
        <p className="text-muted">
          This web version sends reports to the backend first so the Admin SDK can create the
          canonical incident record and report ID.
        </p>
      </div>

      <div className="note-banner">
        <strong>Phase 1 fallback</strong>
        <p className="text-muted">
          Voice dictation from the Expo screen is not included yet. Use the report text box for now,
          then we can add a Web Speech API fallback in a later pass.
        </p>
      </div>

      {errorMessage ? <div className="alert">{errorMessage}</div> : null}
      {statusMessage ? <div className="alert success-alert">{statusMessage}</div> : null}

      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="form-grid two-up">
          <div className="field">
            <label htmlFor="report-full-name">Full name</label>
            <input
              id="report-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Enter your full name"
            />
          </div>
          <div className="field">
            <label htmlFor="report-contact-number">Contact number</label>
            <input
              id="report-contact-number"
              value={contactNumber}
              onChange={(event) => setContactNumber(event.target.value)}
              placeholder="09XXXXXXXXX"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="report-address">Address</label>
          <textarea
            id="report-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Enter the exact report address"
          />
        </div>

        <div className="field">
          <label>Pin exact report location</label>
          <MapPicker
            center={mapCenter}
            selectedLocation={currentLocation}
            onSelectLocation={handleMapLocationChange}
          />
          <div className="inline-actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handlePinCurrentLocation}
              disabled={isPinningLocation}
            >
              {isPinningLocation ? 'Pinning...' : 'Use my current location'}
            </button>
            <span className="small-muted">
              {currentLocation
                ? `Pinned at ${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`
                : 'Click the map to set an exact pin.'}
            </span>
          </div>
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn--subtle"
            onClick={handleCopyProfile}
            disabled={isCopyingProfile}
          >
            {isCopyingProfile ? 'Copying...' : 'Copy profile data'}
          </button>
        </div>

        <div className="field">
          <label htmlFor="incident-report-body">Report</label>
          <textarea
            id="incident-report-body"
            value={reportText}
            onChange={(event) => setReportText(event.target.value)}
            placeholder="Describe the incident, injuries, immediate risks, and what help is needed."
          />
        </div>

        <div className="field">
          <label htmlFor="incident-photos">Attached photos</label>
          <input
            id="incident-photos"
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            onChange={handleFilesSelected}
          />
          <small>Browser uploads replace the Expo camera and image picker flow for phase 1.</small>
          <small>
            Up to {MAX_REPORT_ATTACHMENTS} images, {MAX_CLOUDINARY_IMAGE_SIZE_MB} MB each.
          </small>
        </div>

        {filePreviewUrls.length > 0 ? (
          <div className="photo-grid">
            {filePreviewUrls.map(({ file, url }) => (
              <article key={getFileFingerprint(file)} className="photo-card">
                <img src={url} alt={file.name} />
                <div className="photo-card-body">
                  <strong>{file.name}</strong>
                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    onClick={() => handleRemoveFile(getFileFingerprint(file))}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        <div className="btn-row">
          <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit report'}
          </button>
          <Link to="/reports/tracker" className="btn btn--ghost">
            Open tracker
          </Link>
        </div>
      </form>
    </section>
  );
}
