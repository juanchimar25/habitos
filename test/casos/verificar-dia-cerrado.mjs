/* Un día se cierra solo apenas termina.

   No hay botón de bloquear: el candado ya no es del mes ni se pone a mano.
   Cada día transcurrido deja de aceptar clics directos, y el que insista tiene
   que pasar por una confirmación. El permiso que da esa confirmación alcanza
   solo a ese día y solo hasta la medianoche siguiente, que es lo que vuelve a
   cerrar todo —incluido el día que acaba de terminar— sin recargar la página.

   `AHORA` es el jueves 30 de julio de 2026 a las 10:00. */
import { montar, AHORA } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const guardado = w => JSON.parse(w.localStorage.getItem('tareas-diarias/v1/u-test'));
const celda = (doc, fecha, tarea = 't1') =>
  doc.querySelector(`.cell[data-task-id="${tarea}"][data-date="${fecha}"]`);
const dialogo = doc => doc.querySelector('#confirm-dialog');
const abierto = doc => dialogo(doc).hasAttribute('open');

/** Pone la planilla en vista mensual, que es la que muestra el mes entero. */
async function planilla() {
  const r = await montar(ESTADO_LLENO);
  r.doc.querySelector('#btn-view').click();
  r.doc.querySelector('.view-opt[data-view="month"]').click();
  return r;
}

// --- 1. el botón de bloquear período ya no existe ---------------------------
{
  const { doc } = await planilla();
  ok('no hay botón de bloquear', doc.querySelector('#btn-lock') === null);
  ok('ni nota de período bloqueado', doc.querySelector('#locked-note') === null);

  doc.querySelector('#btn-actions').click();
  const dentro = [...doc.querySelectorAll('#actions-options .view-opt')].map(b => b.id);
  console.log('  opciones:', dentro.join(' · '));
  ok('el apartado «Período» desapareció del menú',
    ![...doc.querySelectorAll('#actions-options .opt-group-title')]
      .some(t => /período/i.test(t.textContent)));
}

// --- 2. el día de hoy se marca sin preguntar --------------------------------
{
  const { window, doc } = await planilla();
  const hoy = celda(doc, '2026-07-30');
  ok('la celda de hoy está habilitada', hoy.disabled === false);

  hoy.click();
  ok('no pregunta nada', abierto(doc) === false);
  ok('y marca en el acto', Boolean(guardado(window).status['t1|2026-07-30']),
    String(guardado(window).status['t1|2026-07-30']));
}

// --- 3. un día por venir tampoco pregunta -----------------------------------
{
  const { window, doc } = await planilla();
  celda(doc, '2026-07-31').click();
  ok('mañana se marca sin diálogo', abierto(doc) === false);
  ok('y queda cargado', Boolean(guardado(window).status['t1|2026-07-31']));
}

// --- 4. un día transcurrido pide confirmación -------------------------------
{
  const { window, doc } = await planilla();
  const antes = guardado(window).status['t1|2026-07-28'];

  celda(doc, '2026-07-28').click();
  ok('el clic abre el diálogo', abierto(doc));
  ok('con el texto pedido',
    doc.querySelector('#confirm-text').textContent === 'Día ya transcurrido. ¿Querés modificarlo?',
    doc.querySelector('#confirm-text').textContent);
  ok('el botón dice «Modificar»', doc.querySelector('#confirm-ok').textContent === 'Modificar',
    doc.querySelector('#confirm-ok').textContent);
  // Corregir un día viejo no destruye nada: el rojo se guarda para lo que sí.
  ok('y no va pintado de rojo',
    doc.querySelector('#confirm-ok').classList.contains('btn-danger') === false,
    doc.querySelector('#confirm-ok').className);
  ok('sino con el color de la marca',
    doc.querySelector('#confirm-ok').classList.contains('btn-brand'));
  ok('la aclaración nombra el día',
    /martes, 28 de julio/i.test(doc.querySelector('#confirm-note').textContent),
    doc.querySelector('#confirm-note').textContent);
  ok('y todavía no tocó nada', guardado(window).status['t1|2026-07-28'] === antes,
    `${antes} → ${guardado(window).status['t1|2026-07-28']}`);
}

// --- 5. cancelar deja el día como estaba ------------------------------------
{
  const { window, doc } = await planilla();
  const antes = guardado(window).status['t1|2026-07-28'];

  celda(doc, '2026-07-28').click();
  doc.querySelector('#confirm-dialog [data-close-dialog]').click();
  ok('el diálogo se cierra', abierto(doc) === false);
  ok('y el estado quedó igual', guardado(window).status['t1|2026-07-28'] === antes,
    `${antes} → ${guardado(window).status['t1|2026-07-28']}`);

  // Cancelar no da permiso: el siguiente clic vuelve a preguntar.
  celda(doc, '2026-07-28').click();
  ok('el clic siguiente vuelve a preguntar', abierto(doc));
  doc.querySelector('#confirm-dialog [data-close-dialog]').click();

  // El tono no se queda pegado: el próximo diálogo puede ser destructivo.
  doc.querySelector('#btn-actions').click();
  doc.querySelector('#btn-mode-delete').click();
  doc.querySelector('.task-pick[data-task-id="t1"]').click();
  doc.querySelector('#btn-mode-ok').click();
  ok('el diálogo de eliminar vuelve al rojo',
    doc.querySelector('#confirm-ok').classList.contains('btn-danger'),
    doc.querySelector('#confirm-ok').className);
  ok('y su rótulo también', doc.querySelector('#confirm-ok').textContent === 'Eliminar',
    doc.querySelector('#confirm-ok').textContent);
}

// --- 6. confirmar aplica el mismo clic --------------------------------------
{
  const { window, doc } = await planilla();
  const antes = guardado(window).status['t1|2026-07-28'];

  celda(doc, '2026-07-28').click();
  doc.querySelector('#confirm-ok').click();
  const despues = guardado(window).status['t1|2026-07-28'];
  ok('el estado avanza un paso del ciclo', despues !== antes, `${antes} → ${despues}`);
  ok('y la celda repinta', celda(doc, '2026-07-28').className.includes(`st-${despues}`),
    celda(doc, '2026-07-28').className);
}

// --- 7. el permiso vale para ese día, no para los demás ---------------------
{
  const { doc } = await planilla();

  celda(doc, '2026-07-28').click();
  doc.querySelector('#confirm-ok').click();

  celda(doc, '2026-07-28').click();
  ok('el mismo día ya no pregunta', abierto(doc) === false);

  celda(doc, '2026-07-27').click();
  ok('pero el día de al lado sí', abierto(doc));
}

// --- 8. después de las 00:00 se cierra lo que acaba de terminar -------------
{
  /* Con la pestaña abierta toda la noche, la fecha del navegador avanza sola.
     Lo que se comprueba es que la app la relea: el 30 —que hasta recién era
     hoy— pasa a estar cerrado, y el permiso dado sobre el 28 se pierde. */
  const { window, doc } = await planilla();

  celda(doc, '2026-07-28').click();
  doc.querySelector('#confirm-ok').click();
  ok('el 28 quedó habilitado antes de la medianoche',
    (celda(doc, '2026-07-28').click(), abierto(doc) === false));

  // Se corre el reloj al 31 a las 00:05 y se despierta a la app como lo hace
  // el navegador al volver a la pestaña.
  const DateFija = window.Date;
  const manana = new Date(2026, 6, 31, 0, 5, 0);
  window.Date = class extends DateFija {
    constructor(...args) {
      if (args.length === 0) super(manana.getTime());
      else super(...args);
    }
    static now() { return manana.getTime(); }
  };
  window.document.dispatchEvent(new window.Event('visibilitychange'));

  ok('la planilla se redibuja en la fecha nueva',
    celda(doc, '2026-07-31') !== null);

  celda(doc, '2026-07-30').click();
  ok('el día que acaba de terminar quedó cerrado', abierto(doc),
    doc.querySelector('#confirm-text').textContent);
  doc.querySelector('#confirm-dialog [data-close-dialog]').click();

  celda(doc, '2026-07-28').click();
  ok('y el permiso de anoche no sobrevivió', abierto(doc));
  doc.querySelector('#confirm-dialog [data-close-dialog]').click();

  celda(doc, '2026-07-31').click();
  ok('el día nuevo se marca sin preguntar', abierto(doc) === false);
}

// --- 9. el cierre es de las celdas, no de la lista de tareas ---------------
{
  const { doc } = await planilla();
  ok('el alta sigue habilitada', doc.querySelector('#btn-add-task').disabled === false);
  ok('y copiar del mes anterior también',
    doc.querySelector('#btn-copy-prev').disabled === false);

  doc.querySelector('#btn-actions').click();
  ok('las tres posturas de fila siguen disponibles',
    ['delete', 'reset', 'reorder']
      .every(m => doc.querySelector(`#btn-mode-${m}`).disabled === false));
}

console.log(`\n  reloj de la prueba: ${AHORA.toISOString()}`);
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
