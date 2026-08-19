/* Los dos selectores de calendario. Arnés: hoy = jueves 30/07/2026.
   Julio 2026 arranca miércoles → 2 huecos antes del día 1. */
import { montar, verVista } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};
const celdas = doc => [...doc.querySelectorAll('#jump-grid .jump-cell')];
const mes = doc => doc.querySelector('#month-label').textContent;

/* Qué ventana está a la vista. Se lee de las columnas dibujadas y no de un
   rótulo: la barra ya no lo tiene, y los números de día son la fuente real. */
const dias = doc =>
  [...doc.querySelectorAll('#grid thead .col-day .dnum')].map(n => n.textContent);

/** Abre el calendario de días, que ahora vive dentro del desplegable. */
const abrirDias = doc => {
  doc.querySelector('#btn-view').click();
  doc.querySelector('#btn-pick-day').click();
};

// --- 1. cada calendario se abre desde donde corresponde --------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const enMes = [...doc.querySelectorAll('.month-nav > button')].map(b => b.id);
  // Por hijos y no por `> button`: el selector de vista va envuelto en
  // `.view-menu`, que es lo que le da el anclaje al desplegable.
  const enVista = [...doc.querySelector('#controls-center').children]
    .map(e => e.id || e.className);
  console.log('  month-nav:', enMes.join(' · '));
  console.log('  centro:   ', enVista.join(' · '));

  /* El de meses no es un botón aparte: es el propio nombre del mes. Ni icono ni
     flechas — elegir mes es un salto largo y se hace de una. */
  const etiqueta = doc.querySelector('#month-label');
  ok('el nombre del mes es el control', etiqueta?.tagName === 'BUTTON', etiqueta?.tagName);
  ok('y anuncia que abre un diálogo',
    etiqueta.getAttribute('aria-haspopup') === 'dialog');
  ok('sin icono de calendario suelto en la línea del mes',
    doc.querySelector('.month-nav .cal-icon') === null);
  ok('ni flechas de mes anterior/siguiente',
    !enMes.includes('prev-month') && !enMes.includes('next-month'), enMes.join(' · '));

  /* El de días tampoco es ya un icono en la barra: bajó al desplegable, junto a
     el resto de los saltos. La barra queda con tres controles y ningún
     calendario suelto. */
  ok('sin icono de calendario en toda la barra',
    doc.querySelector('.controls .cal-icon') === null);
  ok('el de días vive en el desplegable',
    doc.querySelector('#view-options > #btn-pick-day') !== null);
  ok('y anuncia que abre un diálogo',
    doc.querySelector('#btn-pick-day').getAttribute('aria-haspopup') === 'dialog');

  ok('las flechas abrazan al selector de vista',
    enVista.join(' ') === 'prev-range view-menu next-range', enVista.join(' · '));
  ok('y el selector es el que abre el desplegable',
    doc.querySelector('.view-menu > #btn-view')?.getAttribute('aria-haspopup') === 'menu');
  /* «Ir a hoy» y «Ir a un día…» eran el mismo gesto y son uno solo. Volver a
     hoy sigue teniendo camino con el puntero: dentro del calendario. */
  ok('el salto es una sola entrada',
    [...doc.querySelectorAll('#view-options .view-opt')]
      .filter(o => !o.dataset.view).map(o => o.textContent).join(',') === 'Ir a…',
    [...doc.querySelectorAll('#view-options .view-opt')].map(o => o.textContent).join(','));
  ok('y «Hoy» vive en el calendario', Boolean(doc.querySelector('#jump-today')));
  ok('y ya no hay rótulo de rango', doc.querySelector('#range-label') === null);
}

// --- 2. selector de DÍAS ----------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  abrirDias(doc);

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
  abrirDias(doc);
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
  verVista(doc, 'day');
  abrirDias(doc);
  doc.querySelector('#jump-next').click();                    // agosto
  celdas(doc).find(c => c.textContent === '12').click();      // 12 de agosto

  ok('cierra el diálogo', !doc.querySelector('#jump-dialog').hasAttribute('open'));
  ok('cambió de mes', /agosto 2026/i.test(mes(doc)), mes(doc));
  ok('y cayó en ese día', dias(doc).join(' ') === '12', dias(doc).join(' '));
}

// --- 5. en vista semanal cae en la semana del día elegido ------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  verVista(doc, 'week');
  abrirDias(doc);
  celdas(doc).find(c => c.textContent === '8').click();       // miércoles 8 de julio
  const columnas = dias(doc);
  ok('la semana visible contiene el 8', columnas.includes('8'), columnas.join(' '));
  ok('y es la del 6 al 12', columnas[0] === '6' && columnas.at(-1) === '12',
    columnas.join(' '));
  ok('sigue en julio', /julio 2026/i.test(mes(doc)), mes(doc));
}

// --- 6. selector de MESES ---------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#month-label').click();

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
  doc.querySelector('#month-label').click();
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
  doc.querySelector('#month-label').click();
  doc.querySelector('#jump-next').click();
  doc.querySelector('#jump-dialog [data-close-dialog]').click();
  ok('cancelar deja el mes como estaba', mes(doc) === antes, `${antes} → ${mes(doc)}`);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
