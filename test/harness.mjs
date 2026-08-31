/* ============================================================
   Arnés de pruebas — monta la app dentro de jsdom
   ------------------------------------------------------------
   La app no tiene build: se carga el index.html real y se evalúa
   app.js tal cual, sin tocar una línea. Lo único que se sustituye
   es el entorno: reloj, almacenamiento y las APIs del navegador
   que jsdom no trae.

   auth.js queda fuera a propósito: importa un módulo por CDN y lo
   único que aporta es llamar a `Habitos.start(user)`, que acá se
   invoca a mano.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

/** Raíz del proyecto. La exportan los casos para leer fuentes sin rutas absolutas. */
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Instante fijo: jueves 30 de julio de 2026, 10:00 local. */
export const AHORA = new Date(2026, 6, 30, 10, 0, 0);

export const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/**
 * Levanta la app con un estado ya cargado.
 * @param {object} estado  lo que habría en localStorage para ese usuario
 * @param {{ ruta?: string }} [opciones] `ruta` es la dirección con la que se
 *   abre la app —`'ajustes'`, `'pendientes'`…—, sin barra inicial. Por defecto
 *   la raíz, que es lo que hacía siempre: el router cae en Diario.
 * @returns {Promise<{window: object, doc: Document, Habitos: object}>}
 */
export async function montar(estado, { ruta = '' } = {}) {
  const html = leer('index.html')
    // El módulo de sesión pide un import por CDN: fuera.
    .replace(/<script type="module"[^>]*><\/script>/, '');

  const dom = new JSDOM(html, {
    url: `http://localhost/${ruta}`,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const usuario = { id: 'u-test', email: 'test@ejemplo.com' };

  // --- reloj fijo -------------------------------------------------
  const DateReal = window.Date;
  class DateFija extends DateReal {
    constructor(...args) {
      if (args.length === 0) super(AHORA.getTime());
      else super(...args);
    }
    static now() { return AHORA.getTime(); }
  }
  window.Date = DateFija;

  /* jsdom no trae `CSS.escape`, que el navegador sí tiene. Sin esto, todo
     selector armado con un id de tarea revienta y el error se traga adentro
     del listener: la prueba pasa igual, midiendo menos de lo que cree. */
  if (!window.CSS) window.CSS = {};
  if (!window.CSS.escape) {
    window.CSS.escape = v => String(v).replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);
  }

  // --- almacenamiento --------------------------------------------
  const guardado = new Map([
    [`tareas-diarias/v1/${usuario.id}`, JSON.stringify(estado)],
  ]);
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

  // --- APIs que jsdom no implementa ------------------------------
  // Ids estables: si no, cada corrida generaría uuids distintos.
  let contador = 0;
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: { randomUUID: () => `id-fijo-${++contador}` },
  });

  // jsdom no trae matchMedia. Se responde siempre que no, que es el
  // camino por defecto: sin preferencia guardada, tema claro.
  window.matchMedia = query => ({
    media: query,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });

  for (const dlg of window.document.querySelectorAll('dialog')) {
    dlg.showModal = function () { this.setAttribute('open', ''); };
    dlg.close = function () { this.removeAttribute('open'); };
  }

  // app.js deduce su carpeta base de la URL de su propio <script>.
  Object.defineProperty(window.document, 'currentScript', {
    configurable: true,
    value: { src: 'http://localhost/app.js' },
  });

  // --- la app ------------------------------------------------------
  window.eval(leer('app.js'));

  // Sin cliente de Supabase, hydrateStateForUser cae en localStorage
  // y avisa que no sincroniza: es el camino que queremos acá.
  await window.Habitos.start(usuario);

  return { window, doc: window.document, Habitos: window.Habitos, dom };
}

/**
 * Pone un día en el centro del carrete, que es el que se carga.
 *
 * Va por el calendario de «Ir a…» y no clickeando las fichas del carrete: el
 * carrete solo muestra siete días, así que para llegar a uno lejano habría que
 * simular decenas de clics. Este es además el recorrido que hace un usuario
 * cuando el destino no está a la vista.
 *
 * @param {string} clave  fecha `YYYY-MM-DD`
 */
/**
 * Un deslizamiento de costado sobre un nodo: `sentido` -1 va a lo siguiente
 * —el dedo va hacia la izquierda— y 1 a lo anterior.
 *
 * Los gestos de la app piden recorrido de sobra y bastante más ancho que alto,
 * así que los números de acá están elegidos para pasar esas dos condiciones.
 */
export function deslizar(doc, nodo, sentido) {
  const window = doc.defaultView;
  const puntero = (tipo, x) => {
    const e = new window.Event(tipo, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX: x, clientY: 300, pointerId: 1, button: 0, pointerType: 'touch' });
    nodo.dispatchEvent(e);
  };
  puntero('pointerdown', 200);
  puntero('pointermove', 200 + sentido * 120);
  puntero('pointerup', 200 + sentido * 120);
}

export function verDia(doc, clave) {
  const window = doc.defaultView;
  const centro = () => doc.querySelector('.carrete-dia.is-centro')?.dataset.date;
  const distancia = () => Math.round(
    (Date.parse(clave) - Date.parse(centro())) / 86400000);

  // Los atajos no corren con un diálogo abierto ni con el cajón desplegado.
  for (const dlg of doc.querySelectorAll('dialog[open]')) dlg.close();
  if (doc.body.classList.contains('drawer-open')) {
    doc.querySelector('#btn-menu-close').click();
  }

  let vueltas = 0;
  while (centro() !== clave && vueltas++ < 800) {
    const delta = distancia();
    /* De a siete deslizando el carrete mientras haya una semana entera de por
       medio; el resto, de a uno con las teclas. El carrete tuvo flechas para
       esto y ahora el gesto es el deslizamiento. */
    if (Math.abs(delta) >= 7) {
      deslizar(doc, doc.querySelector('#carrete'), delta > 0 ? -1 : 1);
    } else {
      doc.body.dispatchEvent(new window.KeyboardEvent('keydown', {
        key: delta > 0 ? 'ArrowRight' : 'ArrowLeft',
        bubbles: true,
      }));
    }
  }
  if (centro() !== clave) throw new Error(`No pude llegar a ${clave}`);
}

/**
 * El botón de estado de una tarea en un día concreto, yendo hasta ese día si
 * hace falta: la lista muestra uno por vez, así que la celda de otro día no
 * está en el DOM hasta que el carrete se para ahí.
 */
export function celdaDe(doc, taskId, clave) {
  if (doc.querySelector('.carrete-dia.is-centro')?.dataset.date !== clave) {
    verDia(doc, clave);
  }
  return doc.querySelector(
    `.cell[data-task-id="${taskId}"][data-date="${clave}"]`);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Mueve la planilla `delta` meses, por el calendario de meses.
 *
 * Es el único camino que hay: la línea del mes ya no tiene flechas, el nombre
 * del mes ES el botón que abre el calendario. Los casos que antes hacían
 * `#next-month.click()` usan esto, así que además de mover el mes ejercen el
 * recorrido que hace un usuario de verdad.
 */
export function moverMeses(doc, delta) {
  if (!delta) return;

  const [nombre, anio] = doc.querySelector('#month-label').textContent.trim().split(/\s+/);
  const desde = new Date(Number(anio), MESES.indexOf(nombre.toLowerCase()), 1);
  const destino = new Date(desde.getFullYear(), desde.getMonth() + delta, 1);

  doc.querySelector('#month-label').click();

  /* El diálogo abre en los días del mes que se está mirando; el rótulo del
     medio sube a los doce meses del año, que es desde donde se elige. */
  doc.querySelector('#jump-label').click();

  const anioVisible = () => Number(doc.querySelector('#jump-label').textContent);
  while (anioVisible() < destino.getFullYear()) doc.querySelector('#jump-next').click();
  while (anioVisible() > destino.getFullYear()) doc.querySelector('#jump-prev').click();

  const celda = [...doc.querySelectorAll('#jump-grid .jump-cell')]
    .find(c => c.textContent.toLowerCase() === MESES[destino.getMonth()]);
  if (!celda) throw new Error(`No se encontró ${MESES[destino.getMonth()]} en el calendario`);
  celda.click();

  /* Elegir el mes baja a sus días y no navega: el diálogo contesta «a qué
     fecha», y un mes todavía no es una. El destino es el día 1, salvo que el
     mes sea el de hoy — ahí el destino evidente es hoy, como era antes. */
  const dias = [...doc.querySelectorAll('#jump-grid .jump-cell')];
  const hoy = dias.find(c => c.classList.contains('is-today'));
  (hoy ?? dias[0]).click();
}

/**
 * Cicla una celda como lo haría un usuario, incluso si el día ya pasó.
 *
 * Un día transcurrido queda cerrado y el clic abre un pedido de confirmación
 * en lugar de marcar. Casi todos los casos apuntan a fechas viejas —`AHORA`
 * es el 30 de julio—, así que este ayudante hace el recorrido completo:
 * clic, y si aparece el diálogo, confirmar.
 */
export function marcarCelda(doc, celda) {
  if (!celda) throw new Error('No hay celda que marcar');
  celda.click();

  const dialogo = doc.querySelector('#confirm-dialog');
  if (!dialogo.hasAttribute('open')) return;
  if (!/transcurrido/i.test(doc.querySelector('#confirm-text').textContent)) {
    throw new Error('El diálogo abierto no es el del día cerrado');
  }
  doc.querySelector('#confirm-ok').click();
}

/**
 * Normaliza HTML para comparar.
 *
 * Además de colapsar espacios, ordena alfabéticamente los atributos de
 * cada etiqueta. El orden de serialización sigue al de inserción, así que
 * mover un `setAttribute` de lugar cambiaría el texto sin cambiar nada de
 * lo que el navegador hace. Ordenarlos evita esos falsos positivos y no
 * pierde sensibilidad: si se agrega, se quita o cambia un atributo, el
 * conjunto ordenado también cambia.
 */
export function normalizarHtml(html) {
  return String(html)
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/<([a-zA-Z0-9-]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)+)(\s*\/?)>/g,
      (todo, tag, attrs, cierre) => {
        const lista = attrs.match(/[a-zA-Z-]+(?:="[^"]*")?/g) || [];
        return `<${tag} ${[...lista].sort().join(' ')}${cierre}>`;
      });
}
