/* Ids repetidos en el marcado.
   ------------------------------------------------------------
   Un id repetido es HTML válido: nadie se queja. Pero
   `document.querySelector('#x')` devuelve el PRIMERO, así que la
   app termina escribiendo en una copia y el usuario mirando la
   otra — y el síntoma es «este botón no hace nada» o «esto no se
   actualiza», que manda a buscar el error en cualquier lado menos
   donde está.

   Pasó de verdad: un diálogo quedó insertado dos veces al mover
   un bloque, y las dos copias convivieron sin que nada fallara.

   Es el mismo tipo de guarda que `declaraciones.mjs`, que cuida
   los nombres declarados dos veces en `app.js`: lo que un ámbito
   por archivo daría gratis, acá hay que pedirlo.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVOS = ['index.html', '404.html'];

let fallos = 0;

for (const archivo of ARCHIVOS) {
  const ruta = path.join(RAIZ, archivo);
  if (!fs.existsSync(ruta)) continue;

  const html = fs.readFileSync(ruta, 'utf8');
  /* Solo `id=` de verdad: el espacio de adelante evita picar en `aria-labelledby`
     y compañía, que nombran ids ajenos y pueden repetirse cuanto quieran. */
  const donde = new Map();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) {
    const linea = html.slice(0, m.index).split('\n').length;
    if (!donde.has(m[1])) donde.set(m[1], []);
    donde.get(m[1]).push(linea);
  }

  const repetidos = [...donde].filter(([, lineas]) => lineas.length > 1);
  if (!repetidos.length) {
    console.log(`  OK   ${archivo}: ${donde.size} ids, ninguno repetido`);
    continue;
  }

  fallos += repetidos.length;
  console.log(` FALLA ${archivo}: ${repetidos.length} id(s) repetido(s)`);
  for (const [id, lineas] of repetidos) {
    console.log(`         «${id}» en las líneas ${lineas.join(', ')}`);
  }
}

if (fallos) {
  console.log('\nUn id repetido hace que `querySelector` agarre el primero: la app'
    + '\nescribe en una copia y el usuario mira la otra.');
  process.exit(1);
}
console.log('\nTodo en verde.');
