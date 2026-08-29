/* Selección masiva: lo mismo que se le hace a UNA tarea desde «Editar tarea»,
   hecho a varias de una vez.

   Vive plegada en el menú, dentro del apartado «Tareas». Elegir una de sus tres
   opciones pone la lista en una postura —casilleros para eliminar y archivar,
   chevrones para reordenar— y hace aparecer, en el mismo grupo del menú, el ✓ y
   el ✕ que la rematan. Se vuelve al menú para cerrarla: es donde se eligió.

   Arnés: hoy = jueves 30 de julio de 2026, con cinco tareas en julio. */
import { montar, verDia } from '../harness.mjs';
import { ESTADO_LLENO, ESTADO_VACIO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const guardado = w => JSON.parse(w.localStorage.getItem('tareas-diarias/v1/u-test'));
const tareas = w => guardado(w).months['2026-07'] ?? [];
const orden = doc => [...doc.querySelectorAll('#dia-lista .dia-fila')]
  .map(f => f.dataset.taskId).join(',');
const filas = doc => [...doc.querySelectorAll('#dia-lista .dia-fila')].map(f => f.dataset.taskId);
const casilleros = doc => [...doc.querySelectorAll('.task-pick[data-task-id]')];
const barra = doc => doc.querySelector('#mode-confirm');
/** Los rótulos de un grupo del cajón, sin el ícono que los encabeza. */
const rotulos = grupo => [...grupo.querySelectorAll('.drawer-item.is-sub')]
  .map(b => b.textContent.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '').trim()).join(' · ');
const botonOk = doc => doc.querySelector('#btn-mode-ok');
/** El rótulo de una entrada del cajón, sin el ícono que la encabeza. */
const rotulo = (doc, id) => doc.querySelector('#' + id).textContent
  .replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, '').trim();

/** Abre el menú y pone una postura. */
const postura = (doc, modo) => {
  doc.querySelector('#btn-menu').click();
  doc.querySelector(`#btn-mode-${modo}`).click();
};
const tildar = (doc, n) => casilleros(doc).slice(0, n).forEach(c => c.click());
const rematar = (doc, boton = '#btn-mode-ok') => {
  doc.querySelector('#btn-menu').click();
  doc.querySelector(boton).click();
};
const enviar = (doc, form) => doc.querySelector(form)
  .dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

// --- 1. dónde vive ---------------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  /* Se llama «Múltiple»: nombra qué se elige —varias tareas— y no el mecanismo
     con que se eligen. */
  ok('la entrada del cajón se llama «Múltiple»',
    doc.querySelector('#btn-masiva').textContent.trim().replace(/\s+/g, ' ') === '☑ Selección múltiple',
    doc.querySelector('#btn-masiva').textContent.trim());

  const grupo = doc.querySelector('#grupo-masiva');

  ok('es un grupo plegable del menú', grupo?.tagName === 'DETAILS', grupo?.tagName);
  ok('  que arranca plegado', grupo.open === false);
  ok('  con las tres opciones adentro',
    rotulos(grupo) === 'Eliminar · Archivar · Reordenar', rotulos(grupo));

  /* El ✓ y el ✕ no están en el menú: se elige acá pero se tilda en la lista, y
     tener que volver a abrir el menú para rematar deja la mirada lejos de lo
     que se acaba de tildar. Viven en la línea del mes, a la vista. */
  ok('el remate no está en el menú', !grupo.contains(barra(doc)));
  ok('  sino en la línea del mes',
    doc.querySelector('.month-nav')?.contains(barra(doc)));
  ok('  y arranca escondido', barra(doc).hidden === true);

  ok('en reposo las filas van limpias',
    casilleros(doc).length === 0 && doc.querySelectorAll('.move-stack').length === 0);
}

// --- 2. elegir una postura -------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const cuantas = filas(doc).length;

  postura(doc, 'delete');
  ok('«Eliminar» saca los casilleros', casilleros(doc).length === cuantas,
    `${casilleros(doc).length} de ${cuantas}`);
  ok('  incluido el de «todas»', Boolean(doc.querySelector('[data-pick-all]')));
  ok('  sin chevrones', doc.querySelectorAll('.move-stack').length === 0);
  ok('  y cierra el menú, para ver la lista',
    doc.body.classList.contains('drawer-open') === false);
  ok('la opción queda marcada',
    doc.querySelector('#btn-mode-delete').getAttribute('aria-pressed') === 'true');
  ok('y el grupo queda desplegado', doc.querySelector('#grupo-masiva').open === true);

  postura(doc, 'archive');
  ok('«Archivar» usa los mismos casilleros', casilleros(doc).length === cuantas);
  ok('  y destilda la otra opción',
    doc.querySelector('#btn-mode-delete').getAttribute('aria-pressed') === 'false');

  postura(doc, 'reorder');
  ok('«Reordenar» cambia a los chevrones',
    doc.querySelectorAll('.move-stack').length === cuantas);
  ok('  y se lleva los casilleros', casilleros(doc).length === 0);

  /* Ordenando, las flechas ocupan el lugar del recuadro de estado, que es donde
     ya está la mano. */
  ok('  y las flechas van al final de la fila',
    [...doc.querySelectorAll('#dia-lista .dia-fila')]
      .every(f => f.lastElementChild?.classList.contains('move-stack')));

  postura(doc, 'reorder');
  ok('volver a elegirla vuelve a las filas limpias',
    doc.querySelectorAll('.move-stack').length === 0
    && doc.querySelector('#btn-mode-reorder').getAttribute('aria-pressed') === 'false');
}

// --- 2b. con una postura puesta, la fila muestra solo lo de esa postura ----
{
  /* El recuadro de estado invita a cargar el día —y un clic distraído ahí marca
     algo que nadie quiso— y el lápiz abre un diálogo que interrumpe la elección
     a medias. Ninguna de las dos cosas es lo que se está haciendo. */
  const { doc } = await montar(ESTADO_LLENO);
  const recuadros = () => doc.querySelectorAll('#dia-lista .cell').length;
  const lapices = () => doc.querySelectorAll('#dia-lista [data-action="edit"]').length;

  ok('en reposo la fila tiene su recuadro y su lápiz',
    recuadros() > 0 && lapices() > 0, `${recuadros()} recuadros, ${lapices()} lápices`);

  for (const modo of ['delete', 'archive', 'reorder']) {
    postura(doc, modo);
    ok(`  con «${modo}» no queda ningún recuadro de estado`, recuadros() === 0,
      String(recuadros()));
    ok('    ni ningún lápiz', lapices() === 0, String(lapices()));
  }

  /* Y al salir vuelven las dos: la postura no se lleva nada puesto. */
  postura(doc, 'reorder');
  ok('al salir vuelven los dos', recuadros() > 0 && lapices() > 0,
    `${recuadros()} recuadros, ${lapices()} lápices`);
}

// --- 3. el ✓ dice qué falta y qué va a hacer -------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);

  ok('en reposo no hay remate', barra(doc).hidden === true);

  postura(doc, 'delete');
  ok('la postura lo hace aparecer', barra(doc).hidden === false);
  ok('  pero el ✓ arranca apagado', botonOk(doc).disabled === true);
  ok('  y dice qué falta', /Tildá las tareas/.test(botonOk(doc).title), botonOk(doc).title);

  tildar(doc, 2);
  ok('con dos tildadas se habilita', botonOk(doc).disabled === false);
  ok('  y anuncia el alcance', /Eliminar 2 tareas/.test(botonOk(doc).title), botonOk(doc).title);

  postura(doc, 'archive');
  ok('cambiar de postura suelta lo tildado', botonOk(doc).disabled === true);
  tildar(doc, 3);
  ok('  y la nueva anuncia lo suyo', /Archivar 3 tareas/.test(botonOk(doc).title),
    botonOk(doc).title);

  postura(doc, 'reorder');
  ok('reordenar no necesita tildar nada', botonOk(doc).disabled === false);
}

// --- 3b. el remate se turna con «Hoy» -------------------------------------
{
  /* Comparten el lugar de la línea del mes. Con una postura puesta manda el
     remate: volver a hoy en medio de una elección movería la lista debajo de lo
     que se está tildando. */
  const { doc } = await montar(ESTADO_LLENO);
  const hoy = () => doc.querySelector('#btn-hoy');

  verDia(doc, '2026-07-15');
  ok('en otro día, «Hoy» está a la vista', hoy().hidden === false);

  for (const modo of ['delete', 'archive', 'reorder']) {
    postura(doc, modo);
    ok(`con «${modo}» aparece el remate`, barra(doc).hidden === false);
    ok('  y «Hoy» se esconde', hoy().hidden === true);
  }

  postura(doc, 'reorder');                          // se sale de la postura
  ok('al salir vuelve «Hoy»', hoy().hidden === false);
  ok('  y el remate se va', barra(doc).hidden === true);

  /* Parado en hoy no hay «Hoy» que esconder, y el remate aparece igual. */
  const { doc: doc2 } = await montar(ESTADO_LLENO);
  ok('parado en hoy, «Hoy» no está', doc2.querySelector('#btn-hoy').hidden === true);
  postura(doc2, 'delete');
  ok('  y el remate aparece lo mismo',
    doc2.querySelector('#mode-confirm').hidden === false);
}

// --- 4. eliminar varias ----------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const antes = filas(doc).length;

  postura(doc, 'delete');
  tildar(doc, 2);
  rematar(doc);

  ok('el ✓ pregunta desde cuándo', doc.querySelector('#delete-dialog').hasAttribute('open'));
  ok('  hablando de las dos', /2 tareas/.test(doc.querySelector('#delete-note').textContent),
    doc.querySelector('#delete-note').textContent);

  doc.querySelector('#delete-form input[value="inicio"]').click();
  enviar(doc, '#delete-form');

  ok('después pide confirmación', doc.querySelector('#confirm-dialog').hasAttribute('open'));
  ok('  listando las tareas con su fecha',
    doc.querySelectorAll('#confirm-list li').length === 2
    && doc.querySelectorAll('#confirm-list .confirm-der').length === 2,
    String(doc.querySelectorAll('#confirm-list li').length));
  ok('  y todavía no borró nada', filas(doc).length === antes);

  doc.querySelector('#confirm-ok').click();
  ok('al aceptar, borra las dos', filas(doc).length === antes - 2, filas(doc).join(','));
  ok('  y salen del mes', tareas(window).length === antes - 2,
    tareas(window).map(t => t.id).join(','));
  ok('  la postura se cierra sola', barra(doc).hidden === true);
  ok('  sin dejar casilleros', casilleros(doc).length === 0);
}

// --- 5. archivar varias ----------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);

  postura(doc, 'archive');
  tildar(doc, 2);                                   // t1 y t2
  rematar(doc);

  ok('el ✓ abre el diálogo de fecha', doc.querySelector('#archive-dialog').hasAttribute('open'));
  ok('  hablando de las dos', /2 tareas/.test(doc.querySelector('#archive-note').textContent),
    doc.querySelector('#archive-note').textContent);

  doc.querySelector('#archive-date').value = '2026-07-20';
  enviar(doc, '#archive-form');

  const tramos = id => (tareas(window).find(t => t.id === id)?.archived ?? [])
    .map(t => `${t.from}→${t.to ?? '…'}`).join(' ');
  ok('las dos quedan archivadas desde ese día',
    tramos('t1') === '2026-07-20→…' && tramos('t2') === '2026-07-20→…',
    `${tramos('t1')} | ${tramos('t2')}`);
  ok('  y desaparecen de la lista', !filas(doc).includes('t1') && !filas(doc).includes('t2'),
    filas(doc).join(','));
  ok('  la postura se cierra sola', barra(doc).hidden === true);

  verDia(doc, '2026-07-19');
  ok('  pero antes del corte siguen estando',
    filas(doc).includes('t1') && filas(doc).includes('t2'), filas(doc).join(','));
}
{
  /* Se valida ANTES de tocar nada: media tanda archivada y media no sería un
     resultado que nadie pidió. `t5` empieza el 10 de julio. */
  const { window, doc } = await montar(ESTADO_LLENO);

  postura(doc, 'archive');
  casilleros(doc).forEach(c => c.click());          // las cinco
  rematar(doc);
  doc.querySelector('#archive-date').value = '2026-07-05';
  enviar(doc, '#archive-form');

  ok('una sola fecha imposible frena a todas',
    doc.querySelector('#archive-dialog').hasAttribute('open'));
  ok('  y el error dice de cuál se trata',
    /Meditar/.test(doc.querySelector('#archive-error').textContent),
    doc.querySelector('#archive-error').textContent);
  ok('  sin archivar ninguna',
    tareas(window).every(t => !(t.archived ?? []).length),
    tareas(window).map(t => `${t.id}:${(t.archived ?? []).length}`).join(' '));
}

// --- 6. reordenar ----------------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const inicial = orden(doc);

  postura(doc, 'reorder');
  doc.querySelector('[data-action="move-down"]:not(:disabled)').click();
  ok('el chevron mueve en el acto', orden(doc) !== inicial, `${inicial} → ${orden(doc)}`);

  rematar(doc, '#btn-mode-cancel');
  ok('el ✕ devuelve el orden', orden(doc) === inicial, orden(doc));
  ok('  y cierra la postura', barra(doc).hidden === true);
}
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const inicial = orden(doc);

  postura(doc, 'reorder');
  doc.querySelector('[data-action="move-down"]:not(:disabled)').click();
  const movido = orden(doc);

  rematar(doc);
  ok('el ✓ pide confirmación', doc.querySelector('#confirm-dialog').hasAttribute('open'));

  doc.querySelector('#confirm-ok').click();
  ok('al aceptar, el orden queda', orden(doc) === movido && orden(doc) !== inicial, orden(doc));
  ok('  también en lo guardado', tareas(window).map(t => t.id).join(',') === movido,
    tareas(window).map(t => t.id).join(','));
  ok('  y la postura se cierra', barra(doc).hidden === true);
}

// --- 7. sin tareas no hay nada que elegir ----------------------------------
{
  const { doc } = await montar(ESTADO_VACIO);
  doc.querySelector('#btn-menu').click();

  const apagadas = ['delete', 'archive', 'reorder']
    .every(m => doc.querySelector(`#btn-mode-${m}`).disabled === true);
  ok('las tres se apagan sin tareas en el mes', apagadas);
  ok('  diciendo por qué', /No hay tareas/.test(doc.querySelector('#btn-mode-delete').title),
    doc.querySelector('#btn-mode-delete').title);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
