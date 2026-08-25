/* Los tres accesos al alta de tarea, que abren el mismo diálogo:

     · la entrada del apartado «Tareas» del desplegable de opciones, que es lo
       primero que hay adentro;
     · el «+» al pie de la columna de tareas, debajo de la última;
     · el botón del estado vacío, cuando no hay ninguna. */
import { montar } from '../harness.mjs';
import { ESTADO_LLENO, ESTADO_VACIO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

// --- 1. ubicación dentro del desplegable de opciones -----------------------
{
  const { doc } = await montar(ESTADO_LLENO);

  /* La barra del mes es un solo botón: los seis de antes viven adentro,
     agrupados por lo que tocan. El relleno de marca pasó de estar en el alta a
     estar en «Opciones», que es la entrada a todas. */
  const barra = [...doc.querySelectorAll('#month-bar > * > button')].map(b => b.id);
  console.log('  barra del mes:', barra.join(' · '));
  ok('la barra es un solo botón', barra.join(',') === 'btn-actions', barra.join(','));
  ok('con el relleno del color de la marca',
    doc.querySelector('#btn-actions').classList.contains('btn-brand'));

  const opciones = [...doc.querySelectorAll('#actions-options .view-opt')].map(b => b.id);
  console.log('  opciones:', opciones.join(' · '));
  ok('el alta es la primera acción', opciones[0] === 'btn-add-task', opciones[0]);
  ok('está antes de copiar del mes anterior',
    opciones.indexOf('btn-add-task') < opciones.indexOf('btn-copy-prev'));
  ok('y las dos van en el apartado «Tareas»',
    doc.querySelector('#btn-add-task').closest('[role="group"]')
      ?.getAttribute('aria-labelledby') === 'grp-tareas');

  const btn = doc.querySelector('#btn-add-task');
  ok('dice «+ Agregar tarea»', btn.textContent.trim() === '+ Agregar tarea',
    JSON.stringify(btn.textContent.trim()));
}

// --- 2. el «+» al pie de la columna de tareas -------------------------------
{
  /* Un segundo acceso al alta, al final de la columna que va a crecer. No
     reemplaza al del desplegable: los dos abren el mismo diálogo. */
  const { doc } = await montar(ESTADO_LLENO);

  const filas = [...doc.querySelectorAll('#grid tbody tr')];
  const conTarea = doc.querySelectorAll('#grid tbody tr[data-task-id]');

  ok('hay una fila de alta', doc.querySelectorAll('#grid tbody .add-row').length === 1);
  ok('y va última, debajo de todas las tareas',
    filas.at(-1).classList.contains('add-row'), filas.at(-1).className);
  ok('el resto son las tareas', filas.length === conTarea.length + 1,
    `${filas.length} filas · ${conTarea.length} con tarea`);

  const btn = doc.querySelector('#grid .add-task-btn');
  ok('el botón dice «+»', btn?.textContent === '+', JSON.stringify(btn?.textContent));
  ok('con el mismo relleno que «Opciones»', btn?.classList.contains('btn-brand'),
    btn?.className);

  /* Mide lo mismo que las flechas que mueven el período porque comparte su
     clase, no porque alguien haya copiado el número a mano. */
  const flecha = doc.querySelector('#prev-range');
  const medidas = n => [...n.classList].filter(c => c !== 'btn-brand' && c !== 'add-task-btn');
  ok('y el ancho de las flechas de período',
    medidas(btn).join(' ') === medidas(flecha).join(' '),
    `${medidas(btn).join(' ')} vs ${medidas(flecha).join(' ')}`);
  ok('y con nombre accesible, que el «+» solo no dice nada',
    btn?.getAttribute('aria-label') === 'Agregar tarea', btn?.getAttribute('aria-label'));

  /* La fila no lleva `data-task-id`: es lo que hace que todo lo que recorre las
     filas por tarea la saltee sola —el arrastre, la selección, el repintado. */
  ok('la fila no se confunde con una tarea',
    !filas.at(-1).hasAttribute('data-task-id'));

  // La grilla no se descuadra: la fila tiene tantas celdas como las de arriba.
  const celdas = f => f.querySelectorAll('th, td').length;
  ok('tiene la misma cantidad de celdas que una fila de tarea',
    celdas(filas.at(-1)) === celdas(filas[0]),
    `${celdas(filas.at(-1))} vs ${celdas(filas[0])}`);

  doc.querySelector('#grid .add-task-btn').click();
  ok('y abre el alta', doc.querySelector('#task-dialog').hasAttribute('open'));
}
{
  // Sin tareas no hay tabla: ahí el acceso es el botón del estado vacío.
  const { doc } = await montar(ESTADO_VACIO);
  ok('sin tareas no se dibuja la fila',
    doc.querySelectorAll('#grid tbody .add-row').length === 0);
}

// --- 3. abre el diálogo -----------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-add-task').click();
  ok('el clic abre el alta', doc.querySelector('#task-dialog').hasAttribute('open'));
  ok('con el título de tarea nueva',
    doc.querySelector('#task-dialog-title').textContent === 'Nueva tarea');
}

// --- 4. siempre habilitado --------------------------------------------------
//  Dar de alta ya no depende de ningún candado: el cierre por día solo alcanza
//  a las celdas, no a la lista de tareas.
{
  const { doc } = await montar(ESTADO_LLENO);
  const btn = doc.querySelector('#btn-add-task');
  ok('habilitado', btn.disabled === false);
  ok('con su ayuda', /tarea nueva/i.test(btn.title), btn.title);
}

// --- 5. el estado vacío conserva su propio botón ---------------------------
{
  const { doc } = await montar(ESTADO_VACIO);
  const vacio = doc.querySelector('#empty [data-add-task]');
  ok('el estado vacío sigue teniendo su botón', Boolean(vacio));
  vacio.click();
  ok('y también abre el alta', doc.querySelector('#task-dialog').hasAttribute('open'));
}

// --- 6. la selección múltiple no toca el botón de alta ---------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const antes = doc.querySelector('#btn-add-task').textContent.trim();

  /* Los casilleros aparecen recién al elegir «Eliminar tareas»: en reposo las
     filas van limpias. */
  ok('sin casilleros en reposo', doc.querySelectorAll('.task-pick').length === 0);
  doc.querySelector('#btn-actions').click();
  doc.querySelector('#btn-mode-delete').click();

  for (const cb of [...doc.querySelectorAll('.task-pick[data-task-id]')].slice(0, 3)) cb.click();
  const btn = doc.querySelector('#btn-add-task');
  ok('el rótulo del alta no cambia', btn.textContent.trim() === antes, btn.textContent.trim());
  /* La confirmación vive en la barra, no en el menú: ✓ y ✕ entre el selector de
     vista y «Opciones». */
  ok('aparece la barra de confirmación',
    doc.querySelector('#mode-confirm').hidden === false);
  ok('y el ✓ queda habilitado con algo tildado',
    doc.querySelector('#btn-mode-ok').disabled === false);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
