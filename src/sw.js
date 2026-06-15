import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

// Precache manifest is injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Serve the SPA shell for all navigation requests
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Cache Google Fonts indefinitely
registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
)

// ── NO skipWaiting(), NO clientsClaim(), NO SKIP_WAITING message handler ──
// The new SW waits in "waiting" state until all tabs using the old SW are
// naturally closed, then activates on the next fresh open. This eliminates
// the white screen that occurred when the SW hijacked an active page mid-session.
