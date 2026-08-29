/* El alta de tarea tiene UN acceso: el botón redondo de la esquina inferior
   derecha, que flota sobre el contenido y está en Diario y en Pendientes.

   Los otros tres se fueron —el «+» al pie de la columna de tareas, la entrada
   del desplegable «Opciones» y el botón del estado vacío—. Que ya no estén se
   comprueba acá: si volviera alguno, habría dos botones para lo mismo en la
   misma pantalla y habría que decidir cuál usar. */
import { montar, leer } from '../harness.mjs';
import { ESTADO_LLENO, ESTADO_VACIO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

// --- 1. el botón de la esquina ---------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const fab = doc.querySelector('#btn-fab');

  ok('está en la planilla', fab.hidden === false);

  /* Flota sobre el contenido: no es hijo de ninguna sección ni de la barra del
     pie, sino del armazón. Si viviera adentro de `.app-main`, el scroll de la
     planilla se lo llevaría. */
  ok('vive en el armazón y no adentro del contenido',
    fab.parentElement?.id === 'app-root', fab.parentElement?.id);

  /* El «+» solo no dice nada: el nombre lo pone el aria-label, y el dibujo se
     esconde del árbol de accesibilidad para no leerse dos veces. */
  ok('se llama «Agregar tarea»', fab.getAttribute('aria-label') === 'Agregar tarea',
    fab.getAttribute('aria-label'));
  ok('y su ayuda trae el atajo', /atajo: N/.test(fab.title), fab.title);
  ok('el «+» es un dibujo, no un glifo', Boolean(fab.querySelector('svg.fab-icon')));
  ok('que no lee el lector de pantalla',
    fab.querySelector('svg').getAttribute('aria-hidden') === 'true');

  fab.click();
  const dialogo = doc.querySelector('#task-dialog');
  ok('abre el alta', dialogo.hasAttribute('open'));
  ok('con el título de tarea nueva',
    doc.querySelector('#task-dialog-title').textContent === 'Nueva tarea');

  /* Cerrar es cerrar: va como ✕ en la esquina y no como un botón en la fila de
     acciones, donde competía con el que sí decide algo — y en un teléfono el
     dedo que va a «Crear tarea» pasaba por encima de «Cancelar». */
  const cruz = dialogo.querySelector('.dialog-close');
  ok('tiene la ✕ para cerrar', Boolean(cruz));
  ok('que se nombra para el lector de pantalla',
    cruz.getAttribute('aria-label') === 'Cerrar', cruz.getAttribute('aria-label'));
  ok('y no es un submit disfrazado', cruz.type === 'button', cruz.type);

  const acciones = [...dialogo.querySelectorAll('.dialog-actions .btn')].map(b => b.textContent.trim());
  /* El rótulo lo pone el alta según el modo: «Crear tarea» o «Guardar cambios». */
  ok('la fila de acciones quedó con la que decide', acciones.length === 1,
    acciones.join(','));

  cruz.click();
  ok('y cierra', dialogo.hasAttribute('open') === false);
}

// --- 2. en Pendientes crea otra cosa ---------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('[data-page="todos"]').click();
  const fab = doc.querySelector('#btn-fab');

  ok('en Pendientes sigue estando', fab.hidden === false);
  ok('pero se llama «Agregar pendiente»',
    fab.getAttribute('aria-label') === 'Agregar pendiente', fab.getAttribute('aria-label'));
  /* El atajo `N` es del alta de tareas: nombrarlo acá prometería algo que no
     pasa. */
  ok('y su ayuda ya no habla del atajo de tareas', !/atajo/.test(fab.title), fab.title);

  /* Abre el alta de pendientes y no la de tareas: el botón es uno solo, y lo
     que crea es lo que la sección contiene. */
  fab.click();
  ok('no abre el alta de tareas', doc.querySelector('#task-dialog').hasAttribute('open') === false);
  ok('abre el alta de pendientes',
    doc.querySelector('#pendiente-dialog').hasAttribute('open')
      && doc.querySelector('#pendiente-dialog-title').textContent === 'Nuevo pendiente',
    doc.querySelector('#pendiente-dialog-title').textContent);
}

// --- 3. en las otras secciones no aparece ----------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  for (const page of ['indicators', 'settings', 'help']) {
    doc.querySelector(`[data-page="${page}"]`).click();
    ok(`  en ${page} no está`, doc.querySelector('#btn-fab').hidden === true);
  }

  // Y vuelve al volver.
  doc.querySelector('[data-page="home"]').click();
  ok('vuelve en la planilla', doc.querySelector('#btn-fab').hidden === false);
}

// --- 4. los accesos que se fueron -----------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);

  ok('el alta no está en ningún menú', doc.querySelector('#btn-add-task') === null);

  const acciones = [...doc.querySelectorAll('#grupo-tareas .drawer-item')].map(b => b.id);
  console.log('  cajón · Tareas:', acciones.join(' · '));
  /* El apartado arranca por el archivo y sigue por lo que opera sobre varias
     tareas; las plantillas van al final. Las tres posturas viven adentro de
     «Selección masiva», que va plegada. */
  ok('el apartado «Tareas» del cajón, en orden',
    acciones.join(' ')
      === 'btn-archived btn-masiva btn-mode-delete btn-mode-archive btn-mode-reorder'
        + ' btn-templates btn-save-template btn-trash',
    acciones.join(' '));
  ok('  con las tres posturas adentro del grupo plegable',
    ['btn-mode-delete', 'btn-mode-archive', 'btn-mode-reorder']
      .every(id => doc.querySelector(`#grupo-masiva > #${id}`)));
  ok('  y el grupo arranca plegado', doc.querySelector('#grupo-masiva').open === false);

  /* El «+» del pie se fue con la planilla entera: no hay tabla donde ponerlo.
     El cumplimiento del día, que era la fila del pie, es ahora el renglón que
     cierra la lista. */
  ok('la planilla ya no existe', doc.querySelector('#grid') === null);
  ok('ni su «+» del pie', doc.querySelector('.add-task-btn') === null);

  const resumen = doc.querySelector('#dia-resumen');
  ok('el cumplimiento diario encabeza la lista',
    /Cumplimiento diario/.test(resumen.textContent),
    resumen.textContent.replace(/\s+/g, ' ').trim());
  ok('con su porcentaje', /%|—/.test(doc.querySelector('#dia-resumen-valor').textContent),
    doc.querySelector('#dia-resumen-valor').textContent);

  // La lista son solo tareas: el alta no agrega ninguna fila de más.
  const filas = [...doc.querySelectorAll('#dia-lista .dia-fila')];
  ok('la lista son solo las tareas',
    filas.length === doc.querySelectorAll('#dia-lista li').length,
    `${filas.length} de ${doc.querySelectorAll('#dia-lista li').length}`);
}

// --- 5. el estado vacío señala al botón, no lo repite ----------------------
{
  const { doc } = await montar(ESTADO_VACIO);
  ok('sin tareas no se dibuja la lista',
    doc.querySelector('#dia').hidden === true);

  const vacio = doc.querySelector('#empty');
  ok('se ve el aviso de que no hay tareas', vacio.hidden === false);

  /* Sin botón propio: tener dos botones para lo mismo en la misma pantalla
     obliga a decidir cuál usar, y el de la esquina ya está a la vista. */
  ok('y no trae un segundo botón de alta',
    vacio.querySelector('button') === null);
  ok('sino que manda al de la esquina', /Tocá \+ para añadir/.test(vacio.textContent),
    vacio.textContent.replace(/\s+/g, ' ').trim());

  // Que es el que sigue estando, justamente cuando no hay ninguna tarea.
  const fab = doc.querySelector('#btn-fab');
  ok('el botón de la esquina está', fab.hidden === false);
  fab.click();
  ok('y abre el alta', doc.querySelector('#task-dialog').hasAttribute('open'));
}

// --- 6. dónde cae en la pantalla ------------------------------------------
{
  /* jsdom no apila ni mide, así que esto se lee de la hoja. */
  const css = leer('styles.css');
  const bloque = re => css.match(re)?.[0] ?? '';
  const z = regla => Number(regla.match(/z-index:\s*(\d+)/)?.[1]);

  const fab = bloque(/\n\.fab \{[\s\S]*?\n\}/);
  ok('flota contra la ventana', /position:\s*fixed/.test(fab));
  ok('en la esquina inferior derecha', /right:/.test(fab) && /bottom:/.test(fab));

  /* Se ancla contra la barra del pie con la MISMA medida que ella, no con un
     número copiado: si la barra cambia de alto, el botón la sigue. */
  ok('apoyado sobre la barra del pie',
    /bottom:\s*calc\([^;]*var\(--tabbar-h\)/.test(fab), fab.match(/bottom:[^;]*;/)?.[0]);
  ok('y respetando el área segura del teléfono',
    /bottom:\s*calc\([^;]*env\(safe-area-inset-bottom/.test(fab));

  const velo = bloque(/\n\.drawer-backdrop \{[\s\S]*?\n\}/);
  const barra = bloque(/\n\.tabbar \{[\s\S]*?\n\}/);
  console.log(`  z-index → barra ${z(barra)} · botón ${z(fab)} · velo ${z(velo)}`);
  ok('por encima de la barra del pie', z(fab) > z(barra));
  ok('y por debajo del velo del menú, que también lo atenúa', z(fab) < z(velo));

  /* La referencia de la derecha termina antes de la esquina: sin ese hueco el
     botón le caía encima al texto. */
  const leyenda = bloque(/\n\.legend \{[^}]*\}/);
  ok('la leyenda le deja libre la esquina',
    /padding-right:\s*calc\([^;]*var\(--fab-size\)/.test(leyenda),
    leyenda.match(/padding-right:[^;]*;/)?.[0] ?? '(sin reserva)');

  /* Y la lista le deja libre el fondo: sin ese hueco, la última fila queda
     debajo del botón, y justo ahí está su recuadro de estado. */
  const lista = bloque(/\n\.dia-lista \{[\s\S]*?\n\}/);
  ok('la lista le deja libre el fondo',
    /padding:[^;]*var\(--fab-size\)/.test(lista),
    lista.match(/padding:[^;]*;/)?.[0] ?? '(sin reserva)');

  const aviso = bloque(/\n\.toast \{[\s\S]*?\n\}/);
  ok('y el aviso flotante le pasa por encima',
    /bottom:\s*calc\([^;]*var\(--fab-size\)/.test(aviso), aviso.match(/bottom:[^;]*;/)?.[0]);

  /* En el teléfono la leyenda es una sola fila, así que la reserva de la
     esquina tiene que estar también ahí: es donde el botón cae justo sobre la
     última referencia. Y tiene que cubrir el diámetro MÁS su separación del
     borde, o el rótulo pasa por debajo del círculo. */
  const movil = [...css.matchAll(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/g)]
    .map(m => m[1]).find(b => b.includes('.legend')) ?? '';
  const leyendaMovil = movil.match(/\.legend \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  ok('en móvil la leyenda va en una sola fila',
    /flex-wrap:\s*nowrap/.test(leyendaMovil), leyendaMovil.match(/flex-wrap:[^;]*;/)?.[0]);
  ok('y ahí también le hace lugar al botón',
    /padding-right:\s*calc\([^;]*var\(--fab-size\)/.test(leyendaMovil),
    leyendaMovil.match(/padding-right:[^;]*;/)?.[0] ?? '(sin reserva)');

  const impresion = bloque(/@media print \{[\s\S]*?\n\}\n/);
  ok('en papel no se imprime', /\.fab/.test(impresion));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
