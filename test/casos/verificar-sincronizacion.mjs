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
 */
async function montar({ local = null, remoto = null, pendiente = null, alSubir } = {}) {
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
  const responder = alSubir ?? (async () => ({ error: null }));
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
  };

  window.eval(leer('app.js'));
  await window.Habitos.start(USUARIO);
  await latir();

  const doc = window.document;
  return {
    window, doc, subidas, avanzar,
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

// --- 1. las ráfagas se agrupan en una sola escritura -----------------------
{
  const a = await montar({ remoto: REMOTO });
  const base = a.subidas.length;

  a.marcar('27'); a.marcar('28'); a.marcar('29');
  await latir();
  ok('tres clics no escriben en el acto', a.subidas.length === base,
    `${a.subidas.length - base} subida(s)`);

  await a.avanzar(800);
  ok('tras la espera sube UNA vez', a.subidas.length === base + 1,
    `${a.subidas.length - base} subida(s)`);

  const payload = a.subidas.at(-1).payload;
  ok('y lleva los tres estados', Object.keys(payload.status).length === 3,
    Object.keys(payload.status).join(' '));
}

// --- 2. nunca hay dos escrituras en vuelo ---------------------------------
{
  let soltar;
  const enEspera = new Promise(r => { soltar = r; });
  let numero = 0;

  const a = await montar({
    remoto: REMOTO,
    alSubir: async n => {
      numero = n;
      if (n === 1) await enEspera;      // la primera queda colgada
      return { error: null };
    },
  });
  const base = a.subidas.length;

  a.marcar('27');
  await a.avanzar(800);
  ok('arranca la primera subida', a.subidas.length === base + 1);

  // Llegan cambios mientras la anterior sigue sin resolver.
  a.marcar('28');
  await a.avanzar(800);
  ok('no se lanza una segunda en paralelo', a.subidas.length === base + 1,
    `${a.subidas.length - base} en vuelo`);

  soltar({ error: null });
  await latir();
  ok('al resolverse la primera, sube lo que quedó', a.subidas.length === base + 2,
    `${a.subidas.length - base} subida(s)`);
  ok('y esa última lleva los dos estados',
    Object.keys(a.subidas.at(-1).payload.status).length === 2,
    Object.keys(a.subidas.at(-1).payload.status).join(' '));
  ok('el doble vio las dos', numero === 2, String(numero));
}

// --- 3. las preferencias de pantalla no viajan ----------------------------
{
  const a = await montar({ remoto: REMOTO });
  a.marcar('27');
  await a.avanzar(800);

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
  const base = a.subidas.length;

  a.doc.querySelector('#btn-theme').click();
  a.doc.querySelector('#btn-zoom')?.click();
  a.doc.querySelector('[data-compliance-mode]')?.click();
  await a.avanzar(2000);

  ok('tema, zoom y estatus no generan escrituras', a.subidas.length === base,
    `${a.subidas.length - base} subida(s)`);
  ok('pero quedan guardadas en el aparato',
    Boolean(a.guardadoEn('tareas-diarias/prefs')),
    String(a.guardadoEn('tareas-diarias/prefs')));
}

// --- 5. un fallo se reintenta solo ----------------------------------------
{
  const a = await montar({
    remoto: REMOTO,
    alSubir: async n => (n === 1 ? { error: { message: 'red caída' } } : { error: null }),
  });
  const base = a.subidas.length;

  a.marcar('27');
  await a.avanzar(800);
  ok('el primer intento sale y falla', a.subidas.length === base + 1);

  await a.avanzar(1000);
  ok('no reintenta enseguida', a.subidas.length === base + 1,
    `${a.subidas.length - base} intento(s)`);

  await a.avanzar(5000);
  ok('reintenta tras la espera de castigo', a.subidas.length === base + 2,
    `${a.subidas.length - base} intento(s)`);

  await a.avanzar(60000);
  ok('y al lograrlo deja de intentar', a.subidas.length === base + 2,
    `${a.subidas.length - base} intento(s)`);
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
  ok('y se sube para alinear la base', a.subidas.length >= 1,
    `${a.subidas.length} subida(s)`);
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
  ok('al ocultarse la pestaña sube en el acto', a.subidas.length === base + 1,
    `${a.subidas.length - base} subida(s)`);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
