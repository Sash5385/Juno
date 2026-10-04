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
  let overlayJs = ''
  return {
    name: 'juno-version-guard',
    buildStart() {
      version = readVersion()
      // Анімація оновлення — окремий читабельний файл, вставляється в HTML інлайном.
      try { overlayJs = readFileSync(resolve(__dirname, 'src/updateOverlay.inline.js'), 'utf8') } catch { overlayJs = '' }
    },
    transformIndexHtml(html) {
      // Перевіряємо версію одразу при завантаженні, а потім періодично (кожні 45с),
      // поки вкладка відкрита — так відкрита сесія теж підхоплює новий деплой
      // без ручного перезавантаження сторінки.
      const guard =
        '<script>(function(){var B=' + JSON.stringify(version) + ';' +
        'function check(){try{fetch("/version.json?_="+Date.now(),{cache:"no-store"})' +
        '.then(function(r){return r.json()}).then(function(d){' +
        'if(d&&d.version&&d.version!==B){' +
        // Ключ зберігає ЧАС останньої спроби, а не постійний прапорець "вже
        // оброблено" — якщо reload стався, але через якийсь збій (перерваний
        // unregister, зависла вкладка) клієнт так і лишився на старій версії,
        // наступна перевірка (за 45с) спробує ще раз, а не мовчки здасться
        // назавжди. Повторний тригер в межах 10с все одно блокуємо, щоб не
        // зациклити швидкі перезавантаження одне за одним.
        'var k="vreset_"+d.version;var last=+(sessionStorage.getItem(k)||0);' +
        'if(Date.now()-last<10000)return;' +
        'sessionStorage.setItem(k,String(Date.now()));' +
        // Повноекранна анімація оновлення (src/updateOverlay.inline.js): крутиться паралельно зі
        // справжнім скиданням SW/кешів, а перезавантаження — після її кінця (anim).
        'var ov=window.__updOverlay;var anim=ov?ov.show(d.version):Promise.resolve();' +
        'function rl(){location.reload()}' +
        'var done_=false;function done(){if(done_)return;done_=true;anim.then(rl,rl)}' +
        // Якщо unregister/caches.delete зависне (буває у старих WebView-обгортках
        // PWA на телефоні) — все одно перезавантажуємо через 2.5с, а не лишаємось
        // застряглими назавжди на старій версії.
        'setTimeout(done,2500);' +
        'if("serviceWorker"in navigator){' +
        'navigator.serviceWorker.getRegistrations().then(function(rs){' +
        'return Promise.all(rs.map(function(r){return r.unregister()}))})' +
        '.then(function(){return window.caches?caches.keys().then(function(ks){' +
        'return Promise.all(ks.map(function(x){return caches.delete(x)}))}):null})' +
        '.then(done).catch(done)}else{done()}' +
        '}else if("serviceWorker"in navigator){' +
        // Версія збігається, але SW міг зачерствіти на старій сесії (PWA роками
        // не закривалась) — активно проганяємо перевірку оновлення SW-файлу,
        // а не чекаємо пасивного таймера браузера (до 24г).
        'navigator.serviceWorker.getRegistration().then(function(r){r&&r.update()}).catch(function(){})' +
        '}}).catch(function(){})}catch(e){}}' +
        'check();setInterval(check,45000);' +
        'document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")check()});' +
        // Якщо новий SW перехопив контроль (skipWaiting+clientsClaim) — перезавантажуємо,
        // щоб одразу побачити свіжий контент замість застряглого старого бандла.
        // Анімацію показуємо лише коли сторінку вже контролював SW (справжнє оновлення), а не при
        // першій установці SW — там, як і раніше, просто перезавантаження.
        'if("serviceWorker"in navigator){var hadCtl=!!navigator.serviceWorker.controller;' +
        'navigator.serviceWorker.addEventListener("controllerchange",function(){var o=window.__updOverlay;' +
        'function rl(){location.reload()}if(hadCtl&&o){o.show().then(rl,rl)}else{rl()}})}' +
        '})();</script>'
      // Функція-замінник, а не рядок: у коді анімації може бути "$", який replace трактує спеціально.
      return html.replace('</head>', () => (overlayJs ? '<script>' + overlayJs + '</script>' : '') + guard + '</head>')
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
  resolve: {
    // Режим лише читання при простроченій підписці — див. src/firebaseDbGuard.js
    alias: [{ find: /^firebase\/database$/, replacement: resolve(__dirname, 'src/firebaseDbGuard.js') }],
  },
  plugins: [
    react(),
    versionGuard(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-64.png'],
      manifest: {
        name: 'Juno',
        short_name: 'Juno',
        description: 'Juno — запис клієнтів для салонів і майстрів',
        theme_color: '#0f0f14',
        background_color: '#0f0f14',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'uk',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // Без цього новий SW чекає, поки ВСІ вкладки/сесії PWA закриються, перш
        // ніж активуватись — а PWA на телефоні може роками не закриватись
        // повністю (лише згортатись). skipWaiting+clientsClaim: новий SW бере
        // контроль одразу, щойно браузер його завантажив.
        skipWaiting: true,
        clientsClaim: true,
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
