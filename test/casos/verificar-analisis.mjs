/* Los gráficos del análisis. Buena parte es sobre los DÍAS DE USO, que son los
   que alimentan el promedio por día de la semana de «Barras».

   «Día de uso» es un día del período visible que ya transcurrió y no es anterior
   a la primera marca cargada. La fecha de inicio de las tareas no cuenta: se
   declara y no se observa.

   «Barras» pidió siete días de uso para dibujar —lo que tarda cada día de la
   semana en aparecer una vez—. El mínimo evitaba coronar al lunes por haber
   tenido un solo lunes, pero dejaba el gráfico en blanco la primera semana de
   cada mes, que es cuando más se lo mira. Se sacó: ahora dibuja con lo que haya,
   y para promediar sobre un tramo largo está el selector de período.

   Hubo cuatro tarjetas de indicadores —días más y menos productivos, «Necesitan
   tu atención» y la comparación con el mes pasado— que resumían en una línea lo
   que los gráficos muestran con su reparto a la vista. Se fueron, y con ellas
   las comprobaciones que hablaban de ellas.

   Arnés: hoy = jueves 30/07/2026. */
import { montar, moverMeses, leer as leerArchivo } from '../harness.mjs';

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
    /* Un número por día de la semana CON datos: los días sin nada medido no
       dibujan barra ni número, así que esto cuenta cuántos días de la semana
       llegaron a tener algo. */
    valores: [...(card?.querySelectorAll('.bar-value') ?? [])].map(t => t.textContent),
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

// --- sin una sola marca no hay nada que promediar --------------------------
{
  const r = await analizar({});
  mostrar('mes sin ninguna marca', r);

  ok('el gráfico no dibuja barras', r.barras === 0, String(r.barras));
  ok('  y dice que no hay datos', /no hay datos/.test(r.aviso), r.aviso);
}

// --- con lo que haya alcanza ----------------------------------------------
{
  /* Tres días cargados. Pidió siete —lo que tarda cada día de la semana en
     aparecer una vez—, y con eso el gráfico quedaba en blanco toda la primera
     semana de cada mes. Ahora dibuja los días que haya: que el martes tenga un
     solo martes medido lo dice el propio gráfico, que muestra tres barras y no
     siete. */
  const s = marcar(28, 30, iso => ({ [`d1|${iso}`]: 'done', [`lv|${iso}`]: 'done' }));
  const r = await analizar(s);
  mostrar('tres días de uso (28, 29 y 30)', r);

  ok('con tres días ya dibuja', r.barras > 0, String(r.barras));
  ok('  una barra por día medido, y no siete', r.valores.length === 3,
    r.valores.join(' · '));
  ok('  sin avisos de mínimo', r.aviso === '', r.aviso);
}

// --- un mes anterior al primer uso no tiene días de uso --------------------
{
  const s = marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }));

  const { doc } = await montar(estado(s));
  moverMeses(doc, -1);          // junio, entero antes de la primera marca
  const r = leer(doc);
  mostrar('junio — anterior al primer uso', r);

  ok('junio no dibuja nada', r.barras === 0, String(r.barras));
  ok('  porque no tiene un solo día de uso', r.valores.length === 0,
    r.valores.join(' · '));
}

// --- la fecha de inicio no adelanta el comienzo de uso ---------------------
{
  /* Una tarea dada de alta con inicio retroactivo al 1 de enero, con marcas
     solo en los últimos tres días. El comienzo de uso es la primera MARCA, no
     el `start`: si contara el start, julio entero sería medible y los siete
     días de la semana tendrían barra, casi todos hundidos por días en blanco en
     los que la app todavía no se usaba. */
  const tareas = [tarea('d1', 'Leer', 'daily', { start: '2026-01-01' })];
  const s = marcar(28, 30, iso => ({ [`d1|${iso}`]: 'done' }));

  const r = await analizar(s, tareas);
  mostrar('inicio retroactivo al 1 de enero', r);

  ok('el start retroactivo no cuenta como uso', r.valores.length === 3,
    r.valores.join(' · '));
  ok('  y lo medido va al 100%', r.valores.every(v => v === '100%'),
    r.valores.join(' · '));
}

// --- los días futuros no cuentan -------------------------------------------
{
  /* Hoy es el 30, jueves. Marcar el 31 no agrega un día de uso: todavía no
     transcurrió, y contarlo pondría al viernes un promedio que nadie vivió. */
  const s = marcar(25, 31, iso => ({ [`d1|${iso}`]: 'done' }));
  const r = await analizar(s, [TAREAS[0]]);
  mostrar('con el 31 marcado por adelantado', r);

  ok('el día futuro no suma', r.valores.length === 6, r.valores.join(' · '));
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

  /* Un gráfico por vez. «Barras» trae DOS tarjetas —el dibujo arriba y el
     resumen del período abajo—, que es la única excepción: sigue siendo un
     gráfico, repartido en dos bloques para que cada uno se lea por su cuenta. */
  for (const [cual, esperado, tarjetas] of [['barras', /^Barras$/, 2],
    ['porcentajes', /^Porcentajes$/, 1], ['puntos', /^Puntos$/, 1]]) {
    verGrafico(doc, cual);
    ok(`  elegir «${cual}» deja ese solo`, cuantos() === tarjetas && esperado.test(titulo()),
      `${cuantos()} · ${titulo()}`);
    ok('    y queda marcado en el menú',
      doc.querySelector(`#btn-chart-${cual}`).getAttribute('aria-pressed') === 'true');
  }

  /* Las dos de «Barras», nombradas: la segunda no es un gráfico más en el
     menú, es el pie del que está puesto. */
  verGrafico(doc, 'barras');
  const rotulos = [...doc.querySelectorAll('#charts .chart-card')]
    .map(c => c.getAttribute('aria-label'));
  ok('  y las dos de «Barras» se anuncian por separado',
    rotulos.join(' · ') === 'Barras · Resumen del período', rotulos.join(' · '));

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
// --- sin un solo hábito: un ejemplo en vez de un aviso ---------------------
{
  /* «Todavía no hay tareas este mes» dice qué falta pero no PARA QUÉ sirve la
     pantalla: quien recién llega no tiene forma de saber qué va a ver ahí, y por
     lo tanto tampoco por qué le convendría cargar algo.

     El ejemplo usa el dibujo de verdad —las mismas filas, los mismos puntos, las
     mismas barras— y solo inventa los números: uno aparte terminaría mostrando
     algo que la app no hace. */
  const { doc } = await montar({ ...estado({}), months: { '2026-07': [] } });
  const ejemplo = () => doc.querySelector('#charts .grafico-ejemplo');

  verGrafico(doc, 'puntos');
  ok('sin un solo hábito, «Puntos» muestra un ejemplo', Boolean(ejemplo()),
    doc.querySelector('#charts').textContent.trim().slice(0, 60));
  ok('  diciendo que es un ejemplo antes del dibujo',
    /^Ejemplo/.test(ejemplo().querySelector('.ejemplo-rotulo')?.textContent ?? ''),
    ejemplo().querySelector('.ejemplo-rotulo')?.textContent);
  /* No es información sino una muestra, y el rótulo ya la anuncia: para un
     lector de pantalla el dibujo es ruido. */
  ok('  con el dibujo fuera del alcance de un lector de pantalla',
    ejemplo().querySelector('.ejemplo-dibujo')?.getAttribute('aria-hidden') === 'true');

  const fila = ejemplo().querySelector('.dots-row');
  ok('  con «Tomar agua» y sus puntos',
    fila?.querySelector('.task-name')?.textContent === 'Tomar agua'
      && ejemplo().querySelectorAll('.dot').length === 30,
    `${fila?.querySelector('.task-name')?.textContent} · ${ejemplo().querySelectorAll('.dot').length} puntos`);
  /* Los puntos son los de verdad, con sus clases de estado: por eso alcanza con
     el gris de la caja para apagarlos, sin una paleta aparte que envejezca. */
  ok('    que son los puntos de verdad, con sus estados',
    [...ejemplo().querySelectorAll('.dot')].some(p => p.classList.contains('st-done'))
      && [...ejemplo().querySelectorAll('.dot')].some(p => p.classList.contains('st-missed')));

  verGrafico(doc, 'porcentajes');
  ok('«Porcentajes» también, con la misma tarea',
    ejemplo()?.querySelector('.task-name')?.textContent === 'Tomar agua'
      && Boolean(ejemplo().querySelector('.meter-fill')),
    ejemplo()?.textContent?.trim().slice(0, 60));

  verGrafico(doc, 'barras');
  const valores = [...(ejemplo()?.querySelectorAll('.bar-value') ?? [])].map(v => v.textContent);
  ok('y «Barras» simula los siete días', valores.length === 7, valores.join(' '));
  /* Con un mejor y un peor día, para que el podio tenga algo que coronar: es
     parte de lo que el ejemplo tiene que mostrar. */
  ok('  con podio, que es la mitad de lo que hay para ver ahí',
    ejemplo().querySelectorAll('.podio-mejor, .podio-peor').length === 2,
    String(ejemplo().querySelectorAll('.podio-mejor, .podio-peor').length));
}

{
  /* Pero con hábitos cargados en OTRO mes, el mes vacío no lleva ejemplo: quien
     ya usa la app no necesita que le expliquen la pantalla, y el ejemplo taparía
     el aviso que sí dice algo. */
  const s2 = marcar(1, 10, iso => ({ [`d1|${iso}`]: 'done' }));
  const { doc } = await montar(estado(s2));
  moverMeses(doc, -1);
  verGrafico(doc, 'puntos');

  ok('con hábitos en otro mes, el mes vacío no lleva ejemplo',
    doc.querySelector('#charts .grafico-ejemplo') === null,
    doc.querySelector('#charts').textContent.trim().slice(0, 60));
  ok('  y sigue diciendo qué falta',
    /Todavía no hay tareas/.test(doc.querySelector('#charts .chart-empty')?.textContent ?? ''),
    doc.querySelector('#charts .chart-empty')?.textContent);
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

// --- «Porcentajes»: pedir poco no es no pedir nada ------------------------
{
  /* Dos maneras de no tener meta este mes, que la fila cuenta distinto.

     «Lavar ropa» es semanal y empieza el 28: el mes ya empezó, así que le pide
     su cuota entera —4— aunque la tarea lleve tres días de existir. Sin marcar,
     eso es 0%. Mostraba un guion, el mismo que una tarea que no pide nada,
     estando las dos igual de sin hacer.

     «Correr» empieza en agosto: este mes no pide NADA, y ahí el guion se queda
     —no hay nada que medir, y un 0% la acusaría de algo que no le tocaba—. */
  const tareas = [
    tarea('sem', 'Lavar ropa', 'weekly', { start: '2026-07-28' }),
    tarea('lv', 'Trabajar', 'weekdays'),
    tarea('ago', 'Correr', 'daily', { start: '2026-08-01' }),
  ];

  const { doc } = await montar(estado({}, tareas));
  verGrafico(doc, 'porcentajes');

  const valorDe = nombre => [...doc.querySelectorAll('#charts .dots-row')]
    .find(f => f.querySelector('.task-name').textContent === nombre)
    ?.querySelector('.meter-value').textContent;

  console.log(`\n=== sin meta ===\n  Lavar ropa ${valorDe('Lavar ropa')} · `
    + `Trabajar ${valorDe('Trabajar')} · Correr ${valorDe('Correr')}`);

  ok('la semanal recién empezada dice 0%', valorDe('Lavar ropa') === '0%',
    String(valorDe('Lavar ropa')));
  ok('  igual que la de lunes a viernes sin marcar', valorDe('Trabajar') === '0%',
    String(valorDe('Trabajar')));
  ok('  y la que este mes no pide nada sigue con el guion',
    valorDe('Correr') === '—', String(valorDe('Correr')));

  /* Y el riel queda vacío: 0% no dibuja nada, tenga o no tenga meta. */
  const rielDe = nombre => [...doc.querySelectorAll('#charts .dots-row')]
    .find(f => f.querySelector('.task-name').textContent === nombre)
    .querySelector('.meter-fill');
  ok('  con el riel de las dos en cero',
    rielDe('Lavar ropa')?.style.width === '0%' && rielDe('Correr') === null,
    `${rielDe('Lavar ropa')?.style.width} · ${rielDe('Correr')}`);
}

// --- «Puntos» se ordena por puntos ----------------------------------------
{
  /* Cada gráfico se ordena por el número que dibuja. En «Puntos» eso son los
     PUNTOS —lo hecho—, y en «Porcentajes», el porcentaje. Con un solo criterio
     para los dos, uno de los dos quedaba ordenado por algo que no muestra.

     «Leer» es diaria y va cumplida 20 días: 20 puntos sobre 30 pedidos, 67%.
     «Correr» es semanal y va cumplida 4 días: 4 puntos sobre su cuota de 4,
     100%. Por puntos manda «Leer»; por porcentaje, «Correr». */
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
  /* Acotado a SU diálogo: «.orden-opcion» es el molde de las opciones grandes
     de cualquier diálogo, y Pendientes tiene las suyas. */
  const opciones = [...doc.querySelectorAll('#orden-dialog .orden-opcion')];
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

// --- el selector: en Análisis se elige un mes, no un día ------------------
{
  /* El mismo botón que en el Diario abre «a qué fecha vamos», acá contesta otra
     pregunta: los gráficos son de un mes entero, así que bajar a los días era
     un paso que no cambiaba nada de lo dibujado. */
  const { doc } = await montar(estado(marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }))));
  const celdas = () => [...doc.querySelectorAll('#jump-grid .jump-cell')];

  doc.querySelector('[data-page="indicators"]').click();
  doc.querySelector('#month-label').click();

  console.log(`\n=== el selector en Análisis ===\n  `
    + `${doc.querySelector('#jump-title').textContent} · `
    + `${celdas().length} celdas · rótulo «${doc.querySelector('#jump-label').textContent}»`);

  ok('abre en los meses, no en los días', celdas().length === 12, String(celdas().length));
  ok('  con el año en el rótulo',
    doc.querySelector('#jump-label').textContent === '2026',
    doc.querySelector('#jump-label').textContent);
  /* Y el rótulo deja de ser un cambio de escala: no hay adónde bajar. */
  ok('  que ya no cambia de escala', doc.querySelector('#jump-label').disabled === true);

  // Elegir el mes navega y cierra: en el Diario, elegirlo bajaba a sus días.
  celdas().find(c => c.textContent.toLowerCase() === 'mayo').click();
  ok('elegir un mes va y cierra',
    doc.querySelector('#jump-dialog').hasAttribute('open') === false);
  ok('  y el rótulo del mes lo dice',
    doc.querySelector('#month-label').textContent.toLowerCase() === 'mayo 2026',
    doc.querySelector('#month-label').textContent);
}

// --- el desplegable del período, solo en «Barras» -------------------------
{
  /* El período se elige en un desplegable de la fila del mes, al lado del ☰.
     Vivió adentro del calendario de «Ir a…»: había que abrir un diálogo para
     cambiar de tramo, y nada anunciaba que ahí hubiera períodos. */
  const { doc } = await montar(estado(marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }))));
  const campo = () => doc.querySelector('#btn-rango');
  const mes = () => doc.querySelector('#month-label').textContent;
  const pie = () => doc.querySelector('#charts .rango-pie')?.textContent ?? '(sin pie)';
  const elegir = valor => {
    campo().click();
    doc.querySelector(`#rango-dialog [data-rango="${valor}"]`).click();
  };

  doc.querySelector('[data-page="indicators"]').click();

  /* «Puntos» dibuja un punto por día y «Porcentajes» mide contra la meta del
     período: a un año, el primero no entra en una fila y el segundo contesta
     otra pregunta. El que promedia es «Barras», y promediar mejora cuanto más
     largo es el tramo. */
  ok('en «Puntos» no se ofrece el período', campo().hidden === true);

  verGrafico(doc, 'barras');
  ok('en «Barras» sí', campo().hidden === false);

  /* El botón dice el período PUESTO, no el que se ofrece — igual que el del
     orden y el del tema. Y las opciones viven en un diálogo propio: fue un
     `<select>` nativo y su lista la dibujaba el sistema operativo, con su azul
     y su tipografía, sin aceptar una línea de CSS. */
  ok('el botón muestra el período puesto', campo().textContent === '1M',
    campo().textContent);

  campo().click();
  ok('  y abre un diálogo de la app, no una lista del sistema',
    doc.querySelector('#rango-dialog').hasAttribute('open'));

  const opciones = [...doc.querySelectorAll('#rango-dialog [data-rango]')]
    .map(b => `${b.dataset.rango}=${b.textContent.trim()}`);
  console.log(`\n=== períodos ===\n  ${opciones.join(' · ')}`);
  ok('  con las cuatro opciones explicadas, el mes primero',
    opciones.join('|')
      === 'mes=Este mes|3m=Últimos 3 meses|6m=Últimos 6 meses|12m=Último año',
    opciones.join('|'));
  ok('  y la puesta marcada',
    doc.querySelector('#rango-dialog [data-rango="mes"]').getAttribute('aria-pressed') === 'true');

  /* Las mismas clases que el diálogo del orden: es de donde sale que se vea
     igual que el resto de la app, y no de una paleta propia. */
  ok('  con el mismo marcado que el diálogo del orden',
    doc.querySelectorAll('#rango-dialog .orden-opciones .btn.orden-opcion').length === 4);
  doc.querySelector('#rango-dialog [data-close-dialog]').click();

  /* Las claves que ofrece el diálogo tienen que ser las que `VISTAS` acepta al
     restaurar: una opción nueva que no esté en esa lista se guardaría y se
     ignoraría al volver a entrar, sin que nada avise. */
  const claves = opciones.map(o => o.split('=')[0]).sort().join(',');
  ok('  y son las que se saben recordar',
    /rango: \['mes', '3m', '6m', '12m'\]/.test(leerArchivo('app.js'))
    && claves === '12m,3m,6m,mes', claves);

  /* El rótulo del mes dice el MES y nada más. Supo nombrar el período cuando
     era el mismo botón que lo elegía; ahora el tramo tiene su renglón al pie
     del gráfico, y repetirlo arriba sería decirlo dos veces. */
  ok('el rótulo de arriba dice el mes', mes().toLowerCase() === 'julio 2026', mes());
  ok('  y el pie dice el mes dibujado', pie() === 'Julio 2026', pie());

  elegir('6m');
  ok('elegir un período no toca el rótulo del mes',
    mes().toLowerCase() === 'julio 2026', mes());
  /* El pie dice CUÁLES y no cuántos, con todas las letras: hoy es el 30 de
     julio, así que los últimos seis meses son de febrero a julio. */
  ok('  y el pie dice de qué mes a qué mes',
    pie() === 'Desde Febrero 2026 a Julio 2026', pie());

  ok('  y el botón pasa a decirlo en corto', campo().textContent === '6M',
    campo().textContent);

  /* El período es de «Barras» y de nadie más: en los otros dos el botón no
     está, sin que haya que deshacer nada. */
  verGrafico(doc, 'puntos');
  ok('en «Puntos» el botón se esconde', campo().hidden === true);
  ok('  y no queda ningún pie de tramo',
    doc.querySelector('#charts .rango-pie') === null);

  verGrafico(doc, 'barras');
  ok('  y al volver a «Barras» el período sigue puesto',
    campo().textContent === '6M' && pie() === 'Desde Febrero 2026 a Julio 2026',
    `${campo().textContent} · ${pie()}`);

  // Elegir un mes suelto en el calendario lo saca.
  doc.querySelector('#month-label').click();
  [...doc.querySelectorAll('#jump-grid .jump-cell')]
    .find(c => c.textContent.toLowerCase() === 'julio').click();
  ok('elegir un mes en el calendario deshace el período',
    campo().textContent === '1M' && pie() === 'Julio 2026',
    `${campo().textContent} · ${pie()}`);
  ok('  y el calendario volvió a hablar de un mes',
    doc.querySelector('#jump-title').textContent === 'Seleccionar mes',
    doc.querySelector('#jump-title').textContent);
}

// --- las dos tarjetas del pie ---------------------------------------------
{
  /* Dicen con palabras lo que el podio marca sobre la barra, y tienen que
     decir LO MISMO: una corona sobre el sábado y una tarjeta que nombre al
     viernes es de los errores que nadie reporta, porque cada mitad parece
     correcta por su lado. Por eso los dos salen de `mejorYPeor`. */
  const { doc } = await montar(estado(marcar(1, 30, iso => ({ [`d1|${iso}`]: 'done' }))));
  verGrafico(doc, 'barras');

  const card = sel => doc.querySelector(`#charts .dia-card-${sel}`);
  const dia = sel => card(sel)?.querySelector('.dia-card-dia').textContent;
  const linea = (sel, n) => card(sel)?.querySelector(`.dia-card-l${n}`)?.textContent;

  console.log(`\n=== tarjetas ===\n  mejor: ${dia('mejor')} · peor: ${dia('peor')}`);

  ok('hay una tarjeta de mejores y otra de peores',
    Boolean(card('mejor')) && Boolean(card('peor')));

  /* DOS renglones, y son dos nodos: el corte lo decide el marcado y no el
     ancho, así las dos tarjetas cortan en el mismo lugar. */
  ok('  el primer renglón dice de quiénes habla',
    linea('mejor', 1) === 'Tus mejores días en promedio'
    && linea('peor', 1) === 'Tus peores días en promedio',
    `${linea('mejor', 1)} / ${linea('peor', 1)}`);
  ok('  y el segundo, igual en las dos, sin rótulo «Periodo»',
    linea('mejor', 2) === 'durante este periodo fueron los:'
    && linea('peor', 2) === linea('mejor', 2), String(linea('mejor', 2)));
  ok('  y el día en su propio nodo, que es el que lleva color',
    Boolean(dia('mejor')) && Boolean(dia('peor')), `${dia('mejor')} · ${dia('peor')}`);

  /* Van en dos tarjetas separadas: el dibujo en una y lo que se lee en otra. */
  ok('  las dos viven en la tarjeta del resumen, no en la del gráfico',
    doc.querySelectorAll('#charts .resumen-card .dia-card').length === 2
    && doc.querySelector('#charts .chart-card:first-child .dia-card') === null);
  ok('  y el tramo encabeza esa misma tarjeta',
    doc.querySelector('#charts .resumen-card > :first-child')?.className === 'rango-pie',
    doc.querySelector('#charts .resumen-card > :first-child')?.className);

  /* El verde y el rojo del gráfico, un paso más oscuros para que se puedan
     leer: los `--dot-` son colores de relleno y como texto quedaban en 1,9:1 y
     1,7:1 contra la tarjeta. Van en sus propias variables, definidas en los
     DOS temas — en oscuro el paso es al revés, porque ahí oscurecer es
     desaparecer. Se lee de la hoja porque jsdom no computa estilos. */
  const css = leerArchivo('styles.css');
  const colorDe = cual => css
    .match(new RegExp(`\\.dia-card-${cual}\\s+\\.dia-card-dia \\{ color: var\\((--[\\w-]+)\\)`))?.[1];
  ok('el día mejor va con su propio verde', colorDe('mejor') === '--dia-mejor',
    String(colorDe('mejor')));

  /* El rojo del peor es el MISMO de la cruz del podio, sin variable
     intermedia: el día que la cruz marca sobre la barra y el que nombra la
     tarjeta son el mismo, así que tienen que verse del mismo color. Dos
     variables distintas se separarían en cuanto alguien tocara una. */
  const cruz = css.match(/\.podio-peor path \{[\s\S]*?stroke: var\((--[\w-]+)\)/)?.[1];
  ok('  y el peor con el rojo de la cruz del podio',
    colorDe('peor') === '--chart-missed' && cruz === colorDe('peor'),
    `tarjeta ${colorDe('peor')} · cruz ${cruz}`);

  /* Definidas en los dos temas: una sola definición dejaría el modo oscuro
     con el color del claro, que es justo donde un rojo oscuro desaparece. */
  const claro = css.slice(0, css.indexOf('[data-theme="dark"]'));
  const oscuro = css.slice(css.indexOf('[data-theme="dark"]'));
  for (const v of ['--dia-mejor', '--chart-missed']) {
    ok(`  ${v} está en los dos temas`,
      new RegExp(`${v}:\\s*#`).test(claro) && new RegExp(`${v}:\\s*#`).test(oscuro));
  }

  /* Y el gráfico sigue rellenando con los `--dot-`: lo que cambió es el texto
     de la tarjeta, no las barras. */
  ok('  y las columnas siguen con los colores de relleno',
    /fill: `var\(--dot-\$\{nivel\.status\}\)`/.test(leerArchivo('app.js')));

  /* Y lo que dicen coincide con lo que corona el gráfico — como CONJUNTO, que
     es lo que hay que comparar: los empatados se coronan todos y la tarjeta
     los nombra a todos, así que acá hay varios de cada lado. El podio se ubica
     por `transform`, así que se busca la letra del eje más cercana. */
  const ejes = [...doc.querySelectorAll('#charts .axis-text')]
    .map(t => ({ letra: t.textContent, x: Number(t.getAttribute('x')) }));
  const bajoLosPodios = cual => [...doc.querySelectorAll(`#charts .podio-${cual}`)]
    .map(p => {
      const x = Number(p.getAttribute('transform').match(/translate\(([\d.]+)/)[1]);
      return ejes.reduce((a, b) => (Math.abs(b.x - x) < Math.abs(a.x - x) ? b : a)).letra;
    })
    .sort().join('');

  const INICIAL = { Lunes: 'L', Martes: 'M', Miércoles: 'X', Jueves: 'J',
    Viernes: 'V', Sábado: 'S', Domingo: 'D' };
  const iniciales = texto => texto.split(/,| y /)
    .map(n => INICIAL[n.trim()]).sort().join('');

  ok('las coronas están sobre los días que nombra la tarjeta',
    bajoLosPodios('mejor') === iniciales(dia('mejor')),
    `${bajoLosPodios('mejor')} vs ${dia('mejor')}`);
  ok('  y las cruces, sobre los de la otra',
    bajoLosPodios('peor') === iniciales(dia('peor')),
    `${bajoLosPodios('peor')} vs ${dia('peor')}`);
}

// --- con el tramo parejo no hay nada que destacar -------------------------
{
  /* Con un solo día medible, el mejor y el peor son el mismo. Ahí las
     tarjetas no se dibujan —«tus mejores días fueron los jueves» y «tus peores
     días fueron los jueves» sería la pantalla contradiciéndose— y el podio
     tampoco corona a nadie: no hay diferencia que mostrar. */
  const sola = tarea('t1', 'Leer', 'daily', { start: '2026-07-30' });
  const { doc } = await montar(estado({ 't1|2026-07-30': 'done' }, [sola]));
  verGrafico(doc, 'barras');

  ok('un solo día medible no dibuja tarjetas',
    doc.querySelectorAll('#charts .dia-card').length === 0,
    String(doc.querySelectorAll('#charts .dia-card').length));
  ok('  ni corona a nadie', doc.querySelectorAll('#charts .podio').length === 0,
    String(doc.querySelectorAll('#charts .podio').length));
  ok('  pero el tramo se sigue diciendo',
    doc.querySelector('#charts .rango-pie')?.textContent === 'Julio 2026',
    String(doc.querySelector('#charts .rango-pie')?.textContent));
}

// --- el período mira más atrás que el mes ---------------------------------
{
  /* Hoy es el 30 de julio. Una tarea diaria cumplida los martes de junio y
     nada más: en julio no hay una sola marca, así que el mes no tiene nada que
     promediar. Con los últimos 3 meses, junio entra y el martes aparece.

     Los meses se cuentan desde HOY y no desde el mes que se está mirando, así
     que «últimos 3» es mayo, junio y julio se pare uno donde se pare. */
  const status = {};
  for (const dia of [2, 9, 16, 23, 30]) {      // los martes de junio
    status[`d1|2026-06-${String(dia).padStart(2, '0')}`] = 'done';
  }

  const { doc } = await montar({
    ...estado(status, [TAREAS[0]]),
    months: { '2026-06': [TAREAS[0]], '2026-07': [TAREAS[0]] },
  });

  verGrafico(doc, 'barras');
  const valores = () => [...doc.querySelectorAll('#charts .bar-value')].map(t => t.textContent);
  console.log(`\n=== julio solo ===\n  ${valores().join(' · ') || '(nada)'}`);
  ok('julio solo no tiene nada que promediar', valores().length === 0,
    valores().join(' · '));

  const elegirRango = valor => {
    doc.querySelector('#btn-rango').click();
    doc.querySelector(`#rango-dialog [data-rango="${valor}"]`).click();
  };

  elegirRango('3m');
  console.log(`=== últimos 3 meses ===\n  ${valores().join(' · ')}`);

  ok('con los últimos 3 meses aparece junio', valores().length > 0,
    valores().join(' · '));
  /* El martes es el único con algo: cinco martes de junio cumplidos y los
     cuatro de julio en blanco, 5 de 9. Que no sea 100% es justamente la prueba
     de que el período cruza los meses: si solo mirara junio, daría 100%. */
  ok('  y el martes promedia los dos meses', valores()[1] === '56%',
    valores().join(' · '));
  ok('  y el resto del período queda en cero',
    valores().filter(v => v !== '0%').length === 1, valores().join(' · '));

  /* Doce meses cruzan el año, y ahí el pie tiene que llevar los dos: de agosto
     de 2025 a julio de 2026. El año va en los dos meses aunque coincidan, así
     que no hay que deducir ninguno. */
  elegirRango('12m');
  const pie = doc.querySelector('#charts .rango-pie').textContent;
  ok('a doce meses el pie lleva los dos años',
    pie === 'Desde Agosto 2025 a Julio 2026', pie);
}

// --- la semanal y la quincenal son una CUOTA DEL MES ----------------------
{
  /* El rótulo —«Una vez por semana»— describe el ritmo que se busca; lo que se
     mide es un total del mes: 4 para la semanal y 2 para la quincenal.
     CUÁNDO se hicieron no entra en la cuenta, a propósito: hacer las cuatro el
     mismo lunes cumple el mes igual que hacer una por semana.

     Antes cada semana era su propio período y el denominador se armaba
     prorrateando lo transcurrido, así que se movía con el calendario y con lo
     que uno marcaba. Ahora es 4 y 2, y nada lo cambia. */
  const cuotas = [tarea('sem', 'Correr', 'weekly'), tarea('qui', 'Podar', 'biweekly')];
  const dias = (id, ds) => Object.fromEntries(ds.map(d => [`${id}|2026-07-${d}`, 'done']));

  const valores = async marcas => {
    const { doc } = await montar(estado(marcas, cuotas));
    verGrafico(doc, 'porcentajes');
    const v = {};
    for (const f of doc.querySelectorAll('#charts .dots-row')) {
      v[f.querySelector('.task-name').textContent] = f.querySelector('.meter-value').textContent;
    }
    return v;
  };

  /* Julio 2026 toca CINCO bloques de semana —1-5, 6-12, 13-19, 20-26, 27-31— y
     aun así pide 4: la cuota no mira el calendario. */
  const repartida = await valores(dias('sem', ['01', '08', '15', '22']));
  ok('la semanal hecha 4 veces en 4 semanas cumple', repartida.Correr === '100%',
    String(repartida.Correr));

  const juntas = await valores(dias('sem', ['01', '02', '03', '04']));
  ok('  y hecha 4 veces el mismo lunes, también', juntas.Correr === '100%',
    String(juntas.Correr));

  const media = await valores(dias('sem', ['01', '02']));
  ok('  dos de las cuatro son la mitad, se hagan cuando se hagan',
    media.Correr === '50%', String(media.Correr));

  /* De más no sube: `complianceOf` topea en 100 y la quinta semana de un mes
     de cinco no infla el número. */
  const deMas = await valores(dias('sem', ['01', '08', '15', '22', '29']));
  ok('  hacerla de más no pasa de 100%', deMas.Correr === '100%', String(deMas.Correr));

  // La quincenal es lo mismo con 2, que es donde se nota el cambio: antes una
  // sola marca daba 100% porque la segunda quincena todavía no se exigía.
  const unaQuincena = await valores(dias('qui', ['01']));
  ok('la quincenal hecha 1 vez va por la mitad', unaQuincena.Podar === '50%',
    String(unaQuincena.Podar));

  const dosJuntas = await valores(dias('qui', ['01', '02']));
  ok('  y hecha 2 veces cumple, aunque sean el mismo día-quincena',
    dosJuntas.Podar === '100%', String(dosJuntas.Podar));
}

// --- lo único que achica una cuota es la vigencia -------------------------
{
  /* Qué SÍ y qué NO reduce la cuota, que son dos preguntas distintas:

     - el mes a medio correr NO la reduce. Al día 30, una semanal hecha una vez
       va 1 de 4 y no «al día»: la cuota es un total del mes;
     - no haber estado vigente el mes entero SÍ. Una creada el 28 estuvo cuatro
       días de treinta y uno, así que debe una, no cuatro. Sin esto, estrenar
       un hábito a fin de mes lo dejaba en rojo por existir tarde.

     Lo segundo se redondea hacia arriba y nunca da cero: un mes en el que la
     tarea vivió un solo día igual le pide esa vez. */
  const unaMarca = { 'sem|2026-07-01': 'done' };
  const { doc: todoElMes } = await montar(
    estado(unaMarca, [tarea('sem', 'Correr', 'weekly')]));
  verGrafico(todoElMes, 'porcentajes');
  ok('vigente todo el mes, una de cuatro es 25% aunque el mes siga corriendo',
    todoElMes.querySelector('#charts .dots-row .meter-value').textContent === '25%',
    todoElMes.querySelector('#charts .dots-row .meter-value').textContent);

  const nacidaTarde = [tarea('sem', 'Lavar ropa', 'weekly', { start: '2026-07-28' })];
  const { doc } = await montar(estado({ 'sem|2026-07-28': 'done' }, nacidaTarde));
  verGrafico(doc, 'porcentajes');
  const valor = doc.querySelector('#charts .dots-row .meter-value').textContent;
  ok('  pero creada el 28 debe UNA, y hacerla cumple', valor === '100%', valor);

  const aMitad = [tarea('sem', 'Lavar ropa', 'weekly', { start: '2026-07-20' })];
  const { doc: medio } = await montar(estado({ 'sem|2026-07-20': 'done' }, aMitad));
  verGrafico(medio, 'porcentajes');
  ok('  y creada el 20 debe dos: una hecha es la mitad',
    medio.querySelector('#charts .dots-row .meter-value').textContent === '50%',
    medio.querySelector('#charts .dots-row .meter-value').textContent);

  /* Y el mes que NO empezó no pide nada: pedir cuatro de un futuro en el que
     nadie faltó pintaría de rojo un mes que no existe. Es otra cosa que la
     vigencia —ahí la tarea existe, lo que falta es el tiempo—. */
  const { doc: futuro } = await montar(estado({}, [tarea('sem', 'Correr', 'weekly')]));
  moverMeses(futuro, 1);
  verGrafico(futuro, 'porcentajes');
  const enFuturo = futuro.querySelector('#charts .dots-row .meter-value')?.textContent;
  ok('  y un mes que todavía no empezó no pide la cuota', enFuturo === '—',
    String(enFuturo));
}

// --- «Una vez por semana» y «4 veces al mes» miden IGUAL -------------------
{
  /* Significan lo mismo, así que tienen que dar lo mismo. Estaban midiendo
     distinto: la de frecuencia pedía 4 fijo y la de meta mensual prorrateaba
     por los días transcurridos, de modo que en la misma lista de barras dos
     tareas idénticas mostraban números distintos.

     Ahora las dos son una cuota del mes —ver `cuotaMensual`— y la única que
     las achica es la vigencia, que les pega igual a las dos. */
  const par = [
    tarea('sem', 'Correr', 'weekly'),
    tarea('cnt', 'Caminar', 'custom', { customMode: 'count', target: 4 }),
  ];
  const ambas = ds => Object.fromEntries(
    ds.flatMap(d => [[`sem|2026-07-${d}`, 'done'], [`cnt|2026-07-${d}`, 'done']]));

  const valores = async (marcas, tareas = par) => {
    const { doc } = await montar(estado(marcas, tareas));
    verGrafico(doc, 'porcentajes');
    const v = {};
    for (const f of doc.querySelectorAll('#charts .dots-row')) {
      v[f.querySelector('.task-name').textContent] = f.querySelector('.meter-value').textContent;
    }
    return v;
  };

  for (const [marcas, rotulo] of [
    [ambas([]), 'sin marcar'],
    [ambas(['01']), 'con una marca'],
    [ambas(['01', '08', '15', '22']), 'con las cuatro'],
    [ambas(['01', '02', '03', '04']), 'con las cuatro juntas'],
  ]) {
    const v = await valores(marcas);
    ok(`${rotulo}, las dos dan lo mismo`, v.Correr === v.Caminar,
      `semanal=${v.Correr} · meta mensual=${v.Caminar}`);
  }

  // Y también cuando la vigencia las recorta.
  const tarde = [
    tarea('sem', 'Correr', 'weekly', { start: '2026-07-20' }),
    tarea('cnt', 'Caminar', 'custom', { customMode: 'count', target: 4, start: '2026-07-20' }),
  ];
  const v = await valores(ambas(['20']), tarde);
  ok('creadas el 20 y hechas una vez, también', v.Correr === v.Caminar,
    `semanal=${v.Correr} · meta mensual=${v.Caminar}`);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
