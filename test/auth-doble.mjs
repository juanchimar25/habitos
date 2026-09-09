/* El doble de Supabase con el que se ejercita `auth.js` de verdad.

   Vive fuera de `casos/` a propósito: `casos.mjs` corre como caso todo `.mjs`
   que encuentre ahí adentro, y esto no comprueba nada por sí solo.

   Lo que se prueba con él es NUESTRO cableado —qué se le pide al cliente, con
   qué argumentos, y qué queda en pantalla—, sin tocar la red. */
import { JSDOM } from 'jsdom';
import { leer } from './harness.mjs';

export const SESION = { user: { id: 'u-1', email: 'ana@ejemplo.com' } };

/** Monta la app y evalúa `auth.js` con un doble del cliente. */
export async function montarAuth({ sesionInicial = null, url = 'https://ejemplo.test/' } = {}) {
  const html = leer('index.html').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url, runScripts: 'dangerously' });
  const { window } = dom;

  window.matchMedia = q => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} });

  /* jsdom trae `<dialog>` pero no `showModal`. Se lo suple con el atributo, que
     es lo que se puede comprobar acá: abierto o cerrado. Lo que jsdom no puede
     simular es lo que hace de verdad un modal —dejar inerte al resto del
     documento—, que es justamente lo que hacía que la app se viera trabada. */
  for (const dlg of window.document.querySelectorAll('dialog')) {
    dlg.showModal = function () { this.setAttribute('open', ''); };
    dlg.close = function () { this.removeAttribute('open'); };
  }

  Object.defineProperty(window.document, 'currentScript', {
    configurable: true, value: { src: 'https://ejemplo.test/app.js' },
  });

  const llamadas = [];
  let sesion = sesionInicial;
  let alCambiar = () => {};

  /* `app.js` lee y escribe `app_state` apenas hay sesión. Se responde vacío:
     sin esto el arranque cae en el camino de error y ensucia la salida con
     trazas que no tienen que ver con lo que se está probando. */
  window.__db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    }),
    auth: {
      getSession: async () => ({ data: { session: sesion } }),
      onAuthStateChange: fn => { alCambiar = fn; },
      signInWithPassword: async a => { llamadas.push(['signIn', a]); return { data: {}, error: null }; },
      signUp: async a => { llamadas.push(['signUp', a]); return { data: {}, error: null }; },
      signOut: async () => {
        llamadas.push(['signOut']);
        sesion = null;
        // El cliente real avisa; de ese aviso cuelga la vuelta al diario.
        alCambiar('SIGNED_OUT', null);
        return {};
      },
      resetPasswordForEmail: async (email, opts) => {
        llamadas.push(['reset', email, opts]);
        return { error: null };
      },
      updateUser: async a => {
        llamadas.push(['updateUser', a]);
        sesion = SESION;
        return { error: null };
      },
    },
  };
  window.supabase = { createClient: () => window.__db };

  window.eval(leer('config.js'));
  window.eval(leer('app.js'));

  /* `auth.js` es un módulo con await de nivel superior y toma `createClient` del
     global; se envuelve en async para poder evaluarlo. */
  const fuente = leer('auth.js')
    .replace(/^const \{ createClient \} = .*$/m, 'const createClient = () => window.__db;')
    .replace(/new URL\('\.', import\.meta\.url\)\.href/, "'https://ejemplo.test/'");
  await window.eval(`(async () => { ${fuente} })()`);

  const doc = window.document;
  return {
    doc,
    llamadas,
    /** Dispara un evento de Supabase, como haría el cliente real. */
    emitir: (evento, s) => { sesion = s; return alCambiar(evento, s); },
    modo: () => ({
      titulo: doc.querySelector('#auth-title').textContent,
      enviar: doc.querySelector('#auth-submit').textContent,
      email: !doc.querySelector('#auth-email-field').hidden,
      password: !doc.querySelector('#auth-password-field').hidden,
      alterno: doc.querySelector('#auth-toggle').hidden ? null : doc.querySelector('#auth-toggle').textContent,
      olvidaste: !doc.querySelector('#auth-forgot').hidden,
      puertaAbierta: doc.querySelector('#auth-gate').hidden,
    }),
  };
}

/** Manda el formulario, que es lo que dispara cada modo. */
export const enviar = doc => doc.querySelector('#auth-form')
  .dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

/** Un turno del bucle de eventos: los manejadores de `auth.js` son async. */
export const esperar = () => new Promise(r => setTimeout(r, 0));
