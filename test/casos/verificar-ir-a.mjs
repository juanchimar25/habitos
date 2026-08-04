/* Los dos selectores de calendario. Arnés: hoy = jueves 30/07/2026.
   Julio 2026 arranca miércoles → 2 huecos antes del día 1. */
import { montar } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};
const celdas = doc => [...doc.querySelectorAll('#jump-grid .jump-cell')];
const mes = doc => doc.querySelector('#month-label').textContent;
const rango = doc => doc.querySelector('#range-label').textContent;

// --- 1. los dos botones existen y están donde corresponde ------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const enMes = [...doc.querySelectorAll('.month-nav > button')].map(b => b.id);
  const enRango = [...doc.querySelectorAll('#range-nav > button')].map(b => b.id);
  console.log('  month-nav:', enMes.join(' · '));
  console.log('  range-nav:', enRango.join(' · '));

  ok('el de meses está junto al selector de mes', enMes.includes('btn-pick-month'));
  ok('y a la izquierda de todo el selector', enMes[0] === 'btn-pick-month', enMes[0]);
  ok('antes de la flecha de mes anterior',
    enMes.indexOf('btn-pick-month') < enMes.indexOf('prev-month'));
  ok('el de días está a la derecha del selector de día',
    enRango.at(-1) === 'btn-pick-day', enRango.at(-1));
  ok('los dos llevan ícono SVG',
    doc.querySelectorAll('#btn-pick-month .cal-icon, #btn-pick-day .cal-icon').length === 2);
}

// --- 2. selector de DÍAS ----------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-pick-day').click();

  ok('abre el diálogo', doc.querySelector('#jump-dialog').hasAttribute('open'));
  ok('con el título de días',
    doc.querySelector('#jump-title').textContent === 'Seleccionar día',
    doc.querySelector('#jump-title').textContent);
  ok('rotulado con el mes visible', /julio 2026/i.test(doc.querySelector('#jump-label').textContent),
    doc.querySelector('#jump-label').textContent);
  ok('muestra los días de la semana', doc.querySelector('#jump-dows').hidden === false);
  ok('con 7 rótulos', doc.querySelectorAll('#jump-dows span').length === 7,
    [...doc.querySelectorAll('#jump-dows span')].map(s => s.textContent).join(''));
  ok('31 celdas para julio', celdas(doc).length === 31, `${celdas(doc).length}`);
  ok('2 huecos antes del día 1 (arranca miércoles)',
    doc.querySelectorAll('#jump-grid .jump-blank').length === 2);
  ok('marca hoy (30)', celdas(doc).find(c => c.classList.contains('is-today'))?.textContent === '30',
    celdas(doc).find(c => c.classList.contains('is-today'))?.textContent);
}

// --- 3. navegar de mes dentro del selector de días -------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-pick-day').click();
  doc.querySelector('#jump-next').click();
  ok('la flecha avanza un mes', /agosto 2026/i.test(doc.querySelector('#jump-label').textContent),
    doc.querySelector('#jump-label').textContent);
  ok('agosto tiene 31 celdas', celdas(doc).length === 31);
  ok('sin marca de hoy fuera de julio',
    celdas(doc).every(c => !c.classList.contains('is-today')));
  ok('la planilla no se movió todavía', /julio 2026/i.test(mes(doc)), mes(doc));
}

// --- 4. elegir un día salta ahí ---------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('.seg[data-view="day"]').click();
  doc.querySelector('#btn-pick-day').click();
  doc.querySelector('#jump-next').click();                    // agosto
  celdas(doc).find(c => c.textContent === '12').click();      // 12 de agosto

  ok('cierra el diálogo', !doc.querySelector('#jump-dialog').hasAttribute('open'));
  ok('cambió de mes', /agosto 2026/i.test(mes(doc)), mes(doc));
  ok('y cayó en ese día', /12/.test(rango(doc)), rango(doc));
}

// --- 5. en vista semanal cae en la semana del día elegido ------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('.seg[data-view="week"]').click();
  doc.querySelector('#btn-pick-day').click();
  celdas(doc).find(c => c.textContent === '8').click();       // miércoles 8 de julio
  // El rótulo muestra los extremos («6 jul – 12 jul»), así que la comprobación
  // va contra las columnas que quedaron dibujadas.
  const columnas = [...doc.querySelectorAll('#grid thead .col-day .dnum')].map(n => n.textContent);
  ok('la semana visible contiene el 8', columnas.includes('8'), columnas.join(' '));
  ok('y es la del 6 al 12', columnas[0] === '6' && columnas.at(-1) === '12', rango(doc));
  ok('sigue en julio', /julio 2026/i.test(mes(doc)), mes(doc));
}

// --- 6. selector de MESES ---------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-pick-month').click();

  ok('abre con el título de meses',
    doc.querySelector('#jump-title').textContent === 'Seleccionar mes',
    doc.querySelector('#jump-title').textContent);
  ok('rotulado con el año', doc.querySelector('#jump-label').textContent === '2026',
    doc.querySelector('#jump-label').textContent);
  ok('OCULTA los días de la semana', doc.querySelector('#jump-dows').hidden === true);
  ok('solo 12 celdas', celdas(doc).length === 12, `${celdas(doc).length}`);
  ok('son nombres de mes', celdas(doc)[0].textContent === 'Enero'
    && celdas(doc)[11].textContent === 'Diciembre',
    `${celdas(doc)[0].textContent} … ${celdas(doc)[11].textContent}`);
  ok('ninguna celda tiene fecha de día', celdas(doc).every(c => !c.dataset.date));
  ok('marca julio como el mes de hoy',
    celdas(doc).find(c => c.classList.contains('is-today'))?.textContent === 'Julio',
    celdas(doc).find(c => c.classList.contains('is-today'))?.textContent);
}

// --- 7. navegar de año y elegir un mes -------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-pick-month').click();
  doc.querySelector('#jump-prev').click();
  ok('la flecha retrocede un año', doc.querySelector('#jump-label').textContent === '2025');
  ok('sigue con 12 meses', celdas(doc).length === 12);

  celdas(doc).find(c => c.textContent === 'Marzo').click();
  ok('cierra el diálogo', !doc.querySelector('#jump-dialog').hasAttribute('open'));
  ok('saltó a marzo de 2025', /marzo 2025/i.test(mes(doc)), mes(doc));
}

// --- 8. cancelar no mueve nada ----------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const antes = mes(doc);
  doc.querySelector('#btn-pick-month').click();
  doc.querySelector('#jump-next').click();
  doc.querySelector('#jump-dialog [data-close-dialog]').click();
  ok('cancelar deja el mes como estaba', mes(doc) === antes, `${antes} → ${mes(doc)}`);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
