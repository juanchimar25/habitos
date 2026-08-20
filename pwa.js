/* ============================================================
   Registro del service worker
   ------------------------------------------------------------
   Va en su propio archivo y no inline: los bloques inline de
   `index.html` se autorizan por hash en la CSP, y cada uno es un
   hash más para mantener al día. Un `<script src>` propio ya
   queda cubierto por `script-src 'self'`.

   Se registra sin condicionar nada: si el navegador no soporta
   service workers, o la página se abrió por `file://` o por http
   sin cifrar, `serviceWorker` no existe y la app funciona igual,
   solo que sin poder abrirse sin conexión.
   ============================================================ */

if ('serviceWorker' in navigator) {
  /* Después del `load`: registrar antes compite por ancho de banda con lo que
     la app necesita para dibujar, y el service worker no sirve de nada en
     esta visita —empieza a servir en la siguiente—. */
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('No se pudo registrar el service worker', err);
    });
  });
}
