/* Guardar el mes como plantilla, y borrar plantillas.

   El tope es de cinco EN TOTAL contando las que trae la app, y las de fábrica
   también se borran: es lo que le da sentido al límite. Sin poder sacarlas,
   cuatro de los cinco lugares estarían tomados de entrada.

   De una plantilla de fábrica borrada se guarda su ausencia —el id en
   `removedTemplates`— y no la lista completa: copiar las cuatro al payload las
   congelaría en la versión que tuvieran ese día.

   Arnés: hoy = jueves 30/07/2026. */
import { montar, verDia } from '../harness.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const tarea = (id, name, freq, extra = {}) => ({
  id, name, freq, customMode: 'weekdays', weekdays: [], target: 12, start: '2026-07-01', ...extra,
});

const TAREAS = [
  tarea('t1', 'Leer', 'daily'),
  tarea('t2', 'Correr', 'custom', { weekdays: [1, 3, 5] }),
  tarea('t3', 'Socializar', 'custom', { customMode: 'count', target: 8 }),
];

const estado = (extra = {}) => ({
  months: { '2026-07': TAREAS },
  status: {},
  complianceMode: 'both',
  panels: { tiles: true, charts: true },
  theme: 'light',
  ...extra,
});

const FABRICA = 4;   // las que trae TEMPLATES

/** Nombres de las fichas que muestra el diálogo de plantillas. */
const listar = doc => [...doc.querySelectorAll('#templates-list .tpl-name')]
  .map(n => n.textContent);

const abrirPlantillas = doc => {
  doc.querySelector('#btn-templates').click();
  return listar(doc);
};

/** Guarda el mes como plantilla con ese nombre. Devuelve el error, si hubo. */
const guardar = (doc, nombre) => {
  doc.querySelector('#btn-save-template').click();
  doc.querySelector('#save-template-name').value = nombre;
  doc.querySelector('#save-template-form').dispatchEvent(
    new doc.defaultView.Event('submit', { cancelable: true, bubbles: true }));
  const err = doc.querySelector('#save-template-error');
  return err.hidden ? '' : err.textContent;
};

/** Borra la plantilla cuyo nombre coincide, confirmando el diálogo. */
const borrar = (doc, nombre) => {
  const ficha = [...doc.querySelectorAll('#templates-list .tpl')]
    .find(c => c.querySelector('.tpl-name').textContent === nombre);
  if (!ficha) throw new Error(`No hay ficha «${nombre}»`);
  ficha.querySelector('.tpl-del').click();
  doc.querySelector('#confirm-ok').click();
};

const guardado = window => JSON.parse(
  window.localStorage.getItem('tareas-diarias/v1/u-test') || '{}');

// --- guarda las tareas del DÍA, no las del mes -----------------------------
{
  /* La pantalla muestra un día: lo que se guarda tiene que ser eso. Con la
     lista del mes se guardaban tareas que ese día ni siquiera existían —las que
     empiezan más adelante— y que no estaban a la vista al apretar el botón.

     Acá «Correr» arranca el 20 y las otras dos el 1. */
  const { window, doc } = await montar(estado({
    months: {
      '2026-07': [
        tarea('t1', 'Leer', 'daily'),
        tarea('t2', 'Correr', 'daily', { start: '2026-07-20' }),
        tarea('t3', 'Socializar', 'daily'),
      ],
    },
  }));

  verDia(doc, '2026-07-15');
  ok('la nota del diálogo nombra el día',
    (doc.querySelector('#btn-save-template').title.match(/del .*julio/) ?? [''])[0] !== '',
    doc.querySelector('#btn-save-template').title);

  ok('se guarda sin error', guardar(doc, 'Ese día') === '');

  const tpl = guardado(window).templates.at(-1);
  console.log('  guardadas:', tpl.tasks.map(t => t.name).join(' · '));
  ok('guarda solo las que ya existían ese día', tpl.tasks.length === 2,
    String(tpl.tasks.length));
  ok('sin la que arranca más adelante', !tpl.tasks.some(t => t.name === 'Correr'),
    tpl.tasks.map(t => t.name).join(','));
}
{
  /* Un día sin ninguna tarea empezada no tiene nada que guardar, y el botón lo
     dice en vez de guardar una plantilla vacía. */
  const { doc } = await montar(estado({
    months: { '2026-07': [tarea('t1', 'Leer', 'daily', { start: '2026-07-20' })] },
  }));

  verDia(doc, '2026-07-15');
  const btn = doc.querySelector('#btn-save-template');
  ok('sin tareas ese día, el botón se apaga', btn.disabled === true);
  ok('y dice por qué', /día no tiene tareas/i.test(btn.title), btn.title);
}

// --- el mes se guarda como plantilla ---------------------------------------
{
  const { window, doc } = await montar(estado());

  const antes = abrirPlantillas(doc);
  console.log(`=== de fábrica ===\n  ${antes.join(' · ')}`);
  ok('vienen cuatro de fábrica', antes.length === FABRICA, String(antes.length));

  doc.querySelector('#templates-dialog').close();
  const err = guardar(doc, 'mi rutina');
  ok('se guarda sin error', err === '', err);

  const lista = abrirPlantillas(doc);
  console.log(`\n=== después de guardar ===\n  ${lista.join(' · ')}`);
  ok('ahora hay cinco', lista.length === FABRICA + 1, String(lista.length));
  ok('la propia va al final', lista[lista.length - 1] === 'Mi rutina', lista.at(-1));
  ok('con la primera letra en mayúscula', lista.includes('Mi rutina'));

  const g = guardado(window);
  ok('queda en el estado que se sube', g.templates?.length === 1,
    JSON.stringify(g.templates?.map(t => t.name)));

  const tpl = g.templates[0];
  console.log(`\n=== lo que se guardó ===\n  ${JSON.stringify(tpl, null, 1).replace(/\n\s*/g, ' ')}`);

  ok('guarda las tres tareas', tpl.tasks.length === 3, String(tpl.tasks.length));
  ok('con su nombre y frecuencia',
    tpl.tasks[0].name === 'Leer' && tpl.tasks[0].freq === 'daily',
    JSON.stringify(tpl.tasks[0]));
  ok('los días fijos viajan', JSON.stringify(tpl.tasks[1].weekdays) === '[1,3,5]',
    JSON.stringify(tpl.tasks[1]));
  ok('la meta mensual también', tpl.tasks[2].target === 8, JSON.stringify(tpl.tasks[2]));
  ok('sin fecha de inicio: la elige quien la aplica',
    tpl.tasks.every(t => !('start' in t)), JSON.stringify(tpl.tasks));
  ok('y sin id: la plantilla crea tareas nuevas',
    tpl.tasks.every(t => !('id' in t)), JSON.stringify(tpl.tasks));
  /* Nombra el DÍA del que salió, que es de donde se tomaron las tareas. En
     minúscula: el mes viene así del locale y es lo correcto en medio de una
     oración. */
  ok('la descripción dice de qué día salió', tpl.description === 'Guardada desde el 30 jul',
    tpl.description);
}

// --- nombres repetidos ------------------------------------------------------
{
  /* Se arranca con dos de fábrica borradas para tener lugar: si no, el tope de
     cinco pega antes que la validación del nombre y no se probaría nada. */
  const { doc } = await montar(estado({ removedTemplates: ['basicos', 'salud-higiene'] }));

  ok('la primera entra', guardar(doc, 'Mi rutina') === '');

  const err = guardar(doc, 'MI RUTINA');
  console.log(`\n=== nombre repetido ===\n  ${err}`);
  ok('no deja repetir nombre, sin importar mayúsculas', /ya hay una plantilla/i.test(err), err);

  const err2 = guardar(doc, 'Día completo');
  ok('tampoco contra las de fábrica', /ya hay una plantilla/i.test(err2), err2);
}

// --- el tope de cinco -------------------------------------------------------
{
  const { doc } = await montar(estado());

  // Con las cuatro de fábrica, entra una sola propia.
  ok('la primera entra', guardar(doc, 'Una') === '');

  const btn = doc.querySelector('#btn-save-template');
  console.log(`\n=== con los cinco lugares ocupados ===\n  ${btn.title}`);
  ok('el botón queda apagado', btn.disabled === true, String(btn.disabled));
  ok('y el título dice por qué', /borrá una/i.test(btn.title), btn.title);

  // Aun forzándolo, el guardado se niega.
  const err = guardar(doc, 'Dos');
  ok('forzarlo tampoco guarda', /5 plantillas/.test(err), err);
  ok('siguen siendo cinco', abrirPlantillas(doc).length === 5,
    String(abrirPlantillas(doc).length));
}

// --- borrar libera lugar ----------------------------------------------------
{
  const { window, doc } = await montar(estado());
  guardar(doc, 'Una');

  abrirPlantillas(doc);
  borrar(doc, 'Limpieza del hogar');          // una de fábrica

  const lista = listar(doc);
  console.log(`\n=== tras borrar una de fábrica ===\n  ${lista.join(' · ')}`);
  ok('sale de la lista sin cerrar el diálogo', !lista.includes('Limpieza del hogar'),
    lista.join(' · '));
  ok('quedan cuatro', lista.length === 4, String(lista.length));

  const g = guardado(window);
  ok('se guarda su ausencia, no la lista entera',
    JSON.stringify(g.removedTemplates) === '["limpieza-hogar"]',
    JSON.stringify(g.removedTemplates));
  ok('las de fábrica no se copian al payload', g.templates.length === 1,
    String(g.templates.length));

  ok('el botón de guardar vuelve a encenderse',
    doc.querySelector('#btn-save-template').disabled === false);
}

// --- una de fábrica borrada no vuelve al recargar ---------------------------
{
  const { doc } = await montar(estado({ removedTemplates: ['basicos', 'dia-completo'] }));
  const lista = abrirPlantillas(doc);
  console.log(`\n=== estado guardado con dos de fábrica borradas ===\n  ${lista.join(' · ')}`);

  ok('no vuelven a aparecer', !lista.includes('Hábitos básicos')
    && !lista.includes('Día completo'), lista.join(' · '));
  ok('las otras dos siguen', lista.length === 2, String(lista.length));
  ok('y ahora entran tres propias',
    doc.querySelector('#btn-save-template').disabled === false);
}

// --- borrar una propia ------------------------------------------------------
{
  const { window, doc } = await montar(estado());
  guardar(doc, 'Una');
  abrirPlantillas(doc);
  borrar(doc, 'Una');

  ok('la propia sale de la lista', !listar(doc).includes('Una'), listar(doc).join(' · '));
  ok('y del estado', guardado(window).templates.length === 0,
    JSON.stringify(guardado(window).templates));
}

// --- sin tareas no hay nada que guardar -------------------------------------
{
  const { doc } = await montar({ ...estado(), months: { '2026-07': [] } });
  const btn = doc.querySelector('#btn-save-template');
  console.log(`\n=== mes sin tareas ===\n  ${btn.title}`);
  ok('el botón está apagado', btn.disabled === true, String(btn.disabled));
  ok('y lo explica', /no tiene tareas/i.test(btn.title), btn.title);
}

// --- lo que llega de afuera se sanea ----------------------------------------
{
  /* Un archivo importado puede traer cualquier cosa. Se recorta al tope, se
     descartan las que no describen nada y los ids de fábrica que ya no
     existen — si mañana se quita una de TEMPLATES, su id no puede quedar
     marcado como borrado para siempre. */
  const { window, doc } = await montar(estado({
    removedTemplates: ['basicos', 'inventada', 'basicos'],
    templates: [
      { id: 'a', name: 'Buena', tasks: [{ name: 'Algo', freq: 'daily' }] },
      { id: 'b', name: 'Sin tareas', tasks: [] },
      { id: 'c', name: '   ', tasks: [{ name: 'X', freq: 'daily' }] },
      { id: 'd', name: 'Buena', tasks: [{ name: 'Otra', freq: 'daily' }] },
      { id: 'e', name: 'Frecuencia rara', tasks: [{ name: 'Y', freq: 'inventada' }] },
      { id: 'f', name: 'De más 1', tasks: [{ name: 'Z', freq: 'daily' }] },
      { id: 'g', name: 'De más 2', tasks: [{ name: 'W', freq: 'daily' }] },
      { id: 'h', name: 'De más 3', tasks: [{ name: 'V', freq: 'daily' }] },
    ],
  }));

  const lista = abrirPlantillas(doc);
  console.log(`\n=== datos sucios ===\n  visibles: ${lista.join(' · ')}`);

  ok('no se pasa del tope', lista.length <= 5, String(lista.length));
  ok('la sin tareas se descarta', !lista.includes('Sin tareas'), lista.join(' · '));
  ok('la de nombre vacío también', !lista.some(n => !n.trim()), lista.join(' · '));
  ok('el nombre repetido se descarta una vez',
    lista.filter(n => n === 'Buena').length === 1, lista.join(' · '));

  /* El almacenamiento todavía tiene lo sembrado: la app saneó en memoria pero
     no reescribió. Se borra una plantilla para forzar el guardado y recién ahí
     se mira qué se persiste de verdad. */
  borrar(doc, 'Buena');
  const g = guardado(window);
  console.log(`  removedTemplates guardado: ${JSON.stringify(g.removedTemplates)}`);

  ok('el id de fábrica inventado se descarta',
    JSON.stringify(g.removedTemplates) === '["basicos"]', JSON.stringify(g.removedTemplates));
  ok('sin duplicados', g.removedTemplates.length === 1, String(g.removedTemplates.length));
  ok('la frecuencia inventada cae en diaria',
    g.templates.find(t => t.name === 'Frecuencia rara')?.tasks[0].freq === 'daily',
    JSON.stringify(g.templates.find(t => t.name === 'Frecuencia rara')));
}

// --- una plantilla guardada se puede aplicar --------------------------------
{
  const { doc } = await montar(estado());
  guardar(doc, 'Mi rutina');

  // Se borra el mes para ver entrar las tareas de la plantilla.
  const { doc: doc2 } = await montar(estado({
    months: { '2026-07': [] },
    templates: [{
      id: 'p1', name: 'Mi rutina', description: 'Guardada desde Julio 2026',
      tasks: [{ name: 'Leer', freq: 'daily' }, { name: 'Correr', freq: 'custom', weekdays: [1, 3, 5] }],
    }],
  }));

  abrirPlantillas(doc2);
  const ficha = [...doc2.querySelectorAll('#templates-list .tpl')]
    .find(c => c.querySelector('.tpl-name').textContent === 'Mi rutina');
  ok('la propia se lista con sus tareas',
    [...ficha.querySelectorAll('.tpl-tasks li')].length === 2,
    String(ficha.querySelectorAll('.tpl-tasks li').length));

  ficha.querySelector('.tpl-add').click();
  const filas = [...doc2.querySelectorAll('#dia-lista .dia-fila .task-name')]
    .map(n => n.textContent.trim());
  console.log(`\n=== aplicada ===\n  ${filas.join(' · ')}`);
  ok('las tareas entran en el mes', filas.length === 2, filas.join(' · '));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
