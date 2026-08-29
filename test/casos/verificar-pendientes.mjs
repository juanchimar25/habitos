/* Pendientes: lo que hay que hacer una vez, sin frecuencia ni puntaje.

   Dos vistas de la MISMA lista —por categoría y por fecha—, tres estados que se
   ciclan tocando, y un anidado que llega hasta la subcategoría y no más.

   Lo que se comprueba acá es sobre todo lo que no se ve: que borrar una
   categoría no se lleve puesto lo que tiene adentro, que un archivo importado
   con datos rotos no deje la lista sin poder recorrerse, y que todo esto viaje
   al almacenamiento —y por lo tanto a la base— como el resto de los datos.

   Arnés: hoy = jueves 30 de julio de 2026. */
import { montar } from '../harness.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const VACIO = { months: {}, status: {}, theme: 'light' };

const guardado = w => JSON.parse(w.localStorage.getItem('tareas-diarias/v1/u-test'));
const enviar = (doc, form) => doc.querySelector(form)
  .dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

const irAPendientes = doc => doc.querySelector('[data-page="todos"]').click();

/** Crea una categoría; `padre` es el nombre de la que la contiene. */
const nuevaCategoria = (doc, nombre, padre = '') => {
  doc.querySelector('#btn-pend-categoria').click();
  doc.querySelector('#categoria-name').value = nombre;
  const select = doc.querySelector('#categoria-padre');
  const opcion = [...select.options].find(o => o.textContent === padre);
  select.value = opcion ? opcion.value : '';
  enviar(doc, '#categoria-form');
};

/** Crea un pendiente desde el «+», que es el único camino. */
const nuevoPendiente = (doc, nombre, { categoria = '', fecha = '', estado = '' } = {}) => {
  doc.querySelector('#btn-fab').click();
  doc.querySelector('#pendiente-name').value = nombre;
  const select = doc.querySelector('#pendiente-categoria');
  const opcion = [...select.options].find(o => o.textContent === categoria);
  select.value = opcion ? opcion.value : '';
  doc.querySelector('#pendiente-fecha').value = fecha;
  if (estado) {
    doc.querySelector(`#pendiente-form input[name="pendiente-estado"][value="${estado}"]`)
      .checked = true;
  }
  enviar(doc, '#pendiente-form');
};

const nombres = doc => [...doc.querySelectorAll('#pend-lista .pend-nombre')]
  .map(n => n.textContent);
const categorias = doc => [...doc.querySelectorAll('#pend-lista .pend-cat-nombre')]
  .map(n => n.textContent);

// --- 1. la pantalla vacía ---------------------------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);

  ok('la sección se muestra', doc.querySelector('#todos').hidden === false);
  ok('  y arranca en la lista', doc.querySelector('#btn-pend-lista').getAttribute('aria-pressed') === 'true');
  ok('  con el cartel de bienvenida', doc.querySelector('#pend-vacio').hidden === false);
  /* El «+» es el mismo botón de Hábitos y acá crea un pendiente: mismo gesto
     para la misma intención. */
  ok('  y el «+» a mano, diciendo qué crea',
    doc.querySelector('#btn-fab').hidden === false
      && doc.querySelector('#btn-fab').getAttribute('aria-label') === 'Agregar pendiente',
    doc.querySelector('#btn-fab').getAttribute('aria-label'));
  /* En la lista no hay mes que elegir: el selector es del calendario. */
  ok('  sin ☰ ni línea de mes',
    doc.querySelector('#btn-menu').hidden === true
      && doc.querySelector('.controls').hidden === true);
  /* Cada vista deja a la vista lo suyo: las categorías ordenan la lista, el mes
     mueve el calendario. */
  ok('  y con «Nueva categoría», que es de la lista',
    doc.querySelector('#btn-pend-categoria').hidden === false);

  doc.querySelector('#btn-pend-calendario').click();
  ok('en el calendario se cambian de lugar: aparece el mes',
    doc.querySelector('.controls').hidden === false);
  ok('  y «Nueva categoría» se va',
    doc.querySelector('#btn-pend-categoria').hidden === true);
  /* El mes va DEBAJO del par de vistas: ahí es un control de esta pantalla, no
     el encabezado de la app. Se mueve el nodo, así que hay uno solo. */
  ok('  con el mes debajo del par de vistas',
    doc.querySelector('#pend-barra').nextElementSibling === doc.querySelector('.controls'));

  doc.querySelector('#btn-pend-lista').click();
  ok('y al volver a la lista el mes vuelve a su lugar',
    doc.querySelector('.controls').parentElement === doc.querySelector('.app-main')
      && doc.querySelector('.controls').hidden === true);
  ok('  y «Nueva categoría» vuelve',
    doc.querySelector('#btn-pend-categoria').hidden === false);
}

// --- 2. categorías, subcategorías y pendientes ------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);

  nuevaCategoria(doc, 'Casa');
  nuevaCategoria(doc, 'Cocina', 'Casa');
  nuevoPendiente(doc, 'Cambiar la canilla', { categoria: 'Casa › Cocina', fecha: '2026-07-31' });
  nuevoPendiente(doc, 'Pagar expensas', { categoria: 'Casa' });
  nuevoPendiente(doc, 'Llamar al banco');

  console.log(`\n=== la lista ===\n  ${doc.querySelector('#pend-lista').textContent.replace(/\s+/g, ' ').trim()}`);

  ok('el cartel se va con la primera cosa anotada',
    doc.querySelector('#pend-vacio').hidden === true);
  ok('las dos categorías están', categorias(doc).join(',') === 'Casa,Cocina', categorias(doc).join(','));
  ok('  y la subcategoría va sangrada adentro de su padre',
    doc.querySelector('.pend-nivel-0 .pend-nivel-1 .pend-cat-nombre')?.textContent === 'Cocina');
  ok('los tres pendientes están',
    nombres(doc).join(',') === 'Pagar expensas,Cambiar la canilla,Llamar al banco',
    nombres(doc).join(','));

  /* Lo suelto va al final, bajo un encabezado que no se edita: no es una
     categoría más, es su ausencia. */
  ok('lo que no tiene categoría cae en «Sin categoría»',
    doc.querySelector('.pend-sueltos')?.textContent === 'Sin categoría');
  ok('  y no cuenta como categoría editable', categorias(doc).includes('Sin categoría') === false);

  /* La cuenta de una categoría incluye lo de sus subcategorías: es lo único
     que queda a la vista cuando está plegada. */
  const cuentas = [...doc.querySelectorAll('.pend-cat-cuenta')].map(c => c.textContent);
  ok('la cuenta de la categoría suma lo de adentro', cuentas.join(',') === '2,1', cuentas.join(','));

  // Solo aparece la fecha del que la tiene: es opcional a propósito.
  const fechas = [...doc.querySelectorAll('.pend-fecha')].map(f => f.textContent);
  ok('la fecha se muestra solo donde la hay', fechas.length === 1, fechas.join(','));
}

// --- 3. el anidado llega hasta la subcategoría ------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  nuevaCategoria(doc, 'Casa');
  nuevaCategoria(doc, 'Cocina', 'Casa');

  /* Una subcategoría no puede ser padre: con una cadena libre habría que
     dibujar una sangría sin fondo. */
  doc.querySelector('#btn-pend-categoria').click();
  const ofrecidas = [...doc.querySelector('#categoria-padre').options].map(o => o.textContent);
  ok('solo las de primer nivel se ofrecen como padre',
    ofrecidas.join(' | ') === 'Ninguna (primer nivel) | Casa', ofrecidas.join(' | '));
  doc.querySelector('#categoria-dialog').close();

  // Y una que ya tiene hijas tampoco puede mudarse adentro de otra.
  nuevaCategoria(doc, 'Trabajo');
  doc.querySelector('.pend-cat-nombre').click();          // «Casa», que tiene «Cocina»
  const paraCasa = [...doc.querySelector('#categoria-padre').options].map(o => o.textContent);
  ok('  y una con subcategorías no puede meterse adentro de otra',
    paraCasa.join(' | ') === 'Ninguna (primer nivel)', paraCasa.join(' | '));
}

// --- 4. los tres estados ----------------------------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  nuevoPendiente(doc, 'Llamar al banco');

  const boton = () => doc.querySelector('.pend-estado');
  const dice = () => boton().textContent;

  /* El estado se lee, no se descifra: el botón dice en qué anda y el tooltip
     adónde lleva el toque siguiente. */
  ok('nace sin iniciar', dice() === 'Sin iniciar', dice());
  ok('  y anticipa adónde lleva tocarlo', /pasar a en proceso/.test(boton().title), boton().title);
  boton().click();
  ok('un toque lo pone en proceso', dice() === 'En proceso', dice());
  boton().click();
  ok('otro lo termina', dice() === 'Finalizada', dice());
  ok('  y la fila lo tacha',
    doc.querySelector('.pend-item').className.includes('est-finalizada'));
  boton().click();
  ok('y del último vuelve al principio', dice() === 'Sin iniciar', dice());
}

// --- 5. editar y eliminar ---------------------------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  nuevaCategoria(doc, 'Casa');
  nuevoPendiente(doc, 'Pagar expensas', { categoria: 'Casa' });

  doc.querySelector('.pend-nombre').click();
  ok('el nombre abre la edición',
    doc.querySelector('#pendiente-dialog').hasAttribute('open')
      && doc.querySelector('#pendiente-dialog-title').textContent === 'Editar pendiente');
  ok('  con los datos puestos', doc.querySelector('#pendiente-name').value === 'Pagar expensas');
  ok('  y con «Eliminar» a mano', doc.querySelector('#pendiente-tools').hidden === false);

  doc.querySelector('#pendiente-name').value = 'Pagar las expensas';
  doc.querySelector('#pendiente-fecha').value = '2026-08-05';
  enviar(doc, '#pendiente-form');
  ok('guardar cambia lo que muestra la lista',
    nombres(doc).join(',') === 'Pagar las expensas', nombres(doc).join(','));

  doc.querySelector('.pend-nombre').click();
  doc.querySelector('#pendiente-delete').click();
  ok('eliminar pide confirmación', doc.querySelector('#confirm-dialog').hasAttribute('open'));
  doc.querySelector('#confirm-ok').click();
  ok('  y recién ahí se va', nombres(doc).length === 0);
  ok('  sin llevarse la categoría', categorias(doc).join(',') === 'Casa');
}

// --- 6. borrar una categoría no borra lo que tiene --------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  nuevaCategoria(doc, 'Casa');
  nuevaCategoria(doc, 'Cocina', 'Casa');
  nuevoPendiente(doc, 'Cambiar la canilla', { categoria: 'Casa › Cocina' });
  nuevoPendiente(doc, 'Pagar expensas', { categoria: 'Casa' });

  doc.querySelector('.pend-cat-nombre').click();          // «Casa»
  doc.querySelector('#categoria-delete').click();
  ok('borrar una categoría avisa qué pasa con lo de adentro',
    /no se borra/.test(doc.querySelector('#confirm-note').textContent),
    doc.querySelector('#confirm-note').textContent);
  doc.querySelector('#confirm-ok').click();

  /* Perder trabajo anotado por reordenar carpetas sería un precio absurdo: los
     pendientes quedan sueltos y la subcategoría sube a primer nivel. */
  ok('  los pendientes siguen estando',
    nombres(doc).sort().join(',') === 'Cambiar la canilla,Pagar expensas',
    nombres(doc).join(','));
  ok('  la subcategoría pasa a primer nivel',
    categorias(doc).join(',') === 'Cocina' && doc.querySelector('.pend-nivel-1') === null,
    categorias(doc).join(','));
  ok('  y lo que quedó sin categoría se dice',
    doc.querySelector('.pend-sueltos')?.textContent === 'Sin categoría');
}

// --- 7. plegar --------------------------------------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  nuevaCategoria(doc, 'Casa');
  nuevoPendiente(doc, 'Pagar expensas', { categoria: 'Casa' });

  const flecha = () => doc.querySelector('.pend-cat-toggle');
  flecha().click();
  ok('plegar esconde el contenido y deja la cuenta',
    nombres(doc).length === 0
      && doc.querySelector('.pend-cat-cuenta').textContent === '1');
  ok('  y se anuncia como plegada', flecha().getAttribute('aria-expanded') === 'false');
  flecha().click();
  ok('volver a tocar lo despliega', nombres(doc).join(',') === 'Pagar expensas');
}

// --- 8. el calendario -------------------------------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  nuevoPendiente(doc, 'Cambiar la canilla', { fecha: '2026-07-31' });
  nuevoPendiente(doc, 'Llamar al banco');

  doc.querySelector('#btn-pend-calendario').click();
  const chips = [...doc.querySelectorAll('.pend-cal-item')].map(c => c.textContent);

  ok('el calendario reemplaza a la lista',
    doc.querySelector('#pend-calendario').hidden === false
      && doc.querySelector('#pend-lista').hidden === true);
  /* Es mensual como la planilla, así que usa la misma línea de mes: dos
     selectores para lo mismo serían dos cosas que aprender. */
  ok('  y aparece la línea del mes',
    doc.querySelector('.controls').hidden === false
      && doc.querySelector('#month-label').textContent === 'julio 2026',
    doc.querySelector('#month-label').textContent);
  ok('  con un día por cada día del mes',
    doc.querySelectorAll('.pend-cal-dia').length === 31,
    String(doc.querySelectorAll('.pend-cal-dia').length));
  ok('  el pendiente con fecha cae en su día', chips.join(',') === 'Cambiar la canilla', chips.join(','));
  ok('  el 31 de julio, que es jueves, en la última fila',
    doc.querySelectorAll('.pend-cal-hueco').length === 2,   // julio arranca miércoles
    String(doc.querySelectorAll('.pend-cal-hueco').length));

  /* Lo que no tiene fecha no cabe en la rejilla, pero existe: se cuenta al pie
     para que no parezca que se perdió al cambiar de vista. */
  ok('  y lo que no tiene fecha se cuenta al pie',
    /1 pendiente sin fecha/.test(doc.querySelector('.pend-cal-nota').textContent),
    doc.querySelector('.pend-cal-nota').textContent);

  doc.querySelector('.pend-cal-item').click();
  ok('  tocar uno abre su edición',
    doc.querySelector('#pendiente-dialog').hasAttribute('open')
      && doc.querySelector('#pendiente-name').value === 'Cambiar la canilla');
}

// --- 9. tocar un día crea ahí ----------------------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  doc.querySelector('#btn-pend-calendario').click();

  const dia20 = doc.querySelector('.pend-cal-dia[data-fecha="2026-07-20"]');
  dia20.click();

  ok('tocar un día abre el alta', doc.querySelector('#pendiente-dialog').hasAttribute('open')
    && doc.querySelector('#pendiente-dialog-title').textContent === 'Nuevo pendiente');
  ok('  con esa fecha ya puesta', doc.querySelector('#pendiente-fecha').value === '2026-07-20',
    doc.querySelector('#pendiente-fecha').value);
  ok('  y lo dice antes de tocarlo', /20 de julio/.test(dia20.title), dia20.title);

  doc.querySelector('#pendiente-name').value = 'Ir al dentista';
  enviar(doc, '#pendiente-form');
  ok('  y el pendiente queda en ese día',
    doc.querySelector('.pend-cal-dia[data-fecha="2026-07-20"] .pend-cal-item')?.textContent
      === 'Ir al dentista');
}

// --- 10. arrastrar de un día a otro -----------------------------------------
{
  /* El arrastre va con eventos de puntero —el nativo de HTML5 no existe en el
     teléfono—, y jsdom no trae ni PointerEvent ni `elementFromPoint`: se
     simulan los dos, que es lo que aporta el navegador. */
  const { doc, window } = await montar({
    ...VACIO,
    pendientes: {
      categorias: [],
      items: [{ id: 'p1', name: 'Ir al dentista', categoria: null, estado: 'sin-iniciar', fecha: '2026-07-20' }],
    },
  });
  irAPendientes(doc);
  doc.querySelector('#btn-pend-calendario').click();

  const celda = iso => doc.querySelector(`.pend-cal-dia[data-fecha="${iso}"]`);
  const chip = () => doc.querySelector('.pend-cal-item');
  const dondeEsta = () => [...doc.querySelectorAll('.pend-cal-dia')]
    .find(c => c.querySelector('.pend-cal-item'))?.dataset.fecha;

  /** Un evento de puntero con lo poco que el código le mira. */
  const puntero = (tipo, nodo, x, y) => {
    const e = new window.Event(tipo, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX: x, clientY: y, pointerId: 1, button: 0 });
    nodo.dispatchEvent(e);
  };
  /** Arrastra el chip hasta la celda de `iso`. */
  const arrastrar = (destino, pasos = [[100, 100], [200, 300]]) => {
    doc.elementFromPoint = () => destino;
    const origen = chip();
    puntero('pointerdown', origen, 100, 100);
    for (const [x, y] of pasos) puntero('pointermove', origen, x, y);
    puntero('pointerup', origen, ...pasos.at(-1));
  };

  ok('arranca donde lo dejaron', dondeEsta() === '2026-07-20', dondeEsta());

  arrastrar(celda('2026-07-28'));
  ok('arrastrarlo a otro día lo mueve', dondeEsta() === '2026-07-28', dondeEsta());
  ok('  y lo dice', /pasó al martes, 28 de julio/.test(doc.querySelector('.toast')?.textContent ?? ''),
    doc.querySelector('.toast')?.textContent ?? '(sin aviso)');
  ok('  guardándolo', JSON.parse(window.localStorage.getItem('tareas-diarias/v1/u-test'))
    .pendientes.items[0].fecha === '2026-07-28');

  /* El clic que llega después de soltar no es un toque: sin eso, mover algo
     abriría además su diálogo. */
  chip().click();
  ok('  sin abrir el diálogo al soltar',
    doc.querySelector('#pendiente-dialog').hasAttribute('open') === false);

  // Soltarlo en el mismo día no cambia nada.
  arrastrar(celda('2026-07-28'));
  ok('soltarlo donde estaba no hace nada', dondeEsta() === '2026-07-28', dondeEsta());

  /* Y sin movimiento no hay arrastre: sigue siendo un toque, que abre el
     diálogo. Es lo que hace que tocar un pendiente en el celular no lo mueva. */
  doc.elementFromPoint = () => celda('2026-07-10');
  puntero('pointerdown', chip(), 100, 100);
  puntero('pointermove', chip(), 102, 101);      // menos que el umbral
  puntero('pointerup', chip(), 102, 101);
  ok('un toque quieto no lo mueve', dondeEsta() === '2026-07-28', dondeEsta());
  chip().click();
  ok('  y abre su edición',
    doc.querySelector('#pendiente-dialog').hasAttribute('open')
      && doc.querySelector('#pendiente-name').value === 'Ir al dentista');
}

// --- 11. se guarda ----------------------------------------------------------
{
  const { doc, window } = await montar(VACIO);
  irAPendientes(doc);
  nuevaCategoria(doc, 'Casa');
  nuevoPendiente(doc, 'Pagar expensas', { categoria: 'Casa', fecha: '2026-08-05' });
  doc.querySelector('.pend-estado').click();

  const { pendientes } = guardado(window);
  console.log(`\n=== lo guardado ===\n  ${JSON.stringify(pendientes)}`);

  ok('la categoría se guarda', pendientes.categorias.length === 1
    && pendientes.categorias[0].name === 'Casa'
    && pendientes.categorias[0].padre === null);
  ok('el pendiente también, con todo lo suyo',
    pendientes.items[0].name === 'Pagar expensas'
      && pendientes.items[0].fecha === '2026-08-05'
      && pendientes.items[0].estado === 'en-proceso'
      && pendientes.items[0].categoria === pendientes.categorias[0].id,
    JSON.stringify(pendientes.items[0]));

  // Y vuelve igual: es lo que hace que sobreviva a recargar o a sincronizar.
  const { doc: doc2 } = await montar({ ...VACIO, pendientes });
  irAPendientes(doc2);
  ok('y vuelve entero al recargar',
    categorias(doc2).join(',') === 'Casa' && nombres(doc2).join(',') === 'Pagar expensas',
    `${categorias(doc2).join(',')} · ${nombres(doc2).join(',')}`);
}

// --- 12. datos rotos que entran de afuera -----------------------------------
{
  /* Lo que llega de un archivo importado o de una base vieja no se descarta si
     se lo puede enderezar: se lo endereza. Lo que no se puede leer, se tira. */
  const sucio = {
    ...VACIO,
    pendientes: {
      categorias: [
        { id: 'c1', name: 'Casa' },
        { id: 'c2', name: 'Cocina', padre: 'c1' },
        { id: 'c3', name: 'Alacena', padre: 'c2' },      // tercer nivel: sube a raíz
        { id: 'c4', name: 'Bucle', padre: 'c4' },        // su propio padre: sube a raíz
        { id: 'c1', name: 'Repetida' },                  // id repetido: se descarta
        { id: 'c5', name: '   ' },                       // sin nombre: se descarta
      ],
      items: [
        { id: 'p1', name: 'Con fecha rota', fecha: '31/07/2026' },
        { id: 'p2', name: 'Con estado inventado', estado: 'quizás' },
        { id: 'p3', name: 'En una categoría que no existe', categoria: 'c9' },
        { id: 'p4', name: '' },                          // sin nombre: se descarta
      ],
    },
  };
  const { doc, window } = await montar(sucio);
  irAPendientes(doc);
  /* Se mira lo que la pantalla dibuja, que es donde el saneado se nota; el
     estado guardado se compara después, cuando algo lo haga escribir. */
  console.log(`\n=== lo que sobrevive ===\n  ${doc.querySelector('#pend-lista').textContent.replace(/\s+/g, ' ').trim()}`);

  ok('las categorías ilegibles se descartan',
    categorias(doc).join(',') === 'Casa,Cocina,Alacena,Bucle', categorias(doc).join(','));
  ok('  el tercer nivel sube a primer nivel',
    [...doc.querySelectorAll('.pend-nivel-1 .pend-cat-nombre')].map(n => n.textContent)
      .join(',') === 'Cocina');
  ok('  y una que se apunta a sí misma también',
    [...doc.querySelectorAll('#pend-lista > .pend-bloque .pend-cat-nombre')]
      .map(n => n.textContent).includes('Bucle'));

  ok('el pendiente sin nombre se descarta', nombres(doc).length === 3, nombres(doc).join(','));
  ok('  una fecha ilegible queda vacía', doc.querySelector('.pend-fecha') === null);
  ok('  un estado inventado arranca sin iniciar',
    [...doc.querySelectorAll('.pend-estado')].every(b => b.textContent === 'Sin iniciar'));
  /* Una categoría que no existe deja al pendiente suelto, no lo borra con ella:
     es la misma decisión que toma la pantalla al eliminar una. */
  ok('  y una categoría que no existe lo deja suelto',
    doc.querySelector('.pend-sueltos') !== null && nombres(doc).length === 3);

  // Y lo saneado es lo que se guarda: un toque cualquiera lo escribe.
  doc.querySelector('.pend-estado').click();
  const limpio = guardado(window).pendientes;
  ok('  el saneado es lo que queda guardado',
    limpio.categorias.length === 4 && limpio.items.length === 3
      && limpio.categorias.find(c => c.name === 'Alacena').padre === null
      && limpio.categorias.find(c => c.name === 'Cocina').padre === 'c1',
    JSON.stringify(limpio.categorias));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
