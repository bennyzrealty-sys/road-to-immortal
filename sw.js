/* =====================================================================
   Road to Immortal — Service Worker
   Caches the full app shell so the app opens with NO network.
   Bump CACHE on any file change to invalidate the old cache.
   No runtime network calls are made by the app; this only serves the
   local shell. User data never goes through here (it lives in
   localStorage, never fetched).
   ===================================================================== */
'use strict';
var CACHE = 'rti-shell-v9';
// core app shell — small, MUST install successfully
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './util.js',
  './store.js',
  './engine.js',
  './photos.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];
// heavy MediaPipe assets (vendored, offline) — precached BEST-EFFORT so a slow
// network can't fail the whole install. The cache-first fetch handler below
// also caches them on first use, so the photo module works offline either way.
// (no-SIMD wasm is vendored too but cached on demand — modern phones use SIMD.)
var MP = [
  './vendor/mediapipe/vision_bundle.mjs',
  './vendor/mediapipe/wasm/vision_wasm_internal.js',
  './vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  './vendor/mediapipe/face_landmarker.task',
  './vendor/mediapipe/pose_landmarker_lite.task',
  './vendor/mediapipe/selfie_segmenter.tflite'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(SHELL).then(function () { return c.addAll(MP).catch(function (err) { console.warn('[RTI] MediaPipe precache deferred to first use:', err); }); }); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Cache-first for same-origin GETs; falls back to network then to the
// cached shell for navigations (so deep links work offline).
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch cross-origin

  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );
});
