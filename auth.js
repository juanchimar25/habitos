/* ============================================================
   Sesión — Supabase Auth
   ------------------------------------------------------------
   Módulo ES: importa el cliente desde CDN, así el proyecto sigue
   sin build ni `npm install`.

   Ojo: al ser un módulo, el navegador lo bloquea sobre `file://`.
   La app tiene que servirse por http(s) — ver el README.

   Toda la interacción con Supabase vive acá. `app.js` no sabe que
   existe: solo recibe `start(user)` y `stop()`.
   ============================================================ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const $ = sel => document.querySelector(sel);

const el = {
  gate: $('#auth-gate'),
  form: $('#auth-form'),
  email: $('#auth-email'),
  password: $('#auth-password'),
  submit: $('#auth-submit'),
  error: $('#auth-error'),
  notice: $('#auth-notice'),
  toggle: $('#auth-toggle'),
  title: $('#auth-title'),
  session: $('#drawer-session'),
  user: $('#session-user'),
  signOut: $('#btn-sign-out'),
  app: $('#app-root'),
};

/** 'in' = iniciar sesión · 'up' = crear cuenta */
let modo = 'in';
let db = null;

window.supabaseClient = null;
window.supabaseSession = null;

// ---------------------------------------------------------
// Arranque
// ---------------------------------------------------------

const configurado = window.SUPABASE_URL
  && window.SUPABASE_ANON_KEY
  && !String(window.SUPABASE_URL).startsWith('PEGAR');

if (!configurado) {
  faltaConfiguracion();
} else {
  db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  window.supabaseClient = db;

  const { data } = await db.auth.getSession();
  aplicarSesion(data.session);

  // Cubre el login, el cierre de sesión y la renovación del token.
  db.auth.onAuthStateChange((_evento, sesion) => aplicarSesion(sesion));
}

function faltaConfiguracion() {
  el.gate.hidden = false;
  el.form.hidden = true;
  el.notice.hidden = false;
  el.notice.innerHTML = 'Falta configurar Supabase. Abrí <code>config.js</code> '
    + 'y pegá la URL y la <em>anon key</em> de tu proyecto. '
    + 'El esquema de la base está en <code>db/schema.sql</code>.';
}

function aplicarSesion(sesion) {
  const usuario = sesion?.user || null;
  window.supabaseSession = sesion || null;

  el.gate.hidden = Boolean(usuario);
  el.app.hidden = !usuario;
  el.session.hidden = !usuario;

  if (usuario) {
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

el.toggle.addEventListener('click', () => {
  modo = modo === 'in' ? 'up' : 'in';
  const creando = modo === 'up';
  el.title.textContent = creando ? 'Crear cuenta' : 'Iniciar sesión';
  el.submit.textContent = creando ? 'Crear cuenta' : 'Entrar';
  el.toggle.textContent = creando ? 'Ya tengo cuenta' : 'Crear una cuenta';
  mostrarError('');
  el.notice.hidden = true;
});

el.form.addEventListener('submit', async e => {
  e.preventDefault();
  mostrarError('');
  el.notice.hidden = true;

  const email = el.email.value.trim();
  const password = el.password.value;
  if (!email || !password) return mostrarError('Completá el email y la contraseña.');

  el.submit.disabled = true;
  const original = el.submit.textContent;
  el.submit.textContent = 'Un momento…';

  try {
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
  } catch (err) {
    console.error(err);
    mostrarError('No se pudo conectar con el servidor. Revisá la conexión.');
  } finally {
    el.submit.disabled = false;
    el.submit.textContent = original;
  }
});

el.signOut.addEventListener('click', async () => {
  await db.auth.signOut();
  el.password.value = '';
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
  };
  return mapa[mensaje] || mensaje;
}
