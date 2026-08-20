/* El selector de vista: un botón con la vista activa, su desplegable, y las
   flechas que lo abrazan. Arnés: hoy = jueves 30/07/2026, vista semanal. */
import { montar, leer } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const texto = doc => doc.querySelector('#view-text').textContent;
const mes = doc => doc.querySelector('#month-label').textContent;

/* Qué ventana está a la vista. La barra ya no tiene rótulo de rango, así que se
   lee de los números de las columnas, que es la fuente real. */
const rango = doc =>
  [...doc.querySelectorAll('#grid thead .col-day .dnum')].map(n => n.textContent).join(' ');
const abierto = doc => !doc.querySelector('#view-options').hidden;
const opciones = doc => [...doc.querySelectorAll('#view-options .view-opt')];

// --- 1. el botón dice la vista activa y arranca cerrado --------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  ok('muestra la vista activa', texto(doc) === 'Semanal', texto(doc));
  ok('arranca cerrado', !abierto(doc));
  ok('y lo declara', doc.querySelector('#btn-view').getAttribute('aria-expanded') === 'false');
}

// --- 2. abre y cierra con el propio botón ----------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const btn = doc.querySelector('#btn-view');

  btn.click();
  ok('el clic lo abre', abierto(doc));
  ok('y lo declara', btn.getAttribute('aria-expanded') === 'true');

  btn.click();
  ok('otro clic lo cierra', !abierto(doc));
  ok('y vuelve a declararlo', btn.getAttribute('aria-expanded') === 'false');
}

// --- 3. qué hay adentro -----------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();

  const rotulos = opciones(doc).map(o => o.textContent);
  console.log('  opciones:', rotulos.join(' · '));
  ok('las tres vistas y un solo salto',
    rotulos.join(',') === 'Diario,Semanal,Mensual,Ir a…', rotulos.join(','));

  /* Debajo del separador va el salto, que no es una vista: sin `data-view`,
     como `menuitem` y no como `menuitemradio`, y no deja nada marcado. */
  const dia = doc.querySelector('#btn-pick-day');
  ok('el salto no es una vista', !dia.dataset.view);
  ok('y no es un radio', dia.getAttribute('role') === 'menuitem');
  ok('va detrás de un separador',
    dia.previousElementSibling?.getAttribute('role') === 'separator');
  ok('«Ir a…» anuncia que abre un diálogo',
    dia.getAttribute('aria-haspopup') === 'dialog');

  const marcadas = opciones(doc).filter(o => o.getAttribute('aria-checked') === 'true');
  ok('solo la vista activa queda marcada',
    marcadas.length === 1 && marcadas[0].dataset.view === 'week',
    marcadas.map(o => o.dataset.view).join(','));
  ok('y se pinta', marcadas[0].classList.contains('is-active'));
}

// --- 4. elegir una vista la aplica y cierra --------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('.view-opt[data-view="month"]').click();

  ok('cambia la vista', texto(doc) === 'Mensual', texto(doc));
  ok('cierra el desplegable', !abierto(doc));
  ok('la planilla la sigue', doc.querySelector('#grid').classList.contains('view-month'),
    doc.querySelector('#grid').className);
  ok('devuelve el foco al botón', doc.activeElement?.id === 'btn-view', doc.activeElement?.id);
}

// --- 5. Esc y el clic afuera lo cierran ------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Esc lo cierra', !abierto(doc));
  ok('y recupera el foco', doc.activeElement?.id === 'btn-view', doc.activeElement?.id);
}
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.body.click();
  ok('el clic afuera lo cierra', !abierto(doc));
}
{
  /* Con el menú abierto los atajos quedan en suspenso: mover el período por
     detrás del desplegable es desconcertante. */
  const { window, doc } = await montar(ESTADO_LLENO);
  const antes = rango(doc);
  doc.querySelector('#btn-view').click();
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  ok('las teclas no mueven el período por detrás', rango(doc) === antes,
    `${antes} → ${rango(doc)}`);
}

// --- 6. «Hoy», dentro del calendario, salta y no toca la vista ------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('.view-opt[data-view="day"]').click();
  doc.querySelector('#prev-range').click();
  doc.querySelector('#prev-range').click();
  const lejos = rango(doc);

  doc.querySelector('#btn-view').click();
  doc.querySelector('#btn-pick-day').click();
  doc.querySelector('#jump-today').click();

  ok('cierra el calendario', !doc.querySelector('#jump-dialog').hasAttribute('open'));
  ok('vuelve a hoy', /30/.test(rango(doc)), `${lejos} → ${rango(doc)}`);
  ok('sin cambiar la vista', texto(doc) === 'Diario', texto(doc));
}
{
  /* También sirve en el calendario de meses: `goToToday` fija mes y ventana de
     una, así que el mismo botón cubre los dos modos del diálogo. */
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#month-label').click();
  doc.querySelector('#jump-prev').click();          // 2025
  doc.querySelector('#jump-today').click();
  ok('y también desde el calendario de meses',
    /julio 2026/i.test(mes(doc)), mes(doc));
}

// --- 6b. «Ir a…» abre el calendario y cierra el menú ----------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('#btn-pick-day').click();

  ok('abre el calendario de días',
    doc.querySelector('#jump-dialog').hasAttribute('open')
    && doc.querySelector('#jump-title').textContent === 'Seleccionar día',
    doc.querySelector('#jump-title').textContent);
  /* Si el desplegable quedara abierto por detrás, reaparecería al cerrar el
     diálogo sobre una pantalla en la que ya nadie lo pidió. */
  ok('y cierra el desplegable detrás', !abierto(doc));
}

// --- 7. las flechas mueven la ventana de la vista activa -------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('.view-opt[data-view="day"]').click();
  const antes = rango(doc);
  doc.querySelector('#prev-range').click();
  ok('en diaria mueve un día', rango(doc) !== antes && /29/.test(rango(doc)),
    `${antes} → ${rango(doc)}`);
  ok('y se nombra por eso',
    doc.querySelector('#prev-range').title === 'Ir al día anterior',
    doc.querySelector('#prev-range').title);
}
{
  const { doc } = await montar(ESTADO_LLENO);
  ok('en semanal se nombra por la semana',
    doc.querySelector('#next-range').title === 'Ir a la semana siguiente',
    doc.querySelector('#next-range').title);
}
{
  /* En la mensual el mes entero es UNA ventana: no hay tramo que correr, así
     que las flechas pasan a mover de mes. Es lo que las vuelve el único paso a
     paso de la barra, ahora que la línea del mes no tiene flechas propias. */
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('.view-opt[data-view="month"]').click();

  ok('se nombra por el mes',
    doc.querySelector('#next-range').title === 'Ir al mes siguiente',
    doc.querySelector('#next-range').title);

  doc.querySelector('#next-range').click();
  ok('y mueve de mes', /agosto 2026/i.test(mes(doc)), mes(doc));
  doc.querySelector('#prev-range').click();
  ok('para los dos lados', /julio 2026/i.test(mes(doc)), mes(doc));
}

// --- 8. el desplegable es el mismo en las tres vistas ---------------------
{
  /* Nada se apaga al cambiar de vista: un menú que muda de opciones según dónde
     estés obliga a recordar cuáles hay en cada una. */
  const esperado = 'Diario,Semanal,Mensual,Ir a…';
  for (const vista of ['day', 'week', 'month']) {
    const { doc } = await montar(ESTADO_LLENO);
    doc.querySelector('#btn-view').click();
    doc.querySelector(`.view-opt[data-view="${vista}"]`).click();
    doc.querySelector('#btn-view').click();

    const visibles = opciones(doc).filter(o => !o.hidden).map(o => o.textContent);
    ok(`  ${vista}: las mismas cuatro opciones`, visibles.join(',') === esperado,
      visibles.join(','));
  }
}
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('.view-opt[data-view="month"]').click();

  ok('en la mensual las flechas quedan',
    doc.querySelector('#prev-range').hidden === false
    && doc.querySelector('#next-range').hidden === false);
  ok('y el selector de vista también', doc.querySelector('#btn-view').hidden === false);

  /* Elegir un día desde la mensual lleva a SU mes: la ventana es el mes entero,
     así que el salto sigue teniendo sentido. Es lo que hacía que apagarlo fuera
     gratuito. */
  doc.querySelector('#btn-view').click();
  doc.querySelector('#btn-pick-day').click();
  doc.querySelector('#jump-next').click();                    // agosto
  [...doc.querySelectorAll('#jump-grid .jump-cell')].find(c => c.textContent === '12').click();
  ok('y elegir un día lleva a su mes', /agosto 2026/i.test(mes(doc)), mes(doc));
  ok('sin salir de la vista mensual', texto(doc) === 'Mensual', texto(doc));
}

// --- 9. el desplegable de opciones del mes --------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const barra = doc.querySelector('#month-bar');
  ok('la barra del mes es un solo botón',
    barra.querySelectorAll('button').length === 1
    || barra.querySelector('#btn-actions') !== null);

  doc.querySelector('#btn-actions').click();
  const dentro = [...doc.querySelectorAll('#actions-options .view-opt')].map(b => b.id);
  console.log('  opciones:', dentro.join(' · '));
  ok('las cinco opciones viven adentro',
    ['btn-add-task', 'btn-copy-prev', 'btn-mode-delete', 'btn-mode-reset',
      'btn-mode-reorder', 'btn-zoom']
      .every(id => dentro.includes(id)), dentro.join(','));
  ok('y el bloqueo de período ya no existe', !dentro.includes('btn-lock'));

  const titulos = [...doc.querySelectorAll('#actions-options .opt-group-title')]
    .map(t => t.textContent);
  ok('agrupadas en dos apartados',
    titulos.join(',') === 'Tareas,Visualización', titulos.join(','));
  ok('cada apartado es un group con su rótulo',
    [...doc.querySelectorAll('#actions-options [role="group"]')]
      .every(g => doc.getElementById(g.getAttribute('aria-labelledby'))));
}

// --- 10. los dos desplegables no se pisan ---------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const acciones = () => !doc.querySelector('#actions-options').hidden;

  doc.querySelector('#btn-view').click();
  ok('abre el de vista', abierto(doc) && !acciones());

  doc.querySelector('#btn-actions').click();
  ok('abrir el de opciones cierra el otro', acciones() && !abierto(doc));

  doc.querySelector('#btn-view').click();
  ok('y al revés también', abierto(doc) && !acciones());
}

// --- 11. qué cierra el menú y qué no --------------------------------------
{
  /* El zoom cicla tres niveles: cerrarlo obligaría a desplegar de nuevo por
     cada paso. El resto abre un diálogo, así que se cierra. */
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-actions').click();
  const antes = doc.querySelector('#zoom-text').textContent;
  doc.querySelector('#btn-zoom').click();

  ok('el zoom deja el menú abierto', !doc.querySelector('#actions-options').hidden);
  ok('y cicla igual', doc.querySelector('#zoom-text').textContent !== antes,
    `${antes} → ${doc.querySelector('#zoom-text').textContent}`);
}
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-actions').click();
  doc.querySelector('#btn-add-task').click();
  ok('el alta cierra el menú', doc.querySelector('#actions-options').hidden === true);
  ok('y abre su diálogo', doc.querySelector('#task-dialog').hasAttribute('open'));
}
// --- 11b. las dos posturas de la fila -------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const abrir = () => doc.querySelector('#btn-actions').click();
  const filas = () => doc.querySelectorAll('#grid tbody tr[data-task-id]').length;

  ok('en reposo las filas van limpias',
    doc.querySelectorAll('.task-pick').length === 0
    && doc.querySelectorAll('.move-stack').length === 0);
  ok('y hay tareas que mostrar', filas() > 0);

  abrir();
  doc.querySelector('#btn-mode-delete').click();
  ok('«Eliminar tareas» saca los casilleros',
    doc.querySelectorAll('.task-pick[data-task-id]').length === filas());
  ok('incluido el de «todas»', Boolean(doc.querySelector('[data-pick-all]')));
  ok('sin chevrones', doc.querySelectorAll('.move-stack').length === 0);
  ok('y queda marcada en el menú',
    doc.querySelector('#btn-mode-delete').getAttribute('aria-checked') === 'true');

  abrir();
  doc.querySelector('#btn-mode-reorder').click();
  ok('«Reordenar tareas» cambia a los chevrones',
    doc.querySelectorAll('.move-stack').length === filas());
  ok('y se lleva los casilleros', doc.querySelectorAll('.task-pick').length === 0);
  ok('la otra se destilda sola',
    doc.querySelector('#btn-mode-delete').getAttribute('aria-checked') === 'false');

  abrir();
  doc.querySelector('#btn-mode-reorder').click();
  ok('volver a elegirla vuelve a las filas limpias',
    doc.querySelectorAll('.move-stack').length === 0
    && doc.querySelector('#btn-mode-reorder').getAttribute('aria-checked') === 'false');
}
{
  /* Eliminar y resetear comparten los casilleros; lo que cambia es qué se
     ofrece hacer con lo tildado. Cada confirmación aparece solo con SU postura:
     ofrecer las dos sobre el mismo tildado invita a apretar la que no era. */
  const { doc } = await montar(ESTADO_LLENO);
  const postura = modo => {
    doc.querySelector('#btn-actions').click();
    doc.querySelector(`#btn-mode-${modo}`).click();
  };
  const tildar = n =>
    [...doc.querySelectorAll('.task-pick[data-task-id]')].slice(0, n).forEach(c => c.click());

  const barra = () => doc.querySelector('#mode-confirm');
  const botonOk = () => doc.querySelector('#btn-mode-ok');

  ok('en reposo no hay barra de confirmación', barra().hidden === true);

  postura('delete');
  ok('la postura la hace aparecer', barra().hidden === false);
  ok('pero el ✓ arranca apagado', botonOk().disabled === true);
  ok('y dice qué falta', /Tildá las tareas/.test(botonOk().title), botonOk().title);

  tildar(2);
  ok('con dos tildadas el ✓ se habilita', botonOk().disabled === false);
  ok('y anuncia el alcance', /Eliminar 2 tareas/.test(botonOk().title), botonOk().title);

  postura('reset');
  ok('resetear también saca casilleros',
    doc.querySelectorAll('.task-pick[data-task-id]').length > 0);
  ok('y suelta lo que venía tildado', botonOk().disabled === true);

  tildar(3);
  ok('el ✓ ahora habla de resetear', /Resetear 3 tareas/.test(botonOk().title), botonOk().title);

  postura('reorder');
  ok('reordenar no tiene casilleros', doc.querySelectorAll('.task-pick').length === 0);
  ok('y su ✓ va habilitado sin tildar nada', botonOk().disabled === false);
}
// --- 11c. confirmar y cancelar cada postura -------------------------------
{
  /* Eliminar: el ✓ abre el diálogo, y nada se toca hasta aceptarlo. */
  const { window, doc } = await montar(ESTADO_LLENO);
  const filas = () => doc.querySelectorAll('#grid tbody tr[data-task-id]').length;
  const antes = filas();

  doc.querySelector('#btn-actions').click();
  doc.querySelector('#btn-mode-delete').click();
  [...doc.querySelectorAll('.task-pick[data-task-id]')].slice(0, 2).forEach(c => c.click());
  doc.querySelector('#btn-mode-ok').click();

  ok('el ✓ pide confirmación', doc.querySelector('#confirm-dialog').hasAttribute('open'));
  ok('y todavía no borró nada', filas() === antes, `${antes} → ${filas()}`);

  doc.querySelector('#confirm-ok').click();
  ok('al aceptar, borra', filas() === antes - 2, `${antes} → ${filas()}`);
  ok('y la postura se cierra sola', doc.querySelector('#mode-confirm').hidden === true);
  ok('sin dejar casilleros', doc.querySelectorAll('.task-pick').length === 0);
  void window;
}
{
  /* El ✕ sale sin tocar nada. */
  const { doc } = await montar(ESTADO_LLENO);
  const antes = doc.querySelectorAll('#grid tbody tr[data-task-id]').length;

  doc.querySelector('#btn-actions').click();
  doc.querySelector('#btn-mode-delete').click();
  [...doc.querySelectorAll('.task-pick[data-task-id]')].slice(0, 2).forEach(c => c.click());
  doc.querySelector('#btn-mode-cancel').click();

  ok('el ✕ cierra la postura', doc.querySelector('#mode-confirm').hidden === true);
  ok('sin borrar nada',
    doc.querySelectorAll('#grid tbody tr[data-task-id]').length === antes);
  ok('y sin abrir ningún diálogo',
    doc.querySelector('#confirm-dialog').hasAttribute('open') === false);
}
{
  /* Reordenar es el caso raro: los chevrones aplican en el acto, así que lo que
     lo vuelve cancelable es que ✕ devuelva el orden de partida. */
  const { doc } = await montar(ESTADO_LLENO);
  const orden = () => [...doc.querySelectorAll('#grid tbody tr[data-task-id]')]
    .map(tr => tr.dataset.taskId).join(',');
  const inicial = orden();

  doc.querySelector('#btn-actions').click();
  doc.querySelector('#btn-mode-reorder').click();
  doc.querySelector('[data-action="move-down"]:not(:disabled)').click();
  ok('el chevron mueve en el acto', orden() !== inicial, `${inicial} → ${orden()}`);

  doc.querySelector('#btn-mode-cancel').click();
  ok('y el ✕ devuelve el orden', orden() === inicial, orden());
}
{
  const { doc } = await montar(ESTADO_LLENO);
  const orden = () => [...doc.querySelectorAll('#grid tbody tr[data-task-id]')]
    .map(tr => tr.dataset.taskId).join(',');
  const inicial = orden();

  doc.querySelector('#btn-actions').click();
  doc.querySelector('#btn-mode-reorder').click();
  doc.querySelector('[data-action="move-down"]:not(:disabled)').click();
  const movido = orden();

  doc.querySelector('#btn-mode-ok').click();
  ok('reordenar también pide confirmación',
    doc.querySelector('#confirm-dialog').hasAttribute('open'));

  doc.querySelector('#confirm-ok').click();
  ok('al aceptar, el orden queda', orden() === movido && orden() !== inicial, orden());
  ok('y la postura se cierra', doc.querySelector('#mode-confirm').hidden === true);
}

// --- 12. la geometría de la barra, que jsdom no puede medir ---------------
{
  /* jsdom no hace layout, así que esto se comprueba sobre la hoja. Son las dos
     cosas que se rompieron al juntar las filas y que ningún test veía. */
  const css = leer('styles.css');

  const alturas = css.match(/\n\.controls \.btn,\n\.month-label \{([\s\S]*?)\n\}/)?.[1] ?? '';
  ok('los controles de la barra comparten un alto',
    /height:\s*var\(--ctl-h\)/.test(alturas), alturas.trim().replace(/\s+/g, ' ') || '(sin regla)');
  ok('y --ctl-h está declarada', /--ctl-h:\s*\d/.test(css));
  /* Sin esto el alto lo decide el padding de cada uno, que es de donde salían
     las cuatro alturas distintas en una misma fila. */
  ok('con el padding vertical anulado', /padding-block:\s*0/.test(alturas));

  /* Cada desplegable ancla del lado en que está su botón, en todos los anchos:
     la barra tiene una sola disposición. Anclados al revés se salen de la
     pantalla y aparecen cortados. */
  const base = css.replace(/@media[\s\S]*?\n\}\n/g, '');
  ok('el menú de opciones ancla a la derecha',
    /\.actions-options \{[^}]*right:\s*0/.test(base));
  /* El de opciones comparte la clase `.view-options`, cuya regla base lo centra
     con `left: 50%`. El ancla del de vista tiene que ser por ID: por clase le
     pisaría el `left: auto` al de opciones y ese menú saldría cortado. Es
     exactamente lo que pasó una vez. */
  const trasAncla = base.slice(base.indexOf('.actions-options {'));
  ok('y el de vista se acota por id, no por clase',
    /#view-options\s*\{[^}]*left:\s*0/.test(base) && !/\n\.view-options\s*\{/.test(trasAncla),
    trasAncla.match(/\n\.view-options\s*\{/) ? 'hay una regla por clase después' : 'por id');
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
