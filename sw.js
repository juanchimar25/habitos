/* ============================================================
   Service worker — lo que hace que la app abra sin conexión
   ------------------------------------------------------------
   La app siempre supo funcionar sin base: `hydrateStateForUser`
   cae en `localStorage` y avisa que no sincroniza. Lo que no
   sabía era ARRANCAR sin red, porque el HTML, el CSS y los tres
   scripts se pedían al servidor. Esto guarda ese armazón.

   Los datos NO se cachean acá. Viven en `localStorage` —que ya
   es local— y en Supabase, y las llamadas a la base ni se tocan:
   una respuesta vieja de `app_state` servida desde el caché sería
   peor que un error, porque la app la tomaría por buena y subiría
   encima. Ver `lecturaRemotaOk` en app.js.
   ============================================================ */

/* Subir la versión invalida el caché entero. Hay que tocarla cuando cambie
   cualquiera de los archivos de abajo; `test/pwa.mjs` avisa si se olvidó. */
const VERSION = 'habitos-v1';

/**
 * El armazón: lo mínimo para que la app dibuje algo estando sin red.
 * Rutas relativas al service worker, así funciona igual en la raíz del
 * dominio que en un subdirectorio — el caso de GitHub Pages.
 */
const ARMAZON = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'auth.js',
  'config.js',
  'vendor/supabase-js-2.111.0.js',
  'manifest.webmanifest',
  'iconos/icon-192.png',
  'iconos/icon-512.png',
  'iconos/icon-maskable-512.png',
];

self.addEventListener('install', evento => {
  evento.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    /* De a uno y tolerando fallas: `addAll` es atómico y un solo 404 dejaría
       la instalación entera sin caché, que es peor que arrancar con la mitad. */
    await Promise.all(ARMAZON.map(async recurso => {
      try {
        await cache.add(new Request(recurso, { cache: 'reload' }));
      } catch (err) {
        console.warn('[sw] no se pudo cachear', recurso, err);
      }
    }));
    // Sin esto la versión nueva espera a que se cierren todas las pestañas.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', evento => {
  evento.waitUntil((async () => {
    const viejos = (await caches.keys()).filter(k => k !== VERSION);
    await Promise.all(viejos.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/**
 * Qué se responde desde el caché y qué no.
 *
 * - Todo lo que no sea GET, y todo lo que no sea de este mismo origen, pasa
 *   derecho: ahí adentro están las llamadas a Supabase, que nunca se cachean.
 * - Las NAVEGACIONES van a la red primero y caen en `index.html` si no hay.
 *   La app es una sola página con rutas propias (`/diario`, `/analisis`), así
 *   que sin red cualquiera de las tres tiene que resolver al mismo HTML.
 * - El resto —CSS, scripts, íconos— sale del caché y se refresca de fondo.
 *   Es lo que hace que abrir sea instantáneo; el precio es que una versión
 *   nueva entra recién en la carga siguiente.
 */
self.addEventListener('fetch', evento => {
  const { request } = evento;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    evento.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(VERSION);
        return (await cache.match('index.html'))
          ?? (await cache.match('./'))
          ?? Response.error();
      }
    })());
    return;
  }

  evento.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const guardado = await cache.match(request);

    const desdeLaRed = fetch(request).then(respuesta => {
      // Las opacas y los errores no se guardan: taparían la copia buena.
      if (respuesta.ok && respuesta.type === 'basic') cache.put(request, respuesta.clone());
      return respuesta;
    }).catch(() => null);

    return guardado ?? await desdeLaRed ?? Response.error();
  })());
});
