/* El alta de tarea vive en la barra del mes, a la izquierda de «Copiar tareas
   del mes anterior», y con el color del día de hoy. */
import { montar } from '../harness.mjs';
import { ESTADO_LLENO, ESTADO_VACIO, ESTADO_BLOQUEADO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

// --- 1. ubicación en la barra del mes --------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const barra = [...doc.querySelectorAll('#month-bar > button')].map(b => b.id);
  console.log('  orden en la barra:', barra.join(' · '));
  ok('el alta es el primer botón', barra[0] === 'btn-add-task');
  ok('está antes de copiar del mes anterior',
    barra.indexOf('btn-add-task') < barra.indexOf('btn-copy-prev'));

  const btn = doc.querySelector('#btn-add-task');
  ok('lleva la clase de color de hoy', btn.classList.contains('btn-today'),
    btn.className);
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

// --- 4. período bloqueado ---------------------------------------------------
{
  const { doc } = await montar(ESTADO_BLOQUEADO);
  const btn = doc.querySelector('#btn-add-task');
  ok('bloqueado → deshabilitado', btn.disabled === true);
  ok('y explica por qué', /bloqueado/i.test(btn.title), btn.title);
}
{
  const { doc } = await montar(ESTADO_LLENO);
  const btn = doc.querySelector('#btn-add-task');
  ok('sin bloqueo → habilitado', btn.disabled === false);
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
  for (const cb of [...doc.querySelectorAll('.task-pick[data-task-id]')].slice(0, 3)) cb.click();
  const btn = doc.querySelector('#btn-add-task');
  ok('el rótulo del alta no cambia', btn.textContent.trim() === antes, btn.textContent.trim());
  ok('aparecen las acciones de selección',
    doc.querySelector('#btn-delete-sel').hidden === false
    && doc.querySelector('#btn-reset-sel').hidden === false);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
