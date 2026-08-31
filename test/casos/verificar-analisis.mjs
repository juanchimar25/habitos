/* Los gráficos del análisis. Casi todo es sobre el MÍNIMO DE DÍAS DE USO, que
   es lo que decide si el análisis diario dibuja barras o muestra un aviso.

   El promedio por día de la semana no significa nada hasta que cada día de la
   semana aparece al menos una vez, así que hacen falta siete días de uso. Con
   menos, el gráfico avisa en lugar de coronar al día que le tocó al arranque.

   «Día de uso» es un día del mes visible que ya transcurrió y no es anterior a
   la primera marca cargada. La fecha de inicio de las tareas no cuenta: se
   declara y no se observa.

   Hubo cuatro tarjetas de indicadores —días más y menos productivos, «Necesitan
   tu atención» y la comparación con el mes pasado— que resumían en una línea lo
   que los gráficos muestran con su reparto a la vista. Se fueron, y con ellas
   las comprobaciones que hablaban de ellas.

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
  theme: 'light',
});

/** La tarjeta del gráfico que esté a la vista: se dibuja uno por vez. */
const cardDiario = doc => doc.querySelector('#charts .chart-card');

/**
 * Abre Análisis y elige un gráfico en el cajón. Se dibuja UNO por vez, así que
 * mirar el diario es pedirlo.
 */
const verGrafico = (doc, cual) => {
  doc.querySelector('[data-page="indicators"]').click();
  doc.querySelector('#btn-menu').click();
  doc.querySelector(`#btn-chart-${cual}`).click();
};

/** Abre el análisis diario y devuelve qué dice: el aviso, o cuántas barras. */
const leer = doc => {
  verGrafico(doc, 'barras');
  const card = cardDiario(doc);
  return {
    aviso: card?.querySelector('.chart-empty')?.textContent ?? '',
    barras: card?.querySelectorAll('path[fill]').length ?? 0,
  };
};

const analizar = async (status, tareas) => leer((await montar(estado(status, tareas))).doc);

const mostrar = (etiqueta, r) => {
  console.log(`\n=== ${etiqueta} ===`);
  console.log(`  ${r.aviso || `${r.barras} barras`}`);
};

/**
 * Estado sembrado sobre un rango de julio. `fn(iso, dow)` devuelve las marcas
 * de ese día, con `dow` en el índice de `Date#getDay`.
 */
const marcar = (desde, hasta, fn) => {
  const status = {};
  for (let dia = desde; dia <= hasta; dia++) {
    const iso = `2026-07-${String(dia).padStart(2, '0')}`;
    Object.assign(status, fn(iso, new Date(2026, 6, dia).getDay()));
  }
  return status;
};

// --- sin una sola marca no hay días de uso ---------------------------------
{
  const r = await analizar({});
  mostrar('mes sin ninguna marca', r);

  ok('el gráfico no dibuja barras', r.barras === 0, String(r.barras));
  ok('  y explica que no hay días de uso', /no hay días de uso/.test(r.aviso), r.aviso);
}

// --- menos de siete días de uso --------------------------------------------
{
  /* Tres días cargados. Con eso el lunes 28 sería «el más productivo» por haber
     sido el único lunes, que es exactamente lo que el mínimo evita. */
  const s = marcar(28, 30, iso => ({ [`d1|${iso}`]: 'done', [`lv|${iso}`]: 'done' }));
  const r = await analizar(s);
  mostrar('tres días de uso (28, 29 y 30)', r);

  ok('sigue sin dibujar', r.barras === 0, String(r.barras));
  ok('  el aviso cuenta cuántos van', /van 3/i.test(r.aviso), r.aviso);
  ok('  y cuántos hacen falta', /7 días de uso/.test(r.aviso), r.aviso);
}

// --- siete días de uso: el mínimo justo ------------------------------------
{
  const s = marcar(24, 30, iso => ({ [`d1|${iso}`]: 'done' }));
  const r = await analizar(s);
  mostrar('siete días de uso (24 al 30)', r);
  ok('con siete el gráfico dibuja', r.barras > 0, String(r.barras));
}
{
  // Seis: uno menos que el mínimo, para fijar el borde.
  const s = marcar(25, 30, iso => ({ [`d1|${iso}`]: 'done' }));
  const r = await analizar(s);
  mostrar('seis días de uso (25 al 30)', r);
  ok('con seis todavía no', r.barras === 0, String(r.barras));
  ok('  y van 6', /van 6/i.test(r.aviso), r.aviso);
}

// --- un mes anterior al primer uso no tiene días de uso --------------------
{
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }));

  const { doc } = await montar(estado(s));
  moverMeses(doc, -1);          // junio, entero antes de la primera marca
  const r = leer(doc);
  mostrar('junio — anterior al primer uso', r);

  ok('junio no tiene días de uso', /no hay días de uso/.test(r.aviso), r.aviso);
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
  mostrar('inicio retroactivo al 1 de enero', r);

  ok('el start retroactivo no cuenta como uso', r.barras === 0, String(r.barras));
  ok('  siguen siendo tres días', /van 3/i.test(r.aviso), r.aviso);
}

// --- los días futuros no cuentan -------------------------------------------
{
  /* Hoy es el 30. Marcar el 31 no agrega un día de uso: todavía no transcurrió,
     y contarlo pondría al viernes un promedio que nadie vivió. */
  const s = marcar(25, 31, iso => ({ [`d1|${iso}`]: 'done' }));
  const r = await analizar(s, [TAREAS[0]]);
  mostrar('con el 31 marcado por adelantado', r);

  ok('el día futuro no suma', /van 6/i.test(r.aviso), r.aviso);
}

// --- un gráfico por vez, elegido en el cajón ------------------------------
{
  const { doc } = await montar(estado(marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }))));
  doc.querySelector('[data-page="indicators"]').click();

  ok('la sección no tiene tarjetas de indicadores',
    doc.querySelector('#summary') === null && doc.querySelectorAll('.tile').length === 0);
  ok('  ni paneles plegables', doc.querySelectorAll('#analysis .panel').length === 0);

  /* El gráfico ya no lleva su nombre a la vista —lo dice el menú, que queda
     marcado—, pero sigue anunciándose para quien no ve la pantalla. */
  const titulo = () => doc.querySelector('#charts .chart-card')?.getAttribute('aria-label') ?? '';
  const cuantos = () => doc.querySelectorAll('#charts .chart-card').length;

  ok('se dibuja uno solo', cuantos() === 1, String(cuantos()));
  ok('  y abre en «Puntos»', titulo() === 'Puntos', titulo());

  /* El ☰ está en Análisis con lo suyo: elegir gráfico. En Hábitos tiene otra
     cosa adentro, y en las otras dos secciones no está. */
  doc.querySelector('#btn-menu').click();
  ok('el menú tiene el apartado de gráficos',
    doc.querySelector('#grupo-graficos').hidden === false);

  /* Eso y la guía de esta pantalla. El recordatorio y los datos son de la app
     entera y se llega a ellos desde Hábitos: repetirlos acá obliga a buscar la
     entrada que viene al caso entre varias que no. */
  const visibles = [...doc.querySelectorAll('#drawer .drawer-group')]
    .filter(g => !g.hidden).map(g => g.id || '(sin id)');
  ok('  y la guía, y nada más',
    visibles.join(',') === 'grupo-graficos,grupo-guia', visibles.join(','));
  for (const id of ['btn-reminder', 'btn-export', 'btn-import']) {
    ok(`  «${id}» no se ve`, doc.querySelector('#' + id).closest('.drawer-group').hidden);
  }

  /* La guía es una POR SECCIÓN, y el mismo nodo sirve a las tres porque el
     cajón es uno solo: el rótulo tiene que decir cuál se abre, o la entrada
     parecería llevar siempre al mismo lado. */
  ok('  «Cómo usar» está, y dice cuál',
    doc.querySelector('#guia-texto').textContent === 'Cómo usar Análisis',
    doc.querySelector('#guia-texto').textContent);
  ok('    apuntando a su propia ruta',
    doc.querySelector('#guia-link').getAttribute('href').endsWith('comousar-analisis'),
    doc.querySelector('#guia-link').getAttribute('href'));

  // Y abre la de Análisis, no la de Hábitos.
  doc.querySelector('#guia-link').click();
  const visible = [...doc.querySelectorAll('#help [data-guia]')].filter(t => !t.hidden);
  ok('    y abre la de Análisis', visible.length === 1 && visible[0].dataset.guia === 'indicators',
    visible.map(t => t.dataset.guia).join(',') || '(ninguna)');
  ok('      con su título', visible[0]?.querySelector('h2')?.textContent === 'Cómo usar Análisis',
    visible[0]?.querySelector('h2')?.textContent);
  ok('      y sin una palabra de las otras dos',
    !/Cómo usar (Hábitos|Pendientes)/.test(visible[0]?.textContent ?? ''),
    visible[0]?.textContent?.slice(0, 60));

  // Volver a Análisis para lo que sigue.
  doc.querySelector('[data-page="indicators"]').click();

  for (const [cual, esperado] of [['barras', /^Barras$/],
    ['porcentajes', /^Porcentajes$/], ['puntos', /^Puntos$/]]) {
    verGrafico(doc, cual);
    ok(`  elegir «${cual}» deja ese solo`, cuantos() === 1 && esperado.test(titulo()),
      `${cuantos()} · ${titulo()}`);
    ok('    y queda marcado en el menú',
      doc.querySelector(`#btn-chart-${cual}`).getAttribute('aria-pressed') === 'true');
  }

  /* Solo uno queda marcado: son alternativas, no interruptores. */
  const marcados = [...doc.querySelectorAll('#grupo-graficos .drawer-item')]
    .filter(b => b.getAttribute('aria-pressed') === 'true');
  ok('y solo uno queda marcado', marcados.length === 1, String(marcados.length));
}

// --- la visualización mensual ---------------------------------------------
{
  /* Una fila por tarea y un punto por día, del color del estado. Es el único
     gráfico que no resume: los otros dicen un número por tarea o un promedio
     por día de la semana, y este muestra dónde se cortó una racha. */
  const s = marcar(1, 30, (iso, dow) => ({
    [`d1|${iso}`]: dow === 0 ? 'missed' : 'done',
    ...(dow >= 1 && dow <= 5 ? { [`lv|${iso}`]: 'partial' } : {}),
  }));

  const { doc } = await montar(estado(s));
  verGrafico(doc, 'puntos');

  const tarjeta = [...doc.querySelectorAll('#charts .chart-card')]
    .find(c => c.getAttribute('aria-label') === 'Puntos');
  const filas = [...tarjeta.querySelectorAll('.dots-row')];
  const puntosDe = i => [...filas[i].querySelectorAll('.dot')];

  console.log(`\n=== el mes día por día ===`);
  for (const f of filas) {
    console.log(`  ${f.querySelector('.task-name').textContent.padEnd(10)} `
      + `${f.querySelectorAll('.dot').length} puntos`);
  }

  ok('el gráfico existe', Boolean(tarjeta));
  ok('  con una fila por tarea', filas.length === 3, String(filas.length));
  ok('  cada una con su nombre y su frecuencia',
    filas.every(f => f.querySelector('.task-name') && f.querySelector('.task-freq')));
  /* Julio tiene 31 días: un punto por día, también los que todavía no llegaron.
     El lugar se reserva para que las columnas no se corran entre filas. */
  ok('  y 31 puntos, uno por día de julio',
    filas.every(f => f.querySelectorAll('.dot').length === 31),
    filas.map(f => f.querySelectorAll('.dot').length).join(' · '));

  /* Los colores son los del estado. «Leer» va cumplida salvo los domingos. */
  const leer = puntosDe(0);
  ok('los días cumplidos van en verde',
    leer[0].classList.contains('st-done'), leer[0].className);
  ok('  y los no cumplidos en rojo',
    leer.filter(p => p.classList.contains('st-missed')).length === 4,
    String(leer.filter(p => p.classList.contains('st-missed')).length));

  /* Hoy es el 30: el 31 todavía no llegó y no tiene nada que decir. «Leer» es
     diaria, así que ese día SÍ se pide y lo único que falta es el resultado. */
  ok('el día que no llegó va apagado', leer[30].classList.contains('is-off'),
    leer[30].className);

  /* «Trabajar» es de lunes a viernes: el sábado no lo pide, así que va GRIS —el
     color de «no requerido»— y no blanco. Blanco es el día que se pedía y quedó
     vacío, que es otra cosa. */
  const trabajar = puntosDe(2);
  const sabado4 = trabajar[3];       // sábado 4 de julio
  ok('el día que la frecuencia no pide va gris',
    sabado4.classList.contains('st-skip'), sabado4.className);
  ok('  y lo dice', /no requerido/.test(sabado4.title), sabado4.title);

  const lunes6 = trabajar[5];        // lunes 6: sí lo pide, y está cargado
  ok('  mientras que el día que sí pide lleva su estado',
    lunes6.classList.contains('st-partial'), lunes6.className);

  /* El nombre del punto es el mismo que el del botón de estado de la lista. */
  ok('cada punto se nombra solo', /Leer, .* de julio: cumplido/.test(leer[0].title),
    leer[0].title);
}
{
  // Sin tareas no hay filas que dibujar, y lo dice.
  const { doc } = await montar({ ...estado({}), months: { '2026-07': [] } });
  verGrafico(doc, 'puntos');
  const tarjeta = [...doc.querySelectorAll('#charts .chart-card')]
    .find(c => c.getAttribute('aria-label') === 'Puntos');

  ok('sin tareas el gráfico lo dice',
    /Todavía no hay tareas/.test(tarjeta.querySelector('.chart-empty')?.textContent ?? ''),
    tarjeta.querySelector('.chart-empty')?.textContent);
}

// --- el color de las barras y el podio -------------------------------------
{
  /* El color dice CUÁNTO se cumplió, con el mismo umbral que el resto de la app
     —verde desde 75, ámbar desde 50, rojo abajo—, y el podio dice quién ganó.
     Antes el color decía las dos cosas: verde la barra más alta y roja la más
     baja, así que un mes malo parejo igual tenía su verde. */
  const s = marcar(1, 30, (iso, dow) => ({
    // Domingos flojos, el resto cumplido: el peor día no llega ni a la mitad.
    [`d1|${iso}`]: dow === 0 ? 'missed' : 'done',
    [`d2|${iso}`]: dow === 0 ? 'missed' : 'done',
  }));

  const { doc } = await montar(estado(s, [TAREAS[0], TAREAS[1]]));
  verGrafico(doc, 'barras');

  const barras = [...cardDiario(doc).querySelectorAll('path[fill]')];
  const rellenos = barras.map(b => b.getAttribute('fill'));
  console.log(`
=== color de las barras ===
  ${rellenos.join(' · ')}`);

  /* Con la misma paleta que «Puntos» y «Porcentajes»: los tres gráficos se
     miran de corrido y el mismo nivel tiene que ser el mismo color. */
  ok('las barras se pintan por cumplimiento',
    rellenos.every(f => ['done', 'partial', 'missed'].some(e => f === `var(--dot-${e})`)),
    rellenos.join(' · '));
  ok('  el día cumplido va verde', rellenos[0] === 'var(--dot-done)', rellenos[0]);
  ok('  y el domingo en cero va rojo', rellenos.at(-1) === 'var(--dot-missed)',
    rellenos.at(-1));
  ok('  sin barras neutras', !rellenos.includes('var(--chart-neutral)'), rellenos.join(' · '));

  /* El número va en TODAS las barras: el color dice el nivel y el podio dice el
     extremo, así que el número queda libre para el dato exacto del día. */
  const rotulos = [...cardDiario(doc).querySelectorAll('.bar-value')];
  ok('todas las barras llevan su porcentaje', rotulos.length === barras.length,
    `${rotulos.length} de ${barras.length}`);
  ok('  y todos son porcentajes', rotulos.every(t => t.textContent.includes('%')),
    rotulos.map(t => t.textContent).join(' · '));

  /* El podio: una corona sobre el mejor y una cruz sobre el peor. */
  const corona = cardDiario(doc).querySelector('.podio-mejor');
  const cruz = cardDiario(doc).querySelector('.podio-peor');
  ok('hay una corona sobre el mejor día', Boolean(corona));
  ok('  y una cruz sobre el peor', Boolean(cruz));
  ok('  cada una se nombra sola',
    /mejor día/.test(corona?.querySelector('title')?.textContent ?? '')
    && /peor día/.test(cruz?.querySelector('title')?.textContent ?? ''),
    `${corona?.querySelector('title')?.textContent} · ${cruz?.querySelector('title')?.textContent}`);
}

// --- lo que no se pide ya es gris, aunque falte para ese día ---------------
{
  /* Un mes entero por delante. Que un sábado no se pida no es un resultado que
     haya que esperar: se sabe desde que se eligió la frecuencia. Lo único que el
     futuro tiene sin saber es si se va a cumplir, y eso solo aplica a los días
     que sí se piden. */
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }));
  const { doc } = await montar(estado(s));
  moverMeses(doc, 1);                                // agosto: todo por venir
  verGrafico(doc, 'puntos');

  const fila = [...doc.querySelectorAll('#charts .dots-row')]
    .find(f => f.querySelector('.task-name').textContent === 'Trabajar');
  const puntos = [...fila.querySelectorAll('.dot')];

  /* Agosto de 2026 arranca sábado: los dos primeros no se piden, el tercero sí. */
  console.log(`
=== agosto por delante ===
  ${puntos.slice(0, 3).map(p => p.className).join(' · ')}`);
  ok('el sábado que viene ya es gris', puntos[0].classList.contains('st-skip'),
    puntos[0].className);
  ok('  y el domingo también', puntos[1].classList.contains('st-skip'), puntos[1].className);
  ok('  pero el lunes queda apagado, que es lo que falta saber',
    puntos[2].classList.contains('is-off'), puntos[2].className);
}

// --- una tarea dada de alta a mitad de mes --------------------------------
{
  /* Los días anteriores a su fecha de inicio no pedían nada: van grises, como
     cualquier día no requerido. Apagados se confundían con los que todavía no
     llegaron, y la fila arrancaba pareciendo pendiente. */
  const tareas = [tarea('d1', 'Leer', 'daily', { start: '2026-07-15' })];
  const s = marcar(15, 30, iso => ({ [`d1|${iso}`]: 'done' }));

  const { doc } = await montar(estado(s, tareas));
  verGrafico(doc, 'puntos');

  const puntos = [...doc.querySelectorAll('#charts .dots-row .dot')];
  console.log(`
=== alta el 15 de julio ===
  ${puntos.slice(12, 16).map(p => p.className).join(' · ')}`);

  ok('los días anteriores al alta van grises',
    puntos.slice(0, 14).every(p => p.classList.contains('st-skip')),
    puntos.slice(0, 14).map(p => p.className).join(' · '));
  ok('  y lo dicen', /todavía no existía/.test(puntos[0].title), puntos[0].title);
  ok('el día del alta ya lleva su estado', puntos[14].classList.contains('st-done'),
    puntos[14].className);

  /* Y el hueco apagado queda para una sola cosa: el día que se pide y todavía
     no llegó. */
  ok('el 31, que no llegó, sigue apagado', puntos[30].classList.contains('is-off'),
    puntos[30].className);
}

// --- el desempate del podio -----------------------------------------------
{
  /* Todos los días cumplen el 100%: el porcentaje no distingue nada. Lo que los
     separa es cuántas tareas se hicieron — de martes a viernes se agrega
     «Trabajar» y son tres; el lunes está eximida y el fin de semana ni se pide,
     así que son dos.

     La cantidad no se muestra —fue una medida a la vista y premiaba al día con
     más tareas asignadas—, pero como segundo criterio no manda: solo ordena a
     los que ya empataron. */
  const s = marcar(1, 30, (iso, dow) => ({
    [`d1|${iso}`]: 'done',
    [`d2|${iso}`]: 'done',
    ...(dow >= 1 && dow <= 5 ? { [`lv|${iso}`]: dow === 1 ? 'skip' : 'done' } : {}),
  }));

  const { doc } = await montar(estado(s));
  verGrafico(doc, 'barras');

  const rotulos = [...cardDiario(doc).querySelectorAll('.bar-value')].map(t => t.textContent);
  console.log(`\n=== desempate ===\n  ${rotulos.join(' · ')}`);
  ok('todos los días cumplen igual', new Set(rotulos).size === 1, rotulos.join(' · '));

  const corona = cardDiario(doc).querySelector('.podio-mejor');
  const cruz = cardDiario(doc).querySelector('.podio-peor');
  ok('igual hay podio', Boolean(corona) && Boolean(cruz));

  /* Dónde cae cada dibujo: se compara su x con la de cada barra. El orden de las
     barras es lunes → domingo. */
  const equis = g => Number(g.getAttribute('transform').replace(/[^0-9. ]/g, '').trim().split(' ')[0]);
  const centros = [...cardDiario(doc).querySelectorAll('path[fill]')]
    .map(b => Number(b.getAttribute('d').split(' ')[1]) + 12);
  const indiceDe = g => centros.findIndex(c => Math.abs(c - equis(g)) < 1.5);
  console.log(`  corona en ${indiceDe(corona)} · cruz en ${indiceDe(cruz)}`);

  /* De martes a viernes se hacen tres tareas; el lunes y el fin de semana, dos. */
  ok('la corona cae en un día de tres tareas',
    indiceDe(corona) >= 1 && indiceDe(corona) <= 4, String(indiceDe(corona)));
  ok('  y la cruz en uno de dos', [0, 5, 6].includes(indiceDe(cruz)), String(indiceDe(cruz)));
}

// --- «Porcentajes»: la misma forma, con barra ----------------------------
{
  /* Copia la forma de «Puntos» —una tarjeta por tarea, con su nombre y su
     frecuencia— y en el lugar de los puntos pone una barra.

     «Leer» va a la mitad, «Meditar» al 100% y «Trabajar» sin marcar. */
  const s = marcar(1, 30, (iso, dow) => ({
    [`d1|${iso}`]: dow % 2 ? 'done' : 'missed',
    [`d2|${iso}`]: 'done',
  }));

  const { doc } = await montar(estado(s));
  verGrafico(doc, 'porcentajes');

  const filas = () => [...doc.querySelectorAll('#charts .dots-row')];
  const nombres = () => filas().map(f => f.querySelector('.task-name').textContent);
  const valores = () => filas().map(f => f.querySelector('.meter-value').textContent);
  console.log(`\n=== porcentajes ===\n  `
    + nombres().map((n, k) => `${n} ${valores()[k]}`).join(' · '));

  ok('una fila por tarea, con la forma de «Puntos»', filas().length === 3,
    String(filas().length));
  ok('  con su nombre y su frecuencia',
    filas().every(f => f.querySelector('.task-name') && f.querySelector('.task-freq')));

  /* Arranca en el orden de la lista, el mismo que muestra Hábitos. */
  ok('arranca como las armaste', nombres().join(',') === 'Leer,Meditar,Trabajar',
    nombres().join(','));

  const barraDe = nombre => filas()
    .find(f => f.querySelector('.task-name').textContent === nombre)
    .querySelector('.meter-fill');

  ok('cada fila trae su riel', filas().every(f => f.querySelector('.meter-track')));
  ok('  con el ancho del porcentaje', barraDe('Meditar').style.width === '100%',
    barraDe('Meditar').style.width);

  /* El color sale del nivel, con la misma lógica que «Barras». */
  ok('la tarea al 100% va verde', barraDe('Meditar').classList.contains('st-done'),
    barraDe('Meditar').className);
  ok('  y la que va por la mitad, roja', barraDe('Leer').classList.contains('st-missed'),
    barraDe('Leer').className);

  /* Sin marco, como «Puntos»: es una lista de tarjetas, no un dibujo. */
  const tarjeta = doc.querySelector('#charts .chart-card');
  ok('la tarjeta va sin recuadro', tarjeta.classList.contains('is-plana'),
    tarjeta.className);
}

// --- «Puntos» se ordena por puntos ----------------------------------------
{
  /* Cada gráfico se ordena por el número que dibuja. En «Puntos» eso son los
     PUNTOS —lo hecho—, y en «Porcentajes», el porcentaje. Con un solo criterio
     para los dos, uno de los dos quedaba ordenado por algo que no muestra.

     «Leer» es diaria y va cumplida 20 días: 20 puntos sobre 30 pedidos, 67%.
     «Correr» es semanal y va cumplida 4 días: 4 puntos sobre 5, 80%. Por puntos
     manda «Leer»; por porcentaje, «Correr». */
  const semanal = tarea('sem', 'Correr', 'weekly');
  const status = {
    ...marcar(1, 20, iso => ({ [`d1|${iso}`]: 'done' })),
    'sem|2026-07-06': 'done',
    'sem|2026-07-13': 'done',
    'sem|2026-07-20': 'done',
    'sem|2026-07-27': 'done',
  };

  const { doc } = await montar(estado(status, [TAREAS[0], semanal]));
  const nombres = () => [...doc.querySelectorAll('#charts .task-name')].map(n => n.textContent);
  const ordenar = clave => {
    doc.querySelector('#btn-orden').click();
    doc.querySelector(`.orden-opcion[data-orden="${clave}"]`).click();
  };

  verGrafico(doc, 'puntos');
  ordenar('desc');
  console.log(`\n=== orden por puntos ===\n  puntos: ${nombres().join(' · ')}`);
  ok('«Puntos» ordena por puntos, no por porcentaje',
    nombres().join(',') === 'Leer,Correr', nombres().join(','));

  verGrafico(doc, 'porcentajes');
  console.log(`  porcentajes: ${nombres().join(' · ')}`);
  ok('  y «Porcentajes» sigue ordenando por porcentaje',
    nombres().join(',') === 'Correr,Leer', nombres().join(','));

  verGrafico(doc, 'puntos');
  ordenar('asc');
  ok('  de menor a mayor, al revés', nombres().join(',') === 'Correr,Leer', nombres().join(','));
}
{
  /* Empate en puntos: decide el porcentaje. Las dos van cumplidas 10 días, así
     que las dos suman 10 puntos; «Inglés» pide 13 días en el mes y «Leer», 30,
     así que con lo mismo hecho cumplió más de lo suyo. */
  const fijos = tarea('lxv', 'Inglés', 'custom', { weekdays: [1, 3, 5] });
  const status = {
    ...marcar(1, 10, iso => ({ [`d1|${iso}`]: 'done' })),
    ...marcar(1, 31, (iso, dow) => ([1, 3, 5].includes(dow) && iso <= '2026-07-22'
      ? { [`lxv|${iso}`]: 'done' }
      : {})),
  };

  const { doc } = await montar(estado(status, [TAREAS[0], fijos]));
  const nombres = () => [...doc.querySelectorAll('#charts .task-name')].map(n => n.textContent);

  verGrafico(doc, 'puntos');
  doc.querySelector('#btn-orden').click();
  doc.querySelector('.orden-opcion[data-orden="desc"]').click();

  const puntos = [...doc.querySelectorAll('#charts .dots-row')].map(f => ({
    nombre: f.querySelector('.task-name').textContent,
    hechos: f.querySelectorAll('.dot.st-done').length,
  }));
  console.log(`\n=== empate en puntos ===\n  `
    + puntos.map(p => `${p.nombre}: ${p.hechos}`).join(' · '));

  ok('con los mismos puntos, desempata el porcentaje',
    nombres().join(',') === 'Inglés,Leer', nombres().join(','));
  ok('  y los puntos eran los mismos', puntos[0].hechos === puntos[1].hechos,
    puntos.map(p => p.hechos).join(' vs '));
}

// --- el desplegable del orden ---------------------------------------------
{
  /* El botón abre un desplegable con las tres opciones y muestra la puesta.
     Vale para los dos gráficos que listan tareas; «Barras» es por día de la
     semana, y ahí el orden es el calendario. */
  const s = marcar(1, 30, (iso, dow) => ({
    [`d1|${iso}`]: dow % 2 ? 'done' : 'missed',              // a la mitad
    [`d2|${iso}`]: 'done',                                   // al 100%
  }));

  const { doc } = await montar(estado(s));
  const boton = () => doc.querySelector('#btn-orden');
  const nombres = () => [...doc.querySelectorAll('#charts .task-name')]
    .map(n => n.textContent);

  /** Abre el desplegable y elige una de las tres. */
  const ordenar = clave => {
    boton().click();
    doc.querySelector(`.orden-opcion[data-orden="${clave}"]`).click();
  };

  ok('en Hábitos el botón no está', boton().hidden === true);

  verGrafico(doc, 'puntos');
  ok('en «Puntos» aparece', boton().hidden === false);
  ok('  y está a la derecha del mes',
    boton().previousElementSibling?.id === 'month-label',
    boton().previousElementSibling?.id);
  ok('  diciendo en qué orden está', /el predeterminado/.test(boton().title), boton().title);
  ok('  con el orden de la lista', nombres().join(',') === 'Leer,Meditar,Trabajar',
    nombres().join(','));

  /* Las tres a la vista, y la puesta marcada. */
  boton().click();
  const opciones = [...doc.querySelectorAll('.orden-opcion')];
  console.log(`\n=== desplegable del orden ===\n  `
    + opciones.map(o => o.textContent.trim()).join(' · '));
  ok('el botón abre un desplegable',
    doc.querySelector('#orden-dialog').hasAttribute('open'));
  ok('  con las tres opciones', opciones.length === 3, String(opciones.length));
  ok('  y la puesta marcada',
    opciones.filter(o => o.getAttribute('aria-pressed') === 'true')
      .map(o => o.dataset.orden).join(',') === 'lista');
  doc.querySelector('#orden-dialog [data-close-dialog]').click();

  ordenar('desc');
  console.log(`  ${boton().title}\n  ${nombres().join(' · ')}`);
  ok('elegir «de mayor a menor» reordena',
    nombres().join(',') === 'Meditar,Leer,Trabajar', nombres().join(','));
  ok('  cierra el desplegable',
    !doc.querySelector('#orden-dialog').hasAttribute('open'));
  ok('  y el botón lo dice', /de mayor a menor/.test(boton().title), boton().title);

  /* «Trabajar» tiene meta y ninguna marca: va 0%, así que encabeza el
     ascendente. */
  ordenar('asc');
  ok('y «de menor a mayor» lo da vuelta',
    nombres().join(',') === 'Trabajar,Leer,Meditar', nombres().join(','));

  ordenar('lista');
  ok('y se puede volver al orden de la lista',
    nombres().join(',') === 'Leer,Meditar,Trabajar', nombres().join(','));

  /* El orden elegido vale también para «Porcentajes»: son la misma lista. */
  ordenar('desc');
  verGrafico(doc, 'porcentajes');
  ok('el orden vale para los dos gráficos',
    nombres().join(',') === 'Meditar,Leer,Trabajar', nombres().join(','));

  /* Y no hay nada que ordenar en «Barras». */
  verGrafico(doc, 'barras');
  ok('en «Barras» el botón no está', boton().hidden === true);
}

// --- el cumplimiento mensual ----------------------------------------------
{
  /* Arriba de todo y siempre a la vista: cómo viene el mes en una línea. La
     cuenta es (cumplidas + parciales) / lo que las tareas piden, sobre los días
     ya transcurridos.

     Una sola tarea diaria, cumplida los primeros 15 días de los 30 corridos: 15
     marcas sobre 30 días pedidos. */
  const s = marcar(1, 15, iso => ({ [`d1|${iso}`]: 'done' }));
  const { doc } = await montar(estado(s, [TAREAS[0]]));
  doc.querySelector('[data-page="indicators"]').click();

  const valor = () => doc.querySelector('#mes-resumen-valor').textContent;
  const caja = () => doc.querySelector('#mes-resumen');
  console.log(`\n=== cumplimiento mensual ===\n  ${valor()} · ${caja().title}`);

  ok('está arriba de los gráficos',
    doc.querySelector('#analysis').firstElementChild?.id === 'mes-resumen',
    doc.querySelector('#analysis').firstElementChild?.id);
  ok('  con la mitad hecha, va la mitad', valor() === '50%', valor());
  ok('  y el recuadro lleva el color del nivel', /cp-partial/.test(caja().className),
    caja().className);
  ok('  y dice la cuenta, como el resumen del día',
    /15 sobre una meta de 30/.test(caja().title), caja().title);
}
{
  /* Es la misma cuenta que el resto de la app: una parcial vale medio punto, así
     que un mes hecho todo a medias da 50% acá y 50% en la lista del día. */
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'partial' }));
  const { doc } = await montar(estado(s, [TAREAS[0]]));
  doc.querySelector('[data-page="indicators"]').click();

  ok('una parcial vale medio punto',
    doc.querySelector('#mes-resumen-valor').textContent === '50%',
    doc.querySelector('#mes-resumen-valor').textContent);
}
{
  /* «Leer» cumplida los 30 días y «Meditar» sin marcar: 30 puntos sobre una
     meta de 60. */
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }));
  const { doc } = await montar(estado(s, [TAREAS[0], TAREAS[1]]));
  doc.querySelector('[data-page="indicators"]').click();

  ok('una tarea al 100% y otra en cero dan la mitad',
    doc.querySelector('#mes-resumen-valor').textContent === '50%',
    doc.querySelector('#mes-resumen-valor').textContent);
}
{
  /* El total NO topea cada tarea en su meta: lo hecho de más en una compensa lo
     que falta en otra. La semanal se marca los 30 días: pide 5 —las tres semanas
     enteras del mes más las dos partidas, que al marcarlas pasan a pedir— y
     aporta 30 puntos. La diaria, que pide 30, no se marca nunca. Con tope daría
     5 sobre 35 —14%—; sin tope, 30 sobre 35.

     Cada fila sigue mostrando lo suyo: la semanal topea en 100%. */
  const semanal = tarea('sem', 'Lavar ropa', 'weekly');
  const s = marcar(1, 30, iso => ({ [`sem|${iso}`]: 'done' }));
  const { doc } = await montar(estado(s, [semanal, TAREAS[0]]));
  doc.querySelector('[data-page="indicators"]').click();

  const caja = doc.querySelector('#mes-resumen');
  console.log(`\n=== sin tope por tarea ===\n  `
    + `${doc.querySelector('#mes-resumen-valor').textContent} · ${caja.title}`);

  ok('lo hecho de más cuenta en el total',
    /30 sobre una meta de 35/.test(caja.title), caja.title);
  ok('  y levanta el porcentaje del mes',
    doc.querySelector('#mes-resumen-valor').textContent === '86%',
    doc.querySelector('#mes-resumen-valor').textContent);
}
{
  /* Pero el porcentaje no pasa de 100%: una sola tarea marcada muy por encima
     de lo que pide no puede dar 750%. */
  const semanal = tarea('sem', 'Lavar ropa', 'weekly');
  const s = marcar(1, 30, iso => ({ [`sem|${iso}`]: 'done' }));
  const { doc } = await montar(estado(s, [semanal]));
  doc.querySelector('[data-page="indicators"]').click();

  ok('el porcentaje del mes topea en 100%',
    doc.querySelector('#mes-resumen-valor').textContent === '100%',
    doc.querySelector('#mes-resumen-valor').textContent);
}
{
  // Sin nada que pedir no hay porcentaje que mostrar.
  const { doc } = await montar({ ...estado({}), months: { '2026-07': [] } });
  doc.querySelector('[data-page="indicators"]').click();

  ok('sin tareas muestra un guion',
    doc.querySelector('#mes-resumen-valor').textContent === '—',
    doc.querySelector('#mes-resumen-valor').textContent);
  ok('  y lo explica', /Ninguna tarea pidió nada/.test(doc.querySelector('#mes-resumen').title),
    doc.querySelector('#mes-resumen').title);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
