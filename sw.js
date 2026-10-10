/*
 * Service worker de Divisas: la app entera queda guardada en el teléfono y
 * funciona sin conexión.
 *
 * - La app (HTML, CSS, JS, fuentes, iconos, banderas) se guarda al instalar y
 *   se sirve desde la caché. Al publicar, tools/build-site.mjs sustituye
 *   VERSION por un resumen del contenido: si algo cambia, el navegador ve un
 *   sw.js distinto, instala la versión nueva y borra la vieja.
 * - rates.json va siempre primero a la red (para tener los tipos del día) y,
 *   si no hay conexión o tarda, se responde con la última copia guardada.
 */
const VERSION = '__VERSION__';
const CACHE = 'divisas-' + VERSION;
const RATES = 'rates.json';
const RATES_TIMEOUT_MS = 5000;

const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'core.js', 'i18n.js', 'currencies.js',
  'manifest.webmanifest', 'rates.json',
  'fonts/exo2.woff2', 'fonts/exo2-italic.woff2', 'fonts/roboto-mono.woff2',
  'icons/icono.svg', 'icons/icono-192.png', 'icons/icono-512.png', 'icons/icono-apple-180.png',
  /*FLAGS*/
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('divisas-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function ratesFirstFromNetwork(request) {
  return caches.open(CACHE).then((cache) => {
    const network = fetch(request).then((r) => {
      if (r && r.ok) cache.put(RATES, r.clone());
      return r;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, RATES_TIMEOUT_MS));
    return Promise.race([network, timeout.then(() => cache.match(RATES))])
      .then((r) => r || network)
      .catch(() => cache.match(RATES))
      .then((r) => r || network);
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // ubicación y demás: directo a la red

  if (url.pathname.endsWith('/' + RATES)) {
    e.respondWith(ratesFirstFromNetwork(req));
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((r) => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return r;
      }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
    })
  );
});
