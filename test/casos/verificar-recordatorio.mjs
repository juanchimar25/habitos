/* El recordatorio diario, del lado del cliente.

   El aviso lo manda un servidor —una Edge Function que dispara `pg_cron`—,
   así que acá solo se prueba la mitad que corre en el navegador: cuándo se
   puede configurar, cuándo no y qué se dice en cada caso.

   Lo que NO se prueba acá, porque no hay navegador de verdad: que el push
   llegue. La firma que lo hace posible está cubierta en `test/vapid.mjs`, que
   verifica el JWT contra la clave pública igual que hace el servidor de push.

   El arnés monta la app SIN cliente de Supabase, que es el caso de «no hay
   sesión»; los demás se arman sustituyendo `window.supabaseClient`. */
import { montar } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const abrir = doc => {
  doc.querySelector('#btn-reminder').click();
  return {
    abierto: doc.querySelector('#reminder-dialog').hasAttribute('open'),
    error: doc.querySelector('#reminder-error').hidden
      ? '' : doc.querySelector('#reminder-error').textContent,
    onDisabled: doc.querySelector('#reminder-on').disabled,
    guardarDisabled: doc.querySelector('#reminder-save').disabled,
  };
};

/** Espera a que se resuelvan las promesas encoladas del diálogo. */
const respirar = () => new Promise(r => setTimeout(r, 0));

/**
 * Un cliente de Supabase mínimo, que anota lo que se le pide.
 * Solo implementa lo que usa el recordatorio: `select` con filtro y `upsert`.
 */
function clienteFalso({ reminder = { activo: false, hora: '21:00' } } = {}) {
  const escrito = [];
  return {
    escrito,
    from(tabla) {
      const api = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: tabla === 'push_reminders' ? reminder : null, error: null }),
        upsert: async fila => {
          escrito.push({ tabla, fila });
          return { error: null };
        },
      };
      return api;
    },
  };
}

/** Deja el entorno como un navegador que sí admite push y ya dio permiso. */
function habilitarPush(window, { permiso = 'granted' } = {}) {
  const suscripcion = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/ABC',
    toJSON: () => ({ keys: { p256dh: 'llave-p256', auth: 'llave-auth' } }),
  };

  window.Notification = { permission: permiso, requestPermission: async () => permiso };
  window.PushManager = function PushManager() {};
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => null,
          subscribe: async () => suscripcion,
        },
      }),
    },
  });
  window.atob = s => Buffer.from(s, 'base64').toString('binary');
  window.VAPID_PUBLIC_KEY = 'BBwClUEpzz7pYIuOMpPwMc8xArE1nJBL29gWHtcmH4vB5TlgMaRE_cotK91rRYo_5dXTZ0xM0GERw8MRqlmap6c';
  return suscripcion;
}

// --- sin soporte del navegador ---------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const r = abrir(doc);
  console.log(`=== navegador sin push ===\n  ${r.error}`);

  ok('el diálogo abre igual', r.abierto);
  ok('y explica que el navegador no puede', /no admite notificaciones/i.test(r.error), r.error);
  ok('nombrando el caso de iPhone, que es el que confunde',
    /iPhone/.test(r.error), r.error);
  ok('con el interruptor apagado', r.onDisabled === true);
  ok('y sin dejar guardar', r.guardarDisabled === true);
}

// --- falta la clave VAPID ---------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  habilitarPush(window);
  window.VAPID_PUBLIC_KEY = 'PEGAR_CLAVE_PUBLICA_VAPID';
  window.supabaseClient = clienteFalso();

  const r = abrir(doc);
  console.log(`\n=== sin clave VAPID configurada ===\n  ${r.error}`);
  ok('lo dice con el archivo y el comando', /config\.js/.test(r.error) && /vapid/i.test(r.error),
    r.error);
  ok('y no deja activarlo', r.guardarDisabled === true);
}

// --- permiso denegado -------------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  habilitarPush(window, { permiso: 'denied' });
  window.supabaseClient = clienteFalso();

  const r = abrir(doc);
  console.log(`\n=== notificaciones bloqueadas ===\n  ${r.error}`);
  ok('avisa que están bloqueadas', /bloqueaste/i.test(r.error), r.error);
  ok('y que se arregla en el navegador', /ajustes del navegador/i.test(r.error), r.error);
}

// --- activarlo --------------------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const sub = habilitarPush(window);
  const cliente = clienteFalso();
  window.supabaseClient = cliente;

  abrir(doc);
  await respirar();

  doc.querySelector('#reminder-on').checked = true;
  doc.querySelector('#reminder-on').dispatchEvent(new window.Event('change'));
  ok('con el recordatorio activo aparece la hora',
    doc.querySelector('#reminder-time-field').hidden === false);

  doc.querySelector('#reminder-time').value = '20:30';
  doc.querySelector('#reminder-form').dispatchEvent(
    new window.Event('submit', { cancelable: true, bubbles: true }));
  await respirar();
  await respirar();

  console.log('\n=== al activar ===');
  for (const e of cliente.escrito) console.log(`  ${e.tabla}: ${JSON.stringify(e.fila)}`);

  const suscripcion = cliente.escrito.find(e => e.tabla === 'push_subscriptions');
  ok('registra el dispositivo', Boolean(suscripcion));
  ok('con su endpoint', suscripcion?.fila.endpoint === sub.endpoint, suscripcion?.fila.endpoint);
  ok('y las claves del navegador, para poder mandar texto más adelante',
    suscripcion?.fila.p256dh === 'llave-p256' && suscripcion?.fila.auth === 'llave-auth',
    JSON.stringify(suscripcion?.fila));

  const pref = cliente.escrito.find(e => e.tabla === 'push_reminders');
  ok('guarda la preferencia', Boolean(pref));
  ok('activa', pref?.fila.activo === true, String(pref?.fila.activo));
  ok('con la hora elegida', pref?.fila.hora === '20:30', pref?.fila.hora);
  /* El desfase va SIEMPRE: es lo que deja que la hora siga siendo la del reloj
     de quien la eligió si viaja o si cambia el horario de verano. */
  ok('y con el desfase horario del aparato',
    Number.isFinite(pref?.fila.utc_offset), String(pref?.fila.utc_offset));

  ok('el diálogo se cierra', !doc.querySelector('#reminder-dialog').hasAttribute('open'));
  ok('y la hora queda a la vista en el menú',
    doc.querySelector('#reminder-badge').textContent === '20:30',
    doc.querySelector('#reminder-badge').textContent);
}

// --- desactivarlo -----------------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  habilitarPush(window);
  const cliente = clienteFalso({ reminder: { activo: true, hora: '21:00:00' } });
  window.supabaseClient = cliente;

  abrir(doc);
  await respirar();

  ok('\n=== desactivar ===\n  abre con lo que ya estaba guardado',
    doc.querySelector('#reminder-on').checked === true);
  /* Postgres devuelve `HH:MM:SS` y el campo de hora quiere `HH:MM`: sin
     recortarlo, el campo queda vacío y la hora guardada se pierde al guardar. */
  ok('  y con la hora recortada al formato del campo',
    doc.querySelector('#reminder-time').value === '21:00',
    doc.querySelector('#reminder-time').value);

  doc.querySelector('#reminder-on').checked = false;
  doc.querySelector('#reminder-on').dispatchEvent(new window.Event('change'));
  ok('  al apagarlo se esconde la hora',
    doc.querySelector('#reminder-time-field').hidden === true);

  doc.querySelector('#reminder-form').dispatchEvent(
    new window.Event('submit', { cancelable: true, bubbles: true }));
  await respirar();
  await respirar();

  const pref = cliente.escrito.find(e => e.tabla === 'push_reminders');
  console.log(`  ${JSON.stringify(pref?.fila)}`);
  ok('  se guarda apagado', pref?.fila.activo === false, String(pref?.fila.activo));
  /* No se borra la suscripción: volver a activarlo no tiene que pedir permiso
     otra vez, y un permiso que se vuelve a pedir es un permiso que se niega. */
  ok('  sin borrar el dispositivo registrado',
    !cliente.escrito.some(e => e.tabla === 'push_subscriptions'),
    cliente.escrito.map(e => e.tabla).join(','));
  ok('  y la insignia del menú desaparece',
    doc.querySelector('#reminder-badge').hidden === true);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
