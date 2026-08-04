/* ============================================================
   Guarda de la CSP — que la política siga cubriendo la página
   ------------------------------------------------------------
   La CSP de `vercel.json` autoriza los scripts y estilos inline
   de `index.html` por HASH, que es la forma estricta: sin
   'unsafe-inline', un script inyectado no se ejecuta.

   El costo es que el hash y el código tienen que ir juntos.
   Editar una línea del script anti-parpadeo cambia su hash, la
   CSP deja de reconocerlo y el navegador lo bloquea — en
   producción, en silencio, y con el único síntoma de un
   parpadeo de tema que nadie va a atribuir a esto.

   Este chequeo recalcula todo desde el HTML y falla si la
   política quedó vieja. Es lo que vuelve mantenible al hash.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const html = leer('index.html');
const vercel = JSON.parse(leer('vercel.json'));

const problemas = [];

// --- la política, tal como se sirve --------------------------------------

const csp = vercel.headers
  ?.flatMap(h => h.headers)
  ?.find(h => h.key === 'Content-Security-Policy')?.value;

if (!csp) {
  console.error('vercel.json no declara Content-Security-Policy.');
  process.exit(1);
}

/** Valor de una directiva, como lista de tokens. */
function directiva(nombre) {
  const encontrada = csp.split(';')
    .map(d => d.trim())
    .find(d => d === nombre || d.startsWith(`${nombre} `));
  return encontrada ? encontrada.split(/\s+/).slice(1) : null;
}

const sha256 = texto => 'sha256-' + createHash('sha256').update(texto, 'utf8').digest('base64');

/** Contenido de cada `<tag>` inline (los que tienen `src`/`href` no cuentan). */
function inlines(tag) {
  const re = new RegExp(`<${tag}([^>]*)>([\\s\\S]*?)</${tag}>`, 'g');
  return [...html.matchAll(re)]
    .filter(m => !/\ssrc=/.test(m[1]))
    .map(m => m[2]);
}

// --- 1. los inline están autorizados por hash -----------------------------

for (const [tag, nombreDirectiva] of [['script', 'script-src'], ['style', 'style-src']]) {
  const tokens = directiva(nombreDirectiva);
  if (!tokens) {
    problemas.push(`falta la directiva ${nombreDirectiva}`);
    continue;
  }
  if (tokens.includes("'unsafe-inline'")) {
    problemas.push(`${nombreDirectiva} usa 'unsafe-inline', que anula la protección`);
  }

  for (const [i, cuerpo] of inlines(tag).entries()) {
    const hash = sha256(cuerpo);
    if (tokens.includes(`'${hash}'`)) continue;
    problemas.push(
      `${nombreDirectiva} no autoriza el <${tag}> inline #${i + 1} de index.html\n`
      + `      esperado: '${hash}'\n`
      + '      (cambió el código inline: hay que actualizar el hash en vercel.json)');
  }
}

// --- 2. connect-src alcanza al proyecto de Supabase -----------------------
//  Está en config.js, así que cambiar de proyecto sin tocar la CSP dejaría a
//  la app sin poder hablar con su propia base.

const url = leer('config.js').match(/SUPABASE_URL\s*=\s*["']([^"']+)["']/)?.[1];
const conexiones = directiva('connect-src');

if (!url) {
  problemas.push('no se pudo leer SUPABASE_URL de config.js');
} else if (!conexiones) {
  problemas.push('falta la directiva connect-src');
} else {
  const origen = new URL(url).origin;
  if (!conexiones.includes(origen)) {
    problemas.push(`connect-src no incluye ${origen}, que es el proyecto de config.js`);
  }
}

// --- 3. el `integrity` del script de vendor corresponde al archivo --------

const src = html.match(/src="(vendor\/[^"]+)"/)?.[1];
const sri = html.match(/integrity="(sha384-[^"]+)"/)?.[1];

if (!src) {
  problemas.push('index.html no carga ningún script de vendor/');
} else if (!fs.existsSync(path.join(RAIZ, src))) {
  problemas.push(`index.html carga ${src}, que no existe`);
} else {
  const real = 'sha384-' + createHash('sha384')
    .update(fs.readFileSync(path.join(RAIZ, src))).digest('base64');
  if (sri !== real) {
    problemas.push(`el integrity de ${src} no corresponde al archivo\n`
      + `      esperado: ${real}`);
  }
}

// --- 4. Netlify declara exactamente la misma política ---------------------
//  Tener la CSP en dos archivos es, en sí, una fuente de deriva: se endurece
//  uno y el otro queda viejo, y nadie lo nota porque cada hosting sirve el
//  suyo. Se comparan carácter por carácter.

const rutaHeaders = path.join(RAIZ, '_headers');

if (fs.existsSync(rutaHeaders)) {
  const linea = leer('_headers').split('\n')
    .map(l => l.trim())
    .find(l => l.toLowerCase().startsWith('content-security-policy:'));

  if (!linea) {
    problemas.push('_headers no declara Content-Security-Policy');
  } else {
    const suya = linea.slice('content-security-policy:'.length).trim();
    if (suya !== csp) {
      problemas.push('la CSP de _headers (Netlify) difiere de la de vercel.json\n'
        + '      las dos tienen que ser idénticas');
    }
  }
}

// --- resultado -------------------------------------------------------------

if (problemas.length) {
  console.error(`Content-Security-Policy desalineada (${problemas.length}):\n`);
  for (const p of problemas) console.error(`  · ${p}`);
  process.exit(1);
}

const cuantos = inlines('script').length + inlines('style').length;
console.log(`CSP al día: ${cuantos} bloques inline autorizados por hash, `
  + 'connect-src y integrity verificados');
