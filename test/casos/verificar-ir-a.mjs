/* El calendario de meses: el salto largo. Arnés: hoy = jueves 30/07/2026.

   Tuvo un hermano, el calendario de DÍAS, que se abría desde «☰ → Ir a una
   fecha…»: compartían diálogo, encabezado y grilla, y cambiaba qué celdas se
   dibujaban. Con el carrete moviéndose de a siete días con las flechas y de a
   uno con las teclas, esa entrada era un camino más largo para lo mismo, y sin
   ella el modo se quedó sin puerta. */
import { montar, verDia } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};
const celdas = doc => [...doc.querySelectorAll('#jump-grid .jump-cell')];
const mes = doc => doc.querySelector('#month-label').textContent;
const centro = doc => doc.querySelector('.carrete-dia.is-centro')?.dataset.date ?? '(ninguno)';

// --- 1. quién abre qué -----------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const enMes = [...doc.querySelectorAll('.month-nav > button')].map(b => b.id);
  const enCarrete = [...doc.querySelector('#carrete').children]
    .map(e => e.id || e.className);
  console.log('  month-nav:', enMes.join(' · '));
  console.log('  carrete:  ', enCarrete.join(' · '));

  /* El de meses no es un botón aparte: es el propio nombre del mes. Ni icono ni
     flechas — elegir mes es un salto largo y se hace de una. */
  const etiqueta = doc.querySelector('#month-label');
  ok('el nombre del mes es el control', etiqueta?.tagName === 'BUTTON', etiqueta?.tagName);
  ok('y anuncia que abre un diálogo',
    etiqueta.getAttribute('aria-haspopup') === 'dialog');
  ok('sin icono de calendario suelto en la línea del mes',
    doc.querySelector('.month-nav .cal-icon') === null);
  ok('ni flechas de mes anterior/siguiente',
    !enMes.includes('prev-month') && !enMes.includes('next-month'), enMes.join(' · '));

  /* Y no hay ningún otro calendario: el de días se fue del cajón con su
     apartado entero. */
  ok('sin icono de calendario en toda la barra',
    doc.querySelector('.controls .cal-icon') === null);
  ok('sin apartado «Día» en el cajón', doc.querySelector('#grupo-dia') === null);
  ok('  ni su entrada', doc.querySelector('#btn-pick-day') === null);

  /* Las flechas abrazan la pista del carrete: son el paso a paso de todos los
     días, y el salto largo es esto. */
  ok('las flechas abrazan al carrete',
    enCarrete.join(' ') === 'prev-range carrete-pista next-range', enCarrete.join(' · '));
  /* En la línea del mes viven el ☰ —que es de esta pantalla—, el nombre del mes
     —que abre su calendario—, «Hoy» —que aparece solo cuando el carrete está
     parado en otro día— y el remate de la selección masiva, que se turna con
     «Hoy» en el mismo lugar. */
  /* El ☰ a la izquierda, el mes al medio y, del otro lado, el orden —solo en
     Análisis— compartiendo columna con «Hoy» y con el remate de la selección
     masiva, que son de Hábitos: nunca coinciden. */
  ok('la línea del mes quedó con el ☰, el mes, el orden, el «Hoy» y el remate',
    [...doc.querySelector('.month-nav').children].map(e => e.id).join(',')
      === 'btn-menu,month-label,btn-orden,btn-hoy,mode-confirm',
    [...doc.querySelector('.month-nav').children].map(e => e.id).join(','));
  ok('y «Hoy» arranca oculto, porque se abre en hoy',
    doc.querySelector('#btn-hoy').hidden === true);
  ok('y ya no hay rótulo de rango', doc.querySelector('#range-label') === null);
}

// --- 2. el calendario de meses ---------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#month-label').click();

  ok('abre con el título de meses',
    doc.querySelector('#jump-title').textContent === 'Seleccionar mes',
    doc.querySelector('#jump-title').textContent);
  ok('rotulado con el año', doc.querySelector('#jump-label').textContent === '2026',
    doc.querySelector('#jump-label').textContent);
  ok('solo 12 celdas', celdas(doc).length === 12, `${celdas(doc).length}`);
  ok('son nombres de mes', celdas(doc)[0].textContent === 'Enero'
    && celdas(doc)[11].textContent === 'Diciembre',
    `${celdas(doc)[0].textContent} … ${celdas(doc)[11].textContent}`);
  ok('ninguna celda tiene fecha de día', celdas(doc).every(c => !c.dataset.date));
  ok('marca julio como el mes de hoy',
    celdas(doc).find(c => c.classList.contains('is-today'))?.textContent === 'Julio',
    celdas(doc).find(c => c.classList.contains('is-today'))?.textContent);

  /* Sin «Cancelar» ni «Hoy» la fila de acciones no tendría nada que mostrar: se
     fue entera en vez de dejar un hueco al pie. Volver a hoy ya está a un toque
     en la línea del mes. */
  ok('sin fila de acciones al pie', doc.querySelector('#jump-actions') === null);
  ok('y sin «Hoy» adentro', doc.querySelector('#jump-today') === null);
  ok('pero con la ✕ de la esquina',
    Boolean(doc.querySelector('#jump-dialog .dialog-close')));
}

// --- 3. navegar de año y elegir un mes -------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#month-label').click();
  doc.querySelector('#jump-prev').click();
  ok('la flecha retrocede un año', doc.querySelector('#jump-label').textContent === '2025');
  ok('sigue con 12 meses', celdas(doc).length === 12);

  celdas(doc).find(c => c.textContent === 'Marzo').click();
  ok('cierra el diálogo', !doc.querySelector('#jump-dialog').hasAttribute('open'));
  ok('saltó a marzo de 2025', /marzo 2025/i.test(mes(doc)), mes(doc));
  /* Cae en el día 1: el mes elegido no tiene un día «evidente». */
  ok('y quedó parado en el día 1', centro(doc) === '2025-03-01', centro(doc));
}

// --- 4. el mes de hoy cae en hoy -------------------------------------------
{
  /* Salvo uno: el mes actual, donde el destino evidente es hoy, que es donde se
     carga. */
  const { doc } = await montar(ESTADO_LLENO);
  verDia(doc, '2026-07-08');

  doc.querySelector('#month-label').click();
  celdas(doc).find(c => c.textContent === 'Julio').click();
  ok('elegir el mes de hoy vuelve a hoy', centro(doc) === '2026-07-30', centro(doc));
}

// --- 5. cerrar sin elegir no mueve nada ------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const antes = mes(doc);
  doc.querySelector('#month-label').click();
  doc.querySelector('#jump-next').click();
  doc.querySelector('#jump-dialog [data-close-dialog]').click();
  ok('cerrar deja el mes como estaba', mes(doc) === antes, `${antes} → ${mes(doc)}`);
  ok('y el diálogo cerrado', !doc.querySelector('#jump-dialog').hasAttribute('open'));
}

// --- 6. el carrete se acomoda alrededor del día elegido -------------------
{
  /* La ventana es el día, y el carrete se dibuja alrededor. */
  const { doc } = await montar(ESTADO_LLENO);
  verDia(doc, '2026-07-08');                       // miércoles 8 de julio

  ok('el elegido queda al medio', centro(doc) === '2026-07-08', centro(doc));
  const tira = [...doc.querySelectorAll('.carrete-dia')].map(f => f.dataset.date);
  ok('con tres días a cada lado',
    tira[0] === '2026-07-05' && tira.at(-1) === '2026-07-11', tira.join(' '));
  ok('sigue en julio', /julio 2026/i.test(mes(doc)), mes(doc));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
