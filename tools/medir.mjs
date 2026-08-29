/* ============================================================
   Medidor de la app
   ------------------------------------------------------------
   Corre la app real dentro del arnés con distintos volúmenes de
   datos y cronometra las tres cosas que se hacen todo el tiempo:
   marcar una celda, cambiar de mes y abrir Análisis.

     node tools/medir.mjs

   Está para no discutir de rendimiento sin datos. Los tiempos son
   de jsdom, que es entre 3 y 10 veces más lento que un navegador:
   sirven para COMPARAR escenarios y para ver si un cambio empeoró
   algo, no como el número que ve un usuario.

   Lo que se busca acá no es el valor absoluto sino la FORMA de la
   curva: qué crece con el historial y qué no. Marcar una celda
   debería costar lo que cuesta el día que se está mirando, no lo
   que se lleva acumulado.
   ============================================================ */

import { montar } from '../test/harness.mjs';

/** Un estado con `nTareas` tareas y `nMeses` meses de historial cargado. */
function armar(nTareas, nMeses) {
  const tareas = Array.from({ length: nTareas }, (_, i) => ({
    id: `t${i}`,
    name: `Tarea ${i}`,
    freq: 'daily',
    customMode: 'weekdays',
    weekdays: [],
    target: 12,
    start: null,
    archived: [],
    end: null,
  }));

  const months = {};
  const status = {};
  for (let m = 0; m < nMeses; m++) {
    const fecha = new Date(2026, 6 - m, 1);
    const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    months[mes] = tareas;
    for (const t of tareas) {
      for (let d = 1; d <= 28; d++) {
        status[`${t.id}|${mes}-${String(d).padStart(2, '0')}`] = d % 3 ? 'done' : 'partial';
      }
    }
  }
  return { months, status, theme: 'light' };
}

/** Promedio de `veces` corridas, con una previa para calentar. */
function medir(fn, veces = 10) {
  fn();
  const inicio = process.hrtime.bigint();
  for (let i = 0; i < veces; i++) fn();
  return Number(process.hrtime.bigint() - inicio) / 1e6 / veces;
}

const ESCENARIOS = [
  ['hoy', 24, 4],
  ['a 3 años', 24, 40],
  ['a 3 años, 100 tareas', 100, 40],
];

console.log('escenario                  peso    marcar   cambiar mes   Análisis   stringify');
console.log('─'.repeat(80));

for (const [nombre, tareas, meses] of ESCENARIOS) {
  const estado = armar(tareas, meses);
  const { doc } = await montar(estado);

  const marcar = medir(() => doc.querySelector('#dia-lista .cell').click());
  const mes = medir(() => {
    doc.querySelector('#month-label').click();
    doc.querySelector('#jump-grid .jump-cell').click();
  }, 5);
  const analisis = medir(() => {
    doc.querySelector('[data-page="home"]').click();
    doc.querySelector('[data-page="indicators"]').click();
  }, 5);

  /* Serializar el estado entero es lo que hace `guardarLocal` en cada cambio,
     y es lo único del camino de marcar que crece con el historial. */
  const stringify = medir(() => JSON.stringify(estado), 20);
  const kb = JSON.stringify(estado).length / 1024;

  console.log(
    nombre.padEnd(24)
    + `${kb.toFixed(0)} KB`.padStart(8)
    + `${marcar.toFixed(1)} ms`.padStart(10)
    + `${mes.toFixed(1)} ms`.padStart(14)
    + `${analisis.toFixed(1)} ms`.padStart(11)
    + `${stringify.toFixed(1)} ms`.padStart(12),
  );
}

console.log('\nTiempos de jsdom: sirven para comparar, no como el número del navegador.');
process.exit(0);
