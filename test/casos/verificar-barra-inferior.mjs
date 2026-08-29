/* La barra de secciones del pie: cuatro entradas —Hábitos, Análisis, Pendientes
   y Ajustes—, siempre a la vista, con la ruta de cada sección.

   Es la navegación principal desde que «Análisis» dejó el encabezado y el cajón
   dejó de repetir las secciones. Por eso se comprueban las tres cosas juntas:
   que las cuatro estén, que cada una muestre lo suyo y que no queden restos de
   la navegación anterior.

   Arnés: hoy = jueves 30/07/2026. */
import { montar, leer } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

/* Las cuatro, en el orden en que se leen de izquierda a derecha: lo que se
   carga, lo que se lee de lo cargado, lo que todavía no está, y los ajustes.

   `titulo` es el de la pestaña del navegador, que no siempre repite el rótulo:
   la sección principal se llama como la app, y «Hábitos · Hábitos» sería decir
   el nombre dos veces. */
const TABS = [
  { page: 'home', ruta: 'diario', texto: 'Hábitos', titulo: 'Hábitos', seccion: '#board' },
  { page: 'indicators', ruta: 'analisis', texto: 'Análisis', seccion: '#analysis' },
  { page: 'todos', ruta: 'pendientes', texto: 'Pendientes', seccion: '#todos' },
  { page: 'settings', ruta: 'ajustes', texto: 'Ajustes', seccion: '#settings' },
];

// --- 1. las cuatro entradas -------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const tabs = [...doc.querySelectorAll('#tabbar .tab')];

  ok('son cuatro', tabs.length === 4, String(tabs.length));
  ok('en orden', tabs.map(t => t.dataset.page).join(' · ')
    === TABS.map(t => t.page).join(' · '), tabs.map(t => t.dataset.page).join(' · '));
  ok('con sus rótulos', tabs.map(t => t.querySelector('.tab-text').textContent).join(' · ')
    === TABS.map(t => t.texto).join(' · '));

  /* Enlaces de verdad, no botones: ctrl/cmd + clic tiene que poder abrir la
     sección en otra pestaña, y para eso hace falta un `href` de verdad. Lo
     apunta `start()`, que es cuando se conoce la carpeta base. */
  ok('son enlaces con la ruta de cada sección',
    tabs.every((t, i) => t.tagName === 'A' && t.getAttribute('href') === `/${TABS[i].ruta}`),
    tabs.map(t => t.getAttribute('href')).join(' · '));

  /* Los glifos de tilde, cuaderno y torta no tienen cobertura pareja en las
     fuentes de sistema —el problema que ya había dado U+23FB en el cajón—, así
     que van dibujados. */
  ok('cada una lleva su ícono dibujado, no un glifo',
    tabs.every(t => t.querySelector('svg.tab-icon')));
  ok('y los íconos no los lee el lector de pantalla',
    tabs.every(t => t.querySelector('svg.tab-icon').getAttribute('aria-hidden') === 'true'));

  ok('la barra se nombra', doc.querySelector('#tabbar').getAttribute('aria-label') === 'Secciones');

  /* Última franja del armazón: hermana de `.app-main`, no hija, y lo último de
     todo. Lo que desplaza queda entre el encabezado y ella; en el medio está el
     botón de alta, que flota y no ocupa franja. */
  const barra = doc.querySelector('#tabbar');
  ok('vive en el armazón, después del contenido',
    barra.parentElement?.id === 'app-root' && barra.nextElementSibling === null,
    barra.parentElement?.id);
}

// --- 2. cada una lleva a lo suyo -------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);

  for (const destino of TABS) {
    doc.querySelector(`#tabbar [data-page="${destino.page}"]`).click();

    const visibles = TABS.filter(t => !doc.querySelector(t.seccion).hidden).map(t => t.page);
    ok(`${destino.texto}: muestra lo suyo y nada más`,
      visibles.join(',') === destino.page, visibles.join(',') || '(ninguna)');
    ok(`  la dirección queda en /${destino.ruta}`,
      window.location.pathname === `/${destino.ruta}`, window.location.pathname);
    ok('  y el título acompaña',
      doc.title === (destino.titulo ?? `${destino.texto} · Hábitos`), doc.title);

    const activas = [...doc.querySelectorAll('#tabbar .tab.is-active')];
    ok('  solo esa entrada queda marcada',
      activas.length === 1 && activas[0].dataset.page === destino.page,
      activas.map(t => t.dataset.page).join(',') || '(ninguna)');
    ok('  y se anuncia como la página actual',
      activas[0]?.getAttribute('aria-current') === 'page');

    // La barra no se va nunca: es el único camino de vuelta.
    ok('  la barra sigue a la vista', doc.querySelector('#tabbar').hidden === false);
  }
}

// --- 3. la guía sigue estando, aunque no tenga entrada propia --------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#drawer [data-page="help"]').click();

  ok('«Cómo usar» se abre desde el cajón', doc.querySelector('#help').hidden === false);
  ok('y ninguna entrada de la barra queda marcada',
    doc.querySelectorAll('#tabbar .tab.is-active').length === 0);
  ok('con la planilla y el análisis ocultos',
    doc.querySelector('#board').hidden === true
    && doc.querySelector('#analysis').hidden === true);
}

// --- 4. las secciones nuevas responden a su dirección ----------------------
{
  const { doc } = await montar(ESTADO_LLENO, { ruta: 'ajustes' });
  ok('abrir en /ajustes cae en Ajustes', doc.querySelector('#settings').hidden === false);
  ok('con la planilla guardada', doc.querySelector('#board').hidden === true);
  /* No hay período que elegir en Ajustes: la barra del mes entera se va, como
     en la guía. */
  ok('y sin la barra del mes', doc.querySelector('.controls').hidden === true);
}
{
  const { doc } = await montar(ESTADO_LLENO, { ruta: 'pendientes' });
  ok('abrir en /pendientes cae en Pendientes', doc.querySelector('#todos').hidden === false);
  ok('con la planilla guardada', doc.querySelector('#board').hidden === true);
}
{
  const { doc } = await montar(ESTADO_LLENO, { ruta: 'inventada' });
  ok('una ruta que no existe sigue cayendo en Hábitos',
    doc.querySelector('#board').hidden === false);
}

// --- 5. Ajustes: la sesión y el plan --------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO, { ruta: 'ajustes' });

  /* El arnés no carga `auth.js` —importa un módulo por CDN—, así que los datos
     de la sesión llegan vacíos. Lo que se comprueba acá es que el lugar donde
     los escribe siga existiendo con esos ids: si se renombran, auth.js escribe
     en la nada y nadie se entera. */
  for (const id of ['settings-session', 'session-user', 'session-since', 'btn-sign-out']) {
    ok(`  Ajustes tiene #${id}`, Boolean(doc.querySelector(`#${id}`)));
  }
  ok('cerrar sesión es un botón, no un enlace',
    doc.querySelector('#btn-sign-out').tagName === 'BUTTON');
  ok('el plan tiene su tarjeta', Boolean(doc.querySelector('#plan-name')));

  // Y no quedó una segunda copia en el cajón.
  ok('la sesión ya no está en el cajón',
    doc.querySelector('#drawer #btn-sign-out') === null
    && doc.querySelector('#drawer-session') === null);
}

// --- 6. el cajón dejó de repetir las secciones ----------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const enCajon = [...doc.querySelectorAll('#drawer [data-page]')].map(i => i.dataset.page);
  ok('en el cajón solo queda la guía', enCajon.join(',') === 'help', enCajon.join(',') || '(ninguna)');
}

// --- 7. la franja, leída de la hoja ---------------------------------------
{
  /* jsdom no apila ni mide, así que esto se lee del CSS. */
  const css = leer('styles.css');
  const bloque = re => css.match(re)?.[0] ?? '';
  const z = regla => Number(regla.match(/z-index:\s*(\d+)/)?.[1]);

  const barra = bloque(/\n\.tabbar \{[\s\S]*?\n\}/);

  /* Franja del armazón y no `position: fixed`: así no tapa el final del
     contenido ni hay que reservarle lugar con padding en cada sección. */
  ok('es una franja del armazón', /flex:\s*none/.test(barra));
  ok('y no flota sobre el contenido', !/position:\s*fixed/.test(barra));

  /* El pie del teléfono tiene el indicador de inicio encima: sin esto los
     rótulos quedan debajo de la barra del sistema. */
  ok('respeta el área segura del teléfono',
    /padding-bottom:\s*calc\([^)]*env\(safe-area-inset-bottom/.test(barra), barra.match(/padding-bottom:[^;]*;/)?.[0]);

  const cabecera = bloque(/\n\.app-header \{[\s\S]*?\n\}/);
  const velo = bloque(/\n\.drawer-backdrop \{[\s\S]*?\n\}/);
  console.log(`  z-index → encabezado ${z(cabecera)} · barra ${z(barra)} · velo ${z(velo)}`);
  ok('se apila como el encabezado', z(barra) === z(cabecera));
  ok('y el velo del cajón también la atenúa', z(barra) < z(velo));

  /* El aviso flotante es fijo contra la ventana, así que la franja del armazón
     no lo empuja: si no se lo subiera a mano, cada «tarea agregada» saldría
     detrás de la barra. */
  const aviso = bloque(/\n\.toast \{[\s\S]*?\n\}/);
  ok('el aviso flotante pasa por encima de la barra',
    /bottom:\s*calc\([^;]*var\(--tabbar-h\)/.test(aviso), aviso.match(/bottom:[^;]*;/)?.[0]);

  const impresion = bloque(/@media print \{[\s\S]*?\n\}\n/);
  ok('en papel no se imprime', /\.tabbar/.test(impresion));

  /* Las secciones nuevas desplazan por dentro, como el análisis y la guía: el
     armazón no desplaza. */
  const scroll = bloque(/\n\.analysis, \.help, \.todos, \.settings \{[^}]*\}/);
  ok('Pendientes y Ajustes desplazan por dentro',
    /overflow-y:\s*auto/.test(scroll) && /min-height:\s*0/.test(scroll), scroll.trim());
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
