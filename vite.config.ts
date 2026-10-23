import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // main.tsx registers the worker for the app only; the landing page stays SW-free and light.
      injectRegister: false,
      includeAssets: ['icons/*.png', 'brand/*.webp', 'favicon.png'],
      // vite-plugin-pwa 0.21 can't emit the manifest under Rolldown (it was silently missing in prod),
      // so it ships as a static file in public/ and is linked from both HTML entries.
      manifest: false,
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        importScripts: ['/sw-push.js'],
        // App routes get the app shell offline; the landing (/) is served from its own precached HTML.
        navigateFallback: '/app.html',
        navigateFallbackAllowlist: [/^\/app(\/|$)/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/xebwdvtaivqjwbwbzdpv\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'supabase-cache', expiration: { maxEntries: 50, maxAgeSeconds: 300 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-cache' },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      input: {
        landing: path.resolve(__dirname, 'index.html'),
        app: path.resolve(__dirname, 'app.html'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
