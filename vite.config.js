import { defineConfig } from 'vite';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const REPO = 'finance-duo';
const ROOT = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: `/${REPO}/`,
  publicDir: false,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Бюджет двоих',
        short_name: 'Бюджет',
        theme_color: '#061316',
        background_color: '#061316',
        display: 'standalone',
        start_url: `/${REPO}/`,
        scope: `/${REPO}/`,
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallback: `/${REPO}/index.html`,
        skipWaiting: true,
        clientsClaim: true
      }
    }),
    {
      name: 'copy-flat-icons',
      closeBundle() {
        for (const file of ['favicon.svg', 'icon-192.svg', 'icon-512.svg']) {
          copyFileSync(`${ROOT}/${file}`, `${ROOT}/dist/${file}`);
        }
      }
    }
  ]
});
