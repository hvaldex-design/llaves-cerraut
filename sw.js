// ============================================================
// sw.js — service worker: la app abre y funciona sin señal
// ============================================================
// Sube este número cada vez que cambies archivos de la app. Al cambiar, el
// service worker nuevo borra la caché vieja y toma el control.
const VERSION = "cerrauto-v1";

// El esqueleto de la app: lo que hace falta para que abra sin conexión.
// Son rutas relativas a propósito, porque en GitHub Pages la app vive en un
// subdirectorio (/llaves-cerraut/) y no en la raíz del dominio.
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./config.js",
  "./app.js",
  "./firebase.js",
  "./helpers.js",
  "./metricas.js",
  "./dashboard.js",
  "./trabajos.js",
  "./pagos.js",
  "./inventario.js",
  "./taller.js",
  "./cloudinary.js",
  "./vehiculos.js",
  "./espadines.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Recursos de terceros que sí conviene guardar (tipografías e íconos).
// Firebase y Cloudinary NO se cachean: Firestore trae su propia caché offline
// y las subidas necesitan red de verdad.
const CDN_CACHEABLE = [
  "https://fonts.googleapis.com/",
  "https://fonts.gstatic.com/",
  "https://unpkg.com/@tabler/icons-webfont"
];

const NUNCA_CACHEAR = [
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
  "api.cloudinary.com",
  "www.googleapis.com"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION)
      // addAll falla entero si un archivo no está; se agregan de a uno para
      // que un 404 no deje la app sin caché.
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch((e) => console.warn("SW: no se pudo cachear", url, e)))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "saltar-espera") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (NUNCA_CACHEAR.some((h) => url.hostname.includes(h))) return;

  const esModulo = url.origin === self.location.origin;
  const esCdnCacheable = CDN_CACHEABLE.some((p) => req.url.startsWith(p));
  if (!esModulo && !esCdnCacheable) return;

  // Navegación: primero la red (para tomar la versión nueva), y si no hay
  // señal, el index guardado.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put("./index.html", copia));
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Resto: se sirve lo guardado al tiro y se refresca en segundo plano.
  event.respondWith(
    caches.match(req).then((guardado) => {
      const enRed = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copia = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => guardado);
      return guardado || enRed;
    })
  );
});
