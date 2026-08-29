/* La papelera: lo eliminado se guarda siete días y vuelve exacto.

   Eliminar dejó de ser destructivo en el acto. Antes de tocar nada se anota el
   CAMBIO —la copia de la tarea en cada mes, con su índice, y los estados que se
   van a borrar—, y restaurar es poner esa anotación de vuelta. Por eso la tarea
   vuelve al mismo lugar de la lista, con la misma fecha de corte y con todo lo
   que tenía cargado, y por eso no hay fecha que elegir al restaurar.

   Arnés: hoy = jueves 30 de julio de 2026. */
import { montar, verDia } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const guardado = w => JSON.parse(w.localStorage.getItem('tareas-diarias/v1/u-test'));
const tareas = w => guardado(w).months['2026-07'] ?? [];
const orden = w => tareas(w).map(t => t.id).join(',');
const marcas = (w, id) => Object.keys(guardado(w).status).filter(k => k.startsWith(id + '|'));
const basura = w => guardado(w).trash ?? [];

const filas = doc => [...doc.querySelectorAll('#dia-lista .dia-fila')].map(f => f.dataset.taskId);
const fichas = doc => [...doc.querySelectorAll('#trash-list .arch')];
const entrada = doc => doc.querySelector('#btn-trash');

const enviar = (doc, form) => doc.querySelector(form)
  .dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

/** Elimina una tarea desde el lápiz, respondiendo el «desde cuándo». */
const eliminar = (doc, taskId, modo = 'inicio', iso = null) => {
  doc.querySelector(`#dia-lista .dia-fila[data-task-id="${taskId}"] [data-action="edit"]`).click();
  doc.querySelector('#task-delete').click();
  doc.querySelector(`#delete-form input[value="${modo}"]`).click();
  if (iso) doc.querySelector('#delete-date').value = iso;
  enviar(doc, '#delete-form');
  doc.querySelector('#confirm-ok').click();
};

// --- 1. la entrada del menú -------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-menu').click();

  ok('vacía, la entrada está apagada', entrada(doc).disabled === true);
  ok('  y dice por qué', /No hay nada eliminado/.test(entrada(doc).title), entrada(doc).title);
  /* Va última del apartado: se entra solo cuando hay algo que deshacer. */
  const enTareas = [...doc.querySelectorAll('#grupo-tareas .drawer-item')].map(b => b.id);
  ok('  y va al final del apartado «Tareas»', enTareas.at(-1) === 'btn-trash',
    enTareas.join(' '));

  eliminar(doc, 't1');
  doc.querySelector('#btn-menu').click();
  ok('con algo eliminado, se enciende', entrada(doc).disabled === false);
  ok('  y dice cuánto hay', /\(1\)/.test(entrada(doc).title), entrada(doc).title);
}

// --- 2. lo eliminado va a parar ahí ----------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const antes = marcas(window, 't1').length;

  eliminar(doc, 't1');
  ok('la tarea ya no está en la lista', !filas(doc).includes('t1'), filas(doc).join(','));
  ok('  ni entre las del mes', !tareas(window).some(t => t.id === 't1'), orden(window));
  ok('  ni le quedan estados', marcas(window, 't1').length === 0, String(antes));

  /* Pero nada se perdió: el cambio entero quedó anotado. */
  ok('quedó una entrada en la papelera', basura(window).length === 1,
    String(basura(window).length));
  ok('  con los estados que se borraron',
    Object.keys(basura(window)[0].estados).length === antes,
    `${Object.keys(basura(window)[0].estados).length} de ${antes}`);
  ok('  y con el lugar que ocupaba en cada mes',
    basura(window)[0].meses['2026-07']?.indice === 0,
    JSON.stringify(basura(window)[0].meses['2026-07']?.indice));

  doc.querySelector('#btn-menu').click();
  entrada(doc).click();
  ok('el diálogo la muestra', fichas(doc).length === 1, String(fichas(doc).length));
  ok('  nombrándola', fichas(doc)[0].querySelector('.arch-name').textContent === 'Leer',
    fichas(doc)[0].querySelector('.arch-name').textContent);
  /* Tres datos: qué era, desde cuándo se borró y cuánto queda. */
  const desc = fichas(doc)[0].querySelector('.arch-desc').textContent;
  ok('  con su frecuencia', /Todos los días/.test(desc), desc);
  ok('  desde cuándo se borró', /eliminada desde el \d\d\/\d\d\/\d{4}/.test(desc), desc);
  ok('  y cuántos días le quedan', /quedan 7 días/.test(desc), desc);
}

// --- 3. restaurar devuelve todo --------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const ordenPrevio = orden(window);
  const marcasPrevias = marcas(window, 't2').length;

  eliminar(doc, 't2');                               // la segunda de cinco
  doc.querySelector('#btn-menu').click();
  entrada(doc).click();

  ok('restaurar arranca apagado', doc.querySelector('#trash-restore').disabled === true);
  ok('  y dice qué falta', /Tildá/.test(doc.querySelector('#trash-restore').title),
    doc.querySelector('#trash-restore').title);

  fichas(doc)[0].querySelector('.arch-pick').click();
  ok('al tildar se enciende', doc.querySelector('#trash-restore').disabled === false);

  doc.querySelector('#trash-restore').click();
  /* No pregunta nada: la entrada guarda el estado anterior tal cual era, así que
     devolverlo es exacto o no es. */
  ok('no pregunta ninguna fecha', !doc.querySelector('#archive-dialog').hasAttribute('open')
    && !doc.querySelector('#confirm-dialog').hasAttribute('open'));

  ok('la tarea vuelve al mismo lugar', orden(window) === ordenPrevio, orden(window));
  ok('  con todos sus estados', marcas(window, 't2').length === marcasPrevias,
    `${marcasPrevias} → ${marcas(window, 't2').length}`);
  ok('  y vuelve a verse en el día', filas(doc).includes('t2'), filas(doc).join(','));
  ok('la papelera queda vacía', basura(window).length === 0, String(basura(window).length));
  ok('  y la lista lo dice', doc.querySelector('#trash-empty').hidden === false);
}

// --- 4. una eliminación con corte vuelve con su corte ----------------------
{
  /* Eliminada desde el 20, la tarea conservaba los días anteriores. Restaurar
     tiene que devolver ESO, no la tarea entera. */
  const { window, doc } = await montar(ESTADO_LLENO);

  eliminar(doc, 't1', 'fecha', '2026-07-20');
  verDia(doc, '2026-07-19');
  ok('con corte, antes del corte sigue estando', filas(doc).includes('t1'),
    filas(doc).join(','));
  verDia(doc, '2026-07-25');
  ok('  y después no', !filas(doc).includes('t1'), filas(doc).join(','));

  doc.querySelector('#btn-menu').click();
  entrada(doc).click();
  ok('igual figura en la papelera', fichas(doc).length === 1, String(fichas(doc).length));

  fichas(doc)[0].querySelector('.arch-pick').click();
  doc.querySelector('#trash-restore').click();

  ok('restaurada, el corte desaparece', filas(doc).includes('t1'), filas(doc).join(','));
  ok('  y vuelven las marcas del tramo borrado',
    marcas(window, 't1').some(k => k.split('|')[1] >= '2026-07-20'),
    marcas(window, 't1').length + ' marcas');
}

// --- 5. varias de una vez ---------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const ordenPrevio = orden(window);

  eliminar(doc, 't1');
  eliminar(doc, 't3');
  ok('dos entradas en la papelera', basura(window).length === 2, String(basura(window).length));

  doc.querySelector('#btn-menu').click();
  entrada(doc).click();
  /* De lo más reciente a lo más viejo: lo último que se borró es lo que más
     probablemente haya que deshacer. */
  ok('la más reciente va primero',
    fichas(doc)[0].querySelector('.arch-name').textContent === 'Inglés',
    fichas(doc).map(f => f.querySelector('.arch-name').textContent).join(' · '));

  doc.querySelector('#trash-all').click();
  ok('«Seleccionar todas» las tilda', doc.querySelector('#trash-restore').disabled === false);
  ok('  y ofrece lo contrario',
    doc.querySelector('#trash-all').textContent === 'Quitar la selección',
    doc.querySelector('#trash-all').textContent);

  doc.querySelector('#trash-restore').click();
  ok('vuelven las dos, en su lugar', orden(window) === ordenPrevio, orden(window));
  ok('  y la papelera queda vacía', basura(window).length === 0);
}

// --- 6. a los siete días se pierde -----------------------------------------
{
  /* La poda mira la fecha anotada, no un reloj: la app puede estar cerrada una
     semana. Se simula con una entrada vieja en el estado de entrada. */
  const conVieja = fecha => ({
    ...ESTADO_LLENO,
    trash: [{
      taskId: 'zz',
      nombre: 'Vieja',
      frecuencia: 'Todos los días',
      desde: null,
      fecha,
      meses: {
        '2026-07': {
          indice: 0,
          task: {
            id: 'zz', name: 'Vieja', freq: 'daily', customMode: 'weekdays',
            weekdays: [], target: 12, start: null,
          },
        },
      },
      estados: { 'zz|2026-07-02': 'done' },
    }],
  });

  const { doc } = await montar(conVieja('2026-07-25'));    // hace 5 días
  doc.querySelector('#btn-menu').click();
  ok('a los 5 días sigue estando', entrada(doc).disabled === false);
  entrada(doc).click();
  ok('  y muestra los días que le quedan',
    /quedan 2 días/.test(fichas(doc)[0].querySelector('.arch-desc').textContent),
    fichas(doc)[0].querySelector('.arch-desc').textContent);

  const { doc: doc2 } = await montar(conVieja('2026-07-23'));   // hace 7 días
  doc2.querySelector('#btn-menu').click();
  ok('a los 7 ya no está', doc2.querySelector('#btn-trash').disabled === true);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
