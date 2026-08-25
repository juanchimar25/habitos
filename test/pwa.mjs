/* ============================================================
   Guarda de la PWA — que las piezas sigan apuntándose entre sí
   ------------------------------------------------------------
   Una PWA se rompe en silencio. Si el manifest nombra un ícono
   que no está, o el service worker precachea un archivo que se
   renombró, no hay error visible: la app sigue andando con red y
   deja de instalarse o de abrir sin conexión, que es justo lo que
   nadie prueba a diario.

   Esto lo comprueba desde los archivos, sin navegador: qué
   declara el manifest, qué lista el service worker y qué enlaza
   el HTML tienen que coincidir con lo que hay en disco.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const existe = f => fs.existsSync(path.join(RAIZ, f));

const problemas = [];
const html = leer('index.html');

// --- 1. el HTML enlaza el manifest y el registro --------------------------

if (!/<link[^>]+rel="manifest"[^>]+href="manifest\.webmanifest"/.test(html)) {
  problemas.push('index.html no enlaza manifest.webmanifest');
}
if (!/<script[^>]+src="pwa\.js"/.test(html)) {
  problemas.push('index.html no carga pwa.js, que registra el service worker');
}
if (!/navigator\.serviceWorker\.register\(/.test(leer('pwa.js'))) {
  problemas.push('pwa.js no registra ningún service worker');
}

// --- 2. el manifest es válido y lo que nombra existe ----------------------

let manifest = null;
try {
  manifest = JSON.parse(leer('manifest.webmanifest'));
} catch (err) {
  problemas.push(`manifest.webmanifest no es JSON válido: ${err.message}`);
}

/** Lee ancho y alto del IHDR, que en un PNG son los primeros bytes del chunk. */
function medidasPng(archivo) {
  const b = fs.readFileSync(path.join(RAIZ, archivo));
  const firma = b.subarray(0, 8).toString('hex');
  if (firma !== '89504e470d0a1a0a') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

if (manifest) {
  for (const campo of ['name', 'start_url', 'scope', 'display', 'icons']) {
    if (!manifest[campo]) problemas.push(`el manifest no declara "${campo}"`);
  }

  if (manifest.display !== 'standalone') {
    problemas.push(`display es "${manifest.display}": se esperaba "standalone",`
      + ' que es lo que saca la barra del navegador');
  }

  /* Las rutas van RELATIVAS al manifest, no absolutas: así la app se instala
     igual servida en la raíz del dominio que en un subdirectorio, que es el
     caso de GitHub Pages. Una barra inicial ataría el manifest a la raíz. */
  for (const [campo, valor] of [['start_url', manifest.start_url], ['scope', manifest.scope]]) {
    if (String(valor).startsWith('/')) {
      problemas.push(`"${campo}" es absoluto ("${valor}"): rompe la instalación`
        + ' en un subdirectorio');
    }
  }

  const iconos = Array.isArray(manifest.icons) ? manifest.icons : [];
  for (const icono of iconos) {
    if (!existe(icono.src)) {
      problemas.push(`el manifest declara el ícono ${icono.src}, que no existe`);
      continue;
    }
    const medidas = medidasPng(icono.src);
    if (!medidas) {
      problemas.push(`${icono.src} no es un PNG válido`);
      continue;
    }
    const [w, h] = String(icono.sizes).split('x').map(Number);
    if (medidas.w !== w || medidas.h !== h) {
      problemas.push(`${icono.src} mide ${medidas.w}×${medidas.h}`
        + ` y el manifest declara ${icono.sizes}`);
    }
  }

  // Android pide un 192 y un 512 para instalar, y un `maskable` para que el
  // launcher no meta el ícono dentro de un cuadrado blanco.
  const tamaños = iconos.map(i => i.sizes);
  for (const pedido of ['192x192', '512x512']) {
    if (!tamaños.includes(pedido)) problemas.push(`falta un ícono de ${pedido}`);
  }
  if (!iconos.some(i => String(i.purpose).split(/\s+/).includes('maskable'))) {
    problemas.push('ningún ícono declara purpose "maskable"');
  }

  for (const atajo of manifest.shortcuts ?? []) {
    for (const icono of atajo.icons ?? []) {
      if (!existe(icono.src)) {
        problemas.push(`el atajo "${atajo.name}" declara ${icono.src}, que no existe`);
      }
    }
  }
}

// --- 3. el service worker precachea archivos que existen ------------------

const sw = leer('sw.js');
const armazon = sw.match(/const ARMAZON = \[([\s\S]*?)\];/)?.[1];

if (!armazon) {
  problemas.push('no se pudo leer la lista ARMAZON de sw.js');
} else {
  const recursos = [...armazon.matchAll(/'([^']+)'/g)].map(m => m[1]);
  for (const recurso of recursos) {
    if (recurso === './') continue;          // la raíz la resuelve el servidor
    if (!existe(recurso)) {
      problemas.push(`sw.js precachea ${recurso}, que no existe`);
    }
  }

  /* El cliente de Supabase lleva la versión en el nombre y se actualiza a
     mano: es el archivo del armazón que más fácil se desincroniza. */
  const enHtml = html.match(/src="(vendor\/[^"]+)"/)?.[1];
  if (enHtml && !recursos.includes(enHtml)) {
    problemas.push(`index.html carga ${enHtml} y sw.js no lo precachea`);
  }

  if (!/const VERSION = '[^']+'/.test(sw)) {
    problemas.push('sw.js no declara una VERSION de caché');
  }
}

// --- 4. la VERSION acompaña a los cambios del armazón --------------------
//  El olvido clásico: se publica una versión nueva de la app y los navegadores
//  que ya la tienen instalada siguen sirviendo el armazón viejo desde el caché,
//  porque `VERSION` no cambió. No falla nada: simplemente la actualización no
//  llega, y el síntoma aparece días después.
//
//  Esto lo compara contra el último commit: si cambió cualquier archivo que el
//  service worker precachea, `VERSION` tiene que haber cambiado también.

const git = (...args) => {
  const r = spawnSync('git', args, { cwd: RAIZ, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

// Sin git —un zip descargado, por ejemplo— no hay con qué comparar.
if (git('rev-parse', 'HEAD')) {
  const tocados = (git('diff', 'HEAD', '--name-only') ?? '')
    .split('\n').map(l => l.trim()).filter(Boolean);

  /* `./` no es un archivo; el resto del armazón sí, y `sw.js` entra aunque no
     esté en su propia lista: cambiarlo también cambia lo que se sirve. */
  const delArmazon = armazon
    ? [...armazon.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(r => r !== './')
    : [];
  const cambiados = tocados.filter(f => delArmazon.includes(f) || f === 'sw.js');

  if (cambiados.length) {
    const publicada = (git('show', 'HEAD:sw.js') ?? '').match(/const VERSION = '([^']+)'/)?.[1];
    const actual = sw.match(/const VERSION = '([^']+)'/)?.[1];

    if (publicada && publicada === actual) {
      problemas.push(`cambió el armazón (${cambiados.join(', ')}) y VERSION sigue en`
        + ` '${actual}'\n      los navegadores con la app instalada seguirían`
        + ' sirviendo la copia vieja');
    }
  }
}

// --- 5. la CSP deja pasar el manifest y el worker -------------------------
//  Con `default-src 'none'`, lo que no se nombra queda bloqueado: sin estas
//  dos directivas el navegador rechaza el manifest y el registro, y la app
//  deja de ser instalable sin que nada falle a la vista.

const csp = JSON.parse(leer('vercel.json')).headers
  ?.flatMap(h => h.headers)
  ?.find(h => h.key === 'Content-Security-Policy')?.value ?? '';

for (const directiva of ['manifest-src', 'worker-src']) {
  if (!csp.split(';').some(d => d.trim().startsWith(`${directiva} `))) {
    problemas.push(`la CSP no declara ${directiva}, así que cae en default-src 'none'`);
  }
}

// --- resultado -------------------------------------------------------------

if (problemas.length) {
  console.error(`PWA desalineada (${problemas.length}):\n`);
  for (const p of problemas) console.error(`  · ${p}`);
  process.exit(1);
}

const cuantos = (manifest?.icons ?? []).length;
console.log(`PWA al día: manifest con ${cuantos} íconos verificados, `
  + 'armazón del service worker y CSP en orden');
