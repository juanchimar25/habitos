/* Cómo se cierran los diálogos.

   Los cinco que solo se abren y se cierran —alta y edición de tarea, el
   calendario, el recordatorio, guardar plantilla y la lista de plantillas—
   llevan una ✕ arriba a la derecha en vez de un «Cancelar» en la fila de
   acciones: cerrar no es una decisión, y ahí competía con el botón que sí
   decide algo. La confirmación es el caso aparte, y por eso conserva su par
   Cancelar / Aceptar.

   Los seis se cierran además tocando afuera y con `Esc`.

   Arnés: hoy = jueves 30/07/2026. */
import { montar, leer } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

/** Cada diálogo con lo que lo abre. */
const DIALOGOS = [
  { id: 'task-dialog', nombre: 'Nueva tarea', abrir: doc => doc.querySelector('#btn-fab').click() },
  { id: 'jump-dialog', nombre: 'Seleccionar mes', abrir: doc => doc.querySelector('#month-label').click() },
  { id: 'reminder-dialog', nombre: 'Recordatorio diario', abrir: doc => doc.querySelector('#btn-reminder').click() },
  { id: 'templates-dialog', nombre: 'Plantillas', abrir: doc => doc.querySelector('#btn-templates').click() },
  { id: 'save-template-dialog', nombre: 'Guardar como plantilla', abrir: doc => doc.querySelector('#btn-save-template').click() },
];

// --- 1. todos tienen su ✕ y ninguno «Cancelar» -----------------------------
{
  const { doc } = await montar(ESTADO_LLENO);

  for (const d of DIALOGOS) {
    const dlg = doc.querySelector(`#${d.id}`);
    const cruz = dlg.querySelector('.dialog-close');

    ok(`  ${d.nombre}: tiene la ✕`, Boolean(cruz));
    ok('    se nombra para el lector de pantalla',
      cruz?.getAttribute('aria-label') === 'Cerrar', cruz?.getAttribute('aria-label'));
    /* Dentro de un <form>, un botón sin `type` envía: cerrar guardaría. */
    ok('    y no envía el formulario', cruz?.type === 'button', cruz?.type);

    const rotulos = [...dlg.querySelectorAll('.dialog-actions .btn')]
      .map(b => b.textContent.trim());
    ok('    sin «Cancelar» en las acciones', !rotulos.includes('Cancelar'), rotulos.join(',') || '(vacía)');
  }
}

// --- 2. la ✕ cierra ---------------------------------------------------------
{
  for (const d of DIALOGOS) {
    const { doc } = await montar(ESTADO_LLENO);
    const dlg = doc.querySelector(`#${d.id}`);

    d.abrir(doc);
    ok(`  ${d.nombre}: abre`, dlg.hasAttribute('open'));

    dlg.querySelector('.dialog-close').click();
    ok('    y la ✕ lo cierra', dlg.hasAttribute('open') === false);
  }
}

// --- 3. tocar afuera cierra -------------------------------------------------
{
  /* El velo de un <dialog> no es un elemento aparte: es el fondo del diálogo
     mismo, así que un clic ahí llega con `target` en el propio <dialog>. Un
     clic adentro cae siempre en algún hijo. */
  for (const d of DIALOGOS) {
    const { doc } = await montar(ESTADO_LLENO);
    const dlg = doc.querySelector(`#${d.id}`);

    d.abrir(doc);
    dlg.querySelector('.dialog-form').click();
    ok(`  ${d.nombre}: un clic adentro NO cierra`, dlg.hasAttribute('open'));

    dlg.click();
    ok('    y uno afuera sí', dlg.hasAttribute('open') === false);
  }
}

// --- 4. la confirmación es el caso aparte ----------------------------------
{
  /* Ahí las dos salidas son decisiones —hacerlo o no—, así que las dos son
     botones con su rótulo. Tocar afuera equivale a cancelar, que es la salida
     que no rompe nada. */
  const { doc } = await montar(ESTADO_LLENO);
  const dlg = doc.querySelector('#confirm-dialog');

  /* Se llega desde el lápiz de una fila: «Editar tarea» → «Eliminar» → desde
     cuándo → confirmación. */
  doc.querySelectorAll('#dia-lista [data-action="edit"]')[0].click();
  doc.querySelector('#task-delete').click();
  doc.querySelector('#delete-form input[value="inicio"]').click();
  doc.querySelector('#delete-form').dispatchEvent(
    new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

  ok('la confirmación abre', dlg.hasAttribute('open'));
  ok('y conserva su «Cancelar»',
    [...dlg.querySelectorAll('.dialog-actions .btn')].some(b => /Cancelar/.test(b.textContent)));

  const antes = doc.querySelectorAll('#dia-lista .dia-fila').length;
  dlg.click();
  ok('tocar afuera la cierra', dlg.hasAttribute('open') === false);
  ok('sin aplicar nada', doc.querySelectorAll('#dia-lista .dia-fila').length === antes,
    `${antes} → ${doc.querySelectorAll('#dia-lista .dia-fila').length}`);
}

// --- 5. la estética es la de Plantillas ----------------------------------
{
  /* Los formularios se ven como el diálogo de Plantillas: neutro todo, salvo el
     botón que remata, que va con el relleno de la marca. No es un color propio
     de los diálogos —eso hubo un rato y era un color más para aprender—: es la
     misma clase que usan el «Agregar» de cada plantilla y el «Entrar» de la
     puerta de sesión. */
  const { doc } = await montar(ESTADO_LLENO);

  const remata = {
    'Nueva tarea': '#task-submit',
    'Recordatorio diario': '#reminder-save',
    'Guardar como plantilla': '#save-template-form button[type="submit"]',
  };

  for (const [nombre, sel] of Object.entries(remata)) {
    const btn = doc.querySelector(sel);
    ok(`  ${nombre}: el botón que remata lleva el relleno de la marca`,
      btn?.classList.contains('btn-brand'), btn?.className);
  }

  // Las fichas se dibujan al abrir el diálogo, no antes.
  doc.querySelector('#btn-templates').click();
  const agregar = doc.querySelector('#templates-list .tpl-add');
  ok('el mismo relleno que el «Agregar» de una plantilla',
    agregar?.classList.contains('btn-brand'), agregar?.className);

  /* Y nada quedó pintado con el color propio que tuvieron un rato. */
  const css = leer('styles.css');
  ok('sin restos del color que se probó y se descartó',
    !css.includes('--accion') && !css.includes('.btn-primary'));

  /* Lo que se completa adentro va del mismo color que el botón: un formulario
     es una sola acción. */
  const bloque = re => css.match(re)?.[0] ?? '';
  for (const [nombre, re] of [
    ['los radios de frecuencia', /\n\.radio input \{[^}]*\}/],
    ['la casilla del recordatorio', /\n\.field-check input \{[^}]*\}/],
    ['los días fijos', /\n\.wd:has\(input:checked\) \{[^}]*\}/],
    ['el foco de los campos',
      /\n\.field input:focus,\n\.field textarea:focus \{[^}]*\}/],
  ]) {
    ok(`  ${nombre} van del color de la marca`,
      /var\(--brand-text\)/.test(bloque(re)),
      bloque(re).replace(/\s+/g, ' ').trim() || '(sin regla)');
  }

  /* Y los campos se ven todos iguales. La lista de tipos se enumera a mano
     —`.field input` alcanzaría a los radios y las casillas—, así que un tipo
     que falte queda con el recuadro nativo del navegador: le pasó a la hora
     del recordatorio, el único formulario que la usa. */
  const desde = css.indexOf('.field input[type="text"]');
  const campos = css.slice(desde, css.indexOf('{', desde));
  for (const tipo of ['text', 'date', 'time', 'number']) {
    ok(`  el campo de tipo ${tipo} lleva el estilo de la app`,
      campos.includes(`[type="${tipo}"]`), campos.split('\n').join(' ').trim());
  }

  /* Las seis frecuencias van centradas en el cuadro. Con columnas de `1fr` se
     repartían todo el ancho del diálogo y, como los rótulos son cortos, cada
     una quedaba con un hueco a la derecha: el grupo se apoyaba en el borde
     izquierdo aunque la rejilla dijera que ocupaba todo. */
  const rejilla = bloque(/\n\.radio-grid \{[^}]*\}/);
  ok('las frecuencias se centran en el cuadro',
    /justify-content:\s*center/.test(rejilla), rejilla.replace(/\s+/g, ' ').trim());
  ok('  con columnas que miden por contenido',
    /grid-template-columns:\s*auto auto/.test(rejilla));
  ok('  y en pantalla angosta, la única columna también',
    /\.radio-grid \{ grid-template-columns: auto; \}/.test(css));

  /* La casilla y su rótulo van en fila. `.field-check` pide `row` pero comparte
     especificidad con `.field`, que pide `column`: si queda antes en la hoja,
     pierde y los apila. */
  ok('y la casilla no se apila sobre su rótulo',
    css.indexOf('.field-check {') > css.indexOf('.field {'),
    `.field-check en ${css.indexOf('.field-check {')}, .field en ${css.indexOf('.field {')}`);
}

// --- el campo de comentarios, el único de varios renglones -----------------
{
  /* Un `textarea` no entra en `.field input[type=…]`: ese bloque enumera tipos
     a propósito, para no pintar los radios ni las casillas. Sin regla propia,
     el único campo multilínea de la app se quedaba con el recuadro nativo del
     navegador adentro de un diálogo donde todo lo demás está pintado. */
  const css = leer('styles.css');
  const area = css.match(/\n\.field textarea \{[^}]*\}/)?.[0] ?? '';
  ok('el textarea tiene su propia regla', Boolean(area), '(sin regla)');

  /* Vacío tiene que ser EL MISMO recuadro que el del nombre de una tarea sin
     nombre. No «parecido»: las mismas declaraciones, una por una. */
  const linea = css.match(/\n\.field input\[type="text"\],[\s\S]*?\n\}/)?.[0] ?? '';
  const declaracion = (bloque, prop) =>
    bloque.match(new RegExp('\\n\\s*' + prop + ':\\s*([^;]+);'))?.[1]?.trim();
  for (const prop of ['font', 'padding', 'border', 'border-radius', 'background', 'color', 'width']) {
    ok(`  ${prop} es el mismo que el de un campo de una línea`,
      Boolean(declaracion(linea, prop)) && declaracion(area, prop) === declaracion(linea, prop),
      `${declaracion(area, prop)} vs ${declaracion(linea, prop)}`);
  }

  /* Arranca midiendo el DOBLE que un campo de una línea. El `calc` tiene que
     decirlo con esas palabras —la altura de uno, por dos— y no con un número
     suelto de píxeles: así sigue siendo el doble exacto si cambia el cuerpo de
     la letra o el relleno de los campos. */
  const piso = area.match(/min-height:\s*([^;]+);/)?.[1] ?? '';
  ok('  arranca con una altura mínima', Boolean(piso), '(sin min-height)');
  ok('  que es dos veces algo, no un número suelto', /^calc\(\s*2\s*\*/.test(piso), piso);

  /* Y ese «algo» es la altura de un campo de una línea, armada con las mismas
     piezas que la declara: el relleno de arriba y abajo, los dos bordes y un
     interlineado del cuerpo. */
  const relleno = declaracion(linea, 'padding')?.split(/\s+/)[0] ?? '';
  const interlineado = css.match(/\nbody \{[^}]*line-height:\s*([^;]+);/)?.[1]?.trim();
  const doble = n => `${Number(n.replace('rem', '')) * 2}rem`;
  ok('  con el relleno de arriba y abajo de los demás campos',
    Boolean(relleno) && piso.includes(doble(relleno)),
    `${piso} · padding: ${relleno}`);
  ok('  los dos bordes', piso.includes('2px'), piso);
  ok('  y el interlineado del cuerpo',
    Boolean(interlineado) && piso.includes(`${interlineado}em`),
    `${piso} · body: ${interlineado}`);
  ok('  ni lleva agarradera: se acomoda solo', /resize:\s*none/.test(area),
    area.replace(/\s+/g, ' ').trim());
  ok('  con techo, para no empujar el botón de guardar fuera de la pantalla',
    /max-height/.test(area), area.replace(/\s+/g, ' ').trim());

  const { doc } = await montar(ESTADO_LLENO);
  const campo = doc.querySelector('#pendiente-comentario');
  ok('el campo está en el diálogo de la tarea pendiente', Boolean(campo));
  /* El `rows` es lo que mide el campo hasta que el CSS carga, así que dice más
     o menos lo mismo: en una caja del doble de alto entran casi tres líneas,
     porque el relleno y los bordes no se duplican con el texto. */
  ok('  y el atributo dice más o menos lo mismo', campo?.getAttribute('rows') === '3',
    campo?.getAttribute('rows'));
  ok('  con el tope de 200 en el atributo', campo?.getAttribute('maxlength') === '200',
    campo?.getAttribute('maxlength'));
  ok('  y es opcional', !campo?.hasAttribute('required'));
}

// --- los tres estados, en una fila -----------------------------------------
{
  /* Una regla que corrige a otra de la MISMA especificidad tiene que ir
     después: si no, no hace nada y no lo dice. `.radio-tres` pedía tres
     columnas cien líneas antes de que `.radio-grid` volviera a pedir dos, así
     que los tres estados caían en dos filas —dos arriba y uno solo abajo— y la
     clase parecía estar aplicada.

     Esto mira el orden del archivo, que es lo único que decide acá. */
  const css = leer('styles.css');
  const donde = re => css.search(re);
  const grid = donde(/\n\.radio-grid \{/);
  const tres = donde(/\n\.radio-tres \{/);

  ok('las dos reglas existen', grid > 0 && tres > 0, `${grid} · ${tres}`);
  ok('  y la de los tres va DESPUÉS de la de dos columnas', tres > grid,
    `.radio-grid en ${grid}, .radio-tres en ${tres}`);
  ok('  pidiendo tres columnas',
    /\n\.radio-tres \{[^}]*repeat\(3, auto\)/.test(css),
    css.match(/\n\.radio-tres \{[^}]*\}/)?.[0]?.replace(/\s+/g, ' '));

  /* Y en el teléfono más angosto se apilan igual: tres en línea no entran, y
     esa regla vive en la consulta de 380px, que va al final del archivo. */
  const angosto = css.search(/@media \(max-width: 380px\)/);
  ok('  salvo por debajo de 380px, donde vuelven a apilarse', angosto > tres,
    `.radio-tres en ${tres}, la consulta en ${angosto}`);

  const { doc } = await montar(ESTADO_LLENO);
  const grupo = doc.querySelector('#pendiente-form .radio-grid');
  ok('el grupo del estado lleva la clase', grupo?.classList.contains('radio-tres'),
    grupo?.className);
  /* El orden es el del avance, que es el mismo que cicla el botón de la fila:
     leerlos en otro orden en el formulario obligaría a traducir. */
  const etiquetas = [...doc.querySelectorAll('#pendiente-form .radio span')]
    .map(e => e.textContent);
  ok('  y los tres van en el orden del avance',
    etiquetas.join(' → ') === 'Sin iniciar → En proceso → Finalizada',
    etiquetas.join(' → '));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
