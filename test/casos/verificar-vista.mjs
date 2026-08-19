/* El selector de vista: un botón con la vista activa, su desplegable, y las
   flechas que lo abrazan. Arnés: hoy = jueves 30/07/2026, vista semanal. */
import { montar, leer } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const texto = doc => doc.querySelector('#view-text').textContent;
const mes = doc => doc.querySelector('#month-label').textContent;

/* Qué ventana está a la vista. La barra ya no tiene rótulo de rango, así que se
   lee de los números de las columnas, que es la fuente real. */
const rango = doc =>
  [...doc.querySelectorAll('#grid thead .col-day .dnum')].map(n => n.textContent).join(' ');
const abierto = doc => !doc.querySelector('#view-options').hidden;
const opciones = doc => [...doc.querySelectorAll('#view-options .view-opt')];

// --- 1. el botón dice la vista activa y arranca cerrado --------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  ok('muestra la vista activa', texto(doc) === 'Semanal', texto(doc));
  ok('arranca cerrado', !abierto(doc));
  ok('y lo declara', doc.querySelector('#btn-view').getAttribute('aria-expanded') === 'false');
}

// --- 2. abre y cierra con el propio botón ----------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const btn = doc.querySelector('#btn-view');

  btn.click();
  ok('el clic lo abre', abierto(doc));
  ok('y lo declara', btn.getAttribute('aria-expanded') === 'true');

  btn.click();
  ok('otro clic lo cierra', !abierto(doc));
  ok('y vuelve a declararlo', btn.getAttribute('aria-expanded') === 'false');
}

// --- 3. qué hay adentro -----------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();

  const rotulos = opciones(doc).map(o => o.textContent);
  console.log('  opciones:', rotulos.join(' · '));
  ok('las tres vistas y un solo salto',
    rotulos.join(',') === 'Diario,Semanal,Mensual,Ir a…', rotulos.join(','));

  /* Debajo del separador va el salto, que no es una vista: sin `data-view`,
     como `menuitem` y no como `menuitemradio`, y no deja nada marcado. */
  const dia = doc.querySelector('#btn-pick-day');
  ok('el salto no es una vista', !dia.dataset.view);
  ok('y no es un radio', dia.getAttribute('role') === 'menuitem');
  ok('va detrás de un separador',
    dia.previousElementSibling?.getAttribute('role') === 'separator');
  ok('«Ir a…» anuncia que abre un diálogo',
    dia.getAttribute('aria-haspopup') === 'dialog');

  const marcadas = opciones(doc).filter(o => o.getAttribute('aria-checked') === 'true');
  ok('solo la vista activa queda marcada',
    marcadas.length === 1 && marcadas[0].dataset.view === 'week',
    marcadas.map(o => o.dataset.view).join(','));
  ok('y se pinta', marcadas[0].classList.contains('is-active'));
}

// --- 4. elegir una vista la aplica y cierra --------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('.view-opt[data-view="month"]').click();

  ok('cambia la vista', texto(doc) === 'Mensual', texto(doc));
  ok('cierra el desplegable', !abierto(doc));
  ok('la planilla la sigue', doc.querySelector('#grid').classList.contains('view-month'),
    doc.querySelector('#grid').className);
  ok('devuelve el foco al botón', doc.activeElement?.id === 'btn-view', doc.activeElement?.id);
}

// --- 5. Esc y el clic afuera lo cierran ------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok('Esc lo cierra', !abierto(doc));
  ok('y recupera el foco', doc.activeElement?.id === 'btn-view', doc.activeElement?.id);
}
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.body.click();
  ok('el clic afuera lo cierra', !abierto(doc));
}
{
  /* Con el menú abierto los atajos quedan en suspenso: mover el período por
     detrás del desplegable es desconcertante. */
  const { window, doc } = await montar(ESTADO_LLENO);
  const antes = rango(doc);
  doc.querySelector('#btn-view').click();
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  ok('las teclas no mueven el período por detrás', rango(doc) === antes,
    `${antes} → ${rango(doc)}`);
}

// --- 6. «Hoy», dentro del calendario, salta y no toca la vista ------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('.view-opt[data-view="day"]').click();
  doc.querySelector('#prev-range').click();
  doc.querySelector('#prev-range').click();
  const lejos = rango(doc);

  doc.querySelector('#btn-view').click();
  doc.querySelector('#btn-pick-day').click();
  doc.querySelector('#jump-today').click();

  ok('cierra el calendario', !doc.querySelector('#jump-dialog').hasAttribute('open'));
  ok('vuelve a hoy', /30/.test(rango(doc)), `${lejos} → ${rango(doc)}`);
  ok('sin cambiar la vista', texto(doc) === 'Diario', texto(doc));
}
{
  /* También sirve en el calendario de meses: `goToToday` fija mes y ventana de
     una, así que el mismo botón cubre los dos modos del diálogo. */
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#month-label').click();
  doc.querySelector('#jump-prev').click();          // 2025
  doc.querySelector('#jump-today').click();
  ok('y también desde el calendario de meses',
    /julio 2026/i.test(mes(doc)), mes(doc));
}

// --- 6b. «Ir a…» abre el calendario y cierra el menú ----------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('#btn-pick-day').click();

  ok('abre el calendario de días',
    doc.querySelector('#jump-dialog').hasAttribute('open')
    && doc.querySelector('#jump-title').textContent === 'Seleccionar día',
    doc.querySelector('#jump-title').textContent);
  /* Si el desplegable quedara abierto por detrás, reaparecería al cerrar el
     diálogo sobre una pantalla en la que ya nadie lo pidió. */
  ok('y cierra el desplegable detrás', !abierto(doc));
}

// --- 7. las flechas mueven la ventana de la vista activa -------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('.view-opt[data-view="day"]').click();
  const antes = rango(doc);
  doc.querySelector('#prev-range').click();
  ok('en diaria mueve un día', rango(doc) !== antes && /29/.test(rango(doc)),
    `${antes} → ${rango(doc)}`);
  ok('y se nombra por eso',
    doc.querySelector('#prev-range').title === 'Ir al día anterior',
    doc.querySelector('#prev-range').title);
}
{
  const { doc } = await montar(ESTADO_LLENO);
  ok('en semanal se nombra por la semana',
    doc.querySelector('#next-range').title === 'Ir a la semana siguiente',
    doc.querySelector('#next-range').title);
}
{
  /* En la mensual el mes entero es UNA ventana: no hay tramo que correr, así
     que las flechas pasan a mover de mes. Es lo que las vuelve el único paso a
     paso de la barra, ahora que la línea del mes no tiene flechas propias. */
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('.view-opt[data-view="month"]').click();

  ok('se nombra por el mes',
    doc.querySelector('#next-range').title === 'Ir al mes siguiente',
    doc.querySelector('#next-range').title);

  doc.querySelector('#next-range').click();
  ok('y mueve de mes', /agosto 2026/i.test(mes(doc)), mes(doc));
  doc.querySelector('#prev-range').click();
  ok('para los dos lados', /julio 2026/i.test(mes(doc)), mes(doc));
}

// --- 8. el desplegable es el mismo en las tres vistas ---------------------
{
  /* Nada se apaga al cambiar de vista: un menú que muda de opciones según dónde
     estés obliga a recordar cuáles hay en cada una. */
  const esperado = 'Diario,Semanal,Mensual,Ir a…';
  for (const vista of ['day', 'week', 'month']) {
    const { doc } = await montar(ESTADO_LLENO);
    doc.querySelector('#btn-view').click();
    doc.querySelector(`.view-opt[data-view="${vista}"]`).click();
    doc.querySelector('#btn-view').click();

    const visibles = opciones(doc).filter(o => !o.hidden).map(o => o.textContent);
    ok(`  ${vista}: las mismas cuatro opciones`, visibles.join(',') === esperado,
      visibles.join(','));
  }
}
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-view').click();
  doc.querySelector('.view-opt[data-view="month"]').click();

  ok('en la mensual las flechas quedan',
    doc.querySelector('#prev-range').hidden === false
    && doc.querySelector('#next-range').hidden === false);
  ok('y el selector de vista también', doc.querySelector('#btn-view').hidden === false);

  /* Elegir un día desde la mensual lleva a SU mes: la ventana es el mes entero,
     así que el salto sigue teniendo sentido. Es lo que hacía que apagarlo fuera
     gratuito. */
  doc.querySelector('#btn-view').click();
  doc.querySelector('#btn-pick-day').click();
  doc.querySelector('#jump-next').click();                    // agosto
  [...doc.querySelectorAll('#jump-grid .jump-cell')].find(c => c.textContent === '12').click();
  ok('y elegir un día lleva a su mes', /agosto 2026/i.test(mes(doc)), mes(doc));
  ok('sin salir de la vista mensual', texto(doc) === 'Mensual', texto(doc));
}

// --- 9. el desplegable de acciones del mes --------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const barra = doc.querySelector('#month-bar');
  ok('la barra del mes es un solo botón',
    barra.querySelectorAll('button').length === 1
    || barra.querySelector('#btn-actions') !== null);

  doc.querySelector('#btn-actions').click();
  const dentro = [...doc.querySelectorAll('#actions-options .view-opt')].map(b => b.id);
  console.log('  acciones:', dentro.join(' · '));
  ok('las seis acciones viven adentro',
    ['btn-add-task', 'btn-copy-prev', 'btn-delete-sel', 'btn-reset-sel', 'btn-zoom', 'btn-lock']
      .every(id => dentro.includes(id)), dentro.join(','));

  const titulos = [...doc.querySelectorAll('#actions-options .opt-group-title')]
    .map(t => t.textContent);
  ok('agrupadas en tres apartados',
    titulos.join(',') === 'Tareas,Visualización,Período', titulos.join(','));
  ok('cada apartado es un group con su rótulo',
    [...doc.querySelectorAll('#actions-options [role="group"]')]
      .every(g => doc.getElementById(g.getAttribute('aria-labelledby'))));
}

// --- 10. los dos desplegables no se pisan ---------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const acciones = () => !doc.querySelector('#actions-options').hidden;

  doc.querySelector('#btn-view').click();
  ok('abre el de vista', abierto(doc) && !acciones());

  doc.querySelector('#btn-actions').click();
  ok('abrir el de acciones cierra el otro', acciones() && !abierto(doc));

  doc.querySelector('#btn-view').click();
  ok('y al revés también', abierto(doc) && !acciones());
}

// --- 11. qué cierra el menú y qué no --------------------------------------
{
  /* El zoom cicla tres niveles: cerrarlo obligaría a desplegar de nuevo por
     cada paso. El resto abre un diálogo, así que se cierra. */
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-actions').click();
  const antes = doc.querySelector('#zoom-text').textContent;
  doc.querySelector('#btn-zoom').click();

  ok('el zoom deja el menú abierto', !doc.querySelector('#actions-options').hidden);
  ok('y cicla igual', doc.querySelector('#zoom-text').textContent !== antes,
    `${antes} → ${doc.querySelector('#zoom-text').textContent}`);
}
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-actions').click();
  doc.querySelector('#btn-add-task').click();
  ok('el alta cierra el menú', doc.querySelector('#actions-options').hidden === true);
  ok('y abre su diálogo', doc.querySelector('#task-dialog').hasAttribute('open'));
}
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-actions').click();
  doc.querySelector('#btn-lock').click();
  ok('bloquear cierra el menú', doc.querySelector('#actions-options').hidden === true);
  ok('y bloquea de verdad', doc.querySelector('#locked-note').hidden === false);
}

// --- 12. la geometría de la barra, que jsdom no puede medir ---------------
{
  /* jsdom no hace layout, así que esto se comprueba sobre la hoja. Son las dos
     cosas que se rompieron al juntar las filas y que ningún test veía. */
  const css = leer('styles.css');

  const alturas = css.match(/\n\.controls \.btn,\n\.month-label \{([\s\S]*?)\n\}/)?.[1] ?? '';
  ok('los controles de la barra comparten un alto',
    /height:\s*var\(--ctl-h\)/.test(alturas), alturas.trim().replace(/\s+/g, ' ') || '(sin regla)');
  ok('y --ctl-h está declarada', /--ctl-h:\s*\d/.test(css));
  /* Sin esto el alto lo decide el padding de cada uno, que es de donde salían
     las cuatro alturas distintas en una misma fila. */
  ok('con el padding vertical anulado', /padding-block:\s*0/.test(alturas));

  const movil = [...css.matchAll(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}\n/g)]
    .map(m => m[1]).find(b => b.includes('.actions-options')) ?? '';
  ok('en móvil el menú de acciones ancla a la derecha',
    /\.actions-options \{[^}]*right:\s*0/.test(movil));
  /* El de acciones comparte la clase `.view-options`: si esa regla fuera por
     clase le pisaría el ancla y el menú saldría cortado fuera de la pantalla.
     Es exactamente lo que pasó. */
  ok('y el de vista se acota por id, no por clase',
    /#view-options \{[^}]*left:\s*0/.test(movil)
    && !/\n\s*\.view-options \{[^}]*left:/.test(movil));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
