/* Lo que cada pantalla recuerda de cómo se la dejó mirando.
   ---------------------------------------------------------------------------
   Análisis abre en el gráfico que se estaba viendo, con su período y su orden;
   Pendientes, en la vista y el orden que se eligieron. Es por APARATO y no por
   usuario —vive en `tareas-diarias/prefs`, como el tema—: la pantalla de la
   compu y la del teléfono no son la misma, así que elegir «Barras» en una no
   tiene por qué cambiar lo que abre la otra.

   Lo que se lee de ahí es texto que alguien pudo editar a mano, y una versión
   anterior pudo guardar un gráfico que ya no existe: por eso la mitad de abajo
   comprueba que lo que no se reconoce se ignore en vez de romper la pantalla.

   Hoy es jueves 30 de julio de 2026 (reloj del arnés). */
import { montar } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const CLAVE = 'tareas-diarias/prefs';
const guardadas = w => JSON.parse(w.localStorage.getItem(CLAVE) ?? 'null');

/** Qué gráfico quedó marcado como activo en el cajón. */
const graficoActivo = doc => ['puntos', 'porcentajes', 'barras']
  .find(c => doc.querySelector(`#btn-chart-${c}`)?.classList.contains('is-active'))
  ?? '(ninguno)';

/** Qué vista de Pendientes quedó marcada. */
const vistaActiva = doc => [...doc.querySelectorAll('.pend-vista')]
  .find(b => b.getAttribute('aria-pressed') === 'true')?.dataset.vista ?? '(ninguna)';

const abrirAnalisis = doc => doc.querySelector('[data-page="indicators"]').click();
const abrirPendientes = doc => doc.querySelector('[data-page="todos"]').click();

// --- 1. sin nada guardado, los valores de siempre --------------------------
{
  const { doc, window } = await montar(ESTADO_LLENO);

  ok('no se escribe nada hasta que se elige algo', guardadas(window) === null);

  abrirAnalisis(doc);
  ok('Análisis abre en «Puntos»', graficoActivo(doc) === 'puntos', graficoActivo(doc));

  abrirPendientes(doc);
  ok('Pendientes abre en la lista', vistaActiva(doc) === 'lista', vistaActiva(doc));
}

// --- 2. elegir algo lo deja anotado ----------------------------------------
{
  const { doc, window } = await montar(ESTADO_LLENO);

  abrirAnalisis(doc);
  doc.querySelector('#btn-chart-barras').click();
  ok('el gráfico elegido se guarda', guardadas(window)?.chart === 'barras',
    String(guardadas(window)?.chart));

  doc.querySelector('#btn-orden').click();
  doc.querySelector('.orden-opcion[data-orden="desc"]').click();
  ok('  y el orden también', guardadas(window)?.orden === 'desc',
    String(guardadas(window)?.orden));

  abrirPendientes(doc);
  doc.querySelector('.pend-vista[data-vista="calendario"]').click();
  ok('la vista de Pendientes se guarda',
    guardadas(window)?.vistaPendientes === 'calendario',
    String(guardadas(window)?.vistaPendientes));

  /* El aviso del recordatorio vive en el mismo archivo y lo escribe otra
     función: guardar una vista no puede pisárselo. */
  ok('  sin perder lo que ya había en el archivo',
    guardadas(window)?.recordatorioOfrecido === false,
    JSON.stringify(guardadas(window)?.recordatorioOfrecido));
}

// --- 3. y al volver a entrar, ahí está -------------------------------------
{
  const prefs = {
    chart: 'porcentajes', rango: '6m', orden: 'asc',
    vistaPendientes: 'calendario', agrupacion: 'categoria', ordenPend: 'alfabetico',
  };
  const { doc } = await montar(ESTADO_LLENO, { prefs });

  abrirAnalisis(doc);
  ok('Análisis abre en el gráfico que se dejó',
    graficoActivo(doc) === 'porcentajes', graficoActivo(doc));

  abrirPendientes(doc);
  ok('Pendientes abre en la vista que se dejó',
    vistaActiva(doc) === 'calendario', vistaActiva(doc));

  /* El orden no tiene un botón que quede marcado: se lee de lo que el diálogo
     muestra elegido cuando se lo abre. */
  doc.querySelector('#btn-pend-orden').click();
  const marcada = doc.querySelector('#pend-orden-dialog [data-orden][aria-pressed="true"]');
  ok('  con el orden de la lista puesto', marcada?.dataset.orden === 'alfabetico',
    String(marcada?.dataset.orden));
}

// --- 4. «Barras» recuerda su período ---------------------------------------
{
  /* El período es de «Barras» y de nadie más, así que se recuerda junto con
     él: volver a Análisis y tener que volver a pedir «últimos 6 meses» es
     justo lo que esto evita. */
  const { doc } = await montar(ESTADO_LLENO, { prefs: { chart: 'barras', rango: '6m' } });
  abrirAnalisis(doc);

  ok('abre en «Barras»', graficoActivo(doc) === 'barras', graficoActivo(doc));
  const rotulo = doc.querySelector('#month-label').textContent;
  ok('  con el período de seis meses puesto', /feb.*jul/i.test(rotulo), rotulo);
}

// --- 5. lo que no se reconoce se ignora ------------------------------------
{
  /* Un archivo editado a mano, o escrito por una versión que tenía otro
     gráfico. Cada campo se valida contra sus valores: el que no pasa se cae y
     el campo se queda con el suyo, sin arrastrar a los demás. */
  const { doc } = await montar(ESTADO_LLENO, {
    prefs: {
      chart: 'tarta',                 // no existe
      orden: 'desc',                  // sí
      vistaPendientes: 'mosaico',     // no existe
      ordenPend: 'alfabetico',        // sí
    },
  });

  abrirAnalisis(doc);
  ok('un gráfico desconocido cae en el de siempre',
    graficoActivo(doc) === 'puntos', graficoActivo(doc));

  abrirPendientes(doc);
  ok('  y una vista desconocida, también', vistaActiva(doc) === 'lista', vistaActiva(doc));

  doc.querySelector('#btn-pend-orden').click();
  const marcada = doc.querySelector('#pend-orden-dialog [data-orden][aria-pressed="true"]');
  ok('  pero lo válido del mismo archivo se respeta',
    marcada?.dataset.orden === 'alfabetico', String(marcada?.dataset.orden));
}

// --- 6. un archivo roto no rompe la pantalla -------------------------------
{
  /* La basura entra COMO CADENA, que es como estaría en el navegador: pasarla
     como objeto la serializaría y dejaría de ser ilegible, y la prueba no
     probaría nada. */
  for (const [basura, rotulo] of [
    ['no es json', 'texto que no es JSON'],
    ['null', 'un null'],
    ['[1,2,3]', 'una lista en vez de un diccionario'],
    ['"hola"', 'una cadena suelta'],
    ['{"chart":{"raro":1},"orden":42}', 'campos con el tipo equivocado'],
  ]) {
    const { doc } = await montar(ESTADO_LLENO, { prefs: basura });
    abrirAnalisis(doc);
    ok(`con ${rotulo}, Análisis abre igual`, graficoActivo(doc) === 'puntos',
      graficoActivo(doc));

    abrirPendientes(doc);
    ok('  y Pendientes también', vistaActiva(doc) === 'lista', vistaActiva(doc));
  }
}

// --- 7. las vistas no viajan a la base -------------------------------------
{
  /* Son de pantalla y de ESTE aparato, como el tema: no entran en el payload
     ni en el archivo que exporta la app. Si se colaran, elegir «Barras» en la
     compu cambiaría lo que abre el teléfono — y subiría el diario entero para
     hacerlo. */
  const { doc, window } = await montar(ESTADO_LLENO);
  abrirAnalisis(doc);
  doc.querySelector('#btn-chart-barras').click();

  const DE_PANTALLA = new Set([
    'chart', 'rango', 'orden', 'vistaPendientes', 'agrupacion', 'ordenPend',
  ]);
  const estado = JSON.parse(window.localStorage.getItem('tareas-diarias/v1/u-test'));
  const colados = Object.keys(estado).filter(k => DE_PANTALLA.has(k));
  ok('ninguna vista se coló en el estado del usuario', colados.length === 0,
    colados.join(', ') || '(ninguna)');
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
