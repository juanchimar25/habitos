/* El carrete de días y la lista del día elegido, que reemplazaron a la planilla
   de doble entrada y a sus tres vistas.

   Arnés: hoy = jueves 30/07/2026, que es el día en el que abre. */
import { montar, verDia, leer } from '../harness.mjs';
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

// --- 3. las flechas pasan de página ---------------------------------------
{
  /* Arnés parado en el 30/07: la tira va del 27/07 al 02/08. Una flecha muestra
     los SIETE siguientes —del 03 al 09—, no el día de al lado. Como el salto es
     de siete, el día de la semana no cambia: el centro sigue cayendo en jueves,
     y la tira se lee como la página que sigue de la misma grilla. */
  const { doc } = await montar(ESTADO_LLENO);

  doc.querySelector('#next-range').click();
  ok('adelante, una vuelta entera', centro(doc) === '2026-08-06', centro(doc));
  ok('  cruzando de mes', /agosto 2026/i.test(mes(doc)), mes(doc));
  ok('  y sin cambiar de día de la semana',
    fichas(doc).find(f => f.classList.contains('is-centro'))
      ?.querySelector('.carrete-dow').textContent.toLowerCase().startsWith('jue'));

  doc.querySelector('#prev-range').click();
  ok('para atrás también', centro(doc) === '2026-07-30', centro(doc));
  ok('  y vuelve el mes', /julio 2026/i.test(mes(doc)), mes(doc));

  /* La tira que se ve después de tocar es, exactamente, la que seguía. */
  const antes = fichas(doc).map(f => f.dataset.date);
  doc.querySelector('#next-range').click();
  const despues = fichas(doc).map(f => f.dataset.date);
  ok('la tira nueva empieza donde terminaba la anterior',
    despues[0] === '2026-08-03' && antes[antes.length - 1] === '2026-08-02',
    `${antes[antes.length - 1]} → ${despues[0]}`);
  ok('  sin repetir ningún día', despues.every(d => !antes.includes(d)),
    despues.join(' '));

  ok('se nombran por lo que hacen',
    doc.querySelector('#prev-range').title === 'Ver los 7 días anteriores'
    && doc.querySelector('#next-range').title === 'Ver los 7 días siguientes',
    doc.querySelector('#next-range').title);
}
{
  /* Las teclas ← → hacen lo mismo que las flechas. */
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

  doc.querySelector('#next-range').click();
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
  doc.querySelector('#next-range').click();
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

  ok('el carrete reparte nueve columnas iguales',
    /grid-template-columns:\s*repeat\(9,\s*1fr\)/.test(carrete),
    carrete.replace(/\s+/g, ' ').trim());
  ok('  y la pista se lleva siete', /grid-column:\s*span 7/.test(pista));

  const gap = txt => txt.match(/[^-]gap:\s*([^;]+);/)?.[1]?.trim();
  ok('  las dos rejillas comparten la separación',
    Boolean(gap(carrete)) && gap(carrete) === gap(pista),
    `${gap(carrete)} vs ${gap(pista)}`);

  /* Y las flechas se despegan de `.btn`, que les daba ancho fijo y alto propio:
     con eso puesto, la rejilla las estiraba pero el ancho seguía siendo 34px. */
  const flechas = bloque(/\n#prev-range,\n#next-range \{[^}]*\}/);
  for (const [nombre, prop] of [['el ancho fijo', /width:\s*auto/],
    ['el alto propio', /height:\s*auto/]]) {
    ok(`  sueltan ${nombre} que traían de .btn`, prop.test(flechas),
      flechas.replace(/\s+/g, ' ').trim());
  }
  ok('  y se pintan como una ficha', /background:\s*var\(--bg-elev\)/.test(flechas));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
