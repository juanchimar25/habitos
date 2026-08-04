/* ============================================================
   Casos de comportamiento
   ------------------------------------------------------------
     node test/casos.mjs              → corre todos
     node test/casos.mjs plegado zoom → solo los que coincidan

   Cada archivo de `casos/` monta la app y comprueba una
   funcionalidad concreta. Se ejecutan en PROCESOS SEPARADOS a
   propósito: cada uno instala su propio jsdom con relojes,
   almacenamiento y globals sustituidos, y compartir proceso
   haría que un caso viera el entorno que dejó el anterior.

   El costo es arrancar Node once veces; a cambio, cada archivo
   sigue siendo ejecutable a mano, que es como se depuran.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'casos');

if (!fs.existsSync(DIR)) {
  console.error(`No existe ${DIR}`);
  process.exit(2);
}

const filtros = process.argv.slice(2);
const archivos = fs.readdirSync(DIR)
  .filter(f => f.endsWith('.mjs'))
  .filter(f => !filtros.length || filtros.some(t => f.includes(t)))
  .sort();

if (!archivos.length) {
  console.error(filtros.length
    ? `Ningún caso coincide con: ${filtros.join(', ')}`
    : 'No hay casos en test/casos/');
  process.exit(2);
}

const nombre = f => f.replace(/^verificar-/, '').replace(/\.mjs$/, '');

let fallaron = 0;
let comprobaciones = 0;
const detalles = [];

for (const archivo of archivos) {
  const r = spawnSync(process.execPath, [path.join(DIR, archivo)], { encoding: 'utf8' });
  const salida = `${r.stdout ?? ''}${r.stderr ?? ''}`;

  // Cada comprobación imprime una línea que arranca con OK o con FALLA.
  const ok = (salida.match(/^ {2}OK {2}/gm) ?? []).length;
  const mal = (salida.match(/^ FALLA/gm) ?? []).length;
  comprobaciones += ok + mal;

  const paso = r.status === 0;
  if (!paso) {
    fallaron++;
    detalles.push({ archivo, salida });
  }

  console.log(`  ${paso ? 'OK  ' : 'FALLA'}  ${nombre(archivo).padEnd(18)}`
    + `${String(ok).padStart(3)} comprobación(es)`
    + (mal ? `  · ${mal} con falla` : ''));
}

// El detalle va al final: si algo falla, no hay que buscarlo entre el resto.
for (const { archivo, salida } of detalles) {
  console.log(`\n${'─'.repeat(60)}\n${archivo}\n${'─'.repeat(60)}`);
  console.log(salida.trimEnd());
}

console.log();
if (fallaron) {
  console.log(`${fallaron} de ${archivos.length} caso(s) con fallas · ${comprobaciones} comprobaciones`);
  process.exit(1);
}
console.log(`${archivos.length} casos en verde · ${comprobaciones} comprobaciones`);
