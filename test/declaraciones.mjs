/* ============================================================
   Guarda de declaraciones repetidas
   ------------------------------------------------------------
   `app.js` es un único ámbito de miles de líneas: todo lo que se
   declara arriba convive con todo lo que se declara abajo. Ahí,
   declarar dos veces el mismo nombre es legal para el lenguaje
   —la segunda gana, en silencio— y demoledor para la app.

   Pasó de verdad: `moverPendiente(delta)`, escrita para las
   flechas de reordenar, pisó a `moverPendiente(id, fecha)`, que
   era la que movía una tarea de día en el calendario. Arrastrar
   dejó de funcionar y `node --check` no dijo nada, porque no hay
   error de sintaxis: hay dos funciones con el mismo nombre.

   Esta guarda es lo que un ámbito por archivo daría gratis. Se
   escribió antes de partir `app.js` en módulos —que es un
   proyecto aparte— porque el agujero es de hoy.

   Mira las declaraciones de PRIMER NIVEL de cada ámbito: las que
   comparten el espacio de nombres grande. Las de adentro de una
   función pueden repetirse sin problema; ahí el propio ámbito las
   separa.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Los fuentes con un ámbito grande. `auth.js` y `pwa.js` son chicos, pero
   entran igual: la guarda no cuesta nada y el día que crezcan ya está puesta. */
const FUENTES = ['app.js', 'auth.js', 'pwa.js', 'sw.js'];

/**
 * Las declaraciones de primer nivel de un archivo, con su línea.
 *
 * Sin árbol de sintaxis: alcanza con la sangría. En este repositorio el primer
 * nivel de `app.js` vive a dos espacios —está adentro de la función que envuelve
 * todo— y el de los demás, a cero. Cualquier cosa más adentro pertenece a otro
 * ámbito y no compite por el mismo nombre.
 */
function declaraciones(fuente) {
  const lineas = fuente.split('\n');

  /* La sangría del primer nivel: la de la primera declaración que aparezca.
     Así el mismo chequeo sirve para un archivo envuelto y para uno plano. */
  const primera = lineas.find(l => /^(\s*)(?:async )?function [A-Za-z_$]/.test(l));
  const nivel = primera ? /^(\s*)/.exec(primera)[1].length : 0;
  const sangria = ' '.repeat(nivel);

  const patron = new RegExp(
    `^${sangria}(?:async )?(?:function|const|let|class) ([A-Za-z_$][\\w$]*)`,
  );

  const encontradas = [];
  lineas.forEach((linea, i) => {
    const m = patron.exec(linea);
    if (m) encontradas.push({ nombre: m[1], linea: i + 1 });
  });
  return encontradas;
}

let fallos = 0;

for (const archivo of FUENTES) {
  const ruta = path.join(RAIZ, archivo);
  if (!fs.existsSync(ruta)) continue;

  const vistas = new Map();
  for (const { nombre, linea } of declaraciones(fs.readFileSync(ruta, 'utf8'))) {
    if (!vistas.has(nombre)) {
      vistas.set(nombre, linea);
      continue;
    }
    console.error(
      `  FALLA ${archivo}: «${nombre}» se declara dos veces `
      + `—líneas ${vistas.get(nombre)} y ${linea}—. La segunda pisa a la primera.`,
    );
    fallos++;
  }
}

if (fallos) {
  console.error(`\n${fallos} declaración(es) repetida(s).`);
  process.exit(1);
}

console.log('  OK     ningún nombre declarado dos veces en el mismo ámbito');
