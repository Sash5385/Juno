import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Single source of truth for the app version (src/version.js)
function readVersion() {
  try {
    const src = readFileSync(resolve(__dirname, 'src/version.js'), 'utf8')
    const m = src.match(/"([^"]+)"/)
    return m ? m[1] : ''
  } catch {
    return ''
  }
}

// Emits /version.json (matching src/version.js) and injects an inline guard
// into index.html. The guard runs BEFORE the app bundle, so even a browser
// whose service worker is serving a stale index.html can detect a new deploy,
// tear down the SW + caches, and reload onto fresh code. This is the only
// layer that can rescue a wedged client, because it lives in the HTML itself
// rather than inside the cached JS bundle.
function versionGuard() {
  let version = ''
  return {
    name: 'id4drive-version-guard',
    buildStart() {
      version = readVersion()
    },
    transformIndexHtml(html) {
      const guard =
        '<script>(function(){var B=' + JSON.stringify(version) + ';' +
        'try{fetch("/version.json?_="+Date.now(),{cache:"no-store"})' +
        '.then(function(r){return r.json()}).then(function(d){' +
        'if(d&&d.version&&d.version!==B){' +
        'var k="vreset_"+d.version;if(sessionStorage.getItem(k))return;' +
        'sessionStorage.setItem(k,"1");' +
        'function done(){location.reload()}' +
        'if("serviceWorker"in navigator){' +
        'navigator.serviceWorker.getRegistrations().then(function(rs){' +
        'return Promise.all(rs.map(function(r){return r.unregister()}))})' +
        '.then(function(){return window.caches?caches.keys().then(function(ks){' +
        'return Promise.all(ks.map(function(x){return caches.delete(x)}))}):null})' +
        '.then(done).catch(done)}else{done()}' +
        '}}).catch(function(){})}catch(e){}})();</script>'
      return html.replace('</head>', guard + '</head>')
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version })
      })
    }
  }
}

export default defineConfig({
  plugins: [
    react(),
    versionGuard(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'ID4Drive Admin',
        short_name: 'ID4Drive',
        description: 'Адмінпанель автошколи ID4Drive',
        theme_color: '#0f0f14',
        background_color: '#0f0f14',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'uk',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Serve navigations network-first so an online client always gets the
        // freshest index.html (and thus the freshest bundle) through the SW,
        // instead of an indefinitely stale precached shell.
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-navigations',
              networkTimeoutSeconds: 5
            }
          },
          {
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-storage',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5174,
    host: true
  }
})
