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

  /* El carrete es solo la pista de días. Tuvo flechas a los costados para pasar
     de a siete; ahora eso lo hace deslizar la tira, y el salto largo sigue
     siendo el calendario de meses. */
  ok('el carrete es solo la pista de días',
    enCarrete.join(' ') === 'carrete-pista', enCarrete.join(' · '));
  /* En la línea del mes viven el ☰ —que es de esta pantalla—, el nombre del mes
     —que abre su calendario—, «Hoy» —que aparece solo cuando el carrete está
     parado en otro día— y el remate de la selección masiva, que se turna con
     «Hoy» en el mismo lugar. */
  /* El ☰ a la izquierda, el mes al medio y, del otro lado, los de Análisis
     —el orden, el período y «Año actual», que nunca están dos a la vez—
     compartiendo columna con «Hoy» y con el remate de la selección masiva,
     que son de Hábitos. Los cinco se turnan en el mismo lugar. */
  const enLinea = () => [...doc.querySelector('.month-nav').children]
    .map(e => e.id).join(',');
  ok('la línea del mes quedó con el ☰, el mes y los cinco que se turnan a la derecha',
    enLinea()
      === 'btn-menu,month-label,btn-orden,btn-rango,btn-anio-hoy,btn-hoy,mode-confirm',
    enLinea());
  ok('  y en Hábitos no se ve ninguno de los de Análisis',
    doc.querySelector('#btn-orden').hidden === true
    && doc.querySelector('#btn-rango').hidden === true
    && doc.querySelector('#btn-anio-hoy').hidden === true);
  ok('y «Hoy» arranca oculto, porque se abre en hoy',
    doc.querySelector('#btn-hoy').hidden === true);
  ok('y ya no hay rótulo de rango', doc.querySelector('#range-label') === null);
}

// --- 2. abre en los días del mes que se está mirando ------------------------
{
  /* El diálogo contesta «a qué FECHA», así que abre donde está la respuesta:
     los días. Antes contestaba «a qué mes» y elegir uno caía en el día 1, que
     era una respuesta inventada — y para llegar a otro día había que salir y
     moverse con el carrete. */
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#month-label').click();

  ok('abre con el título de la fecha',
    doc.querySelector('#jump-title').textContent === 'Seleccionar fecha',
    doc.querySelector('#jump-title').textContent);
  ok('  y el botón que lo abre dice lo mismo',
    doc.querySelector('#month-label').title === 'Elegir fecha',
    doc.querySelector('#month-label').title);
  ok('rotulado con el mes que se está mirando',
    doc.querySelector('#jump-label').textContent === 'Julio 2026',
    doc.querySelector('#jump-label').textContent);

  ok('con los 31 días de julio', celdas(doc).length === 31, String(celdas(doc).length));
  ok('  numerados', celdas(doc)[0].textContent === '1'
    && celdas(doc)[30].textContent === '31',
    `${celdas(doc)[0].textContent} … ${celdas(doc)[30].textContent}`);
  /* Julio de 2026 arranca un miércoles: dos huecos antes del 1, para que cada
     día caiga debajo del nombre que le corresponde. */
  ok('  alineados al lunes',
    doc.querySelectorAll('#jump-grid .jump-hueco').length === 2,
    String(doc.querySelectorAll('#jump-grid .jump-hueco').length));
  ok('  con los días de la semana encabezando',
    [...doc.querySelectorAll('#jump-dows .jump-dow')].map(d => d.textContent).join(' ')
      === 'lun mar mié jue vie sáb dom',
    [...doc.querySelectorAll('#jump-dows .jump-dow')].map(d => d.textContent).join(' '));

  ok('marca el 30 como hoy',
    celdas(doc).find(c => c.classList.contains('is-today'))?.textContent === '30',
    celdas(doc).find(c => c.classList.contains('is-today'))?.textContent);

  /* Sin «Cancelar» ni «Hoy» la fila de acciones no tendría nada que mostrar: se
     fue entera en vez de dejar un hueco al pie. Volver a hoy ya está a un toque
     en la línea del mes. */
  ok('sin fila de acciones al pie', doc.querySelector('#jump-actions') === null);
  ok('y sin «Hoy» adentro', doc.querySelector('#jump-today') === null);
  ok('pero con la ✕ de la esquina',
    Boolean(doc.querySelector('#jump-dialog .dialog-close')));
}

// --- 3. elegir un día lleva a ese día --------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#month-label').click();

  doc.querySelector('#jump-prev').click();
  ok('la flecha retrocede un mes',
    doc.querySelector('#jump-label').textContent === 'Junio 2026',
    doc.querySelector('#jump-label').textContent);
  ok('  con los 30 días de junio', celdas(doc).length === 30, String(celdas(doc).length));

  celdas(doc).find(c => c.textContent === '12').click();
  ok('cierra el diálogo', !doc.querySelector('#jump-dialog').hasAttribute('open'));
  ok('y va a ese día exacto', centro(doc) === '2026-06-12', centro(doc));
  ok('  con el mes siguiéndolo', /junio 2026/i.test(mes(doc)), mes(doc));
}

// --- 4. el rótulo cambia de escala -----------------------------------------
{
  /* De los días de un mes a los meses de un año, tocando el rótulo del medio.
     Es la misma idea que en cualquier calendario, y evita un segundo control
     para lo mismo. */
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#month-label').click();
  doc.querySelector('#jump-label').click();

  ok('el rótulo sube a los meses del año',
    doc.querySelector('#jump-label').textContent === '2026',
    doc.querySelector('#jump-label').textContent);
  ok('  con los doce', celdas(doc).length === 12, String(celdas(doc).length));
  ok('  con nombre completo', celdas(doc)[0].textContent === 'Enero'
    && celdas(doc)[11].textContent === 'Diciembre',
    `${celdas(doc)[0].textContent} … ${celdas(doc)[11].textContent}`);
  ok('  y sin días de la semana que encabezar',
    doc.querySelector('#jump-dows').hidden === true);

  // Y ahí las flechas mueven el año, que es la escala puesta.
  doc.querySelector('#jump-prev').click();
  ok('la flecha retrocede un año', doc.querySelector('#jump-label').textContent === '2025',
    doc.querySelector('#jump-label').textContent);

  /* Elegir un mes NO navega: baja a sus días. El diálogo contesta «a qué
     fecha», y un mes todavía no es una. */
  celdas(doc).find(c => c.textContent === 'Marzo').click();
  ok('elegir un mes baja a sus días, sin navegar',
    doc.querySelector('#jump-dialog').hasAttribute('open')
      && doc.querySelector('#jump-label').textContent === 'Marzo 2025',
    doc.querySelector('#jump-label').textContent);
  ok('  con los 31 de marzo', celdas(doc).length === 31, String(celdas(doc).length));
  ok('  y el mes de la pantalla todavía sin moverse', /julio 2026/i.test(mes(doc)), mes(doc));

  celdas(doc).find(c => c.textContent === '9').click();
  ok('y recién el día lleva ahí', centro(doc) === '2025-03-09', centro(doc));
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
