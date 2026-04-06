import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { getLocation } from '../services/api';
import { auth, db } from '../services/firebase';

type LocationSource = 'device' | 'approximate' | 'saved';

type ProfileLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
  source?: LocationSource;
};

type FormValues = {
  firstName: string;
  lastName: string;
  middleInitial: string;
  address: string;
  contactNumber: string;
  emergencyContact: string;
};

const EMPTY_FORM: FormValues = {
  firstName: '',
  lastName: '',
  middleInitial: '',
  address: '',
  contactNumber: '',
  emergencyContact: '',
};

export function UserFormPage() {
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState<FormValues>(EMPTY_FORM);
  const [profileLocation, setProfileLocation] = useState<ProfileLocation | null>(null);
  const [hasExistingProfile, setHasExistingProfile] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setIsLoadingProfile(false);
      return;
    }

    void (async () => {
      try {
        const profileRef = doc(db, 'residents', currentUser.uid);
        const profileSnapshot = await getDoc(profileRef);

        if (!profileSnapshot.exists()) {
          setHasExistingProfile(false);
          return;
        }

        setHasExistingProfile(true);
        const data = profileSnapshot.data() as Partial<FormValues> & {
          location?: Partial<ProfileLocation>;
        };

        setFormValues({
          firstName: data.firstName ?? '',
          lastName: data.lastName ?? '',
          middleInitial: data.middleInitial ?? '',
          address: data.address ?? '',
          contactNumber: data.contactNumber ?? '',
          emergencyContact: data.emergencyContact ?? '',
        });

        if (
          typeof data.location?.latitude === 'number' &&
          typeof data.location?.longitude === 'number'
        ) {
          setProfileLocation({
            latitude: data.location.latitude,
            longitude: data.location.longitude,
            accuracy:
              typeof data.location.accuracy === 'number' ? data.location.accuracy : null,
            capturedAt: data.location.capturedAt ?? new Date().toISOString(),
            source: 'saved',
          });
        }
      } catch (error) {
        console.error('Failed to load existing resident profile:', error);
        setErrorMessage('We could not load your saved profile right now.');
      } finally {
        setIsLoadingProfile(false);
      }
    })();
  }, []);

  const locationSummary = useMemo(() => {
    if (!profileLocation) {
      return 'No location captured yet.';
    }

    const sourceLabel =
      profileLocation.source === 'approximate'
        ? 'Approximate IP-based location'
        : profileLocation.source === 'saved'
          ? 'Saved resident location'
          : 'Current device location';

    return `${sourceLabel}: ${profileLocation.latitude.toFixed(6)}, ${profileLocation.longitude.toFixed(6)}`;
  }, [profileLocation]);

  const setFieldValue = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const validate = (): string | null => {
    if (!formValues.firstName.trim()) return 'Please enter your first name.';
    if (!formValues.lastName.trim()) return 'Please enter your last name.';
    if (!formValues.address.trim()) return 'Please enter your address.';
    if (!formValues.contactNumber.trim()) return 'Please enter your contact number.';
    if (formValues.contactNumber.trim().length < 11) {
      return 'Please enter a valid 11-digit contact number.';
    }
    if (!formValues.emergencyContact.trim()) return 'Please enter your emergency contact.';
    if (!profileLocation) return 'Please capture your location before saving.';
    return null;
  };

  const handleUseCurrentLocation = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    setIsLocating(true);

    try {
      const exactLocation = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('Geolocation is not supported in this browser.'));
          return;
        }

        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });

      setProfileLocation({
        latitude: exactLocation.coords.latitude,
        longitude: exactLocation.coords.longitude,
        accuracy: exactLocation.coords.accuracy ?? null,
        capturedAt: new Date().toISOString(),
        source: 'device',
      });
      setSuccessMessage('Current device location captured successfully.');
    } catch (error) {
      console.warn('Falling back to approximate IP-based location:', error);

      const [longitude, latitude] = await getLocation();
      setProfileLocation({
        latitude,
        longitude,
        accuracy: null,
        capturedAt: new Date().toISOString(),
        source: 'approximate',
      });
      setSuccessMessage(
        'Precise geolocation was unavailable, so we saved an approximate fallback location.'
      );
    } finally {
      setIsLocating(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setErrorMessage('Your session expired. Please sign in again.');
      return;
    }

    const validationMessage = validate();
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setIsSaving(true);

    try {
      await setDoc(
        doc(db, 'residents', currentUser.uid),
        {
          uid: currentUser.uid,
          email: currentUser.email ?? null,
          firstName: formValues.firstName.trim(),
          lastName: formValues.lastName.trim(),
          middleInitial: formValues.middleInitial.trim(),
          address: formValues.address.trim(),
          contactNumber: formValues.contactNumber.trim(),
          emergencyContact: formValues.emergencyContact.trim(),
          location: profileLocation,
          updatedAt: serverTimestamp(),
          ...(!hasExistingProfile ? { createdAt: serverTimestamp() } : {}),
        },
        { merge: true }
      );

      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Failed to save resident profile:', error);
      setErrorMessage('Unable to save your resident profile right now.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="page-card">
      <div className="section-header">
        <p className="eyebrow">Resident onboarding</p>
        <h1 className="section-title">Complete your user form</h1>
        <p className="text-muted">
          This adapts the Expo resident profile setup for the web. For now, it
          captures your profile and location without the map UI, then stores the
          same Firestore document shape used by the mobile app.
        </p>
      </div>

      {isLoadingProfile ? (
        <div className="status-card">
          <span className="status-chip">Loading</span>
          <p className="text-muted">Checking whether you already have a saved resident profile.</p>
        </div>
      ) : null}

      {errorMessage ? <div className="alert">{errorMessage}</div> : null}
      {successMessage ? <div className="alert success-alert">{successMessage}</div> : null}

      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="form-grid two-up">
          <div className="field">
            <label htmlFor="first-name">First name</label>
            <input
              id="first-name"
              value={formValues.firstName}
              onChange={(event) => setFieldValue('firstName', event.target.value)}
              placeholder="Juan"
            />
          </div>

          <div className="field">
            <label htmlFor="last-name">Last name</label>
            <input
              id="last-name"
              value={formValues.lastName}
              onChange={(event) => setFieldValue('lastName', event.target.value)}
              placeholder="Dela Cruz"
            />
          </div>
        </div>

        <div className="form-grid two-up">
          <div className="field">
            <label htmlFor="middle-initial">Middle initial</label>
            <input
              id="middle-initial"
              value={formValues.middleInitial}
              onChange={(event) => setFieldValue('middleInitial', event.target.value)}
              placeholder="M"
              maxLength={2}
            />
          </div>

          <div className="field">
            <label htmlFor="contact-number">Contact number</label>
            <input
              id="contact-number"
              inputMode="numeric"
              value={formValues.contactNumber}
              onChange={(event) => setFieldValue('contactNumber', event.target.value)}
              placeholder="09XXXXXXXXX"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="address">Address</label>
          <textarea
            id="address"
            value={formValues.address}
            onChange={(event) => setFieldValue('address', event.target.value)}
            placeholder="Enter your complete home address"
          />
        </div>

        <div className="field">
          <label htmlFor="emergency-contact">Emergency contact</label>
          <input
            id="emergency-contact"
            value={formValues.emergencyContact}
            onChange={(event) => setFieldValue('emergencyContact', event.target.value)}
            placeholder="Name and phone number"
          />
        </div>

        <div className="meta-grid">
          <div className="status-card">
            <span className="status-chip">Location</span>
            <p className="text-muted">{locationSummary}</p>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
              >
                {isLocating ? 'Locating...' : 'Use my current location'}
              </button>
            </div>
          </div>

          <div className="meta-card">
            <strong>Phase 1 note</strong>
            <p className="text-muted">
              The Expo map-based pinning flow will be migrated next. This first
              web page uses browser geolocation so the same resident profile can
              already be stored in Firestore.
            </p>
          </div>
        </div>

        <div className="btn-row">
          <button type="submit" className="btn btn--primary" disabled={isSaving || isLoadingProfile}>
            {isSaving ? 'Saving profile...' : 'Save and continue'}
          </button>
        </div>
      </form>
    </section>
  );
}
