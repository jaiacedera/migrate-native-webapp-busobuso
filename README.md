# BusoBusoMobileApp

BusoBusoMobileApp is a mobile Emergency Operations Center (EOC) app for Barangay Buso-Buso residents. It helps residents register their profile, submit distress reports, track report status, and view community alerts in real time.

## Project Purpose

This project is built to support faster and more organized emergency response by:

- Collecting resident emergency profile information
- Allowing quick distress report submission with optional voice input
- Capturing current location for more accurate responder dispatch
- Showing recent alerts from the dashboard
- Providing in-app assistant support for preparedness and reporting questions

## Core Features

- Authentication
   - Email/password sign up and login (Firebase Auth)
   - Google sign-in support (Expo Auth Session + Firebase credential login)

- Resident Profile
   - Collects first name, last name, middle initial, address, contact info, and emergency contact
   - Pins current GPS location using Expo Location
   - Saves profile to Firestore

- Distress Reporting
   - Manual report encoding
   - Voice-to-text report input (Expo Speech Recognition, development build)
   - Auto-generates report IDs in the format `IR-YYYYMMDD-XXXX`
   - Saves reports to Firestore with timestamps and user linkage

- Report Tracking
   - Lists current user’s submitted reports
   - Search by report ID, status, content, or date

- Dashboard + Alerts
   - Shows latest alerts from Firestore
   - Includes in-app AI assistant chat

## Tech Stack

- Expo SDK 54 + React Native 0.81
- Expo Router (file-based routing)
- Firebase Auth + Firestore
- Expo Auth Session (Google OAuth)
- Expo Location
- Expo Speech Recognition
- OpenAI-compatible Chat Completions API (for example OAI Best)
- GitHub Models (Chat Completions API)

## Important Routes

- `app/index.tsx` → Get Started screen
- `app/mobile-ui/user-log-in-sign-up-screen.tsx` → login/signup + Google sign-in
- `app/mobile-ui/user-form.tsx` → resident profile setup
- `app/mobile-ui/dashboard.tsx` → alerts and assistant
- `app/mobile-ui/reports-screen.tsx` → distress report form
- `app/mobile-ui/reports-tracker-screen.tsx` → report tracking list
- `app/mobile-ui/profile-screen.tsx` → profile and navigation

## Firestore Collections Used

- `residents` (resident profiles)
- `distressReports` (submitted reports)
- `incidentReportCounters` (daily sequence for report ID generation)
- `alerts` (dashboard emergency alerts)

## Environment Variables

Create a `.env` file in the project root and configure:

```env
EXPO_PUBLIC_OPENAI_API_KEY=your_provider_api_key
EXPO_PUBLIC_OPENAI_BASE_URL=https://api.oaibest.com/v1
EXPO_PUBLIC_OPENAI_MODEL=gpt-4o-mini

EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_google_web_client_id
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your_google_android_client_id
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your_google_ios_client_id
```

Google client IDs can also be provided via `app.json` under `expo.extra`:

```json
{
   "expo": {
      "extra": {
         "googleWebClientId": "...",
         "googleAndroidClientId": "...",
         "googleIosClientId": "..."
      }
   }
}
```

## Setup and Run

1. Install dependencies:

```bash
npm install
```

2. Start development server:

```bash
npx expo start
```

3. Run native builds when needed:

```bash
npm run android
npm run ios
```

## Notes for Developers

- Voice recognition requires a development build (not standard Expo Go for all workflows).
- Ensure Firebase Authentication providers (Email/Password and Google) are enabled in Firebase Console.
- Current Firebase config is in `services/firebaseconfig.ts`; for production, move sensitive configuration and service setup to secure environment-based config management.

## Current Status

This project is actively structured around resident emergency reporting and response support for Barangay Buso-Buso, with core user flow already implemented end-to-end.

## Live Hosting Guide (Firebase) for Reports + Admin Alerts

This app already uses Firebase-hosted realtime infrastructure, so residents on different internet connections can communicate without sharing the same Wi-Fi network.

### 1) Confirm your send/receive data flow

- Resident send flow: `reports-screen` writes to `distressReports`
- Resident receive flow: `dashboard` reads from `alerts`
- Admin flow (web/admin app): writes emergency alerts and news into `alerts`

### 2) Standardize Firestore document shapes

Use these minimal fields so both mobile and admin apps are consistent:

- `distressReports/{autoId}`
   - `uid`, `email`, `reportId`, `fullName`, `address`, `contactNumber`, `report`, `location`, `createdAt`, `status`
- `alerts/{autoId}`
   - `level` (`ADVISORY|CAUTION|EMERGENCY|CRITICAL`)
   - `message` (or `alertMessage`, but choose one long-term)
   - `timestamp` (`serverTimestamp()`)
   - `createdBy` (admin UID/email)
   - `target` (`all` by default)

### 3) Add production Firestore security rules

Use deny-by-default rules and allow only required access:

- Residents can create their own `distressReports`
- Residents can read only their own `distressReports`
- Authenticated residents can read `alerts`
- Only admin users can create/update/delete `alerts`

Recommended approach:

1. Add custom claim `admin: true` to admin accounts
2. In Firestore rules, gate alert writes with `request.auth.token.admin == true`

### 4) Enable true cross-network realtime updates

- Keep using Firestore listeners (`onSnapshot`) in resident app
- `dashboard` should listen to `alerts` sorted by `timestamp desc`
- Optional: create a dedicated `news` collection if you want separate UI cards from emergency alerts

### 5) Add push notifications for offline/background users

Realtime listeners work while app is active; add FCM for offline reliability:

1. Register device token (Expo Notifications or native FCM) after login
2. Save token under `residents/{uid}/devices/{deviceId}`
3. Deploy Cloud Function trigger on `alerts/{alertId}` create
4. Function sends notification to all resident tokens

This ensures residents receive emergency/news notifications even when app is closed.

### 6) Deploy Firebase backend config

Run once per environment:

```bash
npm i -g firebase-tools
firebase login
firebase use <your-project-id>
firebase init firestore functions
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only functions
```

### 7) Production hardening checklist

- Turn on App Check for Firestore/Functions
- Keep all writes on server timestamps
- Add alert rate-limit in Cloud Functions (anti-spam)
- Set Firebase budget alerts in Google Cloud billing
- Keep indexes updated for `alerts` and report tracking queries

### 8) End-to-end test scenario (different internet connections)

1. Device A (resident, mobile data) submits a report in `reports-screen`
2. Verify admin sees new document in `distressReports`
3. Admin posts alert/news document in `alerts`
4. Device B (resident, different Wi-Fi) receives alert in dashboard via realtime listener
5. Put Device B in background and verify push notification arrives

If all five pass, your Firebase backend is effectively "live hosted" for multi-network residents.
