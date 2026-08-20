/* El panel de Indicadores. Casi todo es sobre las dos tarjetas de días
   productivos —el mínimo de días de uso y las dos medidas, por cantidad de
   tareas y porcentualmente, cada una en su subtarjeta—; al final va lo de
   «Necesitan tu atención».

   El promedio por día de la semana no significa nada hasta que cada día de la
   semana aparece al menos una vez, así que hacen falta siete días de uso. Antes
   de eso las tarjetas —y el gráfico, que hace la misma cuenta— muestran un
   aviso en lugar de coronar al día que le tocó al arranque.

   «Día de uso» es un día del mes visible que ya transcurrió y no es anterior a
   la primera marca cargada. La fecha de inicio de las tareas no cuenta: se
   declara y no se observa.

   Arnés: hoy = jueves 30/07/2026. */
import { montar, moverMeses } from '../harness.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const tarea = (id, name, freq, extra = {}) => ({
  id, name, freq, customMode: 'weekdays', weekdays: [], target: 12, start: null, ...extra,
});

const TAREAS = [
  tarea('d1', 'Leer', 'daily'),
  tarea('d2', 'Meditar', 'daily'),
  tarea('lv', 'Trabajar', 'weekdays'),
];

const estado = (status, tareas = TAREAS) => ({
  months: { '2026-07': tareas },
  status,
  complianceMode: 'both',
  panels: { tiles: true, charts: true },
  theme: 'light',
});

const leer = doc => {
  doc.querySelector('[data-page="indicators"]').click();

  const tarjeta = re => {
    const t = [...doc.querySelectorAll('.summary .tile')]
      .find(x => re.test(x.querySelector('.tile-label')?.textContent ?? ''));
    if (!t) return null;
    return {
      // Un renglón por medida: rótulo, día ganador y cifra que lo respalda.
      renglones: [...t.querySelectorAll('.tile-ranks li')].map(li => ({
        rotulo: li.querySelector('.rank-label')?.textContent ?? '',
        dia: li.querySelector('.rank-day')?.textContent ?? '',
        cifra: li.querySelector('.rank-value')?.textContent ?? '',
      })),
      valor: t.querySelector('.tile-value')?.textContent ?? '',
      sub: t.querySelector('.tile-sub')?.textContent ?? '',
      tono: t.className,
    };
  };

  return {
    mas: tarjeta(/más productivos/i),
    menos: tarjeta(/menos productivos/i),
    grafico: cardDiario(doc)?.querySelector('.chart-empty')?.textContent ?? 'barras',
  };
};

/** La tarjeta del gráfico «Análisis diario», que hace la misma cuenta que las
    dos de productividad. Se busca por el título para no depender del orden. */
const cardDiario = doc => [...doc.querySelectorAll('#charts .chart-card')]
  .find(c => /Análisis diario/.test(c.querySelector('.chart-title')?.textContent ?? ''));

/** Abre Análisis y devuelve lo que dicen las dos tarjetas y el gráfico. */
const analizar = async (status, tareas) => leer((await montar(estado(status, tareas))).doc);

const mostrar = (etiqueta, r) => {
  console.log(`\n=== ${etiqueta} ===`);
  for (const [n, t] of [['más  ', r.mas], ['menos', r.menos]]) {
    if (!t.renglones.length) {
      console.log(`  ${n} → ${t.valor}  ${t.sub}`);
      continue;
    }
    console.log(`  ${n} →`);
    for (const g of t.renglones) {
      console.log(`          ${g.rotulo.padEnd(18)} ${g.dia}   ${g.cifra}`);
    }
  }
  console.log(`  gráfico → ${r.grafico}`);
};

/**
 * Estado sembrado sobre un rango de julio. `fn(iso, dow)` devuelve las marcas
 * de ese día, con `dow` en el índice de `Date#getDay`.
 */
const marcar = (desde, hasta, fn) => {
  const status = {};
  for (let d = desde; d <= hasta; d++) {
    const iso = `2026-07-${String(d).padStart(2, '0')}`;
    Object.assign(status, fn(iso, new Date(2026, 6, d).getDay()));
  }
  return status;
};

// --- sin una sola marca no hay días de uso ---------------------------------
{
  const r = await analizar({});
  mostrar('cuenta sin ninguna marca', r);

  ok('la tarjeta de más no corona a nadie', r.mas.valor === '—', r.mas.valor);
  ok('la de menos tampoco', r.menos.valor === '—', r.menos.valor);
  ok('sin renglones de medida', !r.mas.renglones.length, String(r.mas.renglones.length));
  ok('y explica que no hay días de uso', /no hay días de uso/.test(r.mas.sub), r.mas.sub);
  ok('el gráfico dice lo mismo', r.grafico === r.mas.sub, r.grafico);
  ok('sin tono de mejor ni de peor', !/tone-(best|worst)/.test(r.mas.tono), r.mas.tono);
}

// --- menos de siete días de uso --------------------------------------------
{
  /* Tres días cargados. Con eso el lunes 28 sería «el más productivo» por haber
     sido el único lunes, que es exactamente lo que el mínimo evita. */
  const s = marcar(28, 30, iso => ({ [`d1|${iso}`]: 'done', [`lv|${iso}`]: 'done' }));
  const r = await analizar(s);
  mostrar('tres días de uso (28, 29 y 30)', r);

  ok('no hay ranking', r.mas.valor === '—', r.mas.valor);
  ok('el aviso cuenta cuántos van', /van 3/i.test(r.mas.sub), r.mas.sub);
  ok('y cuántos hacen falta', /7 días de uso/.test(r.mas.sub), r.mas.sub);
  ok('el gráfico muestra el mismo aviso', r.grafico === r.mas.sub, r.grafico);
}

// --- siete días de uso: el mínimo justo ------------------------------------
{
  const s = marcar(24, 30, iso => ({ [`d1|${iso}`]: 'done' }));
  const r = await analizar(s);
  mostrar('siete días de uso (24 al 30)', r);

  ok('con siete ya hay ranking', r.mas.renglones.length > 0,
    String(r.mas.renglones.length));
  ok('y el gráfico dibuja', r.grafico === 'barras', r.grafico);
}
{
  // Seis: uno menos que el mínimo, para fijar el borde.
  const s = marcar(25, 30, iso => ({ [`d1|${iso}`]: 'done' }));
  const r = await analizar(s);
  console.log(`\n=== seis días de uso (25 al 30) ===\n  ${r.mas.sub}`);
  ok('con seis todavía no', r.mas.valor === '—', r.mas.valor);
  ok('y van 6', /van 6/i.test(r.mas.sub), r.mas.sub);
}

// --- las dos medidas, cada una en su renglón -------------------------------
{
  /* Las dos diarias se marcan todos los días; «Trabajar» solo de lunes a
     viernes, cumplida el lunes y parcial el resto. El lunes hace MÁS COSAS
     —tres tareas— pero el fin de semana cumple el 100% de lo poco que se le
     pide, así que las dos medidas coronan días distintos. */
  const s = marcar(1, 30, (iso, dow) => ({
    [`d1|${iso}`]: 'done',
    [`d2|${iso}`]: dow === 4 ? 'missed' : 'done',
    ...(dow >= 1 && dow <= 5 ? { [`lv|${iso}`]: dow === 1 ? 'done' : 'partial' } : {}),
  }));

  const r = await analizar(s);
  mostrar('julio entero — las dos medidas discrepan', r);

  const [cantidad, porcentaje] = r.mas.renglones;
  ok('la tarjeta trae los dos renglones', r.mas.renglones.length === 2,
    String(r.mas.renglones.length));

  ok('el primero es el de cantidad', cantidad?.rotulo === 'Por cantidad:', cantidad?.rotulo);
  ok('lo gana el lunes', cantidad?.dia === 'Lunes', cantidad?.dia);
  ok('con su número de tareas', cantidad?.cifra === '3 tareas', cantidad?.cifra);

  ok('el segundo es el porcentual', porcentaje?.rotulo === 'Porcentualmente:',
    porcentaje?.rotulo);
  ok('el fin de semana entra ahí',
    /Sábado/.test(porcentaje?.dia ?? '') && /Domingo/.test(porcentaje?.dia ?? ''),
    porcentaje?.dia);
  ok('con su porcentaje', porcentaje?.cifra === '100%', porcentaje?.cifra);
  ok('los empates se separan con punto medio', /·/.test(porcentaje?.dia ?? ''),
    porcentaje?.dia);

  ok('la tarjeta de más lleva el tono bueno', /tone-best/.test(r.mas.tono), r.mas.tono);
  ok('y la de menos el malo', /tone-worst/.test(r.menos.tono), r.menos.tono);
  ok('la de menos también trae las dos medidas', r.menos.renglones.length === 2,
    String(r.menos.renglones.length));
}

// --- coincidir en el día no funde los renglones ----------------------------
{
  /* Una sola tarea diaria: las dos medidas miden lo mismo y coronan siempre al
     mismo día. Igual van los dos renglones, porque cada uno lo dice bajo un
     criterio distinto y con su propia cifra. */
  const s = marcar(1, 30, (iso, dow) => ({ [`d1|${iso}`]: dow === 3 ? 'done' : 'missed' }));
  const r = await analizar(s, [TAREAS[0]]);
  mostrar('una sola tarea — las dos medidas coinciden', r);

  ok('siguen siendo dos renglones', r.mas.renglones.length === 2,
    String(r.mas.renglones.length));
  ok('los dos coronan al miércoles',
    r.mas.renglones.every(g => g.dia === 'Miércoles'),
    r.mas.renglones.map(g => g.dia).join(' | '));
  ok('pero con cifras distintas',
    r.mas.renglones[0].cifra === '1 tarea' && r.mas.renglones[1].cifra === '100%',
    r.mas.renglones.map(g => g.cifra).join(' | '));
}

// --- una medida que no distingue no dibuja renglón -------------------------
{
  /* Una sola tarea diaria marcada los siete días: por cantidad todos empatan,
     así que ese renglón desaparece. Porcentualmente tampoco distingue, y la
     tarjeta entera cae en «parejos». */
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }));
  const r = await analizar(s, [TAREAS[0]]);
  console.log(`\n=== todos los días parejos ===\n  ${r.mas.valor} · ${r.mas.sub}`);

  ok('no corona a nadie', r.mas.valor === '—', r.mas.valor);
  ok('sin renglones', !r.mas.renglones.length, String(r.mas.renglones.length));
  ok('y lo dice', /parejos/i.test(r.mas.sub), r.mas.sub);
}
{
  /* «Leer» todos los días y «Trabajar» los hábiles, las dos cumplidas. Por
     cantidad el lunes a viernes gana; porcentualmente todos los días están al
     100%, así que esa medida no distingue y se muestra un renglón solo. */
  const s = marcar(1, 30, (iso, dow) => ({
    [`d1|${iso}`]: 'done',
    ...(dow >= 1 && dow <= 5 ? { [`lv|${iso}`]: 'done' } : {}),
  }));
  const r = await analizar(s, [TAREAS[0], TAREAS[2]]);
  mostrar('completitud pareja, cantidad no', r);

  ok('queda un solo renglón', r.mas.renglones.length === 1, String(r.mas.renglones.length));
  ok('y es el de cantidad', r.mas.renglones[0]?.rotulo === 'Por cantidad:',
    r.mas.renglones[0]?.rotulo);
  ok('con 2 tareas', r.mas.renglones[0]?.cifra === '2 tareas', r.mas.renglones[0]?.cifra);
}

// --- un mes anterior al primer uso no tiene días de uso --------------------
{
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }));

  const { doc } = await montar(estado(s));
  moverMeses(doc, -1);          // junio, entero antes de la primera marca
  const r = leer(doc);
  mostrar('junio — anterior al primer uso', r);

  ok('junio no tiene días de uso', /no hay días de uso/.test(r.mas.sub), r.mas.sub);
}

// --- la fecha de inicio no adelanta el comienzo de uso ---------------------
{
  /* Una tarea dada de alta con inicio retroactivo al 1 de enero, con marcas
     solo en los últimos tres días. El comienzo de uso es la primera MARCA, no
     el `start`: si contara el start, el umbral quedaría superado al instante
     con tres días de datos. */
  const tareas = [tarea('d1', 'Leer', 'daily', { start: '2026-01-01' })];
  const s = marcar(28, 30, iso => ({ [`d1|${iso}`]: 'done' }));

  const r = await analizar(s, tareas);
  console.log(`\n=== inicio retroactivo al 1 de enero ===\n  ${r.mas.sub}`);

  ok('el start retroactivo no cuenta como uso', r.mas.valor === '—', r.mas.valor);
  ok('siguen siendo tres días', /van 3/i.test(r.mas.sub), r.mas.sub);
}

// --- los días futuros no cuentan -------------------------------------------
{
  /* Hoy es el 30. Marcar el 31 no agrega un día de uso: todavía no transcurrió,
     y contarlo pondría al viernes un promedio que nadie vivió. */
  const s = marcar(25, 31, iso => ({ [`d1|${iso}`]: 'done' }));
  const r = await analizar(s, [TAREAS[0]]);
  console.log(`\n=== con el 31 marcado por adelantado ===\n  ${r.mas.sub}`);

  ok('el día futuro no suma', /van 6/i.test(r.mas.sub), r.mas.sub);
}

// --- «Necesitan tu atención»: la lista de nombres ocupa el ancho entero -----
{
  /* Con varias tareas en rojo la lista puede scrollear. Va marcada para ocupar
     todo el ancho: medida por contenido y centrada como bloque —que es lo que
     hacen las listas cortas, como los dos meses de la comparación—, la barra de
     scroll quedaba contra el texto en el medio de la tarjeta. */
  const tareas = Array.from({ length: 8 }, (_, i) =>
    tarea(`r${i}`, `Tarea bastante larga ${i}`, 'daily'));

  const { doc } = await montar(estado({}, tareas));   // sin marcar: todas en rojo
  doc.querySelector('[data-page="indicators"]').click();

  const card = [...doc.querySelectorAll('.summary .tile')]
    .find(t => /atención/i.test(t.querySelector('.tile-label').textContent));
  const lista = card.querySelector('.tile-list');

  console.log(`\n=== necesitan tu atención ===\n  ${card.querySelector('.tile-value').textContent}`
    + ` en rojo · lista: ${lista?.className}`);

  ok('las ocho quedan en rojo', card.querySelector('.tile-value').textContent === '8',
    card.querySelector('.tile-value').textContent);
  ok('la lista de nombres va marcada', lista?.classList.contains('is-nombres'),
    lista?.className);
  ok('y lista los nombres', lista?.querySelectorAll('li').length === 8,
    String(lista?.querySelectorAll('li').length));
}
{
  // Sin tareas en rojo no hay lista, y marcarla no debe reventar.
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }));
  const { doc } = await montar(estado(s, [TAREAS[0]]));
  doc.querySelector('[data-page="indicators"]').click();

  const card = [...doc.querySelectorAll('.summary .tile')]
    .find(t => /atención/i.test(t.querySelector('.tile-label').textContent));

  console.log(`\n=== sin tareas en rojo ===\n  ${card.querySelector('.tile-sub').textContent}`);
  ok('ninguna en rojo', card.querySelector('.tile-value').textContent === '0',
    card.querySelector('.tile-value').textContent);
  ok('sin lista que marcar', !card.querySelector('.tile-list'));
}

// --- «Mes actual vs mes pasado» lleva su contenido en una caja -------------
{
  /* El rótulo se queda afuera y todo lo demás se muda adentro de `.tile-box`,
     la caja hundida hermana de las subtarjetas de productividad. Vale para los
     tres caminos de la tarjeta, incluido el de «todavía no tiene meta». */
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }));
  const { doc } = await montar(estado(s, [TAREAS[0]]));
  doc.querySelector('[data-page="indicators"]').click();

  const card = [...doc.querySelectorAll('.summary .tile')]
    .find(t => /mes pasado/i.test(t.querySelector('.tile-label').textContent));
  const caja = card.querySelector('.tile-box');

  console.log(`\n=== mes actual vs mes pasado ===\n  ${card.innerHTML.slice(0, 120)}…`);

  ok('el contenido va en una caja', Boolean(caja));
  ok('el rótulo se queda afuera', card.children[0].className === 'tile-label',
    card.children[0].className);
  ok('y la caja es el único hermano', card.children.length === 2,
    String(card.children.length));
  ok('adentro va el valor', Boolean(caja?.querySelector('.tile-value')));
  ok('y lo que lo explica',
    Boolean(caja?.querySelector('.tile-list') || caja?.querySelector('.tile-sub')));
  ok('sin nada suelto fuera de la caja',
    !card.querySelector(':scope > .tile-value') && !card.querySelector(':scope > .tile-list'));
}
{
  // Sin meta en el mes: el otro camino de la tarjeta, también encajado.
  const { doc } = await montar(estado({}, []));
  doc.querySelector('[data-page="indicators"]').click();

  const card = [...doc.querySelectorAll('.summary .tile')]
    .find(t => /mes pasado/i.test(t.querySelector('.tile-label').textContent));

  console.log(`\n=== sin meta en el mes ===\n  ${card.querySelector('.tile-sub')?.textContent}`);
  ok('también va en caja', Boolean(card.querySelector('.tile-box')));
  ok('con el aviso adentro',
    Boolean(card.querySelector('.tile-box .tile-sub')), card.innerHTML.slice(0, 90));
}

// --- «Análisis diario»: el botón alterna entre las dos medidas -------------
{
  /* Las mismas tareas del caso en que las dos medidas discrepan: el lunes hace
     más cosas, el fin de semana cumple mejor. Con `123` la barra más alta es
     la del lunes; con `%`, la del fin de semana. */
  const s = marcar(1, 30, (iso, dow) => ({
    [`d1|${iso}`]: 'done',
    [`d2|${iso}`]: dow === 4 ? 'missed' : 'done',
    ...(dow >= 1 && dow <= 5 ? { [`lv|${iso}`]: dow === 1 ? 'done' : 'partial' } : {}),
  }));

  const { doc } = await montar(estado(s));
  doc.querySelector('[data-page="indicators"]').click();

  ok('el gráfico se llama «Análisis diario»', Boolean(cardDiario(doc)),
    [...doc.querySelectorAll('#charts .chart-title')].map(t => t.textContent).join(' · '));

  const btn = () => doc.querySelector('#charts [data-action="medida-diaria"]');
  /** Los rótulos que el gráfico dibuja sobre las barras extremas. */
  const tope = () => [...cardDiario(doc).querySelectorAll('.bar-value')].map(t => t.textContent);
  const hint = () => cardDiario(doc).querySelector('.chart-hint').textContent;

  console.log(`\n=== análisis diario ===`);
  console.log(`  botón «${btn()?.textContent}» · ${hint()}`);
  console.log(`  extremos rotulados: ${tope().join(' / ')}`);

  ok('arranca en cantidad de tareas', btn()?.textContent === '123', btn()?.textContent);
  ok('el título del botón nombra las dos medidas',
    /cantidad de tareas/.test(btn()?.title ?? '') && /porcentaje/.test(btn()?.title ?? ''),
    btn()?.title);
  ok('la bajada habla de tareas', /Tareas completadas/.test(hint()), hint());
  ok('los rótulos son cantidades, sin %', tope().every(t => !t.includes('%')),
    tope().join(' / '));

  // --- clic: pasa a porcentaje ---
  btn().click();
  console.log(`  botón «${btn()?.textContent}» · ${hint()}`);
  console.log(`  extremos rotulados: ${tope().join(' / ')}`);

  ok('el ícono pasa a %', btn()?.textContent === '%', btn()?.textContent);
  ok('la bajada pasa a cumplimiento', /Cumplimiento/.test(hint()), hint());
  ok('los rótulos ahora son porcentajes', tope().every(t => t.includes('%')),
    tope().join(' / '));
  ok('y el foco queda en el botón nuevo', doc.activeElement === btn(),
    doc.activeElement?.className);

  // --- otro clic: vuelve ---
  btn().click();
  ok('vuelve a cantidad', btn()?.textContent === '123', btn()?.textContent);
  ok('y los rótulos también', tope().every(t => !t.includes('%')), tope().join(' / '));
}

// --- la medida elegida se guarda como preferencia de pantalla --------------
{
  /* Es cómo se ve la app en ESTE aparato, así que vive junto al zoom y al
     plegado, y no viaja a la base con el diario. */
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done', [`lv|${iso}`]: 'done' }));
  const { window, doc } = await montar(estado(s));
  doc.querySelector('[data-page="indicators"]').click();
  doc.querySelector('#charts [data-action="medida-diaria"]').click();

  const prefs = JSON.parse(window.localStorage.getItem('tareas-diarias/prefs') || '{}');
  console.log(`\n=== preferencia guardada ===\n  ${JSON.stringify(prefs)}`);

  ok('queda en las preferencias del aparato', prefs.weekdayMode === 'pct',
    String(prefs.weekdayMode));
  ok('junto a las otras de pantalla', 'zoom' in prefs && 'complianceMode' in prefs,
    Object.keys(prefs).join(', '));
}
{
  // Y se aplica al abrir: un estado guardado con `pct` arranca en porcentaje.
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }));
  const { doc } = await montar({ ...estado(s, [TAREAS[0]]), weekdayMode: 'pct' });
  doc.querySelector('[data-page="indicators"]').click();

  const btn = doc.querySelector('#charts [data-action="medida-diaria"]');
  console.log(`\n=== estado guardado con pct ===\n  botón «${btn?.textContent}»`);
  ok('arranca en porcentaje', btn?.textContent === '%', btn?.textContent);
}
{
  // Un valor inventado no rompe: cae en la medida por omisión.
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }));
  const { doc } = await montar({ ...estado(s, [TAREAS[0]]), weekdayMode: 'inventada' });
  doc.querySelector('[data-page="indicators"]').click();

  const btn = doc.querySelector('#charts [data-action="medida-diaria"]');
  ok('un modo inválido cae en cantidad', btn?.textContent === '123', btn?.textContent);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
