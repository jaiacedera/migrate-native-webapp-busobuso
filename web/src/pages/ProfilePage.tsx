import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import defaultImage from '../../../assets/images/default_image.jpg';
import { MapPicker, type MapLocation } from '../components/map/MapPicker';
import { reverseGeocodeCoordinates } from '../services/api';
import { signOutUser } from '../services/auth';
import { uploadImageToCloudinary } from '../services/cloudinaryUpload';
import { auth, db } from '../services/firebase';

type ResidentProfile = {
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

const DEFAULT_PROFILE_CENTER: [number, number] = [120.947874, 14.024067];

const composeFullName = (profile: ResidentProfile | null, fallbackName: string) => {
  if (!profile) {
    return fallbackName;
  }

  const fullName = [
    profile.firstName?.trim(),
    profile.middleInitial?.trim() ? `${profile.middleInitial.trim()}.` : '',
    profile.lastName?.trim(),
  ]
    .filter(Boolean)
    .join(' ');

  return fullName || fallbackName;
};

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

export function ProfilePage() {
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState<ResidentProfile | null>(null);
  const [displayName, setDisplayName] = useState('Resident');
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [editableAddress, setEditableAddress] = useState('');
  const [pinnedLocation, setPinnedLocation] = useState<MapLocation | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_PROFILE_CENTER);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isPinningLocation, setIsPinningLocation] = useState(false);
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setIsProfileLoading(false);
      return;
    }

    const fallbackAuthName =
      currentUser.displayName?.trim() || currentUser.email?.split('@')[0]?.trim() || 'Resident';
    const profileRef = doc(db, 'residents', currentUser.uid);

    const unsubscribe = onSnapshot(
      profileRef,
      (profileSnap) => {
        if (!profileSnap.exists()) {
          setDisplayName(fallbackAuthName);
          setProfileData(null);
          setEditableAddress('');
          setPinnedLocation(null);
          setIsProfileLoading(false);
          return;
        }

        const data = profileSnap.data() as ResidentProfile;
        setProfileData(data);
        setDisplayName(composeFullName(data, fallbackAuthName));
        setEditableAddress(data.address ?? '');

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
          setPinnedLocation(nextLocation);
          setMapCenter([nextLocation.longitude, nextLocation.latitude]);
        }

        setIsProfileLoading(false);
      },
      (error) => {
        console.error('Failed to listen to profile data:', error);
        setIsProfileLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const avatarUrl = useMemo(() => profileData?.profileImageUrl || defaultImage, [profileData]);

  const handleMapLocationChange = (location: MapLocation) => {
    setPinnedLocation(location);
    setMapCenter([location.longitude, location.latitude]);
  };

  const handlePinCurrentAddressLocation = async () => {
    try {
      setIsPinningLocation(true);
      setErrorMessage('');
      setSuccessMessage('');

      const location = await loadBrowserLocation();
      if (!location) {
        setErrorMessage('Location permission was denied or the browser could not resolve your position.');
        return;
      }

      setPinnedLocation(location);
      setMapCenter([location.longitude, location.latitude]);

      if (!editableAddress.trim()) {
        const resolvedAddress = await reverseGeocodeCoordinates(location.latitude, location.longitude);
        setEditableAddress(resolvedAddress);
      }

      setSuccessMessage('Current browser location pinned successfully.');
    } catch (error) {
      console.error('Failed to pin current address location:', error);
      setErrorMessage('Unable to get your current location right now.');
    } finally {
      setIsPinningLocation(false);
    }
  };

  const handleSaveAddress = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setErrorMessage('Your session expired. Please sign in again.');
      return;
    }

    const nextAddress = editableAddress.trim();
    if (!nextAddress) {
      setErrorMessage('Please enter your address.');
      return;
    }

    if (!pinnedLocation) {
      setErrorMessage('Please pin your exact location on the map before saving.');
      return;
    }

    try {
      setIsSavingAddress(true);
      setErrorMessage('');

      await setDoc(
        doc(db, 'residents', currentUser.uid),
        {
          address: nextAddress,
          location: pinnedLocation,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSuccessMessage('Address and location updated successfully.');
    } catch (error) {
      console.error('Failed to save address and location:', error);
      setErrorMessage('Unable to update your address right now.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleProfilePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const currentUser = auth.currentUser;
    const file = event.target.files?.[0];

    if (!currentUser || !file) {
      return;
    }

    try {
      setIsUploadingProfilePhoto(true);
      setErrorMessage('');
      setSuccessMessage('');

      const uploadResult = await uploadImageToCloudinary(file, {
        folder: import.meta.env.VITE_CLOUDINARY_PROFILE_FOLDER?.trim() || 'resident_profiles',
        uploadPreset:
          import.meta.env.VITE_CLOUDINARY_PROFILE_UPLOAD_PRESET?.trim() ||
          import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET?.trim(),
      });

      await setDoc(
        doc(db, 'residents', currentUser.uid),
        {
          profileImageUrl: uploadResult.url,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSuccessMessage('Profile photo updated successfully.');
    } catch (error) {
      console.error('Failed to upload profile photo:', error);
      setErrorMessage(
        error instanceof Error ? error.message : 'Unable to upload your profile photo right now.'
      );
    } finally {
      setIsUploadingProfilePhoto(false);
      event.target.value = '';
    }
  };

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOutUser();
      navigate('/auth', { replace: true });
    } catch (error) {
      console.error('Failed to sign out:', error);
      setErrorMessage('Unable to log out right now.');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="profile-grid">
      <section className="page-card profile-hero">
        <div className="profile-hero-top">
          <img className="profile-avatar" src={avatarUrl} alt={displayName} />
          <div>
            <p className="eyebrow">Resident profile</p>
            <h1 className="section-title">{displayName}</h1>
            <p className="text-muted">
              The web profile keeps the Firestore-backed resident record and replaces the mobile-only
              image picker and local file storage with a browser upload flow.
            </p>
          </div>
        </div>

        <div className="btn-row">
          <label className="btn btn--subtle profile-upload-btn">
            {isUploadingProfilePhoto ? 'Uploading...' : 'Upload new picture'}
            <input type="file" accept="image/*" onChange={handleProfilePhotoSelected} hidden />
          </label>
          <Link to="/reports/tracker" className="btn btn--ghost">
            Report tracker
          </Link>
          <button type="button" className="btn btn--ghost" onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut ? 'Signing out...' : 'Log out'}
          </button>
        </div>
      </section>

      <section className="page-card">
        <div className="section-header">
          <p className="eyebrow">Personal information</p>
          <h2 className="section-title">Resident record</h2>
        </div>

        {isProfileLoading ? (
          <div className="status-card">
            <span className="status-chip">Loading</span>
            <p className="text-muted">Loading your resident profile from Firestore.</p>
          </div>
        ) : (
          <div className="info-grid">
            <div className="info-tile">
              <span className="small-muted">First name</span>
              <strong>{profileData?.firstName || '-'}</strong>
            </div>
            <div className="info-tile">
              <span className="small-muted">Last name</span>
              <strong>{profileData?.lastName || '-'}</strong>
            </div>
            <div className="info-tile">
              <span className="small-muted">Middle initial</span>
              <strong>{profileData?.middleInitial || '-'}</strong>
            </div>
            <div className="info-tile">
              <span className="small-muted">Contact number</span>
              <strong>{profileData?.contactNumber || '-'}</strong>
            </div>
            <div className="info-tile">
              <span className="small-muted">Emergency contact</span>
              <strong>{profileData?.emergencyContact || '-'}</strong>
            </div>
            <div className="info-tile">
              <span className="small-muted">Address</span>
              <strong>{profileData?.address || '-'}</strong>
            </div>
          </div>
        )}
      </section>

      <section className="page-card">
        <div className="section-header">
          <p className="eyebrow">Address and pin</p>
          <h2 className="section-title">Update your location</h2>
          <p className="text-muted">
            This replaces the old WebView map modal with a live browser map. Click the map to move
            your pin, or use your current browser location.
          </p>
        </div>

        {errorMessage ? <div className="alert">{errorMessage}</div> : null}
        {successMessage ? <div className="alert success-alert">{successMessage}</div> : null}

        <div className="form-stack">
          <div className="field">
            <label htmlFor="profile-address">Address</label>
            <textarea
              id="profile-address"
              value={editableAddress}
              onChange={(event) => setEditableAddress(event.target.value)}
              placeholder="Enter your current address"
            />
          </div>

          <MapPicker
            center={mapCenter}
            selectedLocation={pinnedLocation}
            onSelectLocation={handleMapLocationChange}
          />

          <div className="btn-row">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={handlePinCurrentAddressLocation}
              disabled={isPinningLocation}
            >
              {isPinningLocation ? 'Pinning...' : 'Use my current location'}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSaveAddress}
              disabled={isSavingAddress}
            >
              {isSavingAddress ? 'Saving...' : 'Save address and pin'}
            </button>
          </div>

          <p className="small-muted">
            {pinnedLocation
              ? `Pinned at ${pinnedLocation.latitude.toFixed(6)}, ${pinnedLocation.longitude.toFixed(6)}`
              : 'No exact location pin saved yet.'}
          </p>
        </div>
      </section>

      <section className="page-card">
        <div className="section-header">
          <p className="eyebrow">Web migration notes</p>
          <h2 className="section-title">Still queued for later</h2>
        </div>

        <div className="note-banner">
          <strong>Notifications</strong>
          <p className="text-muted">
            Native push notifications are intentionally not migrated yet. Web push will be added in
            the PWA phase using Firebase Messaging and a service worker.
          </p>
        </div>

        <div className="note-banner">
          <strong>Assistant</strong>
          <p className="text-muted">
            The Expo chatbot used a client-side OpenAI flow. For the web app, that feature stays off
            until it is moved behind a secure Vercel serverless function.
          </p>
        </div>
      </section>
    </div>
  );
}
