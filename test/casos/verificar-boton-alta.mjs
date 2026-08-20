/* El alta de tarea abre el apartado «Tareas» del desplegable de opciones, que
   es lo primero que hay adentro. */
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

// --- 2. ya no está dentro de la tabla ---------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  ok('no queda fila de alta en la grilla', doc.querySelectorAll('#grid .add-row').length === 0);
  ok('ni ningún botón de alta en la grilla',
    doc.querySelectorAll('#grid [data-add-task]').length === 0);

  // El tbody debe tener exactamente una fila por tarea, sin la de relleno.
  const filas = doc.querySelectorAll('#grid tbody tr');
  const conTarea = doc.querySelectorAll('#grid tbody tr[data-task-id]');
  ok('el tbody solo tiene filas de tarea', filas.length === conTarea.length,
    `${filas.length} filas · ${conTarea.length} con tarea`);
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
