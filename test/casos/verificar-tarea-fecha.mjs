/* Alta de tarea: la fecha de inicio es obligatoria, arranca en HOY y decide a
   qué mes va la tarea. Hoy es jueves 30 de julio de 2026 (reloj del arnés). */
import { montar } from '../harness.mjs';
import { ESTADO_LLENO, ESTADO_VACIO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};
const meses = w => JSON.parse(w.localStorage.getItem('tareas-diarias/v1/u-test')).months;
const tareas = (w, mes) => meses(w)[mes] ?? [];

const enviar = doc => doc.querySelector('#task-form')
  .dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

/** Abre el alta, opcionalmente tras moverse de mes, y completa el formulario. */
const crear = async (estado, { nombre = 'Nueva', fecha, mover = 0 } = {}) => {
  const { window, doc } = await montar(estado);
  for (let i = 0; i < Math.abs(mover); i++) {
    doc.querySelector(mover > 0 ? '#next-month' : '#prev-month').click();
  }
  doc.querySelector('[data-add-task]').click();
  doc.querySelector('#task-name').value = nombre;
  if (fecha !== undefined) doc.querySelector('#task-start').value = fecha;
  return { window, doc };
};

// --- 1. el campo es obligatorio y abre en hoy -------------------------------
{
  const { doc } = await crear(ESTADO_VACIO);
  const campo = doc.querySelector('#task-start');
  ok('sin la marca (opcional)', !/opcional/i.test(campo.closest('.field').textContent));
  ok('el input es required', campo.hasAttribute('required'));
  ok('valor por omisión = hoy', campo.value === '2026-07-30', campo.value);
}

// --- 2. abre en hoy aunque se esté mirando otro mes -------------------------
{
  const { doc } = await crear(ESTADO_VACIO, { mover: 1 });        // agosto
  ok('sigue siendo hoy', doc.querySelector('#task-start').value === '2026-07-30',
    doc.querySelector('#task-start').value);
}

// --- 3. parado en un mes PASADO, la tarea va al mes de la fecha -------------
//  Antes se creaba en junio y nacía con la fila entera apagada.
{
  const { window, doc } = await crear(ESTADO_VACIO, { mover: -1 });   // junio
  enviar(doc);
  const m = meses(window);
  ok('la tarea NO va a junio', !m['2026-06'], 'meses: ' + Object.keys(m).join(', '));
  ok('va al mes de la fecha (julio)', Boolean(m['2026-07']));
  ok('navegó a julio', /julio 2026/i.test(doc.querySelector('#month-label').textContent),
    doc.querySelector('#month-label').textContent);

  doc.querySelector('.seg[data-view="month"]').click();
  const celdas = [...doc.querySelectorAll('.cell')];
  ok('no nace toda apagada', celdas.some(c => !c.disabled),
    `${celdas.filter(c => c.disabled).length}/${celdas.length} apagadas`);
}

// --- 4. parado en julio, fecha en septiembre --------------------------------
{
  const { window, doc } = await crear(ESTADO_VACIO, { fecha: '2026-09-15' });
  enviar(doc);
  const m = meses(window);
  ok('va a 2026-09', Boolean(m['2026-09']), 'meses: ' + Object.keys(m).join(', '));
  ok('julio NO se materializó', !m['2026-07']);
  ok('con la fecha elegida', m['2026-09']?.[0]?.start === '2026-09-15');
  ok('navegó a septiembre', /septiembre 2026/i.test(doc.querySelector('#month-label').textContent),
    doc.querySelector('#month-label').textContent);
}

// --- 5. fecha en un mes pasado ----------------------------------------------
{
  const { window, doc } = await crear(ESTADO_VACIO, { fecha: '2026-03-10' });
  enviar(doc);
  ok('va a 2026-03', Boolean(meses(window)['2026-03']),
    'meses: ' + Object.keys(meses(window)).join(', '));
  ok('navegó a marzo', /marzo 2026/i.test(doc.querySelector('#month-label').textContent));
}

// --- 6. el mes destino bloqueado rechaza ------------------------------------
{
  const { window, doc } = await crear({ ...ESTADO_VACIO, locked: { '2026-09': true } },
    { fecha: '2026-09-15' });
  enviar(doc);
  const err = doc.querySelector('#task-error');
  ok('muestra el error', err.hidden === false, err.textContent);
  ok('nombra el mes destino', /septiembre 2026/i.test(err.textContent));
  ok('no creó nada', !meses(window)['2026-09']);
  ok('el diálogo sigue abierto', doc.querySelector('#task-dialog').hasAttribute('open'));
}

// --- 7. sin fecha, o con basura, no se guarda -------------------------------
{
  const { window, doc } = await crear(ESTADO_VACIO, { fecha: '' });
  enviar(doc);
  ok('vacío → error', doc.querySelector('#task-error').hidden === false,
    doc.querySelector('#task-error').textContent);
  ok('vacío → no crea', Object.keys(meses(window)).length === 0);
}
{
  const { window, doc } = await crear(ESTADO_VACIO, { fecha: '15/09/2026' });
  enviar(doc);
  ok('formato no ISO → error', doc.querySelector('#task-error').hidden === false);
  ok('formato no ISO → no crea', Object.keys(meses(window)).length === 0);
}

// --- 8. editar conserva la fecha propia y NO muda de mes --------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const fila = [...doc.querySelectorAll('tbody tr[data-task-id]')]
    .find(tr => tr.dataset.taskId === 't5');            // «Meditar», start 2026-07-10
  fila.querySelector('[data-action="edit"]').click();
  ok('precarga la fecha propia', doc.querySelector('#task-start').value === '2026-07-10',
    doc.querySelector('#task-start').value);
}
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const fila = [...doc.querySelectorAll('tbody tr[data-task-id]')]
    .find(tr => tr.dataset.taskId === 't5');
  fila.querySelector('[data-action="edit"]').click();
  doc.querySelector('#task-start').value = '2026-09-01';   // fecha de otro mes
  enviar(doc);

  const m = meses(window);
  ok('editar NO crea el mes de la fecha nueva', !m['2026-09'],
    'meses: ' + Object.keys(m).join(', '));
  ok('la tarea sigue en julio', tareas(window, '2026-07').some(t => t.id === 't5'));
  ok('con la fecha nueva', tareas(window, '2026-07').find(t => t.id === 't5')?.start === '2026-09-01');
  ok('sigue en julio en pantalla', /julio 2026/i.test(doc.querySelector('#month-label').textContent),
    doc.querySelector('#month-label').textContent);
}

// --- 9. editar una tarea vieja sin fecha no recorta su historial ------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const fila = [...doc.querySelectorAll('tbody tr[data-task-id]')]
    .find(tr => tr.dataset.taskId === 't1');            // «Leer», start: null
  fila.querySelector('[data-action="edit"]').click();
  ok('propone el 1 del mes visible, NO hoy',
    doc.querySelector('#task-start').value === '2026-07-01',
    doc.querySelector('#task-start').value);

  const antes = [...doc.querySelectorAll('tr[data-task-id="t1"] .cell')]
    .filter(c => c.disabled).length;
  enviar(doc);
  const despues = [...doc.querySelectorAll('tr[data-task-id="t1"] .cell')]
    .filter(c => c.disabled).length;

  ok('guardó', tareas(window, '2026-07').find(t => t.id === 't1')?.start === '2026-07-01');
  ok('no apagó ninguna celda ya cargada', antes === despues, `${antes} → ${despues}`);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
