/* Marcar en días que la frecuencia no pide no debe subir el promedio por
   encima de 100%, ni en la fila, ni en el total general, ni en el análisis.
   Arnés: hoy = jueves 30/07/2026. Julio 2026 arranca miércoles: 22 días
   hábiles transcurridos y 8 de fin de semana. */
import { montar, verVista } from '../harness.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

/* Las dos son de lunes a viernes. «Trabajar» se marca TODOS los días —hábiles
   y fines de semana—; «Otra» queda en blanco, para que el total general tenga
   contra qué medir. */
const TAREAS = [
  { id: 'lv', name: 'Trabajar', freq: 'weekdays', customMode: 'weekdays', weekdays: [], target: 12, start: null },
  { id: 'otra', name: 'Otra', freq: 'weekdays', customMode: 'weekdays', weekdays: [], target: 12, start: null },
];

const status = {};
for (let d = 1; d <= 30; d++) {
  status[`lv|2026-07-${String(d).padStart(2, '0')}`] = 'done';
}

const estado = {
  months: { '2026-07': TAREAS },
  status,
  complianceMode: 'both',
  panels: { tiles: true, charts: true },
  theme: 'light',
};

const pct = txt => Number(String(txt).replace('%', '').trim());

const medir = (doc, etiqueta) => {
  const fila = doc.querySelector('tbody tr[data-task-id="lv"] .row-total');
  const total = doc.querySelector('tfoot .grand-total');
  const pFila = pct(fila?.querySelector('.cp-pct')?.textContent);
  const pTotal = pct(total?.querySelector('.cp-pct')?.textContent);

  console.log(`\n=== ${etiqueta} ===`);
  console.log(`  fila «Trabajar»  ${String(pFila).padStart(5)}%   ${fila?.title?.split('\n')[0] ?? ''}`);
  console.log(`  total general    ${String(pTotal).padStart(5)}%   ${total?.title?.split('\n')[0] ?? ''}`);

  ok(`  la fila no pasa de 100%`, !Number.isFinite(pFila) || pFila <= 100, `${pFila}%`);
  ok(`  el total no pasa de 100%`, !Number.isFinite(pTotal) || pTotal <= 100, `${pTotal}%`);
};

// --- semana con fin de semana incluido (20 al 26) --------------------------
{
  const { doc } = await montar(estado);
  verVista(doc, 'week');
  doc.querySelector('#prev-range').click();          // de 27-31 a 20-26
  medir(doc, 'vista week · 20 jul – 26 jul');
}

// --- mes completo -----------------------------------------------------------
{
  const { doc } = await montar(estado);
  verVista(doc, 'month');
  medir(doc, 'vista month · 1 jul – 31 jul');
}

// --- un sábado suelto -------------------------------------------------------
{
  const { doc } = await montar(estado);
  verVista(doc, 'day');
  for (let i = 0; i < 5; i++) doc.querySelector('#prev-range').click();   // 30 → 25 (sábado)
  medir(doc, 'vista day · sábado 25');
}

// --- análisis: gráfico por tarea y tarjeta comparativa ----------------------
{
  const { doc } = await montar(estado);
  doc.querySelector('[data-page="indicators"]').click();

  const barras = [...doc.querySelectorAll('.hbars li')].map(li => ({
    nombre: li.querySelector('.hb-name')?.textContent,
    valor: pct(li.querySelector('.hb-value')?.textContent),
  }));
  console.log('\n=== gráfico «Cumplimiento por tarea» ===');
  for (const b of barras) console.log(`  ${String(b.nombre).padEnd(10)} ${b.valor}%`);
  ok('  ninguna barra pasa de 100%', barras.every(b => b.valor <= 100),
    barras.map(b => `${b.nombre}:${b.valor}%`).join(' '));

  const tarjeta = [...doc.querySelectorAll('.tile')]
    .find(t => /vs mes pasado/i.test(t.querySelector('.tile-label')?.textContent ?? ''));
  const sub = tarjeta?.querySelector('.tile-sub')?.textContent
    ?? [...(tarjeta?.querySelectorAll('.tile-list li') ?? [])].map(li => li.textContent).join(' · ');
  console.log('\n=== tarjeta comparativa ===');
  console.log(`  ${tarjeta?.querySelector('.tile-value')?.textContent} · ${sub}`);
  const propios = String(sub).match(/(\d+)%/g) ?? [];
  ok('  el % del mes no pasa de 100%', propios.every(p => Number(p.replace('%', '')) <= 100),
    propios.join(' ') || '(sin porcentajes)');
}

// --- el techo de la columna son las tareas que ESE día pide ---------------
{
  /* Ocho tareas: cuatro diarias, dos de lunes a viernes, una semanal y una de
     meta mensual. El lunes 27 piden día seis —las cuatro diarias y las dos de
     L a V—; la semanal y la de meta mensual no piden ninguno en concreto.

     Se marcan tres de las seis. El día tiene que dar 3/6 = 50%, no 3/8 = 38%:
     contar las ocho iniciadas inflaba el denominador con tareas que ese día no
     pedía nada. */
  const tareas = [
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `d${i}`, name: `Diaria ${i}`, freq: 'daily',
      customMode: 'weekdays', weekdays: [], target: 12, start: null,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `h${i}`, name: `Hábil ${i}`, freq: 'weekdays',
      customMode: 'weekdays', weekdays: [], target: 12, start: null,
    })),
    { id: 'sem', name: 'Semanal', freq: 'weekly', customMode: 'weekdays', weekdays: [], target: 12, start: null },
    { id: 'mes', name: 'Meta mensual', freq: 'custom', customMode: 'count', weekdays: [], target: 8, start: null },
  ];

  const { doc } = await montar({
    months: { '2026-07': tareas },
    status: { 'd0|2026-07-27': 'done', 'd1|2026-07-27': 'done', 'h0|2026-07-27': 'done' },
    complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  verVista(doc, 'week');
  doc.querySelector('#prev-range').click();          // del 27 al 31 → 20 al 26… volvemos
  doc.querySelector('#next-range').click();

  const lunes = [...doc.querySelectorAll('#grid tfoot td.col-day')][0];
  const leido = pct(lunes?.querySelector('.dt-pct')?.textContent);
  console.log(`\n=== techo de la columna ===\n  lunes 27 → ${leido}%  ·  ${lunes?.title}`);

  ok('el día mide 3 sobre 6, no sobre 8', leido === 50, `${leido}%`);
  ok('y el tooltip lo dice', /3 de 6 puntos/.test(lunes?.title ?? ''), lunes?.title);
}

// --- lo hecho sin que el día lo pidiera también cuenta --------------------
{
  /* Diecisiete diarias, que el martes pide, más dos semanales, que no piden
     ningún día en concreto. Se hacen diez diarias, una a medias y las dos
     semanales: el día pasa a tener 19 cosas en juego y 12,5 hechas.

     Las semanales entran porque SE HICIERON. Si no se tocaran, no contarían:
     hacer algo que no tocaba suma, no hacerlo no resta. */
  const tareas = [
    ...Array.from({ length: 17 }, (_, i) => ({
      id: `d${i}`, name: `Diaria ${i}`, freq: 'daily',
      customMode: 'weekdays', weekdays: [], target: 12, start: null,
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `s${i}`, name: `Semanal ${i}`, freq: 'weekly',
      customMode: 'weekdays', weekdays: [], target: 12, start: null,
    })),
  ];

  const status = { 'd10|2026-07-28': 'partial', 's0|2026-07-28': 'done', 's1|2026-07-28': 'done' };
  for (let i = 0; i < 10; i++) status[`d${i}|2026-07-28`] = 'done';

  const { doc } = await montar({
    months: { '2026-07': tareas }, status,complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  verVista(doc, 'week');

  const martes = [...doc.querySelectorAll('#grid tfoot td.col-day')][1];
  const leido = pct(martes?.querySelector('.dt-pct')?.textContent);
  console.log(`\n=== lo hecho de más ===\n  martes 28 → ${leido}%  ·  ${martes?.title}`);

  ok('las semanales hechas entran en la cuenta', leido === 66, `${leido}%`);
  ok('el techo sube de 17 a 19', /12,5 de 19 puntos/.test(martes?.title ?? ''), martes?.title);
}
{
  /* Las mismas, sin tocar las semanales: vuelven a quedar fuera. Una ✕ en un
     día que no la pedía tampoco entra — no hacer lo que nadie pidió no es un
     incumplimiento. */
  const tareas = [
    ...Array.from({ length: 17 }, (_, i) => ({
      id: `d${i}`, name: `Diaria ${i}`, freq: 'daily',
      customMode: 'weekdays', weekdays: [], target: 12, start: null,
    })),
    { id: 's0', name: 'Semanal', freq: 'weekly', customMode: 'weekdays', weekdays: [], target: 12, start: null },
    { id: 's1', name: 'Semanal ✕', freq: 'weekly', customMode: 'weekdays', weekdays: [], target: 12, start: null },
  ];

  const status = { 's1|2026-07-28': 'missed' };
  for (let i = 0; i < 10; i++) status[`d${i}|2026-07-28`] = 'done';

  const { doc } = await montar({
    months: { '2026-07': tareas }, status,complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  verVista(doc, 'week');

  const martes = [...doc.querySelectorAll('#grid tfoot td.col-day')][1];
  console.log(`\n=== sin tocar las que no pedía ===\n  martes 28 → ${martes?.title}`);
  ok('las que no se tocan no entran', /10 de 17 puntos/.test(martes?.title ?? ''), martes?.title);
}

// --- los días que no transcurrieron no acusan incumplimiento --------------
{
  /* Hoy es jueves 30; en la semana visible el 31 todavía no llegó. Un 0% ahí
     acusaría de incumplido un día que no venció. */
  const tareas = Array.from({ length: 4 }, (_, i) => ({
    id: `d${i}`, name: `Diaria ${i}`, freq: 'daily',
    customMode: 'weekdays', weekdays: [], target: 12, start: null,
  }));

  const { doc } = await montar({
    months: { '2026-07': tareas }, status: {},complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  verVista(doc, 'week');

  const celdas = [...doc.querySelectorAll('#grid tfoot td.col-day')];
  const dias = [...doc.querySelectorAll('#grid thead .col-day .dnum')].map(n => n.textContent);
  const futuro = celdas[dias.indexOf('31')];
  const hoy = celdas[dias.indexOf('30')];

  console.log(`\n=== días sin transcurrir ===\n  31 → ${futuro?.title}\n  30 → ${hoy?.title}`);
  ok('el día futuro muestra un guion',
    futuro?.querySelector('.dt-glyph').textContent === '—',
    futuro?.querySelector('.dt-glyph').textContent);
  ok('sin porcentaje', futuro?.querySelector('.dt-pct').textContent === '');
  ok('y lo explica', /todavía no transcurrió/.test(futuro?.title ?? ''), futuro?.title);
  ok('hoy sí se mide', /0 de 4 puntos/.test(hoy?.title ?? ''), hoy?.title);
}
{
  /* Marcar por adelantado sigue contando: lo hecho es lo hecho, aunque el día
     no haya llegado. Lo que no se muestra es un incumplimiento inventado. */
  const tareas = Array.from({ length: 4 }, (_, i) => ({
    id: `d${i}`, name: `Diaria ${i}`, freq: 'daily',
    customMode: 'weekdays', weekdays: [], target: 12, start: null,
  }));

  const { doc } = await montar({
    months: { '2026-07': tareas }, status: { 'd0|2026-07-31': 'done' },complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  verVista(doc, 'week');

  const dias = [...doc.querySelectorAll('#grid thead .col-day .dnum')].map(n => n.textContent);
  const futuro = [...doc.querySelectorAll('#grid tfoot td.col-day')][dias.indexOf('31')];
  console.log(`  31 con una marca adelantada → ${futuro?.title}`);
  ok('lo marcado por adelantado sí se ve',
    /100% — 1 de 1 puntos/.test(futuro?.title ?? ''), futuro?.title);
}

// --- «no requerido» sale del techo ----------------------------------------
{
  /* Las mismas seis que piden el lunes, con una marcada a mano como no
     requerida: el día pasa a pedir cinco. Dos hechas dan 40%, no 33%. */
  const tareas = Array.from({ length: 6 }, (_, i) => ({
    id: `d${i}`, name: `Diaria ${i}`, freq: 'daily',
    customMode: 'weekdays', weekdays: [], target: 12, start: null,
  }));

  const { doc } = await montar({
    months: { '2026-07': tareas },
    status: {
      'd0|2026-07-27': 'done', 'd1|2026-07-27': 'done',
      'd5|2026-07-27': 'skip',
    },
    complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  verVista(doc, 'week');
  doc.querySelector('#prev-range').click();
  doc.querySelector('#next-range').click();

  const lunes = [...doc.querySelectorAll('#grid tfoot td.col-day')][0];
  const leido = pct(lunes?.querySelector('.dt-pct')?.textContent);
  console.log(`\n=== «no requerido» ===\n  lunes 27 → ${leido}%  ·  ${lunes?.title}`);

  ok('la marcada como no requerida sale del techo', leido === 40, `${leido}%`);
  ok('y el tooltip cuenta cinco', /2 de 5 puntos/.test(lunes?.title ?? ''), lunes?.title);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
