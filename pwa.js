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

  /* Una versión nueva se recarga sola, UNA vez.

     El service worker sirve los scripts y la hoja desde el caché y los refresca
     de fondo, así que una versión nueva quedaba lista pero sin usar: la
     pantalla seguía corriendo el código anterior hasta que alguien recargara a
     mano. El síntoma no se lee como «hay una versión nueva» sino como «la app
     no hace lo que dice»: se toca algo, no pasa nada, y recién al volver a
     entrar funciona.

     `controllerchange` avisa cuando el service worker recién activado toma el
     control de esta página —lo que pasa apenas se instala, porque `sw.js` hace
     `skipWaiting()` y `clients.claim()`—. Ahí ya está todo lo nuevo en el
     caché, y recargar cuesta lo que cuesta leer del disco. */
  /* Si la página ya venía controlada, un cambio de controlador significa que
     hay una versión nueva. Si no había ninguno, es la primera visita: el
     control pasa de «nadie» al recién instalado y no hay nada viejo corriendo,
     así que recargar sería un parpadeo gratis. Se lee ANTES de registrar. */
  const habiaControlador = Boolean(navigator.serviceWorker.controller);

  let recargando = false;

  const recargar = () => {
    if (recargando) return;

    /* Con un diálogo abierto, no: puede haber un nombre a medio escribir, y una
       recarga sorpresa lo tiraría. Se espera a que se cierre — los datos ya
       guardados no corren riesgo, porque cada cambio se escribe al instante. */
    const dialogo = document.querySelector('dialog[open]');
    if (dialogo) {
      dialogo.addEventListener('close', recargar, { once: true });
      return;
    }

    recargando = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (habiaControlador) recargar();
  });
}
