/* «Análisis» se mudó al encabezado y su lugar junto al mes lo ocupa el
   plegado de los controles del período. */
import { montar, leer } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};
const guardado = w => JSON.parse(w.localStorage.getItem('tareas-diarias/v1/u-test'));

// --- 1. ubicaciones ---------------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const toggle = doc.querySelector('#btn-page-toggle');
  const plegar = doc.querySelector('#btn-collapse');

  ok('«Análisis» está en el encabezado',
    toggle?.parentElement?.classList.contains('header-actions'), toggle?.parentElement?.className);
  ok('y ya no en la línea del mes', toggle?.closest('.month-nav') === null);

  const enMes = [...doc.querySelectorAll('.month-nav > button')].map(b => b.id);
  console.log('  línea del mes:', enMes.join(' · '));
  ok('el plegado ocupa su lugar', enMes.at(-1) === 'btn-collapse', enMes.at(-1));
  ok('el encabezado queda con Análisis y tema',
    [...doc.querySelectorAll('.header-actions > button')].map(b => b.id).join(',')
      === 'btn-page-toggle,btn-theme');

  ok('arranca desplegado', plegar.getAttribute('aria-expanded') === 'true');
  ok('con el glifo de ocultar', plegar.textContent.trim() === '–', JSON.stringify(plegar.textContent.trim()));
  ok('declara qué controla',
    plegar.getAttribute('aria-controls') === 'controls-center range-nav month-bar',
    plegar.getAttribute('aria-controls'));
}

// --- 2. plegar y desplegar --------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const plegar = doc.querySelector('#btn-collapse');

  plegar.click();
  ok('plegado: la clase queda en el body',
    doc.body.classList.contains('controls-collapsed'));
  ok('el glifo pasa a +', plegar.textContent.trim() === '+');
  ok('aria-expanded pasa a false', plegar.getAttribute('aria-expanded') === 'false');
  ok('el título dice cómo volver', /Mostrar/i.test(plegar.title), plegar.title);
  ok('queda guardado', guardado(window).controlsCollapsed === true);

  plegar.click();
  ok('desplegado: se va la clase', !doc.body.classList.contains('controls-collapsed'));
  ok('y vuelve el glifo', plegar.textContent.trim() === '–');
  ok('y el guardado', guardado(window).controlsCollapsed === false);
}

// --- 3. se recupera de lo guardado -----------------------------------------
{
  const { doc } = await montar({ ...ESTADO_LLENO, controlsCollapsed: true });
  ok('rehidrata plegado', doc.body.classList.contains('controls-collapsed'));
  ok('con el glifo correcto', doc.querySelector('#btn-collapse').textContent.trim() === '+');
}
{
  const { doc } = await montar({ ...ESTADO_LLENO, controlsCollapsed: 'sí' });
  ok('un valor que no es booleano cae en desplegado',
    !doc.body.classList.contains('controls-collapsed'));
}

// --- 4. el botón solo aparece donde hay algo que plegar --------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  ok('en la planilla se ve', doc.querySelector('#btn-collapse').hidden === false);

  doc.querySelector('[data-page="indicators"]').click();
  ok('en Análisis se oculta', doc.querySelector('#btn-collapse').hidden === true);
  ok('pero «Análisis» sigue disponible para volver',
    doc.querySelector('#btn-page-toggle').hidden === false);

  doc.querySelector('[data-page="help"]').click();
  ok('en la guía se ocultan los dos',
    doc.querySelector('#btn-collapse').hidden === true
    && doc.querySelector('#btn-page-toggle').hidden === true);
}

// --- 5. plegado, la planilla sigue en pie ----------------------------------
{
  const { doc } = await montar({ ...ESTADO_LLENO, controlsCollapsed: true });
  ok('la planilla se sigue viendo', doc.querySelector('#board').hidden === false);
  ok('y la línea del mes también', doc.querySelector('.controls').hidden === false);
  ok('con filas de tareas', doc.querySelectorAll('#grid tbody tr[data-task-id]').length > 0);
}

// --- 6. el CSS pliega las tres zonas, y solo en móvil ----------------------
{
  const css = leer('styles.css');
  const movil = [...css.matchAll(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/g)]
    .map(m => m[1]).find(b => b.includes('controls-collapsed')) ?? '';

  ok('la regla de plegado vive en el bloque móvil', movil !== '');
  for (const zona of ['#controls-center', '#range-nav', '#month-bar']) {
    ok(`  pliega ${zona}`, movil.includes(`body.controls-collapsed ${zona}`));
  }
  ok('el botón no existe fuera de móvil',
    /\.collapse-btn \{ display: none; \}|\.zoom-btn,\s*\n\.collapse-btn \{ display: none; \}/.test(css));
  ok('y aparece dentro del bloque móvil', /\.collapse-btn \{ display: grid; \}/.test(movil));
  ok('«Análisis» pierde el rótulo en móvil',
    /#btn-page-toggle \.nav-text \{ display: none; \}/.test(movil));

  // --- mismo recuadro que el cambio de tema ---------------------------------
  ok('no es un botón fantasma', !/id="btn-page-toggle" class="[^"]*btn-ghost/.test(
    leer('index.html')));

  const props = s => Object.fromEntries(
    [...s.matchAll(/([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  const iconBtn = props(css.match(/^\.icon-btn \{([\s\S]*?)\n\}/m)?.[1] ?? '');
  const toggle = props(movil.match(/#btn-page-toggle \{([\s\S]*?)\n  \}/)?.[1] ?? '');

  const distintas = Object.keys(iconBtn).filter(k => iconBtn[k] !== toggle[k]);
  ok('en móvil toma la geometría exacta de .icon-btn',
    Object.keys(iconBtn).length > 0 && distintas.length === 0,
    distintas.length ? `difieren: ${distintas.join(', ')}`
      : `${Object.keys(iconBtn).length} propiedades iguales`);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
