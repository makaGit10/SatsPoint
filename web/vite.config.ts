/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage } from 'node:http'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const API = 'http://localhost:8120'

/** Les navigations HTML (ex. /r/abc tapé dans la barre d'adresse) restent servies par la SPA ; les requêtes JSON partent vers l'API. */
function laisserPasserHtml(req: IncomingMessage) {
  const accept = req.headers.accept ?? ''
  return accept.includes('text/html') ? req.url : undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.svg', 'icones/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'SatsPoint',
        short_name: 'SatsPoint',
        description: 'Point de vente Lightning et mobile money pour les commerçants.',
        lang: 'fr',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fffdf8',
        theme_color: '#fffdf8',
        categories: ['finance', 'business'],
        icons: [
          { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icones/icone-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icones/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/sanctum\//, /^\/broadcasting\//, /^\/webhooks\//, /^\/audio\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Manifeste `clé → URL` (avant la règle /api/ : la première règle qui correspond l'emporte) : toujours frais si possible, sinon la dernière version connue (hors ligne).
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/v1/audio/manifeste/'),
            handler: 'NetworkFirst',
            options: { cacheName: 'satspoint-manifeste-audio', networkTimeoutSeconds: 3, expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              (url.pathname.startsWith('/api/') ||
                url.pathname.startsWith('/sanctum/') ||
                url.pathname.startsWith('/broadcasting/')),
            handler: 'NetworkOnly',
          },
          {
            // Fichiers audio : URL immuables (empreinte dans le nom) → cache un an.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/audio/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'satspoint-audio',
              expiration: { maxEntries: 3000, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5190,
    strictPort: true,
    proxy: {
      '/api': { target: API, changeOrigin: false },
      '/sanctum': { target: API, changeOrigin: false },
      '/broadcasting': { target: API, changeOrigin: false },
      '/webhooks': { target: API, changeOrigin: false },
      '/audio': { target: API, changeOrigin: false },
      // Reçu public : seulement /r/… (une clé « /r » capterait aussi /reglages, /robots.txt…).
      '^/r/': { target: API, changeOrigin: false, bypass: laisserPasserHtml },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    manifest: true,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('laravel-echo') || id.includes('pusher-js')) return 'temps-reel'
          if (id.includes('/qrcode/')) return 'qrcode'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
  },
})
