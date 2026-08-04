/* ============================================================
   Guarda de codificación — busca caracteres de reemplazo
   ------------------------------------------------------------
   U+FFFD es lo que queda cuando un texto se leyó con la
   codificación equivocada: el byte original ya se perdió y el
   decodificador dejó esa lápida en su lugar. Nunca es algo que
   alguien haya querido escribir, así que encontrarlo siempre es
   un error.

   Existe porque el snapshot del DOM no puede atrapar esto. Un
   snapshot detecta CAMBIOS contra una referencia; si el carácter
   roto ya estaba cuando se grabó —que fue exactamente el caso en
   la guía de `index.html`— lo registra como correcto y lo
   defiende en cada corrida.

   Sin dependencias y sin configuración: recorre los fuentes y
   falla con la ubicación exacta.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Se construye en runtime en vez de escribirlo literal: si el carácter
   apareciera en este archivo, sería su propia primera coincidencia y el
   chequeo no podría pasar nunca. Por la misma razón no figura en ningún
   comentario de acá. */
const REEMPLAZO = String.fromCharCode(0xFFFD);

const EXTENSIONES = new Set(['.html', '.js', '.mjs', '.css', '.md', '.sql', '.json']);

/* `__snapshots__` queda afuera por ser generado: copia el HTML de la app, así
   que un carácter roto en un fuente aparecería dos veces y la segunda no
   señalaría dónde arreglarlo.

   `vendor` queda afuera por ser código de terceros: no podríamos arreglar un
   hallazgo ahí, y su integridad ya la cubre el `integrity` del `<script>`,
   que compara el archivo entero contra un hash y no un solo carácter. */
const EXCLUIDOS = new Set(['node_modules', '.git', '__snapshots__', 'vendor']);

function fuentes() {
  return fs.readdirSync(RAIZ, { recursive: true, withFileTypes: true })
    .filter(entrada => entrada.isFile())
    .map(entrada => path.relative(RAIZ, path.join(entrada.parentPath, entrada.name)))
    .filter(rel => !rel.split(path.sep).some(parte => EXCLUIDOS.has(parte)))
    .filter(rel => EXTENSIONES.has(path.extname(rel)));
}

const hallazgos = [];

for (const archivo of fuentes()) {
  const lineas = fs.readFileSync(path.join(RAIZ, archivo), 'utf8').split('\n');
  lineas.forEach((linea, i) => {
    const columna = linea.indexOf(REEMPLAZO);
    if (columna === -1) return;
    hallazgos.push({ archivo, linea: i + 1, columna: columna + 1, texto: linea.trim() });
  });
}

if (hallazgos.length) {
  console.error(`Carácter de reemplazo (U+FFFD) en ${hallazgos.length} lugar(es):\n`);
  for (const h of hallazgos) {
    console.error(`  ${h.archivo}:${h.linea}:${h.columna}`);
    console.error(`    ${h.texto}\n`);
  }
  console.error('Viene de guardar el archivo con la codificación equivocada.');
  console.error('El carácter original se perdió: hay que volver a escribirlo en UTF-8.');
  process.exit(1);
}

console.log(`Codificación correcta: sin U+FFFD en ${fuentes().length} archivos`);
