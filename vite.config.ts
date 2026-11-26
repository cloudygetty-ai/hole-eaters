import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// MapLibre's tile worker, built as a chunk of the main bundle so it shares MapLibre's common code
// with the map chunk. Bundled on its own (?worker&url) it carried a second ~0.5 MB copy of that code.
// In dev MapLibre finds its worker next to its own module, so the URL is left empty there.
function mapLibreWorkerUrl(): Plugin {
  const id = 'virtual:maplibre-worker-url'
  let build = false
  return {
    name: 'maplibre-worker-url',
    configResolved(config) { build = config.command === 'build' },
    resolveId: source => (source === id ? '\0' + id : null),
    load(loadId) {
      if (loadId !== '\0' + id) return null
      if (!build) return 'export default ""'
      const ref = this.emitFile({
        type: 'chunk',
        id: path.resolve(__dirname, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs'),
        name: 'maplibre-worker',
      })
      return `export default import.meta.ROLLUP_FILE_URL_${ref}`
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    mapLibreWorkerUrl(),
    VitePWA({
      registerType: 'autoUpdate',
      // main.tsx registers the worker for the app only; the landing page stays SW-free and light.
      injectRegister: false,
      // vite-plugin-pwa 0.21 can't emit the manifest under Rolldown (it was silently missing in prod),
      // so it ships as a static file in public/ and is linked from both HTML entries.
      manifest: false,
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}'],
        // Precache only what the app needs to open. Stickers (~0.6 MB) are cached the first time
        // they're shown, and the 512 px icons are fetched by the phone itself when it installs.
        globIgnores: ['stickers/**', 'icons/icon-512.png', 'icons/maskable-512.png'],
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
            urlPattern: /\/stickers\/[^/]+\.webp$/,
            handler: 'CacheFirst',
            options: { cacheName: 'stickers', expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 3600 } },
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
      // React changes far less often than app code; its own chunk survives app-only deploys.
      // (MapLibre and Supabase already get theirs: one is loaded on demand, the other is shared with the landing.)
      output: {
        codeSplitting: {
          groups: [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }],
        },
      },
      input: {
        landing: path.resolve(__dirname, 'index.html'),
        app: path.resolve(__dirname, 'app.html'),
        privacy: path.resolve(__dirname, 'privacy.html'),
        terms: path.resolve(__dirname, 'terms.html'),
        usc2257: path.resolve(__dirname, '2257.html'),
      },
    },
  },
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
})
