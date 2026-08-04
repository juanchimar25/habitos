/* Un usuario que ya venía usando la app abre esta versión. Su estado guardado
   no conoce `zoom` ni `controlsCollapsed`, y sus tareas tienen `start: null`,
   que era lo normal antes de que la fecha fuera obligatoria. */
import { montar } from '../harness.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};
const guardado = w => JSON.parse(w.localStorage.getItem('tareas-diarias/v1/u-test'));

/* Estado tal como lo dejaría la versión anterior: sin los campos nuevos y con
   una tarea de meta mensual, que es la que más cambió de cálculo. */
const ESTADO_VIEJO = {
  months: {
    '2026-06': [
      { id: 'a', name: 'Leer', freq: 'daily', customMode: 'weekdays', weekdays: [], target: 12, start: null },
    ],
    '2026-07': [
      { id: 'a', name: 'Leer', freq: 'daily', customMode: 'weekdays', weekdays: [], target: 12, start: null },
      { id: 'b', name: 'Correr', freq: 'weekly', customMode: 'weekdays', weekdays: [], target: 12, start: null },
      { id: 'c', name: 'Socializar', freq: 'custom', customMode: 'count', weekdays: [], target: 8, start: null },
      { id: 'd', name: 'Inglés', freq: 'custom', customMode: 'weekdays', weekdays: [1, 3, 5], target: 12, start: null },
    ],
  },
  status: {
    'a|2026-06-10': 'done', 'a|2026-07-01': 'done', 'a|2026-07-02': 'partial',
    'a|2026-07-15': 'missed', 'b|2026-07-06': 'done', 'c|2026-07-03': 'done',
    'c|2026-07-20': 'done', 'd|2026-07-06': 'skip', 'd|2026-07-08': 'done',
  },
  locked: { '2026-06': true },
  complianceMode: 'both',
  panels: { tiles: true, charts: false },
  theme: 'light',
  // sin `zoom` ni `controlsCollapsed`: los campos son nuevos
};

// --- 1. abre sin romperse ---------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_VIEJO);
  ok('la planilla se dibuja', doc.querySelectorAll('#grid tbody tr[data-task-id]').length === 4,
    `${doc.querySelectorAll('#grid tbody tr[data-task-id]').length} filas`);
  ok('los estados cargados sobreviven',
    Object.keys(guardado(window).status).length === 9,
    `${Object.keys(guardado(window).status).length} de 9`);
  ok('las tareas conservan start: null',
    guardado(window).months['2026-07'].every(t => t.start === null));
  ok('el mes bloqueado sigue bloqueado', guardado(window).locked['2026-06'] === true);
  ok('respeta complianceMode guardado',
    doc.querySelector('#grid').className.includes('cpm-both'),
    doc.querySelector('#grid').className);
  ok('respeta los paneles guardados', guardado(window).panels.charts === false);
}

// --- 2. los campos nuevos toman su valor por omisión -----------------------
{
  const { window, doc } = await montar(ESTADO_VIEJO);
  ok('zoom cae en normal', doc.documentElement.dataset.zoom === 'normal',
    doc.documentElement.dataset.zoom);
  ok('los controles arrancan desplegados',
    !doc.body.classList.contains('controls-collapsed'));

  // Al primer guardado, el estado queda completo.
  doc.querySelector('#btn-zoom').click();
  const g = guardado(window);
  ok('el primer guardado incorpora zoom', g.zoom === 'compacto', String(g.zoom));
  ok('y controlsCollapsed', g.controlsCollapsed === false, String(g.controlsCollapsed));
}

// --- 3. las tareas sin fecha se pueden seguir marcando ---------------------
{
  const { window, doc } = await montar(ESTADO_VIEJO);
  doc.querySelector('.seg[data-view="month"]').click();
  const celdas = [...doc.querySelectorAll('tr[data-task-id="a"] .cell')];
  ok('ninguna celda queda apagada por falta de fecha',
    celdas.every(c => !c.disabled), `${celdas.filter(c => c.disabled).length} apagadas`);

  celdas[9].click();                       // 10 de julio
  ok('marcar sigue funcionando', Boolean(guardado(window).status['a|2026-07-10']),
    String(guardado(window).status['a|2026-07-10']));
}

// --- 4. editar una tarea vieja no le recorta el historial ------------------
{
  const { window, doc } = await montar(ESTADO_VIEJO);
  doc.querySelector('.seg[data-view="month"]').click();
  const apagadasAntes = [...doc.querySelectorAll('tr[data-task-id="a"] .cell')]
    .filter(c => c.disabled).length;

  doc.querySelector('tr[data-task-id="a"] [data-action="edit"]').click();
  ok('propone el 1 del mes, no hoy',
    doc.querySelector('#task-start').value === '2026-07-01',
    doc.querySelector('#task-start').value);

  doc.querySelector('#task-form').dispatchEvent(
    new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  const apagadasDespues = [...doc.querySelectorAll('tr[data-task-id="a"] .cell')]
    .filter(c => c.disabled).length;
  ok('no apaga ninguna celda ya cargada', apagadasAntes === apagadasDespues,
    `${apagadasAntes} → ${apagadasDespues}`);
  ok('los estados de julio siguen ahí',
    ['a|2026-07-01', 'a|2026-07-02', 'a|2026-07-15']
      .every(k => guardado(window).status[k]));
}

// --- 5. los porcentajes quedan dentro de rango ----------------------------
{
  const { doc } = await montar(ESTADO_VIEJO);
  for (const vista of ['day', 'week', 'month']) {
    doc.querySelector(`.seg[data-view="${vista}"]`).click();
    const pcts = [...doc.querySelectorAll('.compliance .cp-pct')]
      .map(n => n.textContent).filter(t => /%$/.test(t)).map(t => Number(t.replace('%', '')));
    const fuera = pcts.filter(p => p < 0 || p > 100);
    ok(`  ${vista}: ningún porcentaje fuera de 0-100`, fuera.length === 0,
      fuera.length ? fuera.join(', ') : `${pcts.length} valores, máx ${Math.max(...pcts, 0)}%`);
  }
}

// --- 6. el análisis se dibuja con datos viejos ----------------------------
{
  const { doc } = await montar(ESTADO_VIEJO);
  doc.querySelector('[data-page="indicators"]').click();
  ok('hay tarjetas', doc.querySelectorAll('#summary .tile').length === 4,
    `${doc.querySelectorAll('#summary .tile').length}`);
  ok('hay gráficos', doc.querySelectorAll('#charts .chart-card').length === 3,
    `${doc.querySelectorAll('#charts .chart-card').length}`);
  ok('sin celdas de error visibles', !/NaN|undefined/.test(doc.querySelector('#analysis').innerHTML));
}

// --- 7. la forma del estado que se va a persistir -------------------------
{
  const { window, doc } = await montar(ESTADO_VIEJO);

  /* Cargar NO reescribe el almacenamiento: hasta el primer guardado sigue la
     forma vieja, y está bien —`normalize()` completa los campos nuevos en cada
     carga—. Lo que importa es qué queda cuando por fin se escribe. */
  ok('antes de guardar, el almacenamiento conserva la forma vieja',
    guardado(window).zoom === undefined);

  doc.querySelector('.seg[data-view="month"]').click();
  doc.querySelector('tr[data-task-id="a"] .cell').click();       // marca → save()

  const g = guardado(window);
  ok('el guardado deja el estado completo',
    Object.keys(g).sort().join(',')
      === 'complianceMode,controlsCollapsed,locked,months,panels,status,theme,zoom',
    Object.keys(g).sort().join(','));
  ok('sin perder los meses', Object.keys(g.months).sort().join(',') === '2026-06,2026-07');
  ok('ni los estados previos', Object.keys(g.status).length >= 9,
    `${Object.keys(g.status).length}`);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
