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
 * @returns {Promise<{window: object, doc: Document, Habitos: object}>}
 */
export async function montar(estado) {
  const html = leer('index.html')
    // El módulo de sesión pide un import por CDN: fuera.
    .replace(/<script type="module"[^>]*><\/script>/, '');

  const dom = new JSDOM(html, {
    url: 'http://localhost/',
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
