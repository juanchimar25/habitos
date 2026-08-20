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
  ok('con el chevron hacia abajo', !plegar.classList.contains('is-collapsed'), plegar.className);
  ok('que es un SVG y no un glifo', Boolean(plegar.querySelector('.chevron-icon')));
  ok('declara qué controla',
    plegar.getAttribute('aria-controls') === 'controls-center month-bar',
    plegar.getAttribute('aria-controls'));
}

// --- 2. plegar y desplegar --------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const plegar = doc.querySelector('#btn-collapse');

  plegar.click();
  ok('plegado: la clase queda en el body',
    doc.body.classList.contains('controls-collapsed'));
  ok('el chevron gira a la izquierda', plegar.classList.contains('is-collapsed'), plegar.className);
  ok('aria-expanded pasa a false', plegar.getAttribute('aria-expanded') === 'false');
  ok('el título dice cómo volver', /Mostrar/i.test(plegar.title), plegar.title);
  ok('queda guardado', guardado(window).controlsCollapsed === true);

  plegar.click();
  ok('desplegado: se va la clase', !doc.body.classList.contains('controls-collapsed'));
  ok('y vuelve a apuntar hacia abajo', !plegar.classList.contains('is-collapsed'));
  ok('y el guardado', guardado(window).controlsCollapsed === false);
}

// --- 3. se recupera de lo guardado -----------------------------------------
{
  const { doc } = await montar({ ...ESTADO_LLENO, controlsCollapsed: true });
  ok('rehidrata plegado', doc.body.classList.contains('controls-collapsed'));
  ok('con el chevron a la izquierda',
    doc.querySelector('#btn-collapse').classList.contains('is-collapsed'));
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

// --- 6. el CSS pliega las dos zonas, en cualquier ancho -------------------
{
  const css = leer('styles.css');
  const movil = [...css.matchAll(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/g)]
    .map(m => m[1]).find(b => b.includes('#btn-page-toggle')) ?? '';

  /* La barra tiene la misma disposición en todos los anchos, así que el plegado
     también: su regla vive en la base y no dentro de un `@media`. */
  const base = css.replace(/@media[\s\S]*?\n\}\n/g, '');
  for (const zona of ['#controls-center', '#month-bar']) {
    ok(`  pliega ${zona} en cualquier ancho`,
      base.includes(`body.controls-collapsed ${zona}`));
  }
  ok('el botón no se esconde por ancho', !/\.collapse-btn \{ display: none; \}/.test(css));
  /* El zoom sí sigue siendo de móvil: en escritorio la planilla entra. */
  ok('el zoom en cambio sí es solo de móvil',
    /\.zoom-group \{ display: none; \}/.test(base)
    && /\.zoom-group \{ display: flex; \}/.test(movil));
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

// --- el armazón de alto fijo ----------------------------------------------
{
  /* jsdom no desplaza ni apila, así que esto se lee de la hoja.

     Tres bandas quedan quietas —encabezado, controles y encabezado de la
     planilla— y lo que desplaza es la planilla por dentro. No lo hace `sticky`
     contra la ventana: lo hace el armazón, que le da a cada una su franja y
     deja el scroll adentro de `.table-wrap`. */
  const css = leer('styles.css');
  const bloque = re => css.match(re)?.[0] ?? '';
  const z = regla => Number(regla.match(/z-index:\s*(\d+)/)?.[1]);

  const cuerpo = bloque(/\nbody \{[\s\S]*?\n\}/);
  ok('la app ocupa la ventana y no desplaza',
    /overflow:\s*hidden/.test(cuerpo) && /height:\s*100dvh/.test(cuerpo));
  ok('con reserva en `vh` para quien no entienda `dvh`',
    /height:\s*100vh/.test(cuerpo));

  /* `min-height: 0` es lo que permite que un hijo con scroll se achique. Sin
     eso los hijos flex no bajan de su alto natural y el desborde reaparece. */
  for (const [nombre, re] of [['.app-main', /\n\.app-main \{[\s\S]*?\n\}/],
    ['.board', /\n\.board \{[\s\S]*?\n\}/], ['.table-wrap', /\n\.table-wrap \{[\s\S]*?\n\}/]]) {
    ok(`  ${nombre} puede achicarse`, /min-height:\s*0/.test(bloque(re)));
  }

  const envoltorio = bloque(/\n\.table-wrap \{[\s\S]*?\n\}/);
  ok('la planilla es la que desplaza', /overflow:\s*auto/.test(envoltorio));

  const encabezadoTabla = bloque(/\n\.grid thead th \{[\s\S]*?\n\}/);
  ok('su encabezado se pega al borde del contenedor',
    /position:\s*sticky/.test(encabezadoTabla));
  /* Un píxel POR ENCIMA del borde y no pegado a él: el contenedor no siempre
     cae en una posición entera, y por esa costura de subpíxel asomaban las
     filas al desplazar. El fondo estirado la tapa. */
  ok('estirado un píxel hacia arriba, para tapar la costura de subpíxel',
    /top:\s*-1px/.test(encabezadoTabla), encabezadoTabla.match(/top:[^;]*;/)?.[0]);
  /* Tiene que superar al 2 de la columna de tareas del cuerpo, o los nombres se
     dibujarían por encima del encabezado al desplazar. */
  ok('y por encima de la columna de tareas',
    z(encabezadoTabla) > z(bloque(/\n\.grid \.col-task \{[\s\S]*?\n\}/)),
    `${z(encabezadoTabla)} vs ${z(bloque(/\n\.grid \.col-task \{[\s\S]*?\n\}/))}`);

  /* El apilado de la planilla queda encerrado en el tablero. Sin eso sus capas
     internas —el encabezado de días, las columnas fijas— salen a competir con
     las de la barra de controles, empatan en 4 y decide el orden del documento:
     como el tablero va después, el encabezado de la tabla tapaba los
     desplegables que cuelgan de la barra. */
  const tablero = bloque(/\n\.board \{[\s\S]*?\n\}/);
  ok('el tablero encierra su apilado', /isolation:\s*isolate/.test(tablero));
  ok('y el encabezado de la tabla ya no compite con la barra',
    z(bloque(/\n\.controls \{[\s\S]*?\n\}/)) >= z(encabezadoTabla),
    `barra ${z(bloque(/\n\.controls \{[\s\S]*?\n\}/))} vs tabla ${z(encabezadoTabla)}`);

  /* En papel el armazón sobra: la planilla tiene que ocupar las hojas que haga
     falta en vez de recortarse a lo que entraba en una ventana. */
  const impresion = bloque(/@media print \{[\s\S]*?\n\}\n/);
  ok('en impresión se suelta el alto',
    /overflow:\s*visible/.test(impresion) && /max-height:\s*none/.test(impresion));

  const cabecera = bloque(/\n\.app-header \{[\s\S]*?\n\}/);

  /* Lo sutil: tiene que quedar por encima del contenido pero por DEBAJO del
     velo del menú lateral. Si se le subiera el z-index, al abrir el menú el
     encabezado quedaría flotando sobre el velo, iluminado y clickeable. */
  const velo = bloque(/\n\.drawer-backdrop \{[\s\S]*?\n\}/);
  const cajon = bloque(/\n\.drawer \{[\s\S]*?\n\}/);
  console.log(`  z-index → encabezado ${z(cabecera)} · velo ${z(velo)} · cajón ${z(cajon)}`);
  ok('por encima del contenido', z(cabecera) > 0);
  ok('y por debajo del velo del menú', z(cabecera) < z(velo),
    `${z(cabecera)} vs ${z(velo)}`);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
