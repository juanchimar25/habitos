/* Cómo sube el estado a la base: agrupado, de a una escritura por vez, con
   reintento, y sin arrastrar las preferencias de pantalla.

   Se monta la app con un cliente de Supabase instrumentado —lo que se mira es
   NUESTRO cableado: cuántas veces se escribe, con qué y cuándo— y con un reloj
   propio, para no esperar de verdad los 800 ms de la agrupación ni los 5 s del
   primer reintento. */
import { JSDOM } from 'jsdom';
import { celdaDe, leer, marcarCelda, AHORA } from '../harness.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const USUARIO = { id: 'u-test', email: 'test@ejemplo.com' };
const CLAVE = `tareas-diarias/v1/${USUARIO.id}`;

const TAREAS = [
  { id: 't1', name: 'Leer', freq: 'daily', customMode: 'weekdays', weekdays: [], target: 12, start: null },
];

const estadoCon = extra => ({
  months: { '2026-07': TAREAS },
  status: {},
  complianceMode: 'glyph',
  zoom: 'normal',
  controlsCollapsed: false,
  panels: { tiles: true, charts: true },
  theme: 'light',
  ...extra,
});

/** Deja pasar los `await` encadenados sin avanzar el reloj de la app. */
const latir = async (veces = 6) => {
  for (let i = 0; i < veces; i++) await new Promise(r => setTimeout(r, 0));
};

/**
 * Monta la app con el cliente instrumentado.
 * @param {object} opciones
 *   `local`      qué hay en localStorage para este usuario
 *   `remoto`     qué devuelve la base: `null` = cuenta vacía
 *   `pendiente`  marca de cambios locales sin subir (ISO)
 *   `alSubir`    respuesta del upsert; por omisión, éxito
 *   `alParchear` respuesta de `merge_app_state`; por omisión, éxito
 */
async function montar({ local = null, remoto = null, pendiente = null, alSubir, alParchear } = {}) {
  const html = leer('index.html').replace(/<script type="module"[^>]*><\/script>/, '');
  const dom = new JSDOM(html, {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true,
  });
  const { window } = dom;

  // --- reloj fijo, como el arnés ----------------------------------
  const DateReal = window.Date;
  class DateFija extends DateReal {
    constructor(...args) {
      if (args.length === 0) super(AHORA.getTime());
      else super(...args);
    }
    static now() { return AHORA.getTime(); }
  }
  window.Date = DateFija;

  // --- reloj de temporizadores, gobernado desde el test ------------
  const pendientes = new Map();
  let siguienteId = 1;
  let reloj = 0;
  window.setTimeout = (fn, ms = 0) => {
    const id = siguienteId++;
    pendientes.set(id, { fn, en: reloj + ms });
    return id;
  };
  window.clearTimeout = id => { pendientes.delete(id); };

  /** Adelanta el reloj de la app y deja correr lo que venza. */
  async function avanzar(ms) {
    reloj += ms;
    const vencidos = [...pendientes.entries()]
      .filter(([, t]) => t.en <= reloj)
      .sort((a, b) => a[1].en - b[1].en);
    for (const [id, t] of vencidos) {
      pendientes.delete(id);
      t.fn();
    }
    await latir();
  }

  // --- almacenamiento ---------------------------------------------
  const guardado = new Map();
  if (local) guardado.set(CLAVE, JSON.stringify(local));
  if (pendiente) guardado.set(`${CLAVE}/pendiente`, pendiente);
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: k => (guardado.has(k) ? guardado.get(k) : null),
      setItem: (k, v) => { guardado.set(k, String(v)); },
      removeItem: k => { guardado.delete(k); },
      key: i => [...guardado.keys()][i] ?? null,
      get length() { return guardado.size; },
    },
  });

  // --- APIs que jsdom no trae -------------------------------------
  let contador = 0;
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: { randomUUID: () => `id-fijo-${++contador}` },
  });
  window.matchMedia = q => ({
    media: q, matches: false, addEventListener() {}, removeEventListener() {},
  });
  for (const d of window.document.querySelectorAll('dialog')) {
    d.showModal = function () { this.setAttribute('open', ''); };
    d.close = function () { this.removeAttribute('open'); };
  }
  Object.defineProperty(window.document, 'currentScript', {
    configurable: true, value: { src: 'http://localhost/app.js' },
  });

  let visibilidad = 'visible';
  Object.defineProperty(window.document, 'visibilityState', {
    configurable: true, get: () => visibilidad,
  });

  // --- el doble de Supabase ---------------------------------------
  const subidas = [];
  const parches = [];
  const responder = alSubir ?? (async () => ({ error: null }));
  const responderParche = alParchear ?? (async () => ({ data: null, error: null }));
  window.supabaseClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: remoto ? { payload: remoto.payload, updated_at: remoto.updatedAt } : null,
            error: null,
          }),
        }),
      }),
      upsert: async fila => {
        subidas.push(fila);
        return responder(subidas.length);
      },
    }),
    /* La subida incremental: el cliente manda el parche y la base lo mezcla.
       El doble solo lo anota — mezclar de verdad es cosa de Postgres. */
    rpc: async (nombre, args) => {
      parches.push({ nombre, ...args });
      return responderParche(parches.length);
    },
  };

  window.eval(leer('app.js'));
  await window.Habitos.start(USUARIO);
  await latir();

  const doc = window.document;
  return {
    window, doc, subidas, parches, avanzar,
    /** Cicla el estado de una celda, como un clic del usuario. */
    marcar: dia => marcarCelda(doc, celdaDe(doc, 't1', `2026-07-${dia}`)),
    guardadoEn: k => (guardado.has(k) ? guardado.get(k) : null),
    ocultar: () => {
      visibilidad = 'hidden';
      doc.dispatchEvent(new window.Event('visibilitychange'));
    },
  };
}

const REMOTO = { payload: estadoCon({}), updatedAt: '2026-07-30T10:00:00+00:00' };

/* Lo que la app escribe hoy: el estado sin las preferencias de pantalla. Sirve
   para que el primer parche sea el cambio y nada más — contra un payload viejo,
   el primer parche además lo normaliza, que es su otro trabajo. */
const REMOTO_AL_DIA = {
  payload: {
    /* La tarea como la deja `normalize`: si al fixture le faltara un campo, el
       primer parche lo agregaría y ensuciaría lo que estos casos miran. */
    months: { '2026-07': TAREAS.map(t => ({ ...t, archived: [], end: null })) },
    status: {},
    trash: [],
    templates: [],
    removedTemplates: [],
    /* Con «Varios», que la app agrega sola: si al fixture le faltara, el primer
       parche lo sumaría y ensuciaría lo que estos casos miran. */
    pendientes: {
      categorias: [
        { id: 'cat-varios', name: 'Varios', padre: null, archivada: false },
        { id: 'cat-varios-sub', name: 'Varios', padre: 'cat-varios', archivada: false },
      ],
      items: [],
      papelera: [],
    },
  },
  updatedAt: '2026-07-30T10:00:00+00:00',
};

/* Una escritura es una sola cosa mirada desde el planificador, venga por el
   parche —lo normal— o por el volcado entero. Lo que prueban estos casos es
   CUÁNDO se escribe, no por cuál de los dos caminos. */
const escrituras = a => a.parches.length + a.subidas.length;
/** Lo que llevó la última escritura: el parche, o el payload completo. */
const ultimo = a => (a.parches.length
  ? a.parches.at(-1).parche
  : a.subidas.at(-1).payload);

// --- 1. las ráfagas se agrupan en una sola escritura -----------------------
{
  const a = await montar({ remoto: REMOTO });
  const base = escrituras(a);

  a.marcar('27'); a.marcar('28'); a.marcar('29');
  await latir();
  ok('tres clics no escriben en el acto', escrituras(a) === base,
    `${escrituras(a) - base} escritura(s)`);

  await a.avanzar(800);
  ok('tras la espera sube UNA vez', escrituras(a) === base + 1,
    `${escrituras(a) - base} escritura(s)`);

  ok('y lleva los tres estados', Object.keys(ultimo(a).status).length === 3,
    Object.keys(ultimo(a).status).join(' '));
}

// --- 2. nunca hay dos escrituras en vuelo ---------------------------------
{
  let soltar;
  const enEspera = new Promise(r => { soltar = r; });
  let numero = 0;

  const a = await montar({
    remoto: REMOTO,
    alParchear: async n => {
      numero = n;
      if (n === 1) await enEspera;      // la primera queda colgada
      return { data: null, error: null };
    },
  });
  const base = escrituras(a);

  a.marcar('27');
  await a.avanzar(800);
  ok('arranca la primera subida', escrituras(a) === base + 1);

  // Llegan cambios mientras la anterior sigue sin resolver.
  a.marcar('28');
  await a.avanzar(800);
  ok('no se lanza una segunda en paralelo', escrituras(a) === base + 1,
    `${escrituras(a) - base} en vuelo`);

  soltar({ data: null, error: null });
  await latir();
  ok('al resolverse la primera, sube lo que quedó', escrituras(a) === base + 2,
    `${escrituras(a) - base} escritura(s)`);
  /* La segunda lleva UNA sola marca: la sombra ya tiene la primera, así que el
     parche solo trae lo que la base todavía no vio. */
  ok('y esa última lleva lo que faltaba',
    Object.keys(ultimo(a).status).join(',') === 't1|2026-07-28',
    Object.keys(ultimo(a).status).join(' '));
  ok('el doble vio las dos', numero === 2, String(numero));
}

// --- 3. las preferencias de pantalla no viajan ----------------------------
{
  /* Contra una base sin la función de mezcla, para poder mirar el payload
     entero: en un parche solo viaja lo que cambió, así que la ausencia de una
     preferencia no probaría nada. */
  const a = await montar({
    remoto: REMOTO,
    alParchear: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }),
  });
  a.marcar('27');
  await a.avanzar(800);

  /* Se mira el volcado entero y no el parche: un parche solo trae lo que
     cambió, así que la ausencia de una preferencia no probaría nada. */
  const payload = a.subidas.at(-1).payload;
  console.log('  claves del payload:', Object.keys(payload).join(', '));
  for (const campo of ['theme', 'zoom', 'controlsCollapsed', 'panels', 'complianceMode']) {
    ok(`el payload no lleva «${campo}»`, !(campo in payload));
  }
  ok('pero sí los datos', ['months', 'status'].every(k => k in payload));
}

// --- 4. cambiar una preferencia no sube nada ------------------------------
{
  const a = await montar({ remoto: REMOTO });
  const base = escrituras(a);

  a.doc.querySelector('#btn-theme').click();
  a.doc.querySelector('#btn-zoom')?.click();
  a.doc.querySelector('[data-compliance-mode]')?.click();
  await a.avanzar(2000);

  ok('tema, zoom y estatus no generan escrituras', escrituras(a) === base,
    `${escrituras(a) - base} escritura(s)`);
  ok('pero quedan guardadas en el aparato',
    Boolean(a.guardadoEn('tareas-diarias/prefs')),
    String(a.guardadoEn('tareas-diarias/prefs')));
}

// --- 5. un fallo se reintenta solo ----------------------------------------
{
  const a = await montar({
    remoto: REMOTO,
    alParchear: async n => (n === 1
      ? { data: null, error: { message: 'red caída' } }
      : { data: null, error: null }),
  });
  const base = escrituras(a);

  a.marcar('27');
  await a.avanzar(800);
  ok('el primer intento sale y falla', escrituras(a) === base + 1);

  await a.avanzar(1000);
  ok('no reintenta enseguida', escrituras(a) === base + 1,
    `${escrituras(a) - base} intento(s)`);

  await a.avanzar(5000);
  ok('reintenta tras la espera de castigo', escrituras(a) === base + 2,
    `${escrituras(a) - base} intento(s)`);

  await a.avanzar(60000);
  ok('y al lograrlo deja de intentar', escrituras(a) === base + 2,
    `${escrituras(a) - base} intento(s)`);
}

// --- 6. la marca de pendiente sigue el estado real ------------------------
{
  const a = await montar({ remoto: REMOTO });
  ok('al abrir no hay nada pendiente', a.guardadoEn(`${CLAVE}/pendiente`) === null);

  a.marcar('27');
  await latir();
  ok('al guardar queda marcado', Boolean(a.guardadoEn(`${CLAVE}/pendiente`)),
    String(a.guardadoEn(`${CLAVE}/pendiente`)));

  await a.avanzar(800);
  ok('y al subir bien se limpia', a.guardadoEn(`${CLAVE}/pendiente`) === null,
    String(a.guardadoEn(`${CLAVE}/pendiente`)));
}

{
  const a = await montar({
    remoto: REMOTO,
    alParchear: async () => ({ data: null, error: { message: 'red caída' } }),
    alSubir: async () => ({ error: { message: 'red caída' } }),
  });
  a.marcar('27');
  await a.avanzar(800);
  ok('si la subida falla, la marca se conserva',
    Boolean(a.guardadoEn(`${CLAVE}/pendiente`)),
    String(a.guardadoEn(`${CLAVE}/pendiente`)));
}

// --- 7. lo local más nuevo no lo pisa lo remoto ---------------------------
{
  /* La pestaña se cerró antes de que la última subida llegara: en el navegador
     quedó un estado más nuevo que el de la base, marcado con su hora. */
  const local = estadoCon({ status: { 't1|2026-07-28': 'done' } });
  const a = await montar({
    local,
    remoto: { payload: estadoCon({}), updatedAt: '2026-07-30T10:00:00+00:00' },
    pendiente: '2026-07-30T11:00:00.000Z',
  });

  const marcada = celdaDe(a.doc, 't1', '2026-07-28');
  ok('gana la copia local', marcada?.classList.contains('st-done'),
    marcada?.className ?? '(sin celda)');

  await a.avanzar(800);
  ok('y se sube para alinear la base', escrituras(a) >= 1,
    `${escrituras(a)} escritura(s)`);
}

{
  /* Sin marca pendiente no hay nada que rescatar: manda la base. */
  const a = await montar({
    local: estadoCon({ status: { 't1|2026-07-28': 'done' } }),
    remoto: { payload: estadoCon({}), updatedAt: '2026-07-30T10:00:00+00:00' },
  });
  const marcada = celdaDe(a.doc, 't1', '2026-07-28');
  ok('sin marca pendiente gana lo remoto', !marcada?.classList.contains('st-done'),
    marcada?.className ?? '(sin celda)');
}

{
  /* Marca vieja: ya se subió y la base tiene algo posterior. */
  const a = await montar({
    local: estadoCon({ status: { 't1|2026-07-28': 'done' } }),
    remoto: { payload: estadoCon({}), updatedAt: '2026-07-30T12:00:00+00:00' },
    pendiente: '2026-07-30T09:00:00.000Z',
  });
  const marcada = celdaDe(a.doc, 't1', '2026-07-28');
  ok('una marca anterior al remoto no lo pisa', !marcada?.classList.contains('st-done'),
    marcada?.className ?? '(sin celda)');
}

// --- 8. irse de la pestaña sube sin esperar -------------------------------
{
  const a = await montar({ remoto: REMOTO });
  const base = a.subidas.length;

  a.marcar('27');
  await latir();
  ok('todavía no subió', a.subidas.length === base);

  a.ocultar();
  await latir();
  ok('al ocultarse la pestaña sube en el acto', escrituras(a) === base + 1,
    `${escrituras(a) - base} escritura(s)`);
}

// --- 8. sube solo lo que cambió -------------------------------------------
{
  /* Con el estado leído de la base, el cliente sabe qué tiene el otro lado y
     manda solo la diferencia: marcar una celda son cien bytes, no el historial
     entero. El formato es JSON Merge Patch, el mismo que entiende la función
     `merge_app_state`. */
  const a = await montar({ remoto: REMOTO_AL_DIA });

  a.marcar('27');
  await a.avanzar(900);

  console.log(`\n=== el parche ===\n  ${JSON.stringify(a.parches.at(-1))}`);

  ok('la subida va por el parche y no por el upsert',
    a.parches.length === 1 && a.subidas.length === 0,
    `${a.parches.length} parche(s) · ${a.subidas.length} upsert(s)`);
  ok('  contra la función que mezcla del lado de la base',
    a.parches[0].nombre === 'merge_app_state', a.parches[0].nombre);

  const parche = a.parches[0].parche;
  ok('  y lleva SOLO la marca nueva',
    Object.keys(parche).join(',') === 'status'
      && Object.keys(parche.status).join(',') === 't1|2026-07-27',
    JSON.stringify(parche));
  ok('  sin arrastrar los meses ni el resto del estado',
    parche.months === undefined && parche.templates === undefined,
    Object.keys(parche).join(','));

  // Un cambio más viaja igual de chico: la sombra se actualizó con el anterior.
  a.marcar('28');
  await a.avanzar(900);
  ok('el segundo cambio también viaja solo',
    Object.keys(a.parches.at(-1).parche.status).join(',') === 't1|2026-07-28',
    JSON.stringify(a.parches.at(-1).parche));
}

// --- 9. borrar una marca viaja como null ----------------------------------
{
  /* RFC 7386: en un parche, `null` significa «borrá esta clave». Es lo que
     necesita desmarcar una celda —si no, la marca vieja quedaría en la base—. */
  const a = await montar({
    remoto: {
      ...REMOTO_AL_DIA,
      payload: { ...REMOTO_AL_DIA.payload, status: { 't1|2026-07-27': 'done' } },
    },
  });

  /* El ciclo de una diaria es cumplida → parcial → no cumplida → no requerida
     → sin cargar, así que desde «cumplida» hacen falta cuatro toques para
     volver al principio. */
  a.marcar('27'); a.marcar('27'); a.marcar('27'); a.marcar('27');
  await a.avanzar(900);

  ok('desmarcar manda null, que es como se borra en un parche',
    a.parches.at(-1).parche.status['t1|2026-07-27'] === null,
    JSON.stringify(a.parches.at(-1).parche));
}

// --- 10. sin la función instalada, sube todo como antes -------------------
{
  /* Instalar `merge_app_state` es un paso de puesta en marcha, no un requisito:
     si no está, el cliente vuelve al upsert de siempre y no lo reintenta. */
  const a = await montar({
    remoto: REMOTO_AL_DIA,
    alParchear: async () => ({
      data: null,
      error: { message: 'Could not find the function public.merge_app_state', code: 'PGRST202' },
    }),
  });

  a.marcar('27');
  await a.avanzar(900);
  ok('si la función no está, sube el estado entero', a.subidas.length === 1,
    `${a.subidas.length} upsert(s)`);
  ok('  con el payload completo',
    Object.keys(a.subidas[0].payload).includes('months'),
    Object.keys(a.subidas[0].payload).join(','));

  a.marcar('28');
  await a.avanzar(900);
  ok('  y no vuelve a intentar el parche', a.parches.length === 1,
    `${a.parches.length} intento(s)`);
  ok('  pero sigue guardando', a.subidas.length === 2, `${a.subidas.length} upsert(s)`);
}

// --- 11. la primera vez, y después de un error, sube todo -----------------
{
  // Cuenta vacía: no hay contra qué comparar, así que va el estado entero.
  const a = await montar({ local: estadoCon({}), remoto: null });
  ok('en una cuenta vacía sube el estado entero',
    a.subidas.length === 1 && a.parches.length === 0,
    `${a.subidas.length} upsert(s) · ${a.parches.length} parche(s)`);

  /* Tras un fallo no se sabe qué quedó del otro lado, así que la próxima no
     puede ser un parche: se manda todo, que es lo que no depende de saberlo. */
  let vuelta = 0;
  const b = await montar({
    remoto: REMOTO_AL_DIA,
    alParchear: async () => {
      vuelta++;
      return vuelta === 1
        ? { data: null, error: { message: 'network error' } }
        : { data: null, error: null };
    },
  });

  b.marcar('27');
  await b.avanzar(900);
  ok('un parche que falla no da la subida por hecha', b.subidas.length === 0);

  await b.avanzar(6000);   // el reintento, con su espera creciente
  ok('  y el reintento manda el estado entero',
    b.subidas.length === 1 && Object.keys(b.subidas[0].payload).includes('status'),
    `${b.subidas.length} upsert(s)`);
}

// --- 12. el primer parche también normaliza lo que había -------------------
{
  /* Un payload de una versión vieja trae claves que ya no existen —el modo de
     estatus, el zoom, los paneles—. El primer parche las borra con `null`, que
     es como se borra en RFC 7386: la fila queda como la app la entiende hoy,
     sin necesidad de una migración aparte. */
  const a = await montar({ remoto: REMOTO });

  a.marcar('27');
  await a.avanzar(900);

  const parche = a.parches.at(-1).parche;
  ok('el parche borra las claves que ya no existen',
    ['complianceMode', 'zoom', 'panels'].every(k => parche[k] === null),
    Object.keys(parche).filter(k => parche[k] === null).join(','));
  ok('  y trae la marca nueva', parche.status['t1|2026-07-27'] === 'done',
    JSON.stringify(parche.status));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
