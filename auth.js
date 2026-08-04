/* ============================================================
   Sesión — Supabase Auth
   ------------------------------------------------------------
   Módulo ES. El cliente NO se importa: lo deja como global el
   script de `vendor/`, que `index.html` carga antes que esto.

   Se sirve desde nuestro propio dominio en vez de un CDN porque
   este código corre en el navegador de cada visitante: así la
   versión queda fija, el `integrity` se verifica y la CSP puede
   cerrar `script-src` a 'self'. El detalle, en vendor/README.md.

   Ojo: al ser un módulo, el navegador lo bloquea sobre `file://`.
   La app tiene que servirse por http(s) — ver el README.

   Toda la interacción con Supabase vive acá. `app.js` no sabe que
   existe: solo recibe `start(user)` y `stop()`.
   ============================================================ */

const { createClient } = window.supabase ?? {};

const $ = sel => document.querySelector(sel);

const el = {
  gate: $('#auth-gate'),
  form: $('#auth-form'),
  email: $('#auth-email'),
  emailField: $('#auth-email-field'),
  password: $('#auth-password'),
  passwordField: $('#auth-password-field'),
  passwordLabel: $('#auth-password-label'),
  submit: $('#auth-submit'),
  error: $('#auth-error'),
  notice: $('#auth-notice'),
  toggle: $('#auth-toggle'),
  forgot: $('#auth-forgot'),
  title: $('#auth-title'),
  session: $('#drawer-session'),
  user: $('#session-user'),
  signOut: $('#btn-sign-out'),
  app: $('#app-root'),
};

/**
 * Los cuatro estados del formulario. `campos` dice qué se pide y `alterno` es
 * el rótulo del botón que lleva al otro modo; en `nueva` no hay a dónde ir:
 * la contraseña ya está a medio cambiar y volver atrás dejaría la cuenta con
 * una sesión de recuperación sin usar.
 */
const MODOS = {
  in: {
    titulo: 'Iniciar sesión',
    enviar: 'Entrar',
    alterno: 'Crear una cuenta',
    campos: { email: true, password: true },
    autocompletar: 'current-password',
  },
  up: {
    titulo: 'Crear cuenta',
    enviar: 'Crear cuenta',
    alterno: 'Ya tengo cuenta',
    campos: { email: true, password: true },
    autocompletar: 'new-password',
  },
  reset: {
    titulo: 'Recuperar acceso',
    enviar: 'Enviar correo',
    alterno: 'Volver a iniciar sesión',
    campos: { email: true, password: false },
    autocompletar: 'current-password',
  },
  nueva: {
    titulo: 'Elegí una contraseña nueva',
    enviar: 'Guardar contraseña',
    alterno: null,
    campos: { email: false, password: true },
    autocompletar: 'new-password',
    rotuloPassword: 'Contraseña nueva',
  },
};

/** 'in' · 'up' · 'reset' · 'nueva' */
let modo = 'in';
let db = null;

/**
 * El enlace del correo devuelve al usuario acá con una sesión de recuperación.
 * Hay sesión, pero no se entra a la app hasta definir la contraseña nueva: si
 * se entrara, la pantalla para cambiarla no llegaría a verse nunca.
 */
let recuperando = false;

/**
 * A dónde vuelve el enlace del correo. Se deduce de la URL de este módulo, así
 * que funciona igual en la raíz del dominio que en un subdirectorio.
 *
 * Supabase solo redirige a direcciones declaradas en Authentication → URL
 * Configuration: si esta no está en la lista, el enlace lleva al Site URL.
 */
const VOLVER_A = new URL('.', import.meta.url).href;

window.supabaseClient = null;
window.supabaseSession = null;

// ---------------------------------------------------------
// Arranque
// ---------------------------------------------------------

const configurado = window.SUPABASE_URL
  && window.SUPABASE_ANON_KEY
  && !String(window.SUPABASE_URL).startsWith('PEGAR');

if (typeof createClient !== 'function') {
  faltaCliente();
} else if (!configurado) {
  faltaConfiguracion();
} else {
  db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  window.supabaseClient = db;

  const { data } = await db.auth.getSession();
  aplicarSesion(data.session);

  // Cubre el login, el cierre de sesión, la renovación del token y la vuelta
  // desde el enlace de recuperación.
  db.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'PASSWORD_RECOVERY') {
      recuperando = true;
      cambiarModo('nueva');
    }
    aplicarSesion(sesion);
  });
}

function faltaConfiguracion() {
  el.gate.hidden = false;
  el.form.hidden = true;
  el.notice.hidden = false;
  el.notice.innerHTML = 'Falta configurar Supabase. Abrí <code>config.js</code> '
    + 'y pegá la URL y la <em>anon key</em> de tu proyecto. '
    + 'El esquema de la base está en <code>db/supabase-app-state.sql</code>.';
}

/**
 * El script de `vendor/` no dejó su global. Las dos causas reales son que el
 * archivo no se sirvió, o que su `integrity` no coincidió y el navegador lo
 * bloqueó — que es justamente lo que ese atributo tiene que hacer si alguien
 * alteró el archivo. Sin este aviso, el síntoma sería un TypeError en consola
 * y una pantalla de login que no responde.
 */
function faltaCliente() {
  el.gate.hidden = false;
  el.form.hidden = true;
  el.notice.hidden = false;
  el.notice.innerHTML = 'No se pudo cargar el cliente de Supabase. Si el archivo de '
    + '<code>vendor/</code> cambió, su <code>integrity</code> en <code>index.html</code> '
    + 'quedó desactualizado y el navegador lo bloquea. Ver <code>vendor/README.md</code>.';
}

function aplicarSesion(sesion) {
  const usuario = sesion?.user || null;
  window.supabaseSession = sesion || null;

  /* Durante la recuperación hay sesión, pero la puerta sigue cerrada: primero
     hay que elegir la contraseña nueva. Sin esto, el enlace del correo dejaría
     al usuario adentro y la pantalla para cambiarla no aparecería nunca. */
  const entrar = Boolean(usuario) && !recuperando;

  el.gate.hidden = entrar;
  el.app.hidden = !entrar;
  el.session.hidden = !entrar;

  if (entrar) {
    el.user.textContent = usuario.email || 'Sesión iniciada';
    el.user.title = usuario.email || '';
    window.Habitos?.start?.({ id: usuario.id, email: usuario.email });
  } else {
    window.Habitos?.stop?.();
  }
}

// ---------------------------------------------------------
// Formulario
// ---------------------------------------------------------

/** Pone la pantalla en un modo y limpia lo que dijo el anterior. */
function cambiarModo(nuevo) {
  modo = nuevo;
  const m = MODOS[modo];

  el.title.textContent = m.titulo;
  el.submit.textContent = m.enviar;

  el.emailField.hidden = !m.campos.email;
  el.passwordField.hidden = !m.campos.password;
  el.email.required = m.campos.email;
  el.password.required = m.campos.password;

  el.passwordLabel.textContent = m.rotuloPassword ?? 'Contraseña';
  el.password.autocomplete = m.autocompletar;

  el.toggle.hidden = !m.alterno;
  if (m.alterno) el.toggle.textContent = m.alterno;

  // Solo se ofrece desde el inicio de sesión: en los otros modos no aplica.
  el.forgot.hidden = modo !== 'in';

  mostrarError('');
  el.notice.hidden = true;
}

el.toggle.addEventListener('click', () => {
  // Desde recuperar se vuelve a entrar; entre entrar y crear se alterna.
  cambiarModo(modo === 'in' ? 'up' : 'in');
});

el.forgot.addEventListener('click', () => {
  cambiarModo('reset');
  // El email escrito se conserva: casi siempre es el que hay que recuperar.
  el.email.focus();
});

el.form.addEventListener('submit', async e => {
  e.preventDefault();
  mostrarError('');
  el.notice.hidden = true;

  const email = el.email.value.trim();
  const password = el.password.value;
  const pide = MODOS[modo].campos;

  if (pide.email && !email) return mostrarError('Escribí tu email.');
  if (pide.password && !password) return mostrarError('Escribí tu contraseña.');

  el.submit.disabled = true;
  const original = el.submit.textContent;
  el.submit.textContent = 'Un momento…';

  try {
    if (modo === 'reset') await pedirRecuperacion(email);
    else if (modo === 'nueva') await guardarPasswordNueva(password);
    else await entrarOCrear(email, password);
  } catch (err) {
    console.error(err);
    mostrarError('No se pudo conectar con el servidor. Revisá la conexión.');
  } finally {
    el.submit.disabled = false;
    el.submit.textContent = original;
  }
});

async function entrarOCrear(email, password) {
  const { data, error } = modo === 'up'
    ? await db.auth.signUp({ email, password })
    : await db.auth.signInWithPassword({ email, password });

  if (error) {
    mostrarError(traducir(error.message));
  } else if (modo === 'up' && !data.session) {
    // El proyecto pide confirmar por mail antes de dejar entrar.
    el.notice.hidden = false;
    el.notice.textContent = `Te mandamos un mail a ${email} para confirmar la cuenta.`;
  }
  // Si hay sesión, onAuthStateChange se encarga de mostrar la app.
}

async function pedirRecuperacion(email) {
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: VOLVER_A });
  if (error) return mostrarError(traducir(error.message));

  /* El aviso NO confirma si la cuenta existe. Decir «no hay cuenta con ese
     email» convierte esta pantalla en un verificador de quién está registrado,
     que es justo lo que no conviene ofrecer sin sesión. */
  el.notice.hidden = false;
  el.notice.textContent = `Si hay una cuenta con ${email}, te llega un correo `
    + 'con un enlace para elegir una contraseña nueva. Revisá también el correo no deseado.';
}

async function guardarPasswordNueva(password) {
  const { error } = await db.auth.updateUser({ password });
  if (error) return mostrarError(traducir(error.message));

  // Recién ahora se abre la puerta: la sesión de recuperación pasa a ser normal.
  recuperando = false;
  cambiarModo('in');
  el.password.value = '';

  const { data } = await db.auth.getSession();
  aplicarSesion(data.session);
}

el.signOut.addEventListener('click', async () => {
  await db.auth.signOut();
  el.password.value = '';
  cambiarModo('in');
});

function mostrarError(texto) {
  el.error.textContent = texto;
  el.error.hidden = !texto;
}

/** Los mensajes de Supabase vienen en inglés; se traducen los frecuentes. */
function traducir(mensaje) {
  const mapa = {
    'Invalid login credentials': 'Email o contraseña incorrectos.',
    'Email not confirmed': 'Todavía no confirmaste la cuenta. Revisá tu correo.',
    'User already registered': 'Ese email ya tiene una cuenta.',
    'Password should be at least 6 characters':
      'La contraseña necesita al menos 6 caracteres.',
    'Unable to validate email address: invalid format': 'El email no es válido.',
    'New password should be different from the old password.':
      'La contraseña nueva tiene que ser distinta de la anterior.',
    'Auth session missing!':
      'El enlace del correo ya venció. Pedí uno nuevo desde «¿Olvidaste tu contraseña?».',
  };

  /* El límite de reenvíos trae los segundos que faltan, así que el texto varía
     y no entra en el mapa. */
  const espera = mensaje.match(/only request this after (\d+) seconds/);
  if (espera) return `Esperá ${espera[1]} segundos antes de volver a pedirlo.`;

  return mapa[mensaje] || mensaje;
}
