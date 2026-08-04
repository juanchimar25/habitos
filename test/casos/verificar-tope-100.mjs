/* Marcar en días que la frecuencia no pide no debe subir el promedio por
   encima de 100%, ni en la fila, ni en el total general, ni en el análisis.
   Arnés: hoy = jueves 30/07/2026. Julio 2026 arranca miércoles: 22 días
   hábiles transcurridos y 8 de fin de semana. */
import { montar } from '../harness.mjs';

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
  locked: {},
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
  doc.querySelector('.seg[data-view="week"]').click();
  doc.querySelector('#prev-range').click();          // de 27-31 a 20-26
  medir(doc, `vista week · ${doc.querySelector('#range-label')?.textContent}`);
}

// --- mes completo -----------------------------------------------------------
{
  const { doc } = await montar(estado);
  doc.querySelector('.seg[data-view="month"]').click();
  medir(doc, 'vista month · 1 jul – 31 jul');
}

// --- un sábado suelto -------------------------------------------------------
{
  const { doc } = await montar(estado);
  doc.querySelector('.seg[data-view="day"]').click();
  for (let i = 0; i < 5; i++) doc.querySelector('#prev-range').click();   // 30 → 25 (sábado)
  medir(doc, `vista day · ${doc.querySelector('#range-label')?.textContent}`);
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

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
