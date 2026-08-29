/* Las tres cosas que se pueden hacer CON una tarea, desde «Editar tarea»:
   eliminarla, moverla de lugar y archivarla.

   Antes eran dos posturas de la lista entera —casilleros para eliminar,
   chevrones para reordenar— que se ponían desde el menú ☰. El menú no podía
   nombrar de qué tarea hablaba, así que había que elegirla en la fila; ahora se
   entra al revés: primero la tarea, después qué hacerle. Archivar es nueva.

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
const tarea = (w, id) => tareas(w).find(t => t.id === id);

const filas = doc => [...doc.querySelectorAll('#dia-lista .dia-fila')].map(f => f.dataset.taskId);

/* `archived` es una LISTA de tramos `{from, to}`: `to` es el día en que la tarea
   volvió, y null mientras siga archivada. */
const tramos = (w, id) => tarea(w, id)?.archived ?? [];
const comoTexto = (w, id) => tramos(w, id).map(t => `${t.from}→${t.to ?? '…'}`).join(' ');

/** Completa el diálogo de fecha —sirve para archivar y para desarchivar—. */
const conFecha = (doc, iso) => {
  doc.querySelector('#archive-date').value = iso;
  enviar(doc, '#archive-form');
};
const abierto = (doc, id) => doc.querySelector(id).hasAttribute('open');

/**
 * Responde el diálogo de «Eliminar desde». `modo` es 'hoy', 'inicio' o 'fecha';
 * con 'fecha' hay que pasar el día.
 */
const borrarDesde = (doc, modo = 'inicio', iso = null) => {
  doc.querySelector(`#delete-form input[value="${modo}"]`).click();
  if (iso) doc.querySelector('#delete-date').value = iso;
  enviar(doc, '#delete-form');
};

/** Abre «Editar tarea» desde el lápiz de esa fila. */
const editar = (doc, taskId) =>
  doc.querySelector(`#dia-lista .dia-fila[data-task-id="${taskId}"] [data-action="edit"]`).click();

const enviar = (doc, form) => doc.querySelector(form)
  .dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

// --- 1. las tres solo existen sobre una tarea que ya existe -----------------
{
  const { doc } = await montar(ESTADO_LLENO);

  doc.querySelector('#btn-fab').click();
  ok('en un alta no hay acciones', doc.querySelector('#task-tools').hidden === true);
  /* El botón que remata es un tilde: su nombre no está en el texto sino en el
     `aria-label`, que es lo único que lee un lector de pantalla. */
  ok('y el tilde dice que va a crear',
    doc.querySelector('#task-submit').getAttribute('aria-label') === 'Crear tarea',
    doc.querySelector('#task-submit').getAttribute('aria-label'));
  doc.querySelector('#task-dialog').close();

  editar(doc, 't1');
  ok('al editar aparecen las tres', doc.querySelector('#task-tools').hidden === false);
  const rotulos = [...doc.querySelectorAll('#task-tools .task-tool')].map(b => b.textContent);
  ok('  eliminar, reordenar y archivar',
    rotulos.join(' · ') === 'Eliminar · Reordenar · Archivar', rotulos.join(' · '));
  ok('y el mismo tilde dice que va a guardar',
    doc.querySelector('#task-submit').getAttribute('aria-label') === 'Guardar cambios',
    doc.querySelector('#task-submit').getAttribute('aria-label'));
  /* Sin rótulo adentro: solo el dibujo. Si tuviera texto, el cuadrado dejaría
     de ser cuadrado. */
  ok('  y no lleva texto, solo el dibujo',
    doc.querySelector('#task-submit').textContent.trim() === ''
    && Boolean(doc.querySelector('#task-submit .ok-icon')));

  ok('las flechas arrancan guardadas', doc.querySelector('#task-move').hidden === true);
}

// --- 2. eliminar -----------------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const antes = filas(doc).length;

  editar(doc, 't1');
  doc.querySelector('#task-delete').click();

  /* Se cierra antes de preguntar: dos diálogos encimados esconden la pregunta. */
  ok('cierra la edición', abierto(doc, '#task-dialog') === false);
  ok('y pregunta desde cuándo', abierto(doc, '#delete-dialog'));
  ok('  nombrando la tarea', /Leer/.test(doc.querySelector('#delete-note').textContent),
    doc.querySelector('#delete-note').textContent);

  borrarDesde(doc, 'inicio');
  ok('después pide confirmación', abierto(doc, '#confirm-dialog'));
  ok('  con la tarea de un lado y su fecha del otro',
    doc.querySelector('#confirm-list .confirm-izq')?.textContent === 'Leer'
    && /^desde el \d\d\/\d\d\/\d{4}$/.test(doc.querySelector('#confirm-list .confirm-der')?.textContent),
    doc.querySelector('#confirm-list li')?.textContent);
  ok('todavía sin borrar nada', filas(doc).length === antes);

  doc.querySelector('#confirm-ok').click();
  ok('al aceptar, borra la fila', filas(doc).length === antes - 1, filas(doc).join(','));
  ok('y la tarea sale del mes', !tarea(window, 't1'), tareas(window).map(t => t.id).join(','));
}

// --- 3. reordenar ----------------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const orden = () => filas(doc).join(',');
  const inicial = orden();

  editar(doc, 't2');                       // la segunda de cinco
  doc.querySelector('#task-reorder').click();
  ok('«Reordenar» muestra las flechas', doc.querySelector('#task-move').hidden === false);
  ok('  y queda marcado mientras están',
    doc.querySelector('#task-reorder').getAttribute('aria-pressed') === 'true');
  ok('  diciendo dónde está', doc.querySelector('#task-move-pos').textContent === '2 de 5',
    doc.querySelector('#task-move-pos').textContent);

  doc.querySelector('#task-move-up').click();
  ok('sube un lugar', orden() === 't2,t1,t3,t4,t5', orden());
  ok('  y la posición acompaña', doc.querySelector('#task-move-pos').textContent === '1 de 5',
    doc.querySelector('#task-move-pos').textContent);
  /* Arriba de todo no hay a dónde subir: el botón lo dice apagándose, en vez de
     no hacer nada al tocarlo. */
  ok('  arriba de todo, la flecha se apaga',
    doc.querySelector('#task-move-up').disabled === true);

  /* Cada paso ya es el resultado: no hay ✓ que apretar después. */
  ok('el orden se guarda en el acto',
    tareas(window).map(t => t.id).join(',') === 't2,t1,t3,t4,t5',
    tareas(window).map(t => t.id).join(','));
  ok('y arranca distinto de como estaba', orden() !== inicial);

  doc.querySelector('#task-reorder').click();
  ok('volver a tocarlo las guarda', doc.querySelector('#task-move').hidden === true);
}
{
  /* La última no puede bajar. */
  const { doc } = await montar(ESTADO_LLENO);
  editar(doc, 't5');
  doc.querySelector('#task-reorder').click();
  ok('la última no puede bajar', doc.querySelector('#task-move-down').disabled === true);
  ok('  pero sí subir', doc.querySelector('#task-move-up').disabled === false);
}

// --- 4. archivar -----------------------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);

  editar(doc, 't1');
  doc.querySelector('#task-archive').click();
  ok('«Archivar» pregunta desde cuándo', abierto(doc, '#archive-dialog'));
  /* El día en el que está parado el carrete, que es de lo que se está
     hablando. */
  ok('  proponiendo el día que se está mirando',
    doc.querySelector('#archive-date').value === '2026-07-30',
    doc.querySelector('#archive-date').value);
  ok('  y nombrando la tarea', /Leer/.test(doc.querySelector('#archive-note').textContent),
    doc.querySelector('#archive-note').textContent);

  conFecha(doc, '2026-07-20');

  ok('al confirmar se cierran los dos diálogos',
    !abierto(doc, '#archive-dialog') && !abierto(doc, '#task-dialog'));
  ok('y queda anotado el tramo', comoTexto(window, 't1') === '2026-07-20→…',
    comoTexto(window, 't1'));

  /* Desde ese día no se ve más. */
  ok('desde ese día la fila no está', !filas(doc).includes('t1'), filas(doc).join(','));
  verDia(doc, '2026-07-20');
  ok('  tampoco el día del corte', !filas(doc).includes('t1'), filas(doc).join(','));

  /* Antes sí, con todo lo cargado en su lugar: eso es lo que separa archivar de
     eliminar. La tarea sigue en el mes y sus estados también. */
  verDia(doc, '2026-07-19');
  ok('antes del corte sigue estando', filas(doc).includes('t1'), filas(doc).join(','));
  ok('  la tarea no se borró', Boolean(tarea(window, 't1')));
  ok('  y sus estados tampoco',
    Boolean(guardado(window).status['t1|2026-07-15']),
    String(guardado(window).status['t1|2026-07-15']));
  const celda = doc.querySelector('#dia-lista .dia-fila[data-task-id="t1"] .cell');
  ok('  se sigue pudiendo cargar ahí', Boolean(celda) && celda.disabled === false);
}
{
  /* Archivarla desde antes de que empiece la dejaría sin un solo día vivo, que
     es lo mismo que no haberla creado. `t5` empieza el 10 de julio. */
  const { window, doc } = await montar(ESTADO_LLENO);

  editar(doc, 't5');
  doc.querySelector('#task-archive').click();
  conFecha(doc, '2026-07-05');

  ok('no se archiva desde antes de empezar', abierto(doc, '#archive-dialog'));
  ok('  y lo explica', doc.querySelector('#archive-error').hidden === false
    && /empieza/.test(doc.querySelector('#archive-error').textContent),
    doc.querySelector('#archive-error').textContent);
  ok('  sin anotar nada', tramos(window, 't5').length === 0, comoTexto(window, 't5'));
}

// --- 5. desarchivar, también por fecha -------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);

  editar(doc, 't1');
  doc.querySelector('#task-archive').click();
  conFecha(doc, '2026-07-20');

  /* Se la alcanza desde cualquier día anterior al corte, que es donde sigue
     apareciendo. */
  verDia(doc, '2026-07-19');
  editar(doc, 't1');
  ok('archivada, el botón ofrece lo contrario',
    doc.querySelector('#task-archive').textContent === 'Desarchivar',
    doc.querySelector('#task-archive').textContent);

  doc.querySelector('#task-archive').click();
  ok('y también pregunta desde cuándo', abierto(doc, '#archive-dialog'));
  ok('  con el diálogo hablando de volver',
    doc.querySelector('#archive-title').textContent === 'Desarchivar tarea'
    && doc.querySelector('#archive-label').textContent === 'Volver a pedirla desde',
    doc.querySelector('#archive-label').textContent);
  ok('  y el botón también',
    doc.querySelector('#archive-submit').textContent === 'Desarchivar',
    doc.querySelector('#archive-submit').textContent);

  /* Volver ANTES de haberse ido no describe nada. */
  conFecha(doc, '2026-07-15');
  ok('no vuelve antes de haberse archivado', abierto(doc, '#archive-dialog'));
  ok('  y lo explica', /se archivó/.test(doc.querySelector('#archive-error').textContent),
    doc.querySelector('#archive-error').textContent);

  conFecha(doc, '2026-08-01');
  ok('al confirmar, el tramo queda cerrado', comoTexto(window, 't1') === '2026-07-20→2026-08-01',
    comoTexto(window, 't1'));

  /* El hueco sigue siendo un hueco: adentro no está, afuera sí. */
  verDia(doc, '2026-07-25');
  ok('adentro del tramo no aparece', !filas(doc).includes('t1'), filas(doc).join(','));
  verDia(doc, '2026-08-01');
  ok('el día de la vuelta ya aparece', filas(doc).includes('t1'), filas(doc).join(','));
  verDia(doc, '2026-07-19');
  ok('y antes del tramo también', filas(doc).includes('t1'), filas(doc).join(','));
}
{
  /* Ida y vuelta más de una vez: cada ida deja su propio hueco. Es lo que una
     sola fecha no podía anotar. */
  const { window, doc } = await montar(ESTADO_LLENO);
  const archivar = (dia, desde) => {
    verDia(doc, dia);
    editar(doc, 't1');
    doc.querySelector('#task-archive').click();
    conFecha(doc, desde);
  };

  archivar('2026-07-30', '2026-07-10');
  archivar('2026-07-05', '2026-07-15');            // el botón dice «Desarchivar»
  ok('el primer tramo se cierra', comoTexto(window, 't1') === '2026-07-10→2026-07-15',
    comoTexto(window, 't1'));

  archivar('2026-07-20', '2026-07-25');            // se vuelve a archivar
  ok('y el segundo se abre aparte',
    comoTexto(window, 't1') === '2026-07-10→2026-07-15 2026-07-25→…',
    comoTexto(window, 't1'));

  for (const [dia, esta] of [['2026-07-09', true], ['2026-07-12', false],
    ['2026-07-18', true], ['2026-07-26', false]]) {
    verDia(doc, dia);
    ok(`  el ${dia.slice(-2)} ${esta ? 'está' : 'no está'}`,
      filas(doc).includes('t1') === esta, filas(doc).join(','));
  }
}

// --- 6. lo archivado no cuenta como incumplido -----------------------------
{
  /* El día del corte en adelante la tarea no existe, así que no puede figurar
     como faltante: el cumplimiento del día tiene que subir o quedar igual, nunca
     bajar por archivar. */
  const { doc } = await montar(ESTADO_LLENO);
  verDia(doc, '2026-07-28');
  const antes = doc.querySelector('#dia-resumen-valor').textContent;

  verDia(doc, '2026-07-30');
  editar(doc, 't3');                       // Inglés: lunes, miércoles y viernes
  doc.querySelector('#task-archive').click();
  doc.querySelector('#archive-date').value = '2026-07-27';
  enviar(doc, '#archive-form');

  verDia(doc, '2026-07-28');
  const despues = doc.querySelector('#dia-resumen-valor').textContent;
  const num = t => Number(String(t).replace('%', '')) || 0;
  ok('archivar no empeora el cumplimiento del día', num(despues) >= num(antes),
    `${antes} → ${despues}`);
  ok('  y la tarea no figura en el día', !filas(doc).includes('t3'), filas(doc).join(','));
}

// --- 7. la fecha sobrevive a la ida y vuelta por el saneador ---------------
{
  /* Lo que se guarda vuelve a entrar por `cleanTaskList`, que enumera campo por
     campo: uno que no esté en esa lista se pierde en silencio al recargar. */
  const conArchivada = {
    ...ESTADO_LLENO,
    months: {
      ...ESTADO_LLENO.months,
      // Formato viejo: una fecha suelta, que es un tramo abierto.
      '2026-07': ESTADO_LLENO.months['2026-07']
        .map(t => (t.id === 't2' ? { ...t, archived: '2026-07-10' } : t)),
    },
  };
  const { window, doc } = await montar(conArchivada);

  ok('una tarea que ya viene archivada no se muestra',
    !filas(doc).includes('t2'), filas(doc).join(','));

  /* Y sobrevive a la vuelta: el arnés SIEMBRA el estado en `localStorage`, así
     que leerlo sin más sería leer el dato de entrada. Una marca cualquiera hace
     que la app escriba lo que cargó, que es lo que interesa. */
  doc.querySelector('#dia-lista .dia-fila .cell').click();
  ok('  y la fecha vieja se lee como un tramo abierto',
    comoTexto(window, 't2') === '2026-07-10→…', comoTexto(window, 't2'));

  verDia(doc, '2026-07-09');
  ok('  antes del corte sí se muestra', filas(doc).includes('t2'), filas(doc).join(','));
}
{
  /* Archivada desde antes de empezar no describe nada: nunca estuvo viva. El
     saneador la deja sin archivar en vez de esconderla para siempre. */
  const imposible = {
    ...ESTADO_LLENO,
    months: {
      ...ESTADO_LLENO.months,
      '2026-07': ESTADO_LLENO.months['2026-07']
        .map(t => (t.id === 't5' ? { ...t, archived: [{ from: '2026-07-01', to: null }] } : t)),
    },
  };
  const { window, doc } = await montar(imposible);
  ok('archivada desde antes de empezar, la tarea se ve igual',
    filas(doc).includes('t5'), filas(doc).join(','));

  doc.querySelector('#dia-lista .dia-fila .cell').click();
  ok('  porque el saneador descartó ese tramo', tramos(window, 't5').length === 0,
    comoTexto(window, 't5'));
}

// --- 8. dónde se ven las archivadas ---------------------------------------
{
  /* Archivada, la tarea sigue apareciendo en los días anteriores a su corte,
     pero eso pide acordarse de la fecha. La lista del menú las junta todas. */
  const { doc } = await montar(ESTADO_LLENO);
  const entrada = () => doc.querySelector('#btn-archived');
  const fichas = () => [...doc.querySelectorAll('#archived-list .arch')];

  ok('sin archivadas, la entrada del menú está apagada', entrada().disabled === true);
  ok('  y dice por qué', /Ninguna tarea archivada/.test(entrada().title), entrada().title);

  editar(doc, 't1');
  doc.querySelector('#task-archive').click();
  conFecha(doc, '2026-07-20');

  ok('con una archivada, se enciende', entrada().disabled === false);
  ok('  y dice cuántas hay', /^Ver 1 tarea archivada de julio/.test(entrada().title), entrada().title);

  entrada().click();
  ok('abre su diálogo', abierto(doc, '#archived-dialog'));
  ok('  con una ficha por tarea', fichas().length === 1, String(fichas().length));
  ok('  que la nombra',
    fichas()[0].querySelector('.arch-name').textContent === 'Leer',
    fichas()[0].querySelector('.arch-name').textContent);
  /* La fecha es lo que explica qué se ve y qué no: desde ahí no aparece, antes
     de ahí sigue entera. */
  ok('  y dice desde cuándo lo está',
    /archivada desde el 20 jul/.test(fichas()[0].querySelector('.arch-desc').textContent),
    fichas()[0].querySelector('.arch-desc').textContent);

  /* El remate es uno solo, al pie: con un botón por ficha, devolver tres tareas
     eran tres vueltas por el mismo diálogo eligiendo la fecha cada vez. */
  const remate = () => doc.querySelector('#archived-undo');
  ok('el remate es uno solo, al pie',
    doc.querySelectorAll('#archived-dialog .btn-brand').length === 1);
  ok('  apagado mientras no haya nada tildado', remate().disabled === true);
  ok('  diciendo qué falta', /Tildá las tareas/.test(remate().title), remate().title);

  fichas()[0].querySelector('.arch-pick').click();
  ok('al tildar una se enciende', remate().disabled === false);
  ok('  y dice a cuántas alcanza', /1 tarea/.test(remate().title), remate().title);

  remate().click();
  ok('y también se elige la fecha', abierto(doc, '#archive-dialog'));

  conFecha(doc, '2026-08-01');
  ok('  y la lista sigue abierta, sin la ficha',
    abierto(doc, '#archived-dialog') && fichas().length === 0, String(fichas().length));
  ok('  avisa que ya no queda ninguna', doc.querySelector('#archived-empty').hidden === false);
  ok('  con la entrada del menú apagada de nuevo', entrada().disabled === true);

  verDia(doc, '2026-08-02');
  ok('  y la fila vuelve desde el día elegido', filas(doc).includes('t1'), filas(doc).join(','));
}

// --- 9. desarchivar varias de una vez -------------------------------------
{
  /* Es para lo que están los casilleros: una sola vuelta por el diálogo de
     fecha, y la fecha de regreso se elige UNA vez para todas. */
  const { window, doc } = await montar(ESTADO_LLENO);
  const fichas = () => [...doc.querySelectorAll('#archived-list .arch')];

  for (const id of ['t1', 't2', 't3']) {
    editar(doc, id);
    doc.querySelector('#task-archive').click();
    conFecha(doc, '2026-07-20');
  }

  doc.querySelector('#btn-archived').click();
  ok('el Archivo junta las tres', fichas().length === 3, String(fichas().length));

  fichas().slice(0, 2).forEach(f => f.querySelector('.arch-pick').click());
  ok('  y el remate cuenta las tildadas',
    /2 tareas/.test(doc.querySelector('#archived-undo').title),
    doc.querySelector('#archived-undo').title);

  /* «Seleccionar todas» va al lado de «Desarchivar» y del mismo tamaño: son las
     dos cosas que se pueden hacer con la lista. El botón dice qué va a hacer al
     tocarlo, así que con todo tildado se da vuelta. */
  const todas = () => doc.querySelector('#archived-all');
  ok('el botón dice qué hace', todas().textContent === 'Seleccionar todas',
    todas().textContent);

  todas().click();
  ok('tocarlo alcanza a las tres',
    [...doc.querySelectorAll('#archived-list .arch-pick')].every(c => c.checked));
  ok('  el remate las cuenta', /3 tareas/.test(doc.querySelector('#archived-undo').title),
    doc.querySelector('#archived-undo').title);
  ok('  y ahora ofrece lo contrario', todas().textContent === 'Quitar la selección',
    todas().textContent);

  todas().click();
  ok('volver a tocarlo las suelta a todas',
    [...doc.querySelectorAll('#archived-list .arch-pick')].every(c => !c.checked));
  ok('  y el remate se apaga', doc.querySelector('#archived-undo').disabled === true);

  // Se vuelve a las dos de antes para seguir.
  [...doc.querySelectorAll('#archived-list .arch-pick')].slice(0, 2).forEach(c => c.click());

  doc.querySelector('#archived-undo').click();
  ok('una sola vuelta por el diálogo de fecha', abierto(doc, '#archive-dialog'));
  ok('  que habla de las dos', /2 tareas/.test(doc.querySelector('#archive-note').textContent),
    doc.querySelector('#archive-note').textContent);

  conFecha(doc, '2026-08-01');
  ok('las dos vuelven desde ese día',
    comoTexto(window, 't1') === '2026-07-20→2026-08-01'
    && comoTexto(window, 't2') === '2026-07-20→2026-08-01',
    `${comoTexto(window, 't1')} | ${comoTexto(window, 't2')}`);
  ok('  y la que no se tildó sigue archivada', comoTexto(window, 't3') === '2026-07-20→…',
    comoTexto(window, 't3'));
  ok('  la lista queda con esa sola', fichas().length === 1, String(fichas().length));
  ok('  y sin nada tildado', doc.querySelector('#archived-undo').disabled === true);
}

// --- 10. volver el mismo día en que se archivó ----------------------------
{
  /* Es deshacer el archivo: el tramo no cubriría ningún día. Se borra en vez de
     guardar uno vacío, que sería ruido para explicar cada vez que se lee. */
  const { window, doc } = await montar(ESTADO_LLENO);

  editar(doc, 't1');
  doc.querySelector('#task-archive').click();
  conFecha(doc, '2026-07-20');
  ok('archivada desde el 20', comoTexto(window, 't1') === '2026-07-20→…',
    comoTexto(window, 't1'));

  verDia(doc, '2026-07-19');
  editar(doc, 't1');
  doc.querySelector('#task-archive').click();
  conFecha(doc, '2026-07-20');                       // el mismo día

  ok('vuelve el mismo día, sin protestar', !abierto(doc, '#archive-dialog'));
  ok('  y no queda ningún tramo', tramos(window, 't1').length === 0,
    comoTexto(window, 't1'));

  verDia(doc, '2026-07-20');
  ok('  así que ese día vuelve a estar', filas(doc).includes('t1'), filas(doc).join(','));
  verDia(doc, '2026-07-30');
  ok('  y los siguientes también', filas(doc).includes('t1'), filas(doc).join(','));
}

// --- 11. eliminar desde una fecha -----------------------------------------
{
  /* «Hoy»: lo anterior queda como estaba. Hoy es el 30 de julio, así que el 29
     sigue teniendo la fila y sus marcas. */
  const { window, doc } = await montar(ESTADO_LLENO);
  const marcas = id => Object.keys(guardado(window).status).filter(k => k.startsWith(id + '|'));

  const antes = marcas('t1').length;
  ok('hay marcas cargadas de antes', antes > 0, String(antes));

  editar(doc, 't1');
  doc.querySelector('#task-delete').click();
  borrarDesde(doc, 'hoy');
  ok('la confirmación dice desde cuándo',
    doc.querySelector('#confirm-list .confirm-der').textContent === 'desde el 30/07/2026',
    doc.querySelector('#confirm-list .confirm-der').textContent);
  doc.querySelector('#confirm-ok').click();

  ok('hoy la fila ya no está', !filas(doc).includes('t1'), filas(doc).join(','));
  verDia(doc, '2026-07-29');
  ok('  pero el día anterior sí', filas(doc).includes('t1'), filas(doc).join(','));
  ok('  con sus marcas viejas intactas',
    marcas('t1').every(k => k.split('|')[1] < '2026-07-30'),
    marcas('t1').filter(k => k.split('|')[1] >= '2026-07-30').join(' '));
  /* En el escenario no hay nada cargado de hoy en adelante —el arnés llega
     hasta el 29—, así que el borrado no se lleva ninguna: lo que se comprueba es
     justamente eso, que no tocó las de antes. */
  ok('  y las de antes siguen todas', marcas('t1').length === antes,
    `${antes} → ${marcas('t1').length}`);
}
{
  /* «La fecha de inicio»: la tarea se va entera, con todo lo cargado. */
  const { window, doc } = await montar(ESTADO_LLENO);

  editar(doc, 't1');
  doc.querySelector('#task-delete').click();
  borrarDesde(doc, 'inicio');
  /* Sin fecha de inicio propia, la que se muestra es el dato más viejo que hay
     de la tarea —junio, que es su mes más antiguo—, que es el primer día que se
     borra de verdad. */
  ok('la confirmación dice desde qué día se borra',
    doc.querySelector('#confirm-list .confirm-der').textContent === 'desde el 01/06/2026',
    doc.querySelector('#confirm-list .confirm-der').textContent);
  doc.querySelector('#confirm-ok').click();

  ok('la tarea sale del mes', !tarea(window, 't1'), tareas(window).map(t => t.id).join(','));
  ok('  y no queda ninguna marca suya',
    !Object.keys(guardado(window).status).some(k => k.startsWith('t1|')));

  verDia(doc, '2026-07-05');
  ok('  tampoco en los días anteriores', !filas(doc).includes('t1'), filas(doc).join(','));
}
{
  /* «Elegir fecha»: el corte cae donde se lo pone. */
  const { window, doc } = await montar(ESTADO_LLENO);

  editar(doc, 't1');
  doc.querySelector('#task-delete').click();
  borrarDesde(doc, 'fecha', '2026-07-15');
  doc.querySelector('#confirm-ok').click();

  verDia(doc, '2026-07-14');
  ok('el día anterior al corte conserva la fila', filas(doc).includes('t1'),
    filas(doc).join(','));
  verDia(doc, '2026-07-15');
  ok('  y el del corte ya no', !filas(doc).includes('t1'), filas(doc).join(','));

  const marcas = Object.keys(guardado(window).status).filter(k => k.startsWith('t1|'));
  ok('  las marcas del corte en adelante se borraron',
    marcas.every(k => k.split('|')[1] < '2026-07-15'),
    marcas.filter(k => k.split('|')[1] >= '2026-07-15').join(' '));
}
{
  /* Cada tarea con su fecha: elegidas varias y «la fecha de inicio», la
     confirmación tiene que decirlo por fila. */
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-menu').click();
  doc.querySelector('#btn-mode-delete').click();
  [...doc.querySelectorAll('.task-pick[data-task-id]')].slice(0, 3).forEach(c => c.click());
  doc.querySelector('#btn-menu').click();
  doc.querySelector('#btn-mode-ok').click();

  borrarDesde(doc, 'fecha', '2026-07-20');
  const filasConf = [...doc.querySelectorAll('#confirm-list li')]
    .map(li => `${li.querySelector('.confirm-izq').textContent}=${li.querySelector('.confirm-der').textContent}`);
  ok('una fila por tarea, con su fecha al costado', filasConf.length === 3, filasConf.join(' · '));
  ok('  y todas dicen el mismo día elegido',
    filasConf.every(f => /desde el 20\/07\/2026/.test(f)), filasConf.join(' · '));
}
{
  /* Una tarea que EMPIEZA después del corte no deja nada atrás: se va entera, y
     la confirmación lo dice en vez de prometer un recorte que no existe.
     `t5` empieza el 10 de julio. */
  const { doc } = await montar(ESTADO_LLENO);

  editar(doc, 't5');
  doc.querySelector('#task-delete').click();
  borrarDesde(doc, 'fecha', '2026-07-05');
  /* Cortar antes del inicio no borra nada de más, así que la fecha que se
     muestra es la de inicio: es el primer día que se va. */
  ok('cortar antes del inicio muestra la fecha de inicio',
    doc.querySelector('#confirm-list .confirm-der').textContent === 'desde el 10/07/2026',
    doc.querySelector('#confirm-list .confirm-der').textContent);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
