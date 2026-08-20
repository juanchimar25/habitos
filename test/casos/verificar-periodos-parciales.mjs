/* Un período que el rango solo muestra en parte pide solo esa parte.

   Antes bastaba con que UN día del período estuviera a la vista para exigirlo
   entero, y eso distorsionaba todos los bordes. El caso testigo es marzo de
   2025, que arranca sábado y toca seis semanas:

     1-2 mar   2 días    (la semana empieza el lunes 24 de febrero)
     3-9, 10-16, 17-23, 24-30   cuatro completas
     31        1 día     (la semana termina el domingo 6 de abril)

   Una tarea semanal hecha las cuatro veces que el mes pedía marcaba 4 sobre 6:
   67%, pintado de amarillo. Y hacia abajo era peor: en la vista semanal una
   tarea mensual pedía su única vez en cada una de las seis semanas, y la
   quincenal pedía DOS en la semana que cruza el día 15.

   Arnés: hoy = jueves 30/07/2026. Se mira marzo de 2025 y no agosto de
   2026 —que tiene la misma forma de calendario— porque el mes tiene que estar
   ENTERO TRANSCURRIDO: desde que la meta cuenta solo los días vencidos, en un
   mes futuro no hay nada que exigir y todas las filas dirían «—». */
import { montar, verVista, moverMeses } from '../harness.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const tarea = (id, name, freq, extra = {}) => ({
  id, name, freq, customMode: 'weekdays', weekdays: [], target: 12, start: null, ...extra,
});

const TAREAS = [
  tarea('sem', 'Semanal', 'weekly'),
  tarea('qui', 'Quincenal', 'biweekly'),
  tarea('men', 'Mensual', 'monthly'),
];

/* La semanal, una vez en cada semana COMPLETA. La quincenal, una por quincena.
   La mensual, una vez. O sea: todas cumplidas al 100%, sin marcar nada en los
   dos tramos sueltos de los bordes. */
const STATUS = {
  'sem|2025-03-03': 'done',
  'sem|2025-03-11': 'done',
  'sem|2025-03-18': 'done',
  'sem|2025-03-25': 'done',
  'qui|2025-03-05': 'done',
  'qui|2025-03-20': 'done',
  'men|2025-03-12': 'done',
};

const estadoCon = (tareas, status) => ({
  months: { '2025-03': tareas },
  status,
  complianceMode: 'both',
  panels: { tiles: true, charts: true },
  theme: 'light',
});

/** Lo que muestra la columna «Estatus» de una fila: porcentaje y tooltip. */
const fila = (doc, id) => {
  const td = doc.querySelector(`tbody tr[data-task-id="${id}"] .row-total`);
  return {
    pct: td?.querySelector('.cp-pct')?.textContent?.trim() ?? '',
    title: td?.title ?? '',
    meta: Number((td?.title ?? '').match(/meta de ([\d,]+)/)?.[1]?.replace(',', '.')),
  };
};

/** Abre marzo en la vista pedida. */
const enMarzo = async (vista, estado) => {
  const { doc } = await montar(estado);
  moverMeses(doc, -16);
  verVista(doc, vista);
  return doc;
};

// --- vista mensual: las semanas partidas no inventan metas ------------------
{
  const doc = await enMarzo('month', estadoCon(TAREAS, STATUS));
  console.log('\n=== marzo 2025 · vista mensual ===');
  for (const t of TAREAS) {
    const f = fila(doc, t.id);
    console.log(`  ${t.name.padEnd(10)} ${f.pct.padStart(5)}   ${f.title}`);
  }

  const sem = fila(doc, 'sem');
  ok('la semanal pide 4, no 6', sem.meta === 4, `meta ${sem.meta}`);
  ok('y hecha las cuatro veces da 100%', sem.pct === '100%', sem.pct);

  const qui = fila(doc, 'qui');
  ok('la quincenal sigue pidiendo 2', qui.meta === 2, `meta ${qui.meta}`);
  ok('y da 100%', qui.pct === '100%', qui.pct);

  const men = fila(doc, 'men');
  ok('la mensual sigue pidiendo 1', men.meta === 1, `meta ${men.meta}`);
  ok('y da 100%', men.pct === '100%', men.pct);
}

// --- lo marcado en un tramo suelto SÍ se acredita ---------------------------
{
  /* El 1 de marzo cae en el tramo de dos días. Marcar ahí no puede quedar
     invisible: la meta de ese tramo pasa a ser lo que se hizo, así que el mes
     pide 5 y lleva 5. Sigue en 100%, y los puntos crudos lo muestran. */
  const doc = await enMarzo('month', estadoCon(TAREAS, { ...STATUS, 'sem|2025-03-01': 'done' }));
  const sem = fila(doc, 'sem');
  console.log(`\n=== marcada también el 1 de marzo ===\n  ${sem.title}`);

  ok('el tramo suelto marcado suma a la meta', sem.meta === 5, `meta ${sem.meta}`);
  ok('lo hecho de más no se pierde', /5 sobre una meta de 5/.test(sem.title), sem.title);
  ok('y el cumplimiento sigue en 100%', sem.pct === '100%', sem.pct);
}

// --- vista semanal: cada ventana pide lo que le toca ------------------------
{
  /* Seis ventanas. En las cuatro completas la semanal pide 1; en los dos tramos
     de los bordes no pide nada. La quincenal y la mensual no piden en ninguna:
     siete días son menos de media quincena y menos de un cuarto de mes. */
  const doc = await enMarzo('week', estadoCon(TAREAS, STATUS));
  const esperado = [
    { dias: '1,2',                  sem: '—',    qui: '—',    men: '—' },
    { dias: '3,4,5,6,7,8,9',        sem: '100%', qui: '100%', men: '—' },
    { dias: '10,11,12,13,14,15,16', sem: '100%', qui: '—',    men: '100%' },
    { dias: '17,18,19,20,21,22,23', sem: '100%', qui: '100%', men: '—' },
    { dias: '24,25,26,27,28,29,30', sem: '100%', qui: '—',    men: '—' },
    { dias: '31',                   sem: '—',    qui: '—',    men: '—' },
  ];

  console.log('\n=== marzo 2025 · vista semanal, ventana por ventana ===');
  for (const esp of esperado) {
    const dias = [...doc.querySelectorAll('#grid thead .col-day .dnum')]
      .map(n => n.textContent).join(',');
    const leido = { sem: fila(doc, 'sem').pct, qui: fila(doc, 'qui').pct, men: fila(doc, 'men').pct };

    console.log(`  días ${dias.padEnd(24)} sem ${leido.sem.padStart(4)}`
      + ` · qui ${leido.qui.padStart(4)} · men ${leido.men.padStart(4)}`);

    ok(`  ventana ${dias}: la semanal`, leido.sem === esp.sem, `${leido.sem} (esperado ${esp.sem})`);
    ok(`  ventana ${dias}: la quincenal`, leido.qui === esp.qui, `${leido.qui} (esperado ${esp.qui})`);
    ok(`  ventana ${dias}: la mensual`, leido.men === esp.men, `${leido.men} (esperado ${esp.men})`);

    doc.querySelector('#next-range').click();
  }
}

// --- la semana que cruza el 15 no pide dos quincenales ----------------------
{
  const doc = await enMarzo('week', estadoCon(TAREAS, STATUS));
  for (let i = 0; i < 2; i++) doc.querySelector('#next-range').click();   // ventana 10-16

  const qui = fila(doc, 'qui');
  console.log(`\n=== la semana que cruza el día 15 ===\n  quincenal → ${qui.pct}  ·  ${qui.title}`);
  ok('no pide dos quincenales en una semana', !Number.isFinite(qui.meta) || qui.meta < 2,
    `meta ${qui.meta}`);
  ok('no acusa incumplimiento', qui.pct !== '0%', qui.pct);
}

// --- los dos motivos de «sin meta» se nombran distinto ----------------------
{
  /* Con la meta en cero hay que decir POR QUÉ, y hay dos razones distintas:
     que la frecuencia no pida ningún día del rango, o que lo pida pero el
     pedazo de período que se ve no alcance para pedir una vez. */
  const tareas = [...TAREAS, tarea('lv', 'Hábil', 'weekdays')];
  const doc = await enMarzo('week', estadoCon(tareas, STATUS));   // ventana 1-2 mar: sáb y dom

  const corto = fila(doc, 'sem');
  const nunca = fila(doc, 'lv');
  console.log('\n=== los dos guiones ===');
  console.log(`  semanal en 1-2 mar  → ${corto.title}`);
  console.log(`  hábil en sáb y dom  → ${nunca.title}`);

  ok('el tramo corto lo dice como es', /parte del período/.test(corto.title), corto.title);
  ok('y no miente diciendo que no pide días', !/no pide ningún día/.test(corto.title), corto.title);
  ok('la de lunes a viernes en fin de semana conserva su motivo',
    /no pide ningún día/.test(nunca.title), nunca.title);
}

// --- empezar a mitad de semana no exige la semana entera --------------------
{
  /* Una semanal que arranca el jueves 20 tiene 4 de los 7 días de esa semana:
     no llega a pedir una vez. Es la misma regla que ya tenían las de meta
     mensual — empezar tarde reduce lo que se espera, no lo amontona. */
  const tareas = [tarea('sem', 'Semanal', 'weekly', { start: '2025-03-20' })];
  const doc = await enMarzo('month', estadoCon(tareas, {}));

  const f = fila(doc, 'sem');
  console.log(`\n=== semanal que arranca el 20 de marzo ===\n  ${f.pct || '—'}  ·  ${f.title}`);
  ok('pide 1 (la semana del 24 al 30), no 3', f.meta === 1, `meta ${f.meta}`);
}

// --- las de meta mensual no cambiaron -------------------------------------
{
  /* El prorrateo nuevo las incluye como caso particular: su período es el mes y
     pide `target` en vez de 1. La aritmética es idéntica a la del cálculo aparte
     que tenían antes, que por eso se pudo borrar: estos números tienen que
     seguir clavados. */
  const tareas = [tarea('cnt', 'Socializar', 'custom', { customMode: 'count', target: 8 })];

  const mensual = await enMarzo('month', estadoCon(tareas, {}));
  ok('mes completo: la meta es el número exacto', fila(mensual, 'cnt').meta === 8,
    `meta ${fila(mensual, 'cnt').meta}`);

  const semanal = await enMarzo('week', estadoCon(tareas, {}));
  for (let i = 0; i < 1; i++) semanal.querySelector('#next-range').click();   // 3-9 mar: 7 días
  const s = fila(semanal, 'cnt');
  console.log(`\n=== meta mensual de 8, en una semana de marzo ===\n  ${s.title}`);
  ok('una semana pide 8 × 7/31 = 1,8 → 2', s.meta === 2, `meta ${s.meta}`);

  const diaria = await enMarzo('day', estadoCon(tareas, { 'cnt|2025-03-01': 'done' }));
  const d = fila(diaria, 'cnt');
  console.log(`  y en un solo día, marcada → ${d.pct}  ·  ${d.title}`);
  ok('un día no llega a pedir una acción: la fija lo hecho', d.meta === 1, `meta ${d.meta}`);
  ok('y da 100%', d.pct === '100%', d.pct);
}

// --- lo que no transcurrió no se exige -------------------------------------
{
  /* Julio de 2026 con hoy = jueves 30: queda el 31 por transcurrir. Una tarea
     diaria cumplida los treinta días va 30 de 30 y no 30 de 31 — el viernes 31
     todavía no venció, así que no puede acusar de nada. */
  const tareas = [tarea('d', 'Diaria', 'daily')];
  const status = {};
  for (let d = 1; d <= 30; d++) status[`d|2026-07-${String(d).padStart(2, '0')}`] = 'done';

  const { doc } = await montar({
    months: { '2026-07': tareas }, status,
    complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  verVista(doc, 'month');

  const f = fila(doc, 'd');
  console.log(`\n=== julio, cumplida hasta hoy (30 de 31 días) ===\n  ${f.title}`);

  ok('la meta cuenta los días vencidos', f.meta === 30, `meta ${f.meta}`);
  ok('y sin faltar un día da 100%', f.pct === '100%', f.pct);
}
{
  /* Lo hecho POR ADELANTADO sigue sumando: es el mismo criterio que la fila
     «Cumplimiento diario». Lo que no se cuenta es el incumplimiento que
     todavía no ocurrió, no lo que ya se hizo.

     El día futuro entra en la cuenta con meta propia, no como un excedente
     sobre la meta de ayer: su parte vencida es cero, así que cae en el
     fallback de `metaEnAcciones` y la meta de ese día la fija lo que se hizo.
     Da 31 sobre 31 y no 31 sobre 30, que insinuaría haberse pasado. Un ✕
     adelantado, en cambio, no suma nada: cero puntos, meta cero. */
  const tareas = [tarea('d', 'Diaria', 'daily')];
  const status = { 'd|2026-07-31': 'done' };          // solo el día futuro
  for (let d = 1; d <= 30; d++) status[`d|2026-07-${String(d).padStart(2, '0')}`] = 'done';

  const { doc } = await montar({
    months: { '2026-07': tareas }, status,
    complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  verVista(doc, 'month');

  const f = fila(doc, 'd');
  console.log(`\n=== con el 31 marcado por adelantado ===\n  ${f.title}`);

  ok('el adelanto suma a los puntos', /31 sobre una meta de 31/.test(f.title), f.title);
  ok('con meta propia, sin leerse como excedente', f.meta === 31, `meta ${f.meta}`);
  ok('y sigue en 100%', f.pct === '100%', f.pct);
}
{
  // Un ✕ adelantado no inventa una meta: nadie incumplió un día que no llegó.
  const tareas = [tarea('d', 'Diaria', 'daily')];
  const status = { 'd|2026-07-31': 'missed' };
  for (let d = 1; d <= 30; d++) status[`d|2026-07-${String(d).padStart(2, '0')}`] = 'done';

  const { doc } = await montar({
    months: { '2026-07': tareas }, status,
    complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  verVista(doc, 'month');

  const f = fila(doc, 'd');
  console.log(`\n=== con un ✕ adelantado en el 31 ===\n  ${f.title}`);
  ok('el ✕ futuro no agrega meta', f.meta === 30, `meta ${f.meta}`);
  ok('ni baja el cumplimiento', f.pct === '100%', f.pct);
}
{
  /* Un mes entero por venir no exige nada: todas las filas muestran «—». Antes
     agosto pedía sus 31 días desde el primer momento y la planilla se abría
     en rojo. */
  const tareas = [tarea('d', 'Diaria', 'daily')];
  const doc = await enMarzo('month', {
    months: { '2026-08': tareas }, status: {},
    complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  // enMarzo llevó a marzo 2025; volvemos a agosto 2026, que es futuro.
  moverMeses(doc, 17);

  const f = fila(doc, 'd');
  console.log(`\n=== agosto 2026, todavía por venir ===\n  ${f.pct || '—'} · ${f.title}`);
  ok('un mes futuro no exige nada', !Number.isFinite(f.meta), `meta ${f.meta}`);
  ok('y no acusa incumplimiento', f.pct !== '0%', f.pct || '—');
}

// --- un tramo no pide más de lo que pide el período entero -----------------
{
  /* Dos semanales en julio de 2026, con hoy = jueves 30. Las semanas del mes
     son 1-5, 6-12, 13-19, 20-26 y 27-31; la última va por su cuarto día, así
     que todavía no exige nada.

       A — una marca, en la semana ya cerrada del 13 al 19
       B — dos marcas, las dos en la semana en curso

     La meta que un tramo se improvisa cuando no llega a pedir una acción no
     puede pasar de lo que pide el período completo: una tarea de una vez por
     semana no pide dos en media semana por haberla hecho dos veces. Sin el
     tope, las dos marcas de B levantaban una meta de 2 y se gastaban en
     llenarla, así que hacerla el doble medía igual que hacerla una sola vez. */
  const tareas = [
    tarea('a', 'Una vez, semana cerrada', 'weekly'),
    tarea('b', 'Dos veces, semana en curso', 'weekly'),
  ];

  const { doc } = await montar({
    months: { '2026-07': tareas },
    status: {
      'a|2026-07-15': 'done',
      'b|2026-07-29': 'done',
      'b|2026-07-30': 'done',
    },
    complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  verVista(doc, 'month');

  const a = fila(doc, 'a');
  const b = fila(doc, 'b');
  console.log('\n=== el tramo en curso no pide de más ===');
  console.log(`  una vez, semana cerrada   → ${a.pct}  ·  ${a.title}`);
  console.log(`  dos veces, semana en curso→ ${b.pct}  ·  ${b.title}`);

  ok('la semana en curso pide 1 y no 2', b.meta === 4, `meta ${b.meta}`);
  ok('hacerla dos veces no se cobra a sí mismo', b.pct === '50%', b.pct);
  ok('y mide más que hacerla una sola vez', a.pct === '33%', a.pct);
  ok('los puntos crudos siguen a la vista', /2 sobre una meta de 4/.test(b.title), b.title);
}
{
  /* El tope es EL DEL PERÍODO y no un 1 fijo. Una tarea de dos veces al mes,
     mirada en la semana del 27 al 31, prorratea 2 × 4/31 = 0,26: no llega a
     pedir una acción, así que la meta la fija lo hecho. Con tres marcas queda
     en 2 —lo que pide el mes entero—, ni 3 (sin tope) ni 1 (con un tope fijo
     de una vez). */
  const tareas = [tarea('c', 'Socializar', 'custom', { customMode: 'count', target: 2 })];
  const status = {};
  for (const d of [28, 29, 30]) status[`c|2026-07-${d}`] = 'done';

  const { doc } = await montar({
    months: { '2026-07': tareas }, status,
    complianceMode: 'both', panels: { tiles: true, charts: true }, theme: 'light',
  });
  verVista(doc, 'week');          // ventana 27-31, cuatro días vencidos

  const f = fila(doc, 'c');
  console.log(`\n=== dos al mes, tres marcas en la semana ===\n  ${f.title}`);
  ok('el tope de un tramo es lo que pide el período', f.meta === 2, `meta ${f.meta}`);
  ok('lo hecho de más sigue crudo en el tooltip', /3 sobre una meta de 2/.test(f.title),
    f.title);
  ok('y el porcentaje topea en 100', f.pct === '100%', f.pct);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
