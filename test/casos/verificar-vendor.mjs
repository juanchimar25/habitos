/* Verifica el cambio de CDN a archivo local. La red queda afuera a propósito:
   lo que cambió es de dónde sale `createClient`, no qué hace Supabase. */
import { RAIZ, leer } from '../harness.mjs';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

const html = leer('index.html');
let fallos = 0;
const ok = (nombre, cond, detalle = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${nombre}${detalle ? ' → ' + detalle : ''}`);
  if (!cond) fallos++;
};

// --- 1. el HTML apunta a un archivo real, con el hash correcto -----------
const src = html.match(/src="(vendor\/[^"]+)"/)?.[1];
const sri = html.match(/integrity="(sha384-[^"]+)"/)?.[1];
ok('el src de vendor existe', Boolean(src) && fs.existsSync(`${RAIZ}/${src}`), src);

const real = 'sha384-' + createHash('sha384').update(fs.readFileSync(`${RAIZ}/${src}`)).digest('base64');
ok('el integrity corresponde al archivo', sri === real);

// --- 2. no quedan referencias a CDN --------------------------------------
const externas = t => [...t.matchAll(/https?:\/\/[^"'\s)]+/g)].map(m => m[0])
  .filter(u => !u.startsWith('http://www.w3.org'));
ok('index.html sin URLs externas', externas(html).length === 0, externas(html).join(', '));
ok('auth.js sin URLs externas', externas(leer('auth.js')).length === 0, externas(leer('auth.js')).join(', '));

// --- 3. el bundle real expone createClient en un DOM ---------------------
const nuevoDom = () => {
  const dom = new JSDOM(html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, ''),
    { url: 'https://ejemplo.test/', runScripts: 'dangerously', pretendToBeVisual: true });
  dom.window.matchMedia = q => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} });
  Object.defineProperty(dom.window.document, 'currentScript',
    { configurable: true, value: { src: 'https://ejemplo.test/app.js' } });
  for (const d of dom.window.document.querySelectorAll('dialog')) {
    d.showModal = function () { this.setAttribute('open', ''); };
    d.close = function () { this.removeAttribute('open'); };
  }
  return dom.window;
};

{
  const w = nuevoDom();
  w.eval(leer(src));
  ok('el bundle deja el global supabase', typeof w.supabase === 'object');
  ok('con createClient', typeof w.supabase?.createClient === 'function');
}

/* auth.js es un módulo con await de nivel superior: se envuelve en async para
   poder evaluarlo. `createClient` se reemplaza por un doble, así se ejercita
   NUESTRO cableado sin tocar la red. */
async function correrAuth(w) {
  const fuente = leer('auth.js')
    .replace(/^const \{ createClient \} = .*$/m,
      'const createClient = window.__createClient;');
  await w.eval(`(async () => { ${fuente} })()`);
}

// --- 4. camino feliz: auth.js toma createClient del global --------------
{
  const w = nuevoDom();
  w.eval(leer(src));
  w.eval(leer('config.js'));
  w.eval(leer('app.js'));

  let llamadoCon = null;
  w.__createClient = (url, key) => {
    llamadoCon = { url, key };
    return {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange() {},
      },
    };
  };
  await correrAuth(w);

  ok('auth.js llamó a createClient', Boolean(llamadoCon), llamadoCon?.url);
  ok('con la URL de config.js', llamadoCon?.url === w.SUPABASE_URL);
  ok('expuso window.supabaseClient', Boolean(w.supabaseClient));
  ok('sin sesión, muestra el login', w.document.querySelector('#auth-gate').hidden === false);
  ok('sin aviso de error', w.document.querySelector('#auth-notice').hidden === true);
}

// --- 5. la guarda nueva: el bundle no cargó -----------------------------
{
  const w = nuevoDom();
  w.eval(leer('config.js'));
  w.eval(leer('app.js'));
  w.__createClient = undefined;          // como si el integrity lo hubiera bloqueado
  await correrAuth(w);

  const aviso = w.document.querySelector('#auth-notice');
  ok('avisa en pantalla', aviso.hidden === false);
  ok('menciona vendor/', /vendor/.test(aviso.textContent), aviso.textContent.trim().slice(0, 60) + '…');
  ok('oculta el formulario', w.document.querySelector('#auth-form').hidden === true);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
