// Strela — service worker « réseau d'abord » : chaque fichier est demandé au réseau (3 s au plus) et
// gardé en copie ; sans réseau, la copie sert. Ainsi l'appli installée affiche toujours la dernière version
// publiée dès que le téléphone est connecté, et marche quand même hors ligne.
const CACHE = 'strela-__BUILD__';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'assets/theme.css', 'assets/app.css', 'assets/icon.svg', 'src/ui/rescue.js', 'src/ui/app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('strela-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = req.mode === 'navigate' ? 'index.html' : req;
    try {
      const res = await Promise.race([
        fetch(req, { cache: 'no-store' }),
        new Promise((_, no) => setTimeout(() => no(new Error('délai')), 3000)),
      ]);
      if (res.ok) cache.put(key, res.clone());
      return res;
    } catch (err) {
      return (await cache.match(key, { ignoreSearch: true })) || (await cache.match(req, { ignoreSearch: true })) || Response.error();
    }
  })());
});
