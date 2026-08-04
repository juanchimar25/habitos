/* Qué primitivas de red toca la app al arrancar, con el cliente REAL de
   Supabase. Sirve para saber si la CSP declara todo lo que hace falta:
   `connect-src` no incluye `wss:`, así que un WebSocket quedaría bloqueado. */
import { leer } from '../harness.mjs';
import { JSDOM } from 'jsdom';

const html = leer('index.html');

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const dom = new JSDOM(html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, ''),
  { url: 'https://ejemplo.test/', runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;

window.matchMedia = q => ({ media: q, matches: false, addEventListener() {}, removeEventListener() {} });
Object.defineProperty(window.document, 'currentScript', {
  configurable: true, value: { src: 'https://ejemplo.test/app.js' },
});
for (const d of window.document.querySelectorAll('dialog')) {
  d.showModal = function () { this.setAttribute('open', ''); };
  d.close = function () { this.removeAttribute('open'); };
}

// --- espías sobre todo lo que puede salir a la red -------------------------
const fetches = [];
const sockets = [];
const otros = [];

window.fetch = async (url, opts) => {
  fetches.push(String(url?.url ?? url));
  return {
    ok: true, status: 200,
    json: async () => ({}),
    text: async () => '{}',
    headers: { get: () => null },
  };
};
window.WebSocket = class { constructor(url) { sockets.push(String(url)); } close() {} };
window.EventSource = class { constructor(url) { otros.push('EventSource ' + url); } close() {} };
window.XMLHttpRequest = class {
  open(_m, url) { otros.push('XHR ' + url); }
  send() {} setRequestHeader() {} addEventListener() {}
};
window.navigator.sendBeacon = url => { otros.push('sendBeacon ' + url); return true; };

// --- arranque real, en el orden de index.html ------------------------------
window.eval(leer('vendor/supabase-js-2.111.0.js'));
window.eval(leer('config.js'));
window.eval(leer('app.js'));

const { createClient } = window.supabase;
const db = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

console.log('tras createClient():');
console.log('  fetch     :', fetches.length ? fetches.join(', ') : '(ninguno)');
console.log('  WebSocket :', sockets.length ? sockets.join(', ') : '(ninguno)');
console.log('  otros     :', otros.length ? otros.join(', ') : '(ninguno)');

ok('createClient no abre WebSocket', sockets.length === 0, sockets.join(', '));
ok('createClient no usa XHR ni EventSource ni beacon', otros.length === 0, otros.join(', '));

// --- la sesión, que es lo que hace auth.js ---------------------------------
const antes = fetches.length;
await Promise.race([
  db.auth.getSession().catch(() => null),
  new Promise(r => setTimeout(r, 4000)),
]);

const nuevos = fetches.slice(antes);
console.log('\ntras getSession():');
console.log('  fetch     :', nuevos.length ? nuevos.join(', ') : '(ninguno)');
console.log('  WebSocket :', sockets.length ? sockets.join(', ') : '(ninguno)');

ok('la sesión tampoco abre WebSocket', sockets.length === 0, sockets.join(', '));

// --- todo lo que salió por fetch tiene que caer en connect-src -------------
const csp = JSON.parse(leer('vercel.json')).headers
  .flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value;
const permitidos = csp.split(';').map(d => d.trim())
  .find(d => d.startsWith('connect-src'))
  .split(/\s+/).slice(1);

console.log('\nconnect-src permite:', permitidos.join(' '));
const fuera = [...new Set(fetches)].filter(u => {
  if (!/^https?:/.test(u)) return false;             // relativas → 'self'
  return !permitidos.some(p => u.startsWith(p));
});
ok('todo lo que se pide entra en connect-src', fuera.length === 0,
  fuera.length ? fuera.join(', ') : `${new Set(fetches).size} destino(s), todos permitidos`);

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
