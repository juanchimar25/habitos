/* El carrete de días y la lista del día elegido, que reemplazaron a la planilla
   de doble entrada y a sus tres vistas.

   Arnés: hoy = jueves 30/07/2026, que es el día en el que abre. */
import { montar, verDia, leer, deslizar } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const mes = doc => doc.querySelector('#month-label').textContent;
const cajon = doc => doc.body.classList.contains('drawer-open');
const fichas = doc => [...doc.querySelectorAll('.carrete-dia')];
const centro = doc => doc.querySelector('.carrete-dia.is-centro')?.dataset.date ?? '(ninguno)';
const filas = doc => [...doc.querySelectorAll('#dia-lista .dia-fila')];

// --- 1. la tira de días ----------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);

  ok('la planilla de doble entrada ya no está', doc.querySelector('#grid') === null);
  ok('ni sus tres vistas', doc.querySelector('[data-view]') === null);

  const dias = fichas(doc).map(f => f.dataset.date);
  console.log('  carrete:', dias.join(' · '));
  ok('el carrete muestra siete días', dias.length === 7, String(dias.length));

  /* El elegido va SIEMPRE al medio: es lo que hace que moverse no se sienta
     como que la tira salta. */
  ok('con el elegido al medio', dias[3] === centro(doc), `${dias[3]} vs ${centro(doc)}`);
  ok('que al abrir es hoy', centro(doc) === '2026-07-30', centro(doc));

  ok('los tres de cada lado son los días vecinos',
    dias[0] === '2026-07-27' && dias[6] === '2026-08-02', `${dias[0]} … ${dias[6]}`);

  ok('el del centro se anuncia como la fecha actual',
    doc.querySelector('.carrete-dia.is-centro').getAttribute('aria-current') === 'date');
  ok('y cada ficha se nombra entera para el lector de pantalla',
    /jueves, 30 de julio/i.test(doc.querySelector('.carrete-dia.is-centro').getAttribute('aria-label')),
    doc.querySelector('.carrete-dia.is-centro').getAttribute('aria-label'));
}

// --- 2. es continuo: cruza el borde del mes -------------------------------
{
  /* La tira no se corta el 31: sigue con los días de agosto, atenuados. Que se
     vean es la mitad del asunto —el 1º no queda escondido detrás de un salto de
     mes—; que estén atenuados es la otra: elegirlos muda el mes de trabajo. */
  const { doc } = await montar(ESTADO_LLENO);

  const fuera = fichas(doc).filter(f => f.classList.contains('is-fuera'))
    .map(f => f.dataset.date);
  ok('los días del mes vecino se ven, atenuados',
    fuera.join(',') === '2026-08-01,2026-08-02', fuera.join(','));

  ok('el mes de arriba sigue siendo el del centro', /julio 2026/i.test(mes(doc)), mes(doc));
}
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('.carrete-dia[data-date="2026-08-01"]').click();

  ok('elegir uno de agosto lo lleva al centro', centro(doc) === '2026-08-01', centro(doc));
  ok('y el mes de trabajo lo sigue', /agosto 2026/i.test(mes(doc)), mes(doc));
  /* Las tareas son listas por mes: al mudarse, la lista es la de agosto. */
  ok('con la lista del mes nuevo', filas(doc).length > 0, String(filas(doc).length));
}

// --- 3. deslizar el carrete pasa de página --------------------------------
{
  /* Arnés parado en el 30/07: la tira va del 27/07 al 02/08. Deslizar la tira
     muestra los SIETE siguientes —del 03 al 09—, no el día de al lado: es la
     tira lo que se está moviendo, y correrla un solo día obligaría a repetir el
     gesto siete veces. Como el salto es de siete, el día de la semana no
     cambia: el centro sigue cayendo en jueves, y la tira se lee como la página
     que sigue de la misma grilla.

     Tuvo flechas a los costados para esto. Se fueron: el gesto hace lo mismo
     con el pulgar donde ya está, y el ancho que ocupaban volvió a las fichas. */
  const { doc } = await montar(ESTADO_LLENO);
  const carrete = () => doc.querySelector('#carrete');

  deslizar(doc, carrete(), -1);
  ok('adelante, una vuelta entera', centro(doc) === '2026-08-06', centro(doc));
  ok('  cruzando de mes', /agosto 2026/i.test(mes(doc)), mes(doc));
  ok('  y sin cambiar de día de la semana',
    fichas(doc).find(f => f.classList.contains('is-centro'))
      ?.querySelector('.carrete-dow').textContent.toLowerCase().startsWith('jue'));

  deslizar(doc, carrete(), 1);
  ok('para atrás también', centro(doc) === '2026-07-30', centro(doc));
  ok('  y vuelve el mes', /julio 2026/i.test(mes(doc)), mes(doc));

  /* La tira que se ve después de tocar es, exactamente, la que seguía. */
  const antes = fichas(doc).map(f => f.dataset.date);
  deslizar(doc, carrete(), -1);
  const despues = fichas(doc).map(f => f.dataset.date);
  ok('la tira nueva empieza donde terminaba la anterior',
    despues[0] === '2026-08-03' && antes[antes.length - 1] === '2026-08-02',
    `${antes[antes.length - 1]} → ${despues[0]}`);
  ok('  sin repetir ningún día', despues.every(d => !antes.includes(d)),
    despues.join(' '));

  /* Y no quedó ninguna flecha: el ancho que ocupaban es de las fichas. */
  ok('el carrete es solo la pista de días',
    [...carrete().children].map(n => n.id).join(' ') === 'carrete-pista',
    [...carrete().children].map(n => n.id || n.className).join(' · '));
  ok('  con las siete a la vista', fichas(doc).length === 7, String(fichas(doc).length));
}
{
  /* Las teclas ← → mueven de a UN día, que es otra cosa que el gesto. */
  const { window, doc } = await montar(ESTADO_LLENO);
  const tecla = key =>
    doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));

  tecla('ArrowLeft');
  ok('← retrocede un día', centro(doc) === '2026-07-29', centro(doc));
  tecla('ArrowRight');
  tecla('ArrowRight');
  ok('→ avanza', centro(doc) === '2026-07-31', centro(doc));
  tecla('t');
  ok('«t» vuelve a hoy', centro(doc) === '2026-07-30', centro(doc));
}

// --- 3b. el botón «Hoy» ---------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const hoy = doc.querySelector('#btn-hoy');

  /* En hoy no lleva a ningún lado: un botón que no hace nada es peor que no
     tenerlo. */
  ok('parado en hoy, no está', hoy.hidden === true);

  deslizar(doc, doc.querySelector('#carrete'), -1);
  ok('en otro día aparece', hoy.hidden === false);
  ok('  y el día elegido se movió una vuelta', centro(doc) === '2026-08-06', centro(doc));
  ok('y dice a dónde lleva', /30 de julio/i.test(hoy.title), hoy.title);

  hoy.click();
  ok('vuelve a hoy', centro(doc) === '2026-07-30', centro(doc));
  ok('y desaparece de nuevo', hoy.hidden === true);
}
{
  /* Cruzando de mes también: vuelve el día Y el mes. */
  const { doc } = await montar(ESTADO_LLENO);
  verDia(doc, '2026-09-12');
  ok('desde otro mes, el botón está', doc.querySelector('#btn-hoy').hidden === false);

  doc.querySelector('#btn-hoy').click();
  ok('vuelve el día', centro(doc) === '2026-07-30', centro(doc));
  ok('y el mes', /julio 2026/i.test(mes(doc)), mes(doc));
}
{
  /* Fuera del Diario no hay carrete al que volver. */
  const { doc } = await montar(ESTADO_LLENO);
  deslizar(doc, doc.querySelector('#carrete'), -1);
  doc.querySelector('[data-page="indicators"]').click();
  ok('en Análisis no se muestra', doc.querySelector('#btn-hoy').hidden === true);
}

// --- 3c. la tira no cambia de alto al navegar ----------------------------
{
  /* jsdom no mide, así que esto se lee de la hoja. El punto de «hoy» empujaba
     su ficha y las hermanas se estiraban para igualarla: al navegar, la tira
     entera cambiaba de alto según dónde cayera hoy. */
  const css = leer('styles.css');
  const bloque = re => css.match(re)?.[0] ?? '';

  const todas = bloque(/\n\.carrete-dia::after \{[\s\S]*?\n\}/);
  ok('todas las fichas reservan el lugar del punto',
    /content:\s*''/.test(todas) && /height:/.test(todas),
    todas.replace(/\s+/g, ' ').trim() || '(sin regla)');
  ok('y lo que cambia es solo su color',
    /\.carrete-dia\.is-today:not\(\.is-centro\)::after \{ background:/.test(css));
}

// --- 4. la lista del día ---------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);

  ok('una fila por tarea del mes', filas(doc).length === 5, String(filas(doc).length));

  const primera = filas(doc)[0];
  ok('con el nombre', primera.querySelector('.task-name')?.textContent === 'Leer',
    primera.querySelector('.task-name')?.textContent);
  ok('y su frecuencia', /Todos los días/.test(primera.querySelector('.task-freq')?.textContent),
    primera.querySelector('.task-freq')?.textContent);

  /* El botón de estado trae el día en el marcado: es lo que permite que el
     mismo `cycleCell` de la planilla siga sirviendo sin tocarlo. */
  const boton = primera.querySelector('.cell');
  ok('un botón de estado por fila', Boolean(boton));
  ok('que sabe de qué día es', boton.dataset.date === '2026-07-30', boton.dataset.date);

  /* La fila habla del DÍA y nada más: el acumulado del mes se mira en
     Análisis, que es la sección mensual. */
  ok('sin acumulados del mes en la fila',
    primera.querySelector('.dia-mes') === null);

  /* Encendida = hoy cuenta para esa tarea. El arnés abre el jueves 30:
       · «Leer» y «Meditar» son de todos los días → les toca, encendidas;
       · «Inglés» es L·X·V → el jueves no le toca, apagada;
       · «Correr» (una vez por semana) y «Gimnasio» (8 veces al mes) no tienen
         días propios: ningún día es EL día hasta que se las carga, así que
         nacen apagadas. */
  const encendidas = filas(doc).filter(f => !f.classList.contains('is-optional'))
    .map(f => f.querySelector('.task-name').textContent);
  console.log('  encendidas:', encendidas.join(' · '));
  ok('solo se enciende lo que hoy cuenta', encendidas.join(',') === 'Leer,Meditar',
    encendidas.join(','));
}

// --- 4b. una tarea no existe antes de su fecha de inicio ------------------
{
  /* «Meditar» arranca el 10 de julio. El 9 todavía no existía, así que ese día
     no está en la lista — antes aparecía con el recuadro apagado, que es contar
     una historia que no pasó. */
  const { doc } = await montar(ESTADO_LLENO);
  const nombres = () => filas(doc).map(f => f.querySelector('.task-name').textContent);

  verDia(doc, '2026-07-09');
  console.log('  el 9:', nombres().join(' · '));
  ok('el día anterior a su inicio no aparece', !nombres().includes('Meditar'),
    nombres().join(','));

  verDia(doc, '2026-07-10');
  console.log('  el 10:', nombres().join(' · '));
  ok('el día en que empieza sí', nombres().includes('Meditar'), nombres().join(','));

  /* Y las que ya existían ese día siguen estando: lo que se filtra es cada
     tarea por su fecha, no la lista entera. */
  verDia(doc, '2026-07-09');
  ok('las demás siguen ahí', nombres().length > 0, nombres().join(','));
}
{
  /* Si NINGUNA existe todavía, el día queda vacío y aparece el aviso: es lo
     mismo que un mes sin tareas, y se dice igual. */
  const { doc } = await montar({
    months: { '2026-07': [{ id: 'x', name: 'Nueva', freq: 'daily', customMode: 'weekdays',
      weekdays: [], target: 12, start: '2026-07-28' }] },
    status: {},
  });

  verDia(doc, '2026-07-27');
  ok('sin ninguna empezada, no se dibuja la lista', doc.querySelector('#dia').hidden === true);
  ok('y aparece el aviso de que no hay tareas', doc.querySelector('#empty').hidden === false);

  verDia(doc, '2026-07-28');
  ok('desde su fecha, la lista vuelve', doc.querySelector('#dia').hidden === false);
  ok('con la tarea', filas(doc).length === 1, String(filas(doc).length));
}

// --- 5. marcar cambia el estado y los totales ------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const boton = () => filas(doc)[0].querySelector('.cell');
  const guardado = () => JSON.parse(window.localStorage.getItem('tareas-diarias/v1/u-test'));

  const antes = boton().className;
  boton().click();
  ok('el clic avanza el estado', boton().className !== antes,
    `${antes} → ${boton().className}`);
  ok('y queda guardado con la fecha del día',
    Object.keys(guardado().status).some(k => k.endsWith('|2026-07-30')));

  /* El total va en un recuadro alineado con los de las tareas: mismo ancho y
     mismo padding lateral que las filas, que es lo que los deja en la misma
     vertical y hace que se lea como el total de esa columna. */
  const css = leer('styles.css');
  const caja = css.match(/\n\.dia-resumen-valor \{[\s\S]*?\n\}/)?.[0] ?? '';
  const celda = css.match(/\n\.dia-fila \.cell \{[\s\S]*?\n\}/)?.[0] ?? '';
  const ancho = bloque => bloque.match(/width:\s*([^;]+);/)?.[1];
  ok('el total va en un recuadro del ancho del estado',
    ancho(caja) && ancho(caja) === ancho(celda), ancho(caja) + ' vs ' + ancho(celda));

  const resumen = doc.querySelector('#dia-resumen-valor').textContent;
  ok('el cumplimiento diario se recalcula', /%/.test(resumen), resumen);
}

// --- 5a. el resumen cuenta lo mismo que muestran las filas -----------------
{
  /* Domingo 26. «Trabajo» es de lunes a viernes: ese día no tocaba, pero está
     hecha, así que la fila se ve encendida y tiene que contar 1 de 1.

     Antes el resumen sumaba por tarea y con el tope de la meta de cada una: esa
     fila se veía cumplida y valía 0 de 0. El mismo domingo decía un porcentaje
     en la lista y otro en el gráfico de barras, que siempre contó por día. */
  const tarea = (id, name, freq) => ({
    id, name, freq, customMode: 'weekdays', weekdays: [], target: 12, start: null,
  });
  const { doc } = await montar({
    months: { '2026-07': [tarea('d1', 'Leer', 'daily'), tarea('w1', 'Trabajo', 'weekdays')] },
    status: { 'w1|2026-07-26': 'done' },
    theme: 'light',
  });
  verDia(doc, '2026-07-26');

  const fila = filas(doc).find(f => f.dataset.taskId === 'w1');
  ok('la de lunes a viernes se ve encendida el domingo',
    fila && !fila.classList.contains('is-optional'), fila?.className);

  const resumen = doc.querySelector('#dia-resumen-valor').textContent;
  const detalle = doc.querySelector('#dia-resumen').title;
  console.log(`
=== el domingo ===
  ${resumen} · ${detalle}`);
  ok('lo hecho un día que no tocaba entra en la cuenta', resumen === '50%', resumen);
  ok('  y el detalle lo dice: 1 sobre 2', /1 sobre una meta de 2/.test(detalle), detalle);
}

// --- 5b. «no requerido» apaga la tarjeta entera ---------------------------
{
  /* Un día que no cuenta para esa tarea se ve igual lo decida la frecuencia o
     lo marque el usuario: es lo mismo para el que mira. */
  const { doc } = await montar(ESTADO_LLENO);
  const fila = filas(doc)[0];                      // «Leer», todos los días
  const boton = () => fila.querySelector('.cell');

  ok('arranca encendida', !fila.classList.contains('is-optional'), fila.className);

  // El ciclo: verde, amarillo, rojo, no requerido, vacío.
  const recorrido = [];
  for (let i = 0; i < 5; i++) {
    boton().click();
    recorrido.push(boton().className.replace('cell ', ''));
  }
  console.log('  ciclo:', recorrido.join(' → '));
  ok('el ciclo pasa por los cuatro estados y vuelve a vacío',
    recorrido.join(',') === 'st-done,st-partial,st-missed,st-skip,st-none',
    recorrido.join(','));

  // En «no requerido» —el cuarto paso— la tarjeta queda apagada.
  for (let i = 0; i < 4; i++) boton().click();
  ok('«no requerido» apaga la tarjeta entera',
    fila.classList.contains('is-optional'), fila.className);

  boton().click();                                  // vuelve a vacío
  ok('y al salir se enciende de nuevo',
    !fila.classList.contains('is-optional'), fila.className);
}

// --- 5b bis. cargar una tarea sin días propios la enciende ----------------
{
  /* «Cualquier día sirve» no es lo mismo que «hoy toca»: nacen apagadas y se
     encienden el día que se las carga. */
  const { doc } = await montar(ESTADO_LLENO);
  const fila = filas(doc).find(f => /Gimnasio/.test(f.textContent));  // 8 veces al mes

  ok('«8 veces al mes» nace apagada', fila.classList.contains('is-optional'));

  fila.querySelector('.cell').click();
  ok('cargarla la enciende', !fila.classList.contains('is-optional'), fila.className);

  // Y al vaciarla vuelve a apagarse: son tres pasos hasta el vacío.
  for (let i = 0; i < 3; i++) fila.querySelector('.cell').click();
  ok('vaciarla la vuelve a apagar', fila.classList.contains('is-optional'), fila.className);
}

// --- 5c. «no requerido» solo donde la frecuencia sí pedía -----------------
{
  /* Eximirse de un día que ya no contaba no cambiaría nada: ese día no estaba
     en la meta. El ciclo se saltea el paso en vez de ofrecer uno que no hace
     nada.

     El arnés abre el jueves 30. «Leer» es de todos los días —le toca— y
     «Inglés» es L·X·V, así que el jueves no. */
  const { doc } = await montar(ESTADO_LLENO);
  const ciclo = fila => {
    const boton = fila.querySelector('.cell');
    const pasos = [];
    for (let i = 0; i < 5; i++) {
      boton.click();
      pasos.push(boton.className.replace('cell st-', ''));
      if (pasos.at(-1) === 'none') break;
    }
    return pasos;
  };

  const pide = ciclo(filas(doc).find(f => /Leer/.test(f.textContent)));
  console.log('  día que sí toca: ', pide.join(' → '));
  ok('donde la frecuencia pide, el ciclo incluye «no requerido»',
    pide.includes('skip'), pide.join(','));

  const noPide = ciclo(filas(doc).find(f => /Inglés/.test(f.textContent)));
  console.log('  día que no toca:', noPide.join(' → '));
  ok('donde no pide, el ciclo lo saltea', !noPide.includes('skip'), noPide.join(','));
  ok('y son los tres estados de siempre más el vacío',
    noPide.join(',') === 'done,partial,missed,none', noPide.join(','));
}

// --- 6. el día de hoy, cuando no es el elegido ----------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  verDia(doc, '2026-07-28');

  const hoy = doc.querySelector('.carrete-dia.is-today');
  ok('hoy sigue señalado en la tira', hoy?.dataset.date === '2026-07-30', hoy?.dataset.date);
  ok('sin ser el del centro', !hoy.classList.contains('is-centro'));
  ok('y el centro es el elegido', centro(doc) === '2026-07-28', centro(doc));
}

// --- 7. sin tareas -------------------------------------------------------
{
  const { doc } = await montar({ months: {}, status: {} });
  ok('sin tareas no se dibuja la lista', doc.querySelector('#dia').hidden === true);
  ok('y aparece el aviso', doc.querySelector('#empty').hidden === false);
  ok('pero el carrete sigue estando', fichas(doc).length === 7);
}

// --- 9. las opciones del mes, ahora en el cajón ---------------------------
{
  /* Eran un desplegable propio en la barra: dos menús para el mismo mes. Todo
     su contenido se mudó al ☰, con los mismos ids. */
  const { doc } = await montar(ESTADO_LLENO);
  ok('la barra del mes ya no existe', doc.querySelector('#month-bar') === null);
  ok('ni su botón «Opciones»', doc.querySelector('#btn-actions') === null);
  ok('ni su desplegable', doc.querySelector('#actions-options') === null);

  doc.querySelector('#btn-menu').click();
  const dentro = [...doc.querySelectorAll('#drawer .drawer-item')].map(b => b.id);
  console.log('  cajón:', dentro.join(' · '));
  ok('las acciones del mes viven en el cajón',
    ['btn-archived', 'btn-templates', 'btn-save-template'].every(id => dentro.includes(id)),
    dentro.join(','));
  /* El zoom era la densidad de la planilla: se fue con ella. */
  ok('y el zoom ya no existe', !dentro.includes('btn-zoom'), dentro.join(','));
  ok('y el bloqueo de período ya no existe', !dentro.includes('btn-lock'));
  /* El alta no volvió con ellas: es el botón redondo de la esquina, que es lo
     que más se hace y no puede pedir abrir un menú. */
  ok('el alta sigue afuera', !dentro.includes('btn-add-task'), dentro.join(','));

  const titulos = [...doc.querySelectorAll('#drawer .drawer-label')].map(t => t.textContent);
  console.log('  apartados:', titulos.join(' · '));
  /* «Día» se fue entero: era «Ir a una fecha…», y el carrete llega a cualquier
     día con las flechas y las teclas. «Gráficos» está en el marcado pero es de
     Análisis: acá se dibuja escondido. */
  ok('con sus apartados, y «Tareas» el primero visible',
    titulos.includes('Tareas') && !titulos.includes('Día'), titulos.join(','));
  ok('  el de gráficos no se ve en Hábitos',
    doc.querySelector('#grupo-graficos').hidden === true);
}

// --- 11. qué cierra el cajón y qué no -------------------------------------
{
  /* Todo lo que hay adentro abre un diálogo, y para verlo hay que sacar el
     cajón del medio. */
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-menu').click();
  ok('el cajón se abre', doc.body.classList.contains('drawer-open'));

  doc.querySelector('#btn-templates').click();
  ok('y elegir algo de adentro lo cierra', !doc.body.classList.contains('drawer-open'));
}
{
  /* El botón redondo tiene que poder abrir su diálogo con el cajón abierto. */
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#btn-menu').click();
  doc.querySelector('#btn-fab').click();
  ok('el alta abre su diálogo desde la esquina',
    doc.querySelector('#task-dialog').hasAttribute('open'));
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

  /* No quedó CSS de ninguno de los dos desplegables que se mudaron al cajón.
     Reglas huérfanas de un componente que ya no existe son la forma más barata
     de que la hoja crezca sin que nadie sepa qué se puede tocar. */
  const base = css.replace(/@media[\s\S]*?\n\}\n/g, '');
  for (const resto of ['.view-options', '.view-opt', '.view-menu', '.view-btn',
    '.actions-options', '.grid', '.table-wrap', '--cell-w']) {
    ok(`  sin restos de ${resto}`, !base.includes(resto));
  }
}

// --- las flechas miden lo que una ficha ------------------------------------
{
  /* jsdom no calcula anchos, así que la igualdad se comprueba donde se decide:
     en la cuenta de la hoja. El carrete reparte NUEVE columnas iguales —flecha,
     siete días, flecha— y la pista se lleva siete y las vuelve a repartir. Eso
     solo da fichas del ancho de una flecha si las dos rejillas usan el MISMO
     `gap`; con gaps distintos, la cuenta de adentro deja de cerrar. */
  const css = leer('styles.css');
  const bloque = re => css.match(re)?.[0] ?? '';

  const carrete = bloque(/\n\.carrete \{[^}]*\}/);
  const pista = bloque(/\n\.carrete-pista \{[^}]*\}/);

  ok('el carrete reparte siete columnas iguales',
    /grid-template-columns:\s*repeat\(7,\s*1fr\)/.test(carrete),
    carrete.replace(/\s+/g, ' ').trim());
  ok('  y la pista se las lleva todas', /grid-column:\s*1 \/ -1/.test(pista),
    pista.replace(/\s+/g, ' ').trim());

  const gap = txt => txt.match(/[^-]gap:\s*([^;]+);/)?.[1]?.trim();
  ok('  las dos rejillas comparten la separación',
    Boolean(gap(carrete)) && gap(carrete) === gap(pista),
    `${gap(carrete)} vs ${gap(pista)}`);

  /* Y no quedó nada de las flechas: ni el estilo que las hacía parecer una
     ficha ni el cuerpo reducido de su triángulo. Una regla huérfana no rompe
     nada y por eso se queda para siempre. */
  ok('  sin restos de las flechas en la hoja',
    !/#prev-range|#next-range/.test(css));
}

// --- deslizar la lista cambia de día ---------------------------------------
{
  /* El mismo gesto que en el calendario de Pendientes, con la misma función.
     Sobre la LISTA pasa un día, que es lo que hacen las teclas ← →; sobre el
     carrete pasa siete, que es otra cosa — mover la tira entera—.

     Deslizar sobre la lista del día es lo único que puede confundirse con
     marcar una celda, y por eso lo importante de acá abajo es que el clic que
     cierra el gesto no marque nada. */
  const { doc } = await montar(ESTADO_LLENO);
  const tablero = doc.querySelector('#board');

  const puntero = (tipo, nodo, x, y, tipoPuntero = 'touch') => {
    const e = new doc.defaultView.Event(tipo, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX: x, clientY: y, pointerId: 1, button: 0, pointerType: tipoPuntero });
    nodo.dispatchEvent(e);
  };
  const deslizar = (dx, dy = 0, tipoPuntero = 'touch') => {
    puntero('pointerdown', tablero, 200, 300, tipoPuntero);
    puntero('pointermove', tablero, 200 + dx, 300 + dy, tipoPuntero);
    puntero('pointerup', tablero, 200 + dx, 300 + dy, tipoPuntero);
  };

  ok('arranca en hoy', centro(doc) === '2026-07-30', centro(doc));

  deslizar(-120);
  ok('deslizar a la izquierda trae el día siguiente', centro(doc) === '2026-07-31', centro(doc));

  deslizar(120);
  deslizar(120);
  ok('  y a la derecha, los anteriores', centro(doc) === '2026-07-29', centro(doc));

  /* Uno por gesto: el puntero se suelta al pasar, así que seguir moviendo el
     mismo dedo no encadena días. */
  puntero('pointerdown', tablero, 200, 300);
  puntero('pointermove', tablero, 60, 300);
  puntero('pointermove', tablero, -100, 300);
  puntero('pointerup', tablero, -100, 300);
  ok('un solo día por gesto', centro(doc) === '2026-07-30', centro(doc));

  // Un toque quieto y un desplazamiento vertical no son este gesto.
  deslizar(-30);
  ok('un movimiento corto no cambia de día', centro(doc) === '2026-07-30', centro(doc));
  deslizar(-80, 200);
  ok('  ni uno que va más para abajo que para el costado', centro(doc) === '2026-07-30', centro(doc));

  // Con mouse tampoco: para eso están las teclas y el carrete.
  deslizar(-120, 0, 'mouse');
  ok('con el mouse no se desliza', centro(doc) === '2026-07-30', centro(doc));

  /* Y lo importante: el clic que cierra el gesto no marca. La fila que quedó
     debajo del dedo después de redibujar ni siquiera es la que se tocó. */
  const primera = () => filas(doc)[0].querySelector('.cell').className;
  const antes = primera();
  deslizar(-120);
  filas(doc)[0].querySelector('.cell').click();
  ok('el clic que cierra el deslizamiento no marca nada', primera() === antes,
    `${antes} → ${primera()}`);

  // Pero el siguiente sí: la marca se descarta una vez, no queda trabada.
  filas(doc)[0].querySelector('.cell').click();
  ok('  y el toque que viene después sí marca', primera() !== antes,
    `${antes} → ${primera()}`);

  /* El tablero tiene que dejar pasar el gesto de costado y quedarse con el de
     arriba abajo, que es el que desplaza la lista. */
  const css = leer('styles.css');
  ok('el tablero deja pasar el gesto de costado',
    /\n\.board \{[\s\S]*?touch-action:\s*pan-y/.test(css),
    css.match(/\n\.board \{[\s\S]*?\n\}/)?.[0]?.replace(/\s+/g, ' ').slice(0, 90));

  /* Y la lista también, aparte: es la que DESPLAZA, así que es ella la que
     arbitra el gesto y el `pan-y` del tablero no le llega. Faltando esto, el
     deslizamiento andaba solo sobre «Cumplimiento diario» —lo único de la zona
     que queda fuera del área que se desplaza— y no sobre las filas, que es
     donde cae el pulgar. En un teléfono de verdad: jsdom no arbitra gestos, así
     que esto solo se puede leer de la hoja. */
  const lista = css.match(/\n\.dia-lista \{[\s\S]*?\n\}/)?.[0] ?? '';
  ok('  y la lista, que es la que desplaza, también',
    /touch-action:\s*pan-y/.test(lista),
    lista.replace(/\s+/g, ' ').slice(0, 110) || '(sin regla)');
  ok('  sin dejar de desplazarse a lo largo',
    /overflow-y:\s*auto/.test(lista));
}

// --- los dos deslizamientos no se pisan ------------------------------------
{
  /* En la misma pantalla hay dos, y cada uno mueve lo que se está tocando: la
     tira pasa de a siete y la lista de a uno. El del tablero contiene al del
     carrete, así que si no lo dejara afuera un dedo sobre la tira dispararía los
     dos y el día se iría OCHO.

     Es la clase de error que se ve como «a veces se pasa de más». */
  const { doc } = await montar(ESTADO_LLENO);
  const carrete = () => doc.querySelector('#carrete');
  const lista = () => doc.querySelector('#dia-lista');

  ok('arranca en hoy', centro(doc) === '2026-07-30', centro(doc));

  deslizar(doc, carrete(), -1);
  ok('deslizar la tira pasa siete días', centro(doc) === '2026-08-06', centro(doc));

  deslizar(doc, lista(), 1);
  ok('deslizar la lista pasa uno solo', centro(doc) === '2026-08-05', centro(doc));

  deslizar(doc, carrete(), 1);
  ok('  y la tira sigue pasando siete', centro(doc) === '2026-07-29', centro(doc));

  /* Y el clic que cierra el gesto de la tira no es un toque: la ficha que quedó
     debajo del dedo ya es de otra semana. */
  const antes = centro(doc);
  deslizar(doc, carrete(), -1);
  fichas(doc)[0].click();
  ok('el clic que cierra el gesto no elige un día',
    centro(doc) !== antes && centro(doc) === '2026-08-05', centro(doc));

  // Pero el toque que viene después sí elige.
  fichas(doc)[0].click();
  ok('  y el toque siguiente sí', centro(doc) === fichas(doc)[0].dataset.date
    || centro(doc) !== '2026-08-05', centro(doc));
}

// --- la tira entra deslizándose ---------------------------------------------
{
  /* Pasar de semana cambia los siete números de una vez, y sin animación no se
     veía de dónde salieron: parecía que la tira se había reescrito y no que se
     había movido. Entra por el lado hacia el que fue el dedo, así el gesto y lo
     que pasa en la pantalla son la misma cosa.

     jsdom no anima, así que lo que se mira acá es lo que la app DECIDE: qué
     clase queda puesta y con qué dirección. El movimiento en sí lo hace el CSS,
     y de eso se ocupan las comprobaciones sobre la hoja, más abajo. */
  const { doc } = await montar(ESTADO_LLENO);
  const pista = () => doc.querySelector('#carrete-pista');
  const entrada = () => [...pista().classList].filter(c => c.startsWith('entra-')).join(',');

  ok('quieta, no entra por ningún lado', entrada() === '', entrada());

  deslizar(doc, doc.querySelector('#carrete'), -1);
  ok('llevando el dedo a la izquierda, la semana que sigue entra por la derecha',
    entrada() === 'entra-der', entrada() || '(ninguna)');

  deslizar(doc, doc.querySelector('#carrete'), 1);
  ok('  y al revés, por la izquierda', entrada() === 'entra-izq', entrada() || '(ninguna)');

  /* Las teclas corren la tira UN lugar: ahí no hay nada que anunciar, se ve
     solo. Animar eso sería un aviso para algo que no pasó. */
  doc.body.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown',
    { key: 'ArrowRight', bubbles: true }));
  ok('moverse de a un día no anima nada', entrada() === '', entrada());
}

{
  /* Y el movimiento, leído de la hoja. La definición es UNA sola y la comparten
     las dos pantallas que se deslizan —la tira de días y la rejilla del
     calendario de Pendientes—: las dos ya comparten la función que detecta el
     gesto, y un movimiento distinto en cada una haría sentir la app hecha por
     dos manos. */
  const css = leer('styles.css');
  const bloque = re => css.match(re)?.[0] ?? '';

  for (const [lado, signo] of [['der', ''], ['izq', '-']]) {
    const marco = bloque(new RegExp(`@keyframes desliza-entra-${lado} \\{[\\s\\S]*?\\n\\}`));
    ok(`lo que entra por ${lado} arranca corrido`,
      marco.includes(`translateX(${signo}35%)`), marco.replace(/\s+/g, ' '));
    ok('  y termina en su lugar', /translateX\(0\)/.test(marco));
    /* La ventana en la que un movimiento se lee como movimiento. Abajo de dos
       décimas es un parpadeo —el ojo no lo sigue, así que avisa de un cambio en
       vez de mostrarlo— y arriba de medio segundo se siente pesado y estorba. */
    const regla = bloque(new RegExp(`\\n\\.entra-${lado} \\{[^}]*\\}`));
    const dura = Number(regla.match(/([\d.]+)s /)?.[1]);
    ok('  en un tiempo que se alcanza a ver y no estorba',
      dura >= .2 && dura <= .5, `${dura}s`);
  }

  /* Lo que entra se mueve adentro de su caja: sin esto, el 35% de corrimiento
     empuja el ancho de la pantalla y aparece una barra de desplazamiento
     durante la animación. Las dos cajas, no una. */
  const recorte = bloque(/\n\.carrete,\n\.pend-cal-rejilla \{[^}]*\}/);
  ok('las dos cajas recortan lo que se sale', /overflow:\s*hidden/.test(recorte),
    recorte.replace(/\s+/g, ' ') || '(sin regla)');
}

// --- «Hoy» se asoma en vez de aparecer de golpe -----------------------------
{
  /* Un botón que se materializa al lado del mes se lee como un parpadeo de la
     pantalla y no como algo que llegó. Se enciende asomándose, y solo AL
     aparecer: mientras ya está a la vista, cada dibujado lo volvería a animar
     por nada. */
  const { doc } = await montar(ESTADO_LLENO);
  const hoy = () => doc.querySelector('#btn-hoy');
  const tecla = key => doc.body.dispatchEvent(
    new doc.defaultView.KeyboardEvent('keydown', { key, bubbles: true }));

  ok('parado en hoy no está, así que no se asoma',
    hoy().hidden === true && !hoy().classList.contains('asoma'));

  tecla('ArrowRight');
  ok('al aparecer, se asoma', hoy().hidden === false && hoy().classList.contains('asoma'),
    hoy().className);

  tecla('ArrowRight');
  ok('  y estando ya a la vista, no se vuelve a animar',
    hoy().hidden === false && !hoy().classList.contains('asoma'), hoy().className);

  doc.querySelector('#btn-hoy').click();
  tecla('ArrowLeft');
  ok('  pero al volver a aparecer, sí', hoy().classList.contains('asoma'), hoy().className);

  /* Y el movimiento, leído de la hoja: viene del mismo gesto que la tira, así
     que comparten la curva y el tiempo — se acompañan en vez de competir. */
  const css = leer('styles.css');
  const marco = css.match(/@keyframes hoy-asoma \{[\s\S]*?\n\}/)?.[0] ?? '';
  ok('arranca apagado y un poco más abajo',
    /opacity:\s*0/.test(marco) && /translateY\(4px\)/.test(marco),
    marco.replace(/\s+/g, ' '));

  const suyo = css.match(/\n\.month-nav \.month-hoy\.asoma \{[^}]*\}/)?.[0] ?? '';
  const tira = css.match(/\n\.entra-der \{[^}]*\}/)?.[0] ?? '';
  const receta = txt => txt.match(/animation:\s*[\w-]+\s+(.*?);/)?.[1];
  ok('  con el mismo tiempo y la misma curva que la tira',
    Boolean(receta(suyo)) && receta(suyo) === receta(tira),
    `${receta(suyo)} vs ${receta(tira)}`);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
