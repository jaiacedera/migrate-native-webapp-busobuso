import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const APP_NAME = 'BusoBuso Resident EOC';
const APP_SHORT_NAME = 'BusoBuso EOC';
const APP_DESCRIPTION =
  'Barangay Buso-Buso Resident EOC web app for sign-in, resident profile setup, reporting, and emergency response access.';
const THEME_COLOR = '#274C77';
const shouldRegisterServiceWorker = process.env.NODE_ENV === 'production';
const mobileInputZoomGuardStyles = `
html {
  -webkit-text-size-adjust: 100%;
}

@media (max-width: 1024px) {
  input,
  textarea,
  select {
    font-size: 16px !important;
  }
}
`;

const serviceWorkerRegistrationScript = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/' })
      .then(function (registration) {
        registration.update().catch(function () {});
      })
      .catch(function (error) {
        console.error('Service worker registration failed:', error);
      });
  });
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover, interactive-widget=resizes-content"
        />
        <title>{APP_NAME}</title>
        <meta name="application-name" content={APP_NAME} />
        <meta name="description" content={APP_DESCRIPTION} />
        <meta name="theme-color" content={THEME_COLOR} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content={APP_SHORT_NAME} />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />

        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <style dangerouslySetInnerHTML={{ __html: mobileInputZoomGuardStyles }} />

        {shouldRegisterServiceWorker ? (
          <script dangerouslySetInnerHTML={{ __html: serviceWorkerRegistrationScript }} />
        ) : null}

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
