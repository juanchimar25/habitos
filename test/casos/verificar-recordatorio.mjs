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

/**
 * Provoca un redibujado. `window.Habitos` no expone `render`, así que se hace
 * lo que haría una persona: mover el rango y volver.
 *
 * Hace falta porque el aviso se decide en el render, y el arnés monta la app
 * —y con ella el arranque— ANTES de que el caso instale el cliente de Supabase
 * y el soporte de push.
 */
const renderizar = doc => {
  // Ir a un día y volver: cualquier movimiento del carrete redibuja.
  doc.body.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  doc.body.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
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

// --- el ofrecimiento, una sola vez por aparato -----------------------------
{
  /* Se ofrece cuando se puede aceptar: con soporte, con sesión y sin un
     recordatorio ya activo. Es una franja sobre la planilla y no un diálogo:
     interrumpir la pantalla para pedir un permiso que nadie pidió es la forma
     más rápida de que lo rechacen para siempre. */
  const { window, doc } = await montar(ESTADO_LLENO);
  habilitarPush(window);
  window.supabaseClient = clienteFalso();

  // El aviso depende de una lectura remota, así que no aparece en el acto.
  ok('no se ofrece antes de saber si ya está activo',
    doc.querySelector('#reminder-nudge').hidden === true);

  renderizar(doc);
  await respirar();
  await respirar();

  const nudge = doc.querySelector('#reminder-nudge');
  console.log(`\n=== el ofrecimiento ===\n  visible: ${!nudge.hidden}`);
  console.log(`  ${doc.querySelector('.nudge-titulo').textContent.trim()}`);
  console.log(`  ${doc.querySelector('.nudge-detalle').textContent.trim().replace(/\s+/g, ' ')}`);

  ok('se ofrece con la sesión abierta', nudge.hidden === false);
  ok('dice la hora que va a proponer',
    /22/.test(doc.querySelector('.nudge-detalle').textContent), '');
  ok('con un botón para activar', Boolean(doc.querySelector('#nudge-si')));
  ok('y otro para dejarlo pasar', Boolean(doc.querySelector('#nudge-no')));
}

// --- «Ahora no» no vuelve a preguntar --------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  habilitarPush(window);
  window.supabaseClient = clienteFalso();
  renderizar(doc);
  await respirar();
  await respirar();

  doc.querySelector('#nudge-no').click();
  console.log('\n=== «Ahora no» ===');
  ok('  el aviso desaparece', doc.querySelector('#reminder-nudge').hidden === true);

  const prefs = JSON.parse(window.localStorage.getItem('tareas-diarias/prefs') || '{}');
  console.log(`  recordatorioOfrecido: ${prefs.recordatorioOfrecido}`);
  ok('  y queda anotado en el aparato', prefs.recordatorioOfrecido === true,
    String(prefs.recordatorioOfrecido));

  /* Va con las preferencias de pantalla, no con los datos: la suscripción al
     push es por navegador, así que ofrecerlo de nuevo en el teléfono cuando se
     activó en la computadora es lo correcto. */
  const guardado = JSON.parse(window.localStorage.getItem('tareas-diarias/v1/u-test'));
  ok('  no viaja con el diario a la base', guardado.recordatorioOfrecido === true,
    JSON.stringify(Object.keys(prefs)));
}
{
  // Al volver a abrir con la marca puesta, ya no se ofrece.
  const { window, doc } = await montar({ ...ESTADO_LLENO, recordatorioOfrecido: true });
  habilitarPush(window);
  window.supabaseClient = clienteFalso();
  renderizar(doc);
  await respirar();
  await respirar();

  ok('con la marca puesta no se vuelve a ofrecer',
    doc.querySelector('#reminder-nudge').hidden === true);
}

// --- «Activar» deja todo configurado ---------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const sub = habilitarPush(window);
  const cliente = clienteFalso();
  window.supabaseClient = cliente;
  renderizar(doc);
  await respirar();
  await respirar();

  doc.querySelector('#nudge-si').click();
  await respirar();
  await respirar();
  await respirar();

  console.log('\n=== «Activar» ===');
  for (const e of cliente.escrito) console.log(`  ${e.tabla}: ${JSON.stringify(e.fila)}`);

  const suscripcion = cliente.escrito.find(e => e.tabla === 'push_subscriptions');
  ok('  registra el dispositivo', suscripcion?.fila.endpoint === sub.endpoint,
    suscripcion?.fila.endpoint);

  const pref = cliente.escrito.find(e => e.tabla === 'push_reminders');
  ok('  lo deja activo', pref?.fila.activo === true, String(pref?.fila.activo));
  ok('  a las 22, que es la hora propuesta', pref?.fila.hora === '22:00', pref?.fila.hora);

  ok('  el aviso desaparece', doc.querySelector('#reminder-nudge').hidden === true);
  ok('  y la hora aparece en el menú',
    doc.querySelector('#reminder-badge').textContent === '22:00',
    doc.querySelector('#reminder-badge').textContent);
}

// --- no se ofrece cuando no corresponde ------------------------------------
{
  // Ya activo: no hay nada que ofrecer.
  const { window, doc } = await montar(ESTADO_LLENO);
  habilitarPush(window);
  window.supabaseClient = clienteFalso({ reminder: { activo: true, hora: '20:00:00' } });
  renderizar(doc);
  await respirar();
  await respirar();

  console.log('\n=== con el recordatorio ya activo ===');
  ok('  no se ofrece', doc.querySelector('#reminder-nudge').hidden === true);
  ok('  pero la hora ya se ve en el menú, sin abrir el diálogo',
    doc.querySelector('#reminder-badge').textContent === '20:00',
    doc.querySelector('#reminder-badge').textContent);
}
{
  // Sin soporte de push no se ofrece algo que no se puede aceptar.
  const { doc } = await montar(ESTADO_LLENO);
  renderizar(doc);
  await respirar();
  ok('sin soporte del navegador no se ofrece',
    doc.querySelector('#reminder-nudge').hidden === true);
}
{
  // Con el permiso ya denegado tampoco: el navegador no lo volvería a pedir.
  const { window, doc } = await montar(ESTADO_LLENO);
  habilitarPush(window, { permiso: 'denied' });
  window.supabaseClient = clienteFalso();
  renderizar(doc);
  await respirar();
  await respirar();
  ok('con el permiso denegado tampoco',
    doc.querySelector('#reminder-nudge').hidden === true);
}

// --- una cuenta que ya existía y nunca tocó el recordatorio ----------------
{
  /* El caso más común al publicar esto: gente que viene usando la app desde
     antes de que el recordatorio existiera. No tiene fila en `push_reminders`
     —que NO es lo mismo que tenerla en `activo = false`— ni marca de que se le
     haya ofrecido, porque esa marca es nueva.

     Tiene que verlo ofrecido, con la hora en 22. */
  const { window, doc } = await montar(ESTADO_LLENO);
  habilitarPush(window);
  const cliente = clienteFalso({ reminder: null });   // la tabla no devuelve fila
  window.supabaseClient = cliente;

  renderizar(doc);
  await respirar();
  await respirar();

  console.log('\n=== cuenta vieja, sin fila en la tabla ===');
  ok('  se le ofrece', doc.querySelector('#reminder-nudge').hidden === false);
  ok('  y el menú no muestra hora, porque no hay ninguna',
    doc.querySelector('#reminder-badge').hidden === true);

  doc.querySelector('#nudge-si').click();
  await respirar();
  await respirar();
  await respirar();

  const pref = cliente.escrito.find(e => e.tabla === 'push_reminders');
  console.log(`  al aceptar: ${JSON.stringify(pref?.fila)}`);
  ok('  al aceptar queda a las 22', pref?.fila.hora === '22:00', pref?.fila.hora);
  ok('  y la fila se crea con el upsert', pref?.fila.user_id === 'u-test',
    pref?.fila.user_id);
}
{
  /* La otra mitad del mismo caso: alguien que ya tenía su hora elegida no
     debe ver nada ni que se le pise la hora por la nueva por omisión. */
  const { window, doc } = await montar(ESTADO_LLENO);
  habilitarPush(window);
  const cliente = clienteFalso({ reminder: { activo: true, hora: '19:30:00' } });
  window.supabaseClient = cliente;

  renderizar(doc);
  await respirar();
  await respirar();

  console.log('\n=== cuenta que ya lo tenía activo a otra hora ===');
  ok('  no se le ofrece nada', doc.querySelector('#reminder-nudge').hidden === true);
  ok('  y conserva su hora', doc.querySelector('#reminder-badge').textContent === '19:30',
    doc.querySelector('#reminder-badge').textContent);
  ok('  sin escribir nada en la base', cliente.escrito.length === 0,
    JSON.stringify(cliente.escrito));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
