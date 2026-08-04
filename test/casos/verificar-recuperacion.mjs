/* Recuperación de contraseña, de punta a punta: pedir el correo, volver desde
   el enlace y guardar la contraseña nueva.

   Se ejecuta `auth.js` de verdad, con un cliente de Supabase instrumentado: lo
   que se comprueba es NUESTRO cableado —qué se llama, con qué, y qué queda en
   pantalla—, sin tocar la red. */
import { JSDOM } from 'jsdom';
import { leer } from '../harness.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const SESION = { user: { id: 'u-1', email: 'ana@ejemplo.com' } };

/** Monta la app y evalúa `auth.js` con un doble del cliente. */
async function montarAuth({ sesionInicial = null } = {}) {
  const html = leer('index.html').replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'https://ejemplo.test/', runScripts: 'dangerously' });
  const { window } = dom;

  window.matchMedia = q => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} });
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
      signOut: async () => { llamadas.push(['signOut']); sesion = null; return {}; },
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

const enviar = doc => doc.querySelector('#auth-form')
  .dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));
const esperar = () => new Promise(r => setTimeout(r, 0));

// --- 1. el enlace existe y solo en el inicio de sesión --------------------
{
  const a = await montarAuth();
  ok('el enlace está en la pantalla', Boolean(a.doc.querySelector('#auth-forgot')));
  ok('dice «¿Olvidaste tu contraseña?»',
    a.doc.querySelector('#auth-forgot').textContent.trim() === '¿Olvidaste tu contraseña?');
  ok('se ve al iniciar sesión', a.modo().olvidaste === true);

  a.doc.querySelector('#auth-toggle').click();
  ok('se esconde al crear cuenta', a.modo().olvidaste === false);
  ok('y el modo cambió a crear', a.modo().enviar === 'Crear cuenta', a.modo().enviar);
}

// --- 2. el modo recuperar solo pide el email ------------------------------
{
  const a = await montarAuth();
  a.doc.querySelector('#auth-email').value = 'ana@ejemplo.com';
  a.doc.querySelector('#auth-forgot').click();

  const m = a.modo();
  console.log('  modo recuperar:', JSON.stringify(m));
  ok('cambia el título', m.titulo === 'Recuperar acceso', m.titulo);
  ok('pide el email', m.email === true);
  ok('esconde la contraseña', m.password === false);
  ok('el botón dice enviar', m.enviar === 'Enviar correo', m.enviar);
  ok('ofrece volver', m.alterno === 'Volver a iniciar sesión', String(m.alterno));
  ok('conserva el email ya escrito',
    a.doc.querySelector('#auth-email').value === 'ana@ejemplo.com');
}

// --- 3. envía el correo con el destino de vuelta --------------------------
{
  const a = await montarAuth();
  a.doc.querySelector('#auth-forgot').click();
  a.doc.querySelector('#auth-email').value = 'ana@ejemplo.com';
  enviar(a.doc);
  await esperar();

  const reset = a.llamadas.find(l => l[0] === 'reset');
  ok('llama a resetPasswordForEmail', Boolean(reset));
  ok('con el email escrito', reset?.[1] === 'ana@ejemplo.com', String(reset?.[1]));
  ok('y con un redirectTo', Boolean(reset?.[2]?.redirectTo), String(reset?.[2]?.redirectTo));

  const aviso = a.doc.querySelector('#auth-notice');
  ok('avisa en pantalla', aviso.hidden === false);
  /* No confirma si la cuenta existe: hacerlo convertiría la pantalla en un
     verificador de quién está registrado. */
  ok('sin confirmar que la cuenta exista', /^Si hay una cuenta/.test(aviso.textContent),
    aviso.textContent.slice(0, 45) + '…');
}

// --- 4. sin email no se envía nada ----------------------------------------
{
  const a = await montarAuth();
  a.doc.querySelector('#auth-forgot').click();
  a.doc.querySelector('#auth-email').value = '';
  enviar(a.doc);
  await esperar();

  ok('no llama a Supabase', !a.llamadas.some(l => l[0] === 'reset'));
  ok('y muestra el error', a.doc.querySelector('#auth-error').hidden === false,
    a.doc.querySelector('#auth-error').textContent);
}

// --- 5. volver desde el enlace NO abre la app -----------------------------
{
  const a = await montarAuth();
  a.emitir('PASSWORD_RECOVERY', SESION);

  const m = a.modo();
  console.log('  tras el enlace:', JSON.stringify(m));
  ok('la puerta sigue cerrada', m.puertaAbierta === false);
  ok('pide la contraseña nueva', m.titulo === 'Elegí una contraseña nueva', m.titulo);
  ok('sin pedir el email', m.email === false);
  ok('con el campo de contraseña', m.password === true);
  ok('rotulado como nueva',
    a.doc.querySelector('#auth-password-label').textContent === 'Contraseña nueva');
  ok('el navegador la trata como nueva',
    a.doc.querySelector('#auth-password').getAttribute('autocomplete') === 'new-password');
  ok('sin salida alterna', m.alterno === null, String(m.alterno));
  ok('la app sigue oculta', a.doc.querySelector('#app-root').hidden === true);
}

// --- 6. guardar la contraseña nueva abre la app ---------------------------
{
  const a = await montarAuth();
  a.emitir('PASSWORD_RECOVERY', SESION);
  a.doc.querySelector('#auth-password').value = 'unaNueva123';
  enviar(a.doc);
  await esperar();
  await esperar();

  const upd = a.llamadas.find(l => l[0] === 'updateUser');
  ok('llama a updateUser', Boolean(upd));
  ok('con la contraseña escrita', upd?.[1]?.password === 'unaNueva123');
  ok('la puerta se abre', a.doc.querySelector('#auth-gate').hidden === true);
  ok('y la app aparece', a.doc.querySelector('#app-root').hidden === false);
  ok('el campo queda vacío', a.doc.querySelector('#auth-password').value === '');
  ok('vuelve al modo iniciar sesión',
    a.doc.querySelector('#auth-title').textContent === 'Iniciar sesión');
}

// --- 7. sin contraseña no se guarda ---------------------------------------
{
  const a = await montarAuth();
  a.emitir('PASSWORD_RECOVERY', SESION);
  a.doc.querySelector('#auth-password').value = '';
  enviar(a.doc);
  await esperar();

  ok('no llama a updateUser', !a.llamadas.some(l => l[0] === 'updateUser'));
  ok('muestra el error', a.doc.querySelector('#auth-error').hidden === false);
  ok('y la puerta sigue cerrada', a.doc.querySelector('#auth-gate').hidden === false);
}

// --- 8. una sesión normal sí entra ----------------------------------------
{
  const a = await montarAuth();
  a.emitir('SIGNED_IN', SESION);
  ok('el inicio de sesión normal abre la app',
    a.doc.querySelector('#auth-gate').hidden === true
    && a.doc.querySelector('#app-root').hidden === false);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
