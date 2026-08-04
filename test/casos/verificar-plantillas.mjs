/* Plantillas: la fecha de inicio es obligatoria, arranca en HOY y decide el
   mes destino. Hoy es jueves 30 de julio de 2026 (reloj del arnés). */
import { montar } from '../harness.mjs';
import { ESTADO_VACIO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};
const meses = w => JSON.parse(w.localStorage.getItem('tareas-diarias/v1/u-test')).months;

/** `fecha === null` deja el valor por omisión; una cadena lo reemplaza. */
const abrir = async (estado, fecha, { irAMes } = {}) => {
  const { window, doc } = await montar(estado);
  if (irAMes) for (let i = 0; i < irAMes; i++) doc.querySelector('#next-month').click();
  doc.querySelector('#btn-templates').click();
  if (fecha !== null) {
    const input = doc.querySelector('#templates-start');
    input.value = fecha;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  return { window, doc };
};

// --- 1. el párrafo de intro ya no está --------------------------------------
{
  const { doc } = await abrir(ESTADO_VACIO, null);
  ok('#templates-intro fue quitado', doc.querySelector('#templates-intro') === null);
  ok('la etiqueta ya no dice (opcional)',
    !/opcional/i.test(doc.querySelector('.tpl-start')?.textContent ?? ''));
}

// --- 2. por defecto, hoy, y listo para usar ---------------------------------
{
  const { doc } = await abrir(ESTADO_VACIO, null);
  ok('el campo abre en hoy', doc.querySelector('#templates-start').value === '2026-07-30',
    doc.querySelector('#templates-start').value);
  const btns = [...doc.querySelectorAll('.tpl-add')];
  ok('los botones salen habilitados', btns.every(b => b.disabled === false));
  ok('apuntan al mes de hoy', /julio 2026/i.test(btns[0].title), btns[0].title);
}

// --- 3. vaciarlo a mano vuelve a bloquear -----------------------------------
{
  const { window, doc } = await abrir(ESTADO_VACIO, '');
  const btns = [...doc.querySelectorAll('.tpl-add')];
  ok('sin fecha, botones apagados', btns.every(b => b.disabled === true),
    `${btns.filter(b => b.disabled).length}/${btns.length}`);
  ok('el título dice por qué', /fecha de inicio/i.test(btns[0].title), btns[0].title);
  btns[0].click();
  ok('el clic no agrega nada', Object.keys(meses(window)).length === 0,
    'meses: ' + (Object.keys(meses(window)).join(', ') || '(ninguno)'));
  ok('el diálogo sigue abierto', doc.querySelector('#templates-dialog').hasAttribute('open'));
}

// --- 4. una fecha inválida tampoco habilita ---------------------------------
{
  const { window, doc } = await abrir(ESTADO_VACIO, 'no-es-fecha');
  ok('sigue apagado con basura', doc.querySelectorAll('.tpl-add')[0].disabled === true);
  doc.querySelectorAll('.tpl-add')[0].click();
  ok('no agregó nada', Object.keys(meses(window)).length === 0);
}

// --- 5. el defecto manda sobre el mes visible -------------------------------
{
  const { window, doc } = await abrir(ESTADO_VACIO, null, { irAMes: 2 });   // septiembre
  doc.querySelectorAll('.tpl-add')[0].click();
  const m = meses(window);
  ok('sin tocar la fecha va al mes de HOY, no al visible',
    Boolean(m['2026-07']) && !m['2026-09'], 'meses: ' + Object.keys(m).join(', '));
}

// --- 6. cambiando la fecha, manda ella --------------------------------------
{
  const { window, doc } = await abrir(ESTADO_VACIO, '2026-09-15');
  const btn = doc.querySelectorAll('.tpl-add')[0];
  ok('el título sigue al mes de la fecha', /septiembre 2026/i.test(btn.title), btn.title);

  btn.click();
  const m = meses(window);
  ok('las tareas van a 2026-09', Boolean(m['2026-09']), 'meses: ' + Object.keys(m).join(', '));
  ok('julio NO se materializó', !m['2026-07']);
  ok('todas con start del 15/09', m['2026-09']?.every(t => t.start === '2026-09-15'));
  ok('navegó a septiembre', /septiembre 2026/i.test(doc.querySelector('#month-label').textContent),
    doc.querySelector('#month-label').textContent);
}

// --- 7. mes pasado -----------------------------------------------------------
{
  const { window, doc } = await abrir(ESTADO_VACIO, '2026-03-10');
  doc.querySelectorAll('.tpl-add')[0].click();
  ok('las tareas van a 2026-03', Boolean(meses(window)['2026-03']),
    'meses: ' + Object.keys(meses(window)).join(', '));
  ok('navegó a marzo', /marzo 2026/i.test(doc.querySelector('#month-label').textContent));
}

// --- 8. el bloqueo se mide contra el mes destino ----------------------------
{
  const { window, doc } = await abrir({ ...ESTADO_VACIO, locked: { '2026-09': true } }, '2026-09-15');
  const btn = doc.querySelectorAll('.tpl-add')[0];
  ok('destino bloqueado apaga el botón', btn.disabled === true);
  ok('la ayuda lo explica', /bloqueado/.test(doc.querySelector('#templates-start-hint').textContent),
    doc.querySelector('#templates-start-hint').textContent.slice(0, 46) + '…');
  btn.click();
  ok('no agregó nada', !meses(window)['2026-09']);
}

// --- 9. el mes visible bloqueado no estorba ---------------------------------
{
  const { window, doc } = await abrir({ ...ESTADO_VACIO, locked: { '2026-07': true } }, '2026-09-15');
  ok('el diálogo abre con julio bloqueado',
    doc.querySelector('#templates-dialog').hasAttribute('open'));
  doc.querySelectorAll('.tpl-add')[0].click();
  ok('agrega a septiembre igual', Boolean(meses(window)['2026-09']),
    'meses: ' + Object.keys(meses(window)).join(', '));
}

// --- 10. duplicados contra el mes destino -----------------------------------
{
  const conTareas = {
    ...ESTADO_VACIO,
    months: { '2026-09': [{ id: 'x', name: 'Meditar', freq: 'daily', customMode: 'weekdays', weekdays: [], target: 12, start: null }] },
  };
  const { window, doc } = await abrir(conTareas, '2026-09-15');
  doc.querySelectorAll('.tpl-add')[0].click();
  const veces = meses(window)['2026-09'].filter(t => t.name === 'Meditar').length;
  ok('no duplica contra el mes destino', veces === 1, `«Meditar» aparece ${veces} vez/veces`);
}

// --- 11. no arrastra la fecha entre aperturas -------------------------------
{
  const { doc } = await abrir(ESTADO_VACIO, '2026-09-20');
  doc.querySelector('[data-close-dialog]').click();
  doc.querySelector('#btn-templates').click();
  ok('reabre en hoy, no en la fecha anterior',
    doc.querySelector('#templates-start').value === '2026-07-30',
    doc.querySelector('#templates-start').value);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
