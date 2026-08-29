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

/** La vista del árbol, que es donde viven las tarjetas de categoría. */
const verCategorias = doc => doc.querySelector('#btn-pend-categorias').click();

/**
 * Toca el «+» parado en la vista donde crea lo que se quiere, y deja la
 * pantalla en la vista que estaba: el «+» crea lo que la vista muestra.
 */
const agregar = (doc, que) => {
  const vistaDe = { categoria: 'categorias', pendiente: 'lista' };
  const previa = [...doc.querySelectorAll('.pend-vista')]
    .find(b => b.getAttribute('aria-pressed') === 'true')?.dataset.vista;

  doc.querySelector(`#btn-pend-${vistaDe[que]}`).click();
  doc.querySelector('#btn-fab').click();
  if (previa && previa !== vistaDe[que]) doc.querySelector(`#btn-pend-${previa}`).click();
};

/** Crea una categoría; `padre` es el nombre de la que la contiene. */
const nuevaCategoria = (doc, nombre, padre = '') => {
  agregar(doc, 'categoria');
  doc.querySelector('#categoria-name').value = nombre;
  const select = doc.querySelector('#categoria-padre');
  const opcion = [...select.options].find(o => o.textContent === padre);
  select.value = opcion ? opcion.value : '';
  enviar(doc, '#categoria-form');
};

/**
 * Crea un pendiente desde el «+». `categoria` acepta «Madre» o «Madre › Hija»:
 * el formulario las elige en dos pasos, uno por desplegable.
 */
const nuevoPendiente = (doc, nombre, { categoria = '', fecha = '', estado = '' } = {}) => {
  agregar(doc, 'pendiente');
  doc.querySelector('#pendiente-name').value = nombre;

  const [madre, hija] = categoria.split(' › ');
  const elegir = (id, texto) => {
    const select = doc.querySelector(id);
    const opcion = [...select.options].find(o => o.textContent === texto);
    select.value = opcion ? opcion.value : '';
    select.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  };
  elegir('#pendiente-categoria', madre ?? '');
  if (hija) elegir('#pendiente-subcategoria', hija);
  doc.querySelector('#pendiente-fecha').value = fecha;
  if (estado) {
    doc.querySelector(`#pendiente-form input[name="pendiente-estado"][value="${estado}"]`)
      .checked = true;
  }
  enviar(doc, '#pendiente-form');
};

const nombres = doc => [...doc.querySelectorAll('#pend-lista .pend-nombre')]
  .map(n => n.textContent);
/* Las categorías que arma cada escenario. «Varios» y su subcategoría están
   siempre —son el piso que sostiene que ninguna tarea quede sin categoría— y
   ensuciarían todas las listas que estos casos comparan, así que se filtran acá
   y se prueban aparte. */
const categorias = doc => [...doc.querySelectorAll('#pend-lista .pend-cat-nombre')]
  .map(n => n.textContent)
  .filter(n => n !== 'Varios');

/** Abre el diálogo de una categoría por su nombre, no por su posición. */
const editarCategoria = (doc, nombre) => {
  const cabecera = [...doc.querySelectorAll('#pend-lista .pend-cat')]
    .find(c => c.querySelector('.pend-cat-nombre').textContent === nombre);
  if (!cabecera) throw new Error(`no encontré la categoría «${nombre}»`);
  cabecera.querySelector('.pend-cat-editar').click();
};

// --- 1. la pantalla vacía ---------------------------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);

  ok('la sección se muestra', doc.querySelector('#todos').hidden === false);
  ok('  y arranca en la lista', doc.querySelector('#btn-pend-lista').getAttribute('aria-pressed') === 'true');
  /* El cartel de bienvenida mira que no haya NADA anotado: «Varios» viene de
     fábrica y no cuenta como algo que alguien haya cargado. */
  ok('  con el cartel de bienvenida', doc.querySelector('#pend-vacio').hidden === false);
  /* El «+» es el mismo botón de Hábitos y acá crea lo que la vista muestra. */
  const rotuloFab = () => doc.querySelector('#btn-fab').getAttribute('aria-label');
  ok('  y el «+» a mano, diciendo qué crea',
    doc.querySelector('#btn-fab').hidden === false
      && rotuloFab() === 'Agregar tarea pendiente', rotuloFab());
  /* En la lista no hay mes que elegir: el selector es del calendario. */
  ok('  sin ☰ ni línea de mes',
    doc.querySelector('#btn-menu').hidden === true
      && doc.querySelector('.controls').hidden === true);
  /* Las dos cosas que la pantalla contiene —lo que hay que hacer y dónde va—
     cuelgan del «+», así que la barra se quedó solo con el par de vistas. */
  /* La barra: el ☰ a la izquierda, el par de vistas centrado y el orden a la
     derecha. Crear categorías se mudó al «+». */
  const enBarra = [...doc.querySelectorAll('.pend-barra button')].map(b2 => b2.id);
  ok('  con el ☰ a un lado y el orden al otro',
    enBarra.join(',') === 'btn-pend-menu,btn-pend-lista,btn-pend-categorias,'
      + 'btn-pend-calendario,btn-pend-orden',
    enBarra.join(','));

  /* Sin paso intermedio: en «Lista» abre el alta de una tarea pendiente… */
  doc.querySelector('#btn-fab').click();
  ok('el «+» abre el alta de una tarea pendiente',
    doc.querySelector('#pendiente-dialog').hasAttribute('open')
      && doc.querySelector('#pendiente-dialog-title').textContent === 'Nueva tarea pendiente',
    doc.querySelector('#pendiente-dialog-title').textContent);
  ok('  con el nombre topeado en 35 caracteres',
    doc.querySelector('#pendiente-name').getAttribute('maxlength') === '35',
    doc.querySelector('#pendiente-name').getAttribute('maxlength'));
  doc.querySelector('#pendiente-dialog').close();

  // …y en «Categorías», el de una categoría: crea lo que la vista muestra.
  verCategorias(doc);
  ok('  y en «Categorías» dice que agrega una categoría',
    rotuloFab() === 'Agregar categoría', rotuloFab());
  doc.querySelector('#btn-fab').click();
  ok('  abriendo su formulario',
    doc.querySelector('#categoria-dialog').hasAttribute('open'));
  /* Una categoría puede ser suelta o colgar de otra, y el formulario lo dice
     antes de que haya que adivinarlo. */
  ok('    que aclara cómo queda suelta',
    /categoría suelta/.test(doc.querySelector('#categoria-dialog .field-hint')?.textContent ?? ''),
    doc.querySelector('#categoria-dialog .field-hint')?.textContent);
  /* El mismo tope que el alta de tareas: 35 caracteres, que es lo que entra en
     una fila sin recortarse en un teléfono. */
  ok('    y topea el nombre en 35 caracteres',
    doc.querySelector('#categoria-name').getAttribute('maxlength') === '35',
    doc.querySelector('#categoria-name').getAttribute('maxlength'));
  doc.querySelector('#categoria-dialog').close();
  doc.querySelector('#btn-pend-lista').click();

  doc.querySelector('#btn-pend-calendario').click();
  ok('en el calendario aparece la línea del mes',
    doc.querySelector('.controls').hidden === false);
  /* El mes va DEBAJO del par de vistas: ahí es un control de esta pantalla, no
     el encabezado de la app. Se mueve el nodo, así que hay uno solo. */
  ok('  con el mes debajo del par de vistas',
    doc.querySelector('#pend-barra').nextElementSibling === doc.querySelector('.controls'));

  doc.querySelector('#btn-pend-lista').click();
  ok('y al volver a la lista el mes vuelve a su lugar',
    doc.querySelector('.controls').parentElement === doc.querySelector('.app-main')
      && doc.querySelector('.controls').hidden === true);
}

// --- 2. categorías, subcategorías y pendientes ------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);

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
    [...doc.querySelectorAll('.pend-nivel-0 .pend-nivel-1 .pend-cat-nombre')]
      .some(n => n.textContent === 'Cocina'));
  ok('los tres pendientes están',
    nombres(doc).sort().join(',') === 'Cambiar la canilla,Llamar al banco,Pagar expensas',
    nombres(doc).join(','));
  /* Con mayúscula inicial, se haya escrito como se haya escrito: es el mismo
     criterio que el alta de tareas, y una lista con mayúsculas mezcladas se lee
     peor de lo que cuesta arreglarla. */
  {
    const { doc: d2 } = await montar(VACIO);
    irAPendientes(d2);
    verCategorias(d2);
    nuevaCategoria(d2, 'casa');
    nuevaCategoria(d2, 'cocina', 'Casa');
    nuevoPendiente(d2, 'algo', { categoria: 'Casa › Cocina' });
    ok('la categoría arranca con mayúscula',
      categorias(d2).join(',') === 'Casa,Cocina', categorias(d2).join(','));
  }

  /* La edición de una categoría sale del lápiz y de ningún otro lado, como en
     las tarjetas de Hábitos: un solo lugar donde buscarla en las dos pantallas.
     El nombre es el rótulo del bloque y no abre nada. */
  ok('el lápiz abre la edición de la categoría',
    doc.querySelector('.pend-cat-editar').tagName === 'BUTTON');
  ok('  y el nombre no es un botón',
    doc.querySelector('.pend-cat-nombre').tagName === 'SPAN',
    doc.querySelector('.pend-cat-nombre').tagName);
  editarCategoria(doc, 'Casa');
  ok('  con los datos de esa categoría',
    doc.querySelector('#categoria-dialog').hasAttribute('open')
      && doc.querySelector('#categoria-name').value !== '',
    doc.querySelector('#categoria-name').value);
  doc.querySelector('#categoria-dialog').close();

  /* Nada queda suelto: lo que no se puso en otro lado cae en «Varios», que es
     una categoría de verdad —se puede renombrar y reordenar— y no un cartel. */
  ok('lo que no se puso en ninguna categoría cae en «Varios»',
    doc.querySelector('.pend-sueltos') === null);
  const enVarios = [...doc.querySelectorAll('#pend-lista > .pend-bloque')]
    .find(b => b.querySelector('.pend-cat-nombre')?.textContent === 'Varios');
  ok('  que lo muestra adentro',
    [...enVarios.querySelectorAll('.pend-nombre')].map(n => n.textContent)
      .join(',') === 'Llamar al banco',
    [...enVarios.querySelectorAll('.pend-nombre')].map(n => n.textContent).join(','));

  /* La cuenta de una categoría incluye lo de sus subcategorías: es lo único
     que queda a la vista cuando está plegada. */
  const cuentaDe = nombre => [...doc.querySelectorAll('#pend-lista .pend-cat')]
    .find(c => c.querySelector('.pend-cat-nombre').textContent === nombre)
    ?.querySelector('.pend-cat-cuenta').textContent;
  ok('la cuenta de la categoría suma lo de adentro',
    cuentaDe('Casa') === '2' && cuentaDe('Cocina') === '1',
    `Casa ${cuentaDe('Casa')} · Cocina ${cuentaDe('Cocina')}`);

  // Solo aparece la fecha del que la tiene: es opcional a propósito.
  const fechas = [...doc.querySelectorAll('.pend-fecha')].map(f => f.textContent);
  ok('la fecha se muestra solo donde la hay', fechas.length === 1, fechas.join(','));
}

// --- 3. el anidado llega hasta la subcategoría ------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  nuevaCategoria(doc, 'Cocina', 'Casa');

  /* Una subcategoría no puede ser padre: con una cadena libre habría que
     dibujar una sangría sin fondo. */
  agregar(doc, 'categoria');
  const ofrecidas = [...doc.querySelector('#categoria-padre').options].map(o => o.textContent);
  ok('solo las de primer nivel se ofrecen como padre',
    ofrecidas.join(' | ') === 'Ninguna (primer nivel) | Casa | Varios'
      || ofrecidas.join(' | ') === 'Ninguna (primer nivel) | Varios | Casa',
    ofrecidas.join(' | '));
  doc.querySelector('#categoria-dialog').close();

  // Y una que ya tiene hijas tampoco puede mudarse adentro de otra.
  nuevaCategoria(doc, 'Trabajo');
  doc.querySelector('.pend-cat-editar').click();          // «Casa», que tiene «Cocina»
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
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  nuevoPendiente(doc, 'Pagar expensas', { categoria: 'Casa' });

  doc.querySelector('.pend-editar').click();
  /* El lápiz es la única puerta a la edición de un pendiente, como en las
     categorías: el nombre es el rótulo de la fila y no abre nada. */
  ok('  el nombre no es un botón', doc.querySelector('.pend-nombre').tagName === 'SPAN',
    doc.querySelector('.pend-nombre').tagName);
  ok('el lápiz abre la edición',
    doc.querySelector('#pendiente-dialog').hasAttribute('open')
      && doc.querySelector('#pendiente-dialog-title').textContent === 'Editar tarea pendiente');
  ok('  con los datos puestos', doc.querySelector('#pendiente-name').value === 'Pagar expensas');
  ok('  y con «Eliminar» a mano', doc.querySelector('#pendiente-tools').hidden === false);

  doc.querySelector('#pendiente-name').value = 'Pagar las expensas';
  doc.querySelector('#pendiente-fecha').value = '2026-08-05';
  enviar(doc, '#pendiente-form');
  ok('guardar cambia lo que muestra la lista',
    nombres(doc).join(',') === 'Pagar las expensas', nombres(doc).join(','));

  doc.querySelector('.pend-editar').click();
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
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  nuevaCategoria(doc, 'Cocina', 'Casa');
  nuevoPendiente(doc, 'Cambiar la canilla', { categoria: 'Casa › Cocina' });
  nuevoPendiente(doc, 'Pagar expensas', { categoria: 'Casa' });

  doc.querySelector('.pend-cat-editar').click();          // «Casa»
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
    categorias(doc).join(',') === 'Cocina'
      && doc.querySelector('#pend-lista > .pend-bloque .pend-nivel-1 .pend-cat-nombre')
        ?.textContent !== 'Cocina',
    categorias(doc).join(','));
  /* Y lo que estaba adentro cae en «Varios», que es lo que sostiene que ninguna
     tarea quede sin categoría. */
  const enVarios2 = [...doc.querySelectorAll('#pend-lista > .pend-bloque')]
    .find(b => b.querySelector('.pend-cat-nombre')?.textContent === 'Varios');
  ok('  y sus tareas caen en «Varios»',
    [...enVarios2.querySelectorAll('.pend-nombre')].map(n => n.textContent)
      .includes('Pagar expensas'),
    [...enVarios2.querySelectorAll('.pend-nombre')].map(n => n.textContent).join(','));
}

// --- 6b. reordenar categorías ----------------------------------------------
{
  /* Las mismas tres acciones que «Editar tarea», en el mismo lugar y con el
     mismo orden: eliminar, reordenar y archivar. */
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  nuevaCategoria(doc, 'Cocina', 'Casa');
  nuevaCategoria(doc, 'Baño', 'Casa');
  nuevaCategoria(doc, 'Trabajo');

  const editar = nombre => editarCategoria(doc, nombre);

  editar('Casa');
  const acciones = [...doc.querySelectorAll('#categoria-tools .btn')].map(b => b.textContent.trim());
  ok('la categoría tiene las tres acciones de una tarea',
    acciones.join(' · ') === 'Eliminar · Reordenar · Archivar', acciones.join(' · '));

  ok('  las flechas arrancan guardadas', doc.querySelector('#categoria-move').hidden === true);
  doc.querySelector('#categoria-reorder').click();
  ok('  «Reordenar» las muestra',
    doc.querySelector('#categoria-move').hidden === false
      && doc.querySelector('#categoria-reorder').getAttribute('aria-pressed') === 'true');
  /* La cuenta es entre HERMANAS: «Casa» y «Trabajo» son las dos de primer
     nivel, y las subcategorías no entran en esa lista. */
  /* Tres hermanas de primer nivel: las dos del caso y «Varios», que va última. */
  ok('  y dicen dónde está entre sus hermanas',
    doc.querySelector('#categoria-move-pos').textContent === '1 de 3',
    doc.querySelector('#categoria-move-pos').textContent);
  ok('  sin poder subir la primera', doc.querySelector('#categoria-move-up').disabled === true);

  doc.querySelector('#categoria-move-down').click();
  console.log(`\n=== reordenar categorías ===\n  ${categorias(doc).join(' · ')}`);
  ok('bajarla la mueve, y sus subcategorías van con ella',
    categorias(doc).join(',') === 'Trabajo,Casa,Cocina,Baño', categorias(doc).join(','));
  ok('  y la posición se actualiza sola',
    doc.querySelector('#categoria-move-pos').textContent === '2 de 3',
    doc.querySelector('#categoria-move-pos').textContent);
  doc.querySelector('#categoria-dialog').close();

  // Una subcategoría se mueve adentro de su madre y no sale de ahí.
  editar('Cocina');
  doc.querySelector('#categoria-reorder').click();
  ok('una subcategoría se mueve entre las suyas',
    doc.querySelector('#categoria-move-pos').textContent === '1 de 2',
    doc.querySelector('#categoria-move-pos').textContent);
  doc.querySelector('#categoria-move-down').click();
  ok('  y baja adentro de su madre',
    categorias(doc).join(',') === 'Trabajo,Casa,Baño,Cocina', categorias(doc).join(','));
}

// --- 6c. archivar categorías ------------------------------------------------
{
  const { doc, window } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  nuevaCategoria(doc, 'Cocina', 'Casa');
  nuevaCategoria(doc, 'Trabajo');
  nuevoPendiente(doc, 'Cambiar la canilla', { categoria: 'Casa › Cocina', fecha: '2026-07-20' });
  nuevoPendiente(doc, 'Revisar el informe', { categoria: 'Trabajo' });

  const editar = nombre => editarCategoria(doc, nombre);
  const enArchivo = () => [...doc.querySelectorAll('#pend-archivo-list .arch-name')]
    .map(n => n.textContent);

  editar('Casa');
  ok('el botón ofrece archivar', doc.querySelector('#categoria-archive').textContent === 'Archivar');
  doc.querySelector('#categoria-archive').click();

  /* Archivar no pierde nada ni pregunta nada: la categoría sale de la lista con
     todo lo suyo y queda en ☰ → Archivo, de donde vuelve entera. */
  ok('archivarla la saca de la lista',
    categorias(doc).join(',') === 'Trabajo', categorias(doc).join(','));
  ok('  y lo dice', /quedó guardada/.test(doc.querySelector('.toast')?.textContent ?? ''),
    doc.querySelector('.toast')?.textContent ?? '(sin aviso)');
  ok('  con sus pendientes', nombres(doc).join(',') === 'Revisar el informe',
    nombres(doc).join(','));

  /* Y sale del calendario: archivar es dejar de verlo, y verlo igual ahí sería
     archivar a medias. */
  doc.querySelector('#btn-pend-calendario').click();
  ok('lo guardado sale del calendario',
    doc.querySelectorAll('.pend-cal-item').length === 0,
    String(doc.querySelectorAll('.pend-cal-item').length));
  doc.querySelector('#btn-pend-lista').click();

  // --- ☰ → Archivo ---
  doc.querySelector('#btn-pend-menu').click();
  ok('el ☰ de Pendientes abre el cajón',
    doc.body.classList.contains('drawer-open'));
  ok('  con su apartado', doc.querySelector('#grupo-pendientes').hidden === false);
  ok('  y el Archivo encendido, diciendo cuánto hay',
    doc.querySelector('#btn-pend-archivo').disabled === false
      && /1 cosa guardada/.test(doc.querySelector('#btn-pend-archivo').title),
    doc.querySelector('#btn-pend-archivo').title);

  doc.querySelector('#btn-pend-archivo').click();
  console.log(`\n=== archivo ===\n  ${doc.querySelector('#pend-archivo-list').textContent.replace(/\s+/g, ' ').trim()}`);

  /* Solo las de primer nivel: una subcategoría se guardó CON su madre y vuelve
     con ella, así que ofrecerla suelta prometería algo que no pasa. */
  ok('el Archivo lista la categoría guardada', enArchivo().join(',') === 'Casa',
    enArchivo().join(','));
  ok('  contando lo que se lleva adentro',
    /1 subcategoría · 1 tarea/.test(doc.querySelector('#pend-archivo-list .arch-desc').textContent),
    doc.querySelector('#pend-archivo-list .arch-desc').textContent);
  ok('  y «Desarchivar» arranca apagado',
    doc.querySelector('#pend-archivo-undo').disabled === true);

  doc.querySelector('#pend-archivo-all').click();
  ok('«Seleccionar todas» las tilda y enciende el botón',
    doc.querySelector('#pend-archivo-undo').disabled === false);

  doc.querySelector('#pend-archivo-undo').click();
  verCategorias(doc);
  ok('desarchivar la devuelve a la lista',
    categorias(doc).join(',') === 'Casa,Cocina,Trabajo', categorias(doc).join(','));
  ok('  con todo lo suyo', nombres(doc).sort().join(',') === 'Cambiar la canilla,Revisar el informe',
    nombres(doc).join(','));
  ok('  y el diálogo se cierra al no quedar nada',
    doc.querySelector('#pend-archivo-dialog').hasAttribute('open') === false);

  const { pendientes } = guardado(window);
  ok('y el archivado se guarda',
    pendientes.categorias.every(c => c.archivada === false),
    JSON.stringify(pendientes.categorias.map(c => [c.name, c.archivada])));

  doc.querySelector('#btn-pend-menu').click();
  ok('sin nada guardado, la entrada se apaga',
    doc.querySelector('#btn-pend-archivo').disabled === true);
  ok('  y dice por qué', /No hay nada guardado/.test(doc.querySelector('#btn-pend-archivo').title));
}

// --- 6d. la papelera de Pendientes ------------------------------------------
{
  const { doc, window } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  nuevaCategoria(doc, 'Cocina', 'Casa');
  nuevoPendiente(doc, 'Cambiar la canilla', { categoria: 'Casa › Cocina' });
  nuevoPendiente(doc, 'Pagar expensas', { categoria: 'Casa' });
  nuevoPendiente(doc, 'Llamar al banco');

  const editar = nombre => editarCategoria(doc, nombre);
  const enPapelera = () => [...doc.querySelectorAll('#pend-papelera-list .arch-name')]
    .map(n => n.textContent);
  const abrirPapelera = () => {
    doc.querySelector('#btn-pend-menu').click();
    doc.querySelector('#btn-pend-papelera').click();
  };

  doc.querySelector('#btn-pend-menu').click();
  ok('sin nada borrado la papelera está apagada',
    doc.querySelector('#btn-pend-papelera').disabled === true);

  // Borrar un pendiente lo manda a la papelera, no al vacío.
  doc.querySelectorAll('.pend-editar')[1].click();       // «Cambiar la canilla»
  doc.querySelector('#pendiente-delete').click();
  ok('borrar avisa que queda en la papelera',
    /papelera/.test(doc.querySelector('#confirm-note').textContent),
    doc.querySelector('#confirm-note').textContent);
  doc.querySelector('#confirm-ok').click();

  // Y borrar una categoría también, con lo que se lleva puesto.
  editar('Casa');
  doc.querySelector('#categoria-delete').click();
  doc.querySelector('#confirm-ok').click();

  console.log(`\n=== tras borrar ===\n  ${doc.querySelector('#pend-lista').textContent.replace(/\s+/g, ' ').trim()}`);
  ok('la categoría borrada deja lo suyo suelto',
    categorias(doc).join(',') === 'Cocina', categorias(doc).join(','));

  abrirPapelera();
  console.log(`\n=== papelera ===\n  ${doc.querySelector('#pend-papelera-list').textContent.replace(/\s+/g, ' ').trim()}`);

  /* Lo último borrado va primero: es lo que más probablemente se quiera
     deshacer. */
  ok('la papelera guarda las dos cosas', enPapelera().join(',') === 'Casa,Cambiar la canilla',
    enPapelera().join(','));
  ok('  diciendo qué era cada una y cuánto le queda',
    /Categoría · borrada el .* · quedan 7 días/.test(doc.querySelector('#pend-papelera-list .arch-desc').textContent),
    doc.querySelector('#pend-papelera-list .arch-desc').textContent);

  doc.querySelector('#pend-papelera-all').click();
  doc.querySelector('#pend-papelera-restore').click();

  /* Restaurar una categoría deshace las tres cosas que hizo borrarla: vuelve a
     su lugar, se lleva de vuelta a su subcategoría y recupera los pendientes
     que habían quedado sueltos. */
  ok('restaurar devuelve la categoría a su lugar',
    categorias(doc).join(',') === 'Casa,Cocina', categorias(doc).join(','));
  ok('  con su subcategoría adentro',
    doc.querySelector('.pend-nivel-0 .pend-nivel-1 .pend-cat-nombre')?.textContent === 'Cocina');
  ok('  y el pendiente borrado también vuelve',
    nombres(doc).sort().join(',') === 'Cambiar la canilla,Llamar al banco,Pagar expensas',
    nombres(doc).join(','));
  ok('  la papelera queda vacía y se cierra',
    doc.querySelector('#pend-papelera-dialog').hasAttribute('open') === false
      && guardado(window).pendientes.papelera.length === 0,
    JSON.stringify(guardado(window).pendientes.papelera));
}


// --- 6e. la vista «Lista»: todo junto y por fecha ---------------------------
{
  /* Tres vistas de lo MISMO. «Lista» contesta «qué sigue» —todo junto, sin
     categorías, ordenado por fecha de completado— y «Categorías» contesta
     «dónde está». Lo que no tiene fecha va al final: sin fecha no hay lugar en
     una línea de tiempo, y arriba taparía lo que sí vence pronto. */
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  nuevaCategoria(doc, 'Trabajo');
  nuevoPendiente(doc, 'Sin fecha', { categoria: 'Casa' });
  nuevoPendiente(doc, 'Para el 25', { categoria: 'Trabajo', fecha: '2026-07-25' });
  nuevoPendiente(doc, 'Para el 3', { categoria: 'Casa', fecha: '2026-07-03' });
  nuevoPendiente(doc, 'Para el 12', { fecha: '2026-07-12' });

  doc.querySelector('#btn-pend-lista').click();
  console.log(`\n=== la vista Lista ===\n  ${nombres(doc).join(' · ')}`);

  ok('«Lista» ordena por fecha de completado',
    nombres(doc).join(',') === 'Para el 3,Para el 12,Para el 25,Sin fecha',
    nombres(doc).join(','));
  ok('  y no muestra las categorías', categorias(doc).length === 0,
    categorias(doc).join(','));
  /* Tres tarjetas, una por estado y siempre las tres: el estado deja de ser
     algo que hay que leer fila por fila y pasa a ser el encabezado del bloque. */
  const grupos = [...doc.querySelectorAll('#pend-lista .pend-grupo-nombre')]
    .map(n => n.textContent);
  ok('  agrupadas en tres tarjetas por estado',
    grupos.join(' · ') === 'Sin iniciar · En proceso · Finalizada', grupos.join(' · '));
  const cuentas = [...doc.querySelectorAll('#pend-lista .pend-grupo-cuenta')]
    .map(n => n.textContent);
  /* Las cuatro están sin iniciar, así que las otras dos tarjetas van en cero:
     se muestran igual, porque son el mapa de los tres estados. */
  ok('    con la cuenta de cada una', cuentas.join(',') === '4,0,0', cuentas.join(','));
  ok('    y las vacías lo dicen',
    [...doc.querySelectorAll('#pend-lista .pend-cat-vacia')].length === 2,
    String(doc.querySelectorAll('#pend-lista .pend-cat-vacia').length));

  // Y se pliegan, como las categorías.
  doc.querySelector('#pend-lista .pend-cat-toggle').click();
  ok('    que se pliegan', nombres(doc).length === 0, nombres(doc).join(','));
  doc.querySelector('#pend-lista .pend-cat-toggle').click();
  ok('    y se vuelven a abrir', nombres(doc).length === 4, nombres(doc).join(','));

  verCategorias(doc);
  ok('«Categorías» sí las muestra, con lo suyo adentro',
    categorias(doc).join(',') === 'Casa,Trabajo', categorias(doc).join(','));
  ok('  y ahí las filas cuelgan de su tarjeta',
    doc.querySelectorAll('#pend-lista > .pend-bloque').length === 3,   // + «Sin categoría»
    String(doc.querySelectorAll('#pend-lista > .pend-bloque').length));

  /* Lo guardado tampoco aparece en «Lista»: es la misma lista mirada de otra
     manera, no otra lista. */
  doc.querySelectorAll('.pend-cat-editar')[0].click();
  doc.querySelector('#categoria-archive').click();
  doc.querySelector('#btn-pend-lista').click();
  ok('lo archivado tampoco está en «Lista»',
    nombres(doc).join(',') === 'Para el 12,Para el 25', nombres(doc).join(','));
}

// --- 6f. reordenar y archivar un pendiente ----------------------------------
{
  /* Un pendiente tiene las mismas tres acciones que una tarea y que una
     categoría, en el mismo lugar y el mismo orden. */
  const { doc, window } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  nuevoPendiente(doc, 'Uno', { categoria: 'Casa' });
  nuevoPendiente(doc, 'Dos', { categoria: 'Casa' });
  nuevoPendiente(doc, 'Suelto');

  const abrir = nombre => doc.querySelectorAll('.pend-editar')[nombres(doc).indexOf(nombre)].click();

  abrir('Uno');
  const acciones = [...doc.querySelectorAll('#pendiente-tools .btn')].map(b => b.textContent.trim());
  ok('el pendiente tiene las tres acciones',
    acciones.join(' · ') === 'Eliminar · Reordenar · Archivar', acciones.join(' · '));

  doc.querySelector('#pendiente-reorder').click();
  /* Entre los de SU categoría: «Suelto» no está en esa cuenta aunque esté más
     abajo en la lista. */
  ok('  las flechas cuentan entre los de su categoría',
    doc.querySelector('#pendiente-move-pos').textContent === '1 de 2',
    doc.querySelector('#pendiente-move-pos').textContent);
  doc.querySelector('#pendiente-move-down').click();
  ok('  y bajarlo lo mueve', nombres(doc).join(',') === 'Dos,Uno,Suelto', nombres(doc).join(','));
  ok('    sin tocar a los de afuera',
    nombres(doc).at(-1) === 'Suelto', nombres(doc).join(','));
  doc.querySelector('#pendiente-dialog').close();

  // Archivar lo saca de la lista y lo deja en ☰ → Archivo, junto a las categorías.
  abrir('Dos');
  ok('el botón ofrece archivar',
    doc.querySelector('#pendiente-archive').textContent === 'Archivar');
  doc.querySelector('#pendiente-archive').click();
  ok('archivarlo lo saca de la lista', nombres(doc).join(',') === 'Uno,Suelto',
    nombres(doc).join(','));
  ok('  y lo dice', /quedó guardado/.test(doc.querySelector('.toast')?.textContent ?? ''),
    doc.querySelector('.toast')?.textContent ?? '(sin aviso)');

  doc.querySelector('#btn-pend-menu').click();
  doc.querySelector('#btn-pend-archivo').click();
  console.log(`\n=== archivo con un pendiente ===\n  `
    + doc.querySelector('#pend-archivo-list').textContent.replace(/\s+/g, ' ').trim());

  ok('el Archivo lo muestra',
    [...doc.querySelectorAll('#pend-archivo-list .arch-name')].map(n => n.textContent)
      .join(',') === 'Dos');
  ok('  diciendo que es una tarea pendiente y cómo está',
    /Tarea pendiente · Sin iniciar/.test(doc.querySelector('#pend-archivo-list .arch-desc').textContent),
    doc.querySelector('#pend-archivo-list .arch-desc').textContent);

  doc.querySelector('#pend-archivo-all').click();
  doc.querySelector('#pend-archivo-undo').click();
  ok('y desarchivarlo lo devuelve a su lugar',
    nombres(doc).join(',') === 'Dos,Uno,Suelto', nombres(doc).join(','));
  ok('  y queda guardado así', guardado(window).pendientes.items
    .every(p => p.archivado === false),
    JSON.stringify(guardado(window).pendientes.items.map(p => [p.name, p.archivado])));
}

// --- 6g. el orden de cada vista --------------------------------------------
{
  /* El botón de la derecha cambia el orden de lo que se está mirando, con las
     opciones que le tocan a cada vista: ordenan cosas distintas. */
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
  nuevaCategoria(doc, 'Zapatería');       // 1 tarea
  nuevaCategoria(doc, 'Almacén');         // 3 tareas
  nuevoPendiente(doc, 'Botas', { categoria: 'Zapatería', fecha: '2026-07-05', estado: 'finalizada' });
  nuevoPendiente(doc, 'Aceite', { categoria: 'Almacén', fecha: '2026-07-28' });
  nuevoPendiente(doc, 'Café', { categoria: 'Almacén', estado: 'en-proceso' });
  nuevoPendiente(doc, 'Bananas', { categoria: 'Almacén', fecha: '2026-07-12' });

  const boton = () => doc.querySelector('#btn-pend-orden');
  const elegir = clave => {
    boton().click();
    doc.querySelector(`#pend-orden-opciones [data-orden="${clave}"]`).click();
  };
  const opciones = () => [...doc.querySelectorAll('#pend-orden-opciones [data-orden]')]
    .map(b => b.dataset.orden);

  // --- «Lista»: el estado manda, y el botón desempata ---
  doc.querySelector('#btn-pend-lista').click();
  ok('el botón de orden está en «Lista»', boton().hidden === false);
  ok('  y dice en qué orden está', /por fecha/.test(boton().title), boton().title);

  boton().click();
  ok('  ofreciendo el personalizado, fecha o alfabético',
    opciones().join(',') === 'personalizado,fecha,alfabetico', opciones().join(','));
  doc.querySelector('#pend-orden-dialog [data-close-dialog]').click();

  console.log(`\n=== Lista, por fecha ===\n  ${nombres(doc).join(' · ')}`);
  /* Primero lo que no arrancó —por fecha, y lo que no tiene al final—, después
     lo que está en curso y al fondo lo terminado. */
  ok('«Lista» agrupa por estado y desempata por fecha',
    nombres(doc).join(',') === 'Bananas,Aceite,Café,Botas', nombres(doc).join(','));

  elegir('alfabetico');
  console.log(`  alfabético: ${nombres(doc).join(' · ')}`);
  ok('  y alfabético reordena adentro de cada estado',
    nombres(doc).join(',') === 'Aceite,Bananas,Café,Botas', nombres(doc).join(','));
  ok('  sin romper los grupos: lo terminado sigue al final',
    nombres(doc).at(-1) === 'Botas', nombres(doc).join(','));

  // --- «Categorías»: el orden de las tarjetas ---
  verCategorias(doc);
  ok('el botón sigue estando en «Categorías»', boton().hidden === false);
  boton().click();
  ok('  con sus propias opciones',
    opciones().join(',') === 'personalizado,alfabetico,cantidad', opciones().join(','));
  doc.querySelector('#pend-orden-dialog [data-close-dialog]').click();

  ok('arranca en el orden en que se armaron',
    categorias(doc).join(',') === 'Zapatería,Almacén', categorias(doc).join(','));

  elegir('alfabetico');
  ok('alfabético las ordena por nombre',
    categorias(doc).join(',') === 'Almacén,Zapatería', categorias(doc).join(','));

  elegir('cantidad');
  console.log(`\n=== Categorías, por cantidad ===\n  ${categorias(doc).join(' · ')}`);
  ok('y por cantidad, la más cargada primero',
    categorias(doc).join(',') === 'Almacén,Zapatería', categorias(doc).join(','));

  /* Cada vista se acuerda de lo suyo: son dos elecciones distintas sobre dos
     cosas distintas. */
  doc.querySelector('#btn-pend-lista').click();
  ok('cada vista conserva su orden', /alfabético/.test(boton().title), boton().title);

  // Y en el calendario no hay nada que ordenar.
  doc.querySelector('#btn-pend-calendario').click();
  ok('en el calendario el botón no está', boton().hidden === true);
}

// --- 6h. mover a mano elige el orden personalizado --------------------------
{
  /* Con un orden automático puesto, la flecha guardaba el cambio y la pantalla
     no se movía: se lee como que el botón está roto. Mover a mano ES elegir el
     orden personalizado, y eso vale para las dos vistas. */
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
  nuevaCategoria(doc, 'Almacén');
  nuevaCategoria(doc, 'Zapatería');
  nuevoPendiente(doc, 'Aceite', { categoria: 'Almacén' });
  nuevoPendiente(doc, 'Bananas', { categoria: 'Almacén' });

  const boton = () => doc.querySelector('#btn-pend-orden');
  const elegir = clave => {
    boton().click();
    doc.querySelector(`#pend-orden-opciones [data-orden="${clave}"]`).click();
  };

  // --- categorías ---
  elegir('alfabetico');
  ok('con el alfabético puesto, las categorías van por nombre',
    categorias(doc).join(',') === 'Almacén,Zapatería', categorias(doc).join(','));

  editarCategoria(doc, 'Almacén');
  doc.querySelector('#categoria-reorder').click();
  doc.querySelector('#categoria-move-down').click();
  ok('bajar una a mano la mueve de verdad',
    categorias(doc).join(',') === 'Zapatería,Almacén', categorias(doc).join(','));
  ok('  y deja el orden en personalizado',
    /personalizado/.test(boton().title), boton().title);
  doc.querySelector('#categoria-dialog').close();

  // --- tareas pendientes ---
  doc.querySelector('#btn-pend-lista').click();
  elegir('alfabetico');
  ok('con el alfabético puesto, las tareas van por nombre',
    nombres(doc).join(',') === 'Aceite,Bananas', nombres(doc).join(','));

  verCategorias(doc);
  doc.querySelectorAll('.pend-editar')[nombres(doc).indexOf('Aceite')].click();
  doc.querySelector('#pendiente-reorder').click();
  doc.querySelector('#pendiente-move-down').click();
  doc.querySelector('#pendiente-dialog').close();

  doc.querySelector('#btn-pend-lista').click();
  ok('mover una tarea a mano también deja el orden en personalizado',
    /personalizado/.test(boton().title), boton().title);
  ok('  y la lista la muestra donde quedó',
    nombres(doc).join(',') === 'Bananas,Aceite', nombres(doc).join(','));
}

// --- 6i. la categoría se elige en dos pasos ---------------------------------
{
  /* Una lista con los caminos completos —«Casa › Cocina»— mezclaba los dos
     niveles y obligaba a leer la ruta para saber dónde estaba parado uno. Ahora
     el primer desplegable trae solo las principales y el segundo aparece con
     las de esa. */
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  nuevaCategoria(doc, 'Cocina', 'Casa');
  nuevaCategoria(doc, 'Patio', 'Casa');
  nuevaCategoria(doc, 'Trabajo');
  nuevoPendiente(doc, 'Cambiar la canilla', { categoria: 'Casa › Cocina' });

  const opciones = id => [...doc.querySelectorAll(`#${id} option`)].map(o => o.textContent);
  const madre = () => doc.querySelector('#pendiente-categoria');
  const hija = () => doc.querySelector('#pendiente-subcategoria');

  // Al abrir el alta: solo las principales, y la segunda lista apagada.
  doc.querySelector('#btn-pend-lista').click();
  doc.querySelector('#btn-fab').click();
  console.log(`\n=== los dos desplegables ===\n  `
    + opciones('pendiente-categoria').join(' · '));

  /* Sin opción vacía: una tarea no puede quedar sin categoría, y «Varios» —que
     va última— es la que viene puesta. */
  ok('el primer desplegable trae solo las principales',
    opciones('pendiente-categoria').join(',') === 'Casa,Trabajo,Varios',
    opciones('pendiente-categoria').join(','));
  ok('  sin caminos ni subcategorías mezcladas',
    !opciones('pendiente-categoria').some(o => o.includes('›')));
  /* Arranca en «Varios › Varios», que es la categoría por defecto. */
  ok('  y arranca en «Varios»',
    madre().options[madre().selectedIndex].textContent === 'Varios',
    madre().options[madre().selectedIndex].textContent);
  ok('    con su subcategoría',
    hija().options[hija().selectedIndex].textContent === 'Varios',
    hija().options[hija().selectedIndex].textContent);

  // Elegir una principal habilita las suyas.
  madre().value = [...madre().options].find(o => o.textContent === 'Casa').value;
  madre().dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  ok('elegir una categoría habilita sus subcategorías', hija().disabled === false);
  ok('  con las de esa categoría y ninguna más',
    opciones('pendiente-subcategoria').join(',') === 'Ninguna,Cocina,Patio',
    opciones('pendiente-subcategoria').join(','));

  // Y una sin subcategorías vuelve a apagarlo.
  madre().value = [...madre().options].find(o => o.textContent === 'Trabajo').value;
  madre().dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  ok('una categoría sin subcategorías lo deja apagado', hija().disabled === true);
  ok('  y lo dice', /no tiene subcategorías/.test(hija().title), hija().title);
  doc.querySelector('#pendiente-dialog').close();

  /* Al editar, lo guardado —que es UNA categoría de cualquiera de los dos
     niveles— se muestra partido en los dos desplegables. */
  verCategorias(doc);
  doc.querySelector('.pend-editar').click();
  ok('al editar, la madre queda en el primero',
    madre().options[madre().selectedIndex].textContent === 'Casa',
    madre().options[madre().selectedIndex].textContent);
  ok('  y la subcategoría en el segundo',
    hija().options[hija().selectedIndex].textContent === 'Cocina',
    hija().options[hija().selectedIndex].textContent);

  // Guardar sin tocar nada la deja donde estaba.
  enviar(doc, '#pendiente-form');
  ok('  y guardar sin tocar nada no la mueve',
    doc.querySelector('.pend-nivel-1 .pend-item .pend-nombre')?.textContent === 'Cambiar la canilla');
}

// --- 6j. «Varios», el piso que sostiene todo --------------------------------
{
  /* Ninguna tarea puede quedar sin categoría, y eso solo se sostiene si hay una
     categoría que siempre está. «Varios» y su subcategoría vienen de fábrica,
     no se pueden borrar ni archivar, y sí se pueden renombrar: lo que importa
     es que existan, no cómo se llamen. */
  const { doc, window } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);

  const todas = () => [...doc.querySelectorAll('#pend-lista .pend-cat-nombre')]
    .map(n => n.textContent);

  console.log(`\n=== una cuenta nueva ===\n  ${todas().join(' · ')}`);
  ok('una cuenta nueva ya tiene «Varios» y su subcategoría',
    todas().join(',') === 'Varios,Varios', todas().join(','));
  ok('  con la subcategoría adentro',
    doc.querySelector('.pend-nivel-1 .pend-cat-nombre')?.textContent === 'Varios');

  // No se borra ni se archiva, y el botón dice por qué.
  editarCategoria(doc, 'Varios');
  ok('no se puede eliminar', doc.querySelector('#categoria-delete').disabled === true);
  ok('  y dice por qué',
    /donde caen las tareas/.test(doc.querySelector('#categoria-delete').title),
    doc.querySelector('#categoria-delete').title);
  ok('tampoco se puede archivar', doc.querySelector('#categoria-archive').disabled === true);

  // Pero se renombra, y sigue siendo la misma: el id no cambia.
  doc.querySelector('#categoria-name').value = 'Cajón de sastre';
  enviar(doc, '#categoria-form');
  ok('se puede renombrar', todas().includes('Cajón de sastre'), todas().join(','));

  const ids = guardado(window).pendientes.categorias.map(c => c.id);
  ok('  sin dejar de ser la misma', ids.includes('cat-varios'), ids.join(','));

  /* Y sigue siendo la de por defecto después del cambio de nombre: lo que la
     identifica es el id, no el rótulo. */
  doc.querySelector('#btn-pend-lista').click();
  doc.querySelector('#btn-fab').click();
  const madre = doc.querySelector('#pendiente-categoria');
  ok('sigue siendo la que viene puesta al crear una tarea',
    madre.options[madre.selectedIndex].textContent === 'Cajón de sastre',
    madre.options[madre.selectedIndex].textContent);
  doc.querySelector('#pendiente-name').value = 'Algo';
  enviar(doc, '#pendiente-form');

  ok('  y la tarea queda ahí',
    guardado(window).pendientes.items[0].categoria === 'cat-varios-sub',
    guardado(window).pendientes.items[0].categoria);

  // Una categoría normal sí se borra: la protección es de estas dos y nada más.
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  editarCategoria(doc, 'Casa');
  ok('una categoría normal sí se puede eliminar',
    doc.querySelector('#categoria-delete').disabled === false);
  ok('  y archivar', doc.querySelector('#categoria-archive').disabled === false);
  doc.querySelector('#categoria-dialog').close();
}

// --- 6k. nombres únicos donde conviven -------------------------------------
{
  /* Dos cosas con el mismo nombre en la misma lista son indistinguibles. En
     listas distintas no: ahí el lugar las distingue, y esa es justamente la
     razón de tener categorías. */
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  nuevaCategoria(doc, 'Auto');
  nuevaCategoria(doc, 'Cocina', 'Casa');

  const error = id => doc.querySelector(id).hidden
    ? '' : doc.querySelector(id).textContent;

  // --- categorías de primer nivel: únicas ---
  agregar(doc, 'categoria');
  doc.querySelector('#categoria-name').value = 'casa';   // con otra mayúscula
  enviar(doc, '#categoria-form');
  console.log(`\n=== nombres repetidos ===\n  ${error('#categoria-error')}`);
  ok('no entran dos categorías con el mismo nombre',
    /Ya hay una categoría/.test(error('#categoria-error')), error('#categoria-error'));
  ok('  sin importar mayúsculas ni acentos',
    categorias(doc).filter(n => n.toLowerCase() === 'casa').length === 1,
    categorias(doc).join(','));
  doc.querySelector('#categoria-dialog').close();

  // --- subcategorías: únicas adentro de SU madre ---
  agregar(doc, 'categoria');
  doc.querySelector('#categoria-name').value = 'Cocina';
  const padre = doc.querySelector('#categoria-padre');
  padre.value = [...padre.options].find(o => o.textContent === 'Casa').value;
  enviar(doc, '#categoria-form');
  ok('  ni dos subcategorías con el mismo nombre en la misma madre',
    /ya tiene una subcategoría/.test(error('#categoria-error')), error('#categoria-error'));
  doc.querySelector('#categoria-dialog').close();

  /* Pero en otra madre sí: «Casa › Cocina» y «Auto › Cocina» se distinguen por
     dónde están. */
  nuevaCategoria(doc, 'Cocina', 'Auto');
  ok('pero sí en otra categoría',
    categorias(doc).filter(n => n === 'Cocina').length === 2, categorias(doc).join(','));

  // --- tareas pendientes: únicas adentro de su categoría ---
  nuevoPendiente(doc, 'Comprar filtros', { categoria: 'Casa › Cocina' });
  nuevoPendiente(doc, 'Comprar filtros', { categoria: 'Auto › Cocina' });
  ok('una tarea puede repetirse en otra categoría',
    nombres(doc).filter(n => n === 'Comprar filtros').length === 2, nombres(doc).join(','));

  doc.querySelector('#btn-pend-lista').click();
  doc.querySelector('#btn-fab').click();
  doc.querySelector('#pendiente-name').value = 'Comprar filtros';
  const madre = doc.querySelector('#pendiente-categoria');
  madre.value = [...madre.options].find(o => o.textContent === 'Casa').value;
  madre.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  const hija = doc.querySelector('#pendiente-subcategoria');
  hija.value = [...hija.options].find(o => o.textContent === 'Cocina').value;
  enviar(doc, '#pendiente-form');
  ok('  pero no dos veces en la misma',
    /Ya hay una tarea con ese nombre/.test(error('#pendiente-error')),
    error('#pendiente-error'));
  doc.querySelector('#pendiente-dialog').close();

  /* Y al editar, el nombre propio no cuenta como repetido: guardar sin tocar
     nada tiene que seguir funcionando. */
  verCategorias(doc);
  doc.querySelector('.pend-editar').click();
  enviar(doc, '#pendiente-form');
  ok('editar sin cambiar el nombre no se choca consigo misma',
    doc.querySelector('#pendiente-dialog').hasAttribute('open') === false);
}

// --- 7. plegar --------------------------------------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
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
    /1 tarea sin fecha/.test(doc.querySelector('.pend-cal-nota').textContent),
    doc.querySelector('.pend-cal-nota').textContent);

  /* En el calendario los pendientes son ETIQUETAS: dicen qué cae ese día y se
     arrastran a otro, pero no se editan. Editar sale del lápiz de la lista, que
     es el único lugar. */
  doc.querySelector('.pend-cal-item').click();
  ok('  tocar uno no abre nada: acá no se edita',
    doc.querySelector('#pendiente-dialog').hasAttribute('open') === false);
  ok('  y no es un botón', doc.querySelector('.pend-cal-item').tagName === 'SPAN',
    doc.querySelector('.pend-cal-item').tagName);
}

// --- 9. tocar un día crea ahí ----------------------------------------------
{
  const { doc } = await montar(VACIO);
  irAPendientes(doc);
  doc.querySelector('#btn-pend-calendario').click();

  const dia20 = doc.querySelector('.pend-cal-dia[data-fecha="2026-07-20"]');
  dia20.click();

  ok('tocar un día abre el alta', doc.querySelector('#pendiente-dialog').hasAttribute('open')
    && doc.querySelector('#pendiente-dialog-title').textContent === 'Nueva tarea pendiente');
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
  ok('  y tampoco abre el alta del día que hay debajo',
    doc.querySelector('#pendiente-dialog').hasAttribute('open') === false);
}

// --- 11. se guarda ----------------------------------------------------------
{
  const { doc, window } = await montar(VACIO);
  irAPendientes(doc);
  verCategorias(doc);
  nuevaCategoria(doc, 'Casa');
  nuevoPendiente(doc, 'Pagar expensas', { categoria: 'Casa', fecha: '2026-08-05' });
  doc.querySelector('.pend-estado').click();

  const { pendientes } = guardado(window);
  console.log(`\n=== lo guardado ===\n  ${JSON.stringify(pendientes)}`);

  const propias = pendientes.categorias.filter(c => !c.id.startsWith('cat-varios'));
  ok('la categoría se guarda', propias.length === 1
    && propias[0].name === 'Casa' && propias[0].padre === null,
    JSON.stringify(propias.map(c => c.name)));
  ok('el pendiente también, con todo lo suyo',
    pendientes.items[0].name === 'Pagar expensas'
      && pendientes.items[0].fecha === '2026-08-05'
      && pendientes.items[0].estado === 'en-proceso'
      && pendientes.items[0].categoria === pendientes.categorias[0].id,
    JSON.stringify(pendientes.items[0]));

  // Y vuelve igual: es lo que hace que sobreviva a recargar o a sincronizar.
  const { doc: doc2 } = await montar({ ...VACIO, pendientes });
  irAPendientes(doc2);
  verCategorias(doc2);
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
  verCategorias(doc);
  /* Se mira lo que la pantalla dibuja, que es donde el saneado se nota; el
     estado guardado se compara después, cuando algo lo haga escribir. */
  console.log(`\n=== lo que sobrevive ===\n  ${doc.querySelector('#pend-lista').textContent.replace(/\s+/g, ' ').trim()}`);

  ok('las categorías ilegibles se descartan',
    categorias(doc).join(',') === 'Casa,Cocina,Alacena,Bucle', categorias(doc).join(','));
  ok('  el tercer nivel sube a primer nivel',
    [...doc.querySelectorAll('.pend-nivel-1 .pend-cat-nombre')].map(n => n.textContent)
      .filter(n => n !== 'Varios').join(',') === 'Cocina',
    [...doc.querySelectorAll('.pend-nivel-1 .pend-cat-nombre')].map(n => n.textContent).join(','));
  ok('  y una que se apunta a sí misma también',
    [...doc.querySelectorAll('#pend-lista > .pend-bloque .pend-cat-nombre')]
      .map(n => n.textContent).includes('Bucle'));

  ok('el pendiente sin nombre se descarta', nombres(doc).length === 3, nombres(doc).join(','));
  ok('  una fecha ilegible queda vacía', doc.querySelector('.pend-fecha') === null);
  ok('  un estado inventado arranca sin iniciar',
    [...doc.querySelectorAll('.pend-estado')].every(b => b.textContent === 'Sin iniciar'));
  /* Una categoría que no existe deja al pendiente suelto, no lo borra con ella:
     es la misma decisión que toma la pantalla al eliminar una. */
  ok('  y una categoría que no existe la manda a «Varios»',
    doc.querySelector('.pend-sueltos') === null && nombres(doc).length === 3,
    nombres(doc).join(','));

  // Y lo saneado es lo que se guarda: un toque cualquiera lo escribe.
  doc.querySelector('.pend-estado').click();
  const limpio = guardado(window).pendientes;
  ok('  el saneado es lo que queda guardado',
    limpio.categorias.filter(c => !c.id.startsWith('cat-varios')).length === 4
      && limpio.items.length === 3
      && limpio.categorias.find(c => c.name === 'Alacena').padre === null
      && limpio.categorias.find(c => c.name === 'Cocina').padre === 'c1',
    JSON.stringify(limpio.categorias));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
