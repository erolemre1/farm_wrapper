const CACHE_NAME = 'ciftlik-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './cow.png',
//   'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js'
];

// Kurulum (Install) - Dosyaları önbelleğe al
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
});

// İnternet varken ağı kullan, yoksa önbellekten (cache) getir (Network First)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});