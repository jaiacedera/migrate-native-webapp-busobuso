import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BusoBuso Resident EOC',
        short_name: 'BusoBuso',
        description: 'Web access for Barangay Buso-Buso resident emergency operations and reporting.',
        theme_color: '#274C77',
        background_color: '#0B1724',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        orientation: 'portrait',
        // TODO: Add generated app icons in web/public/icons during the PWA polish pass.
        icons: [],
      },
    }),
  ],
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
});
