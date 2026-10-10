/* Una cuenta recién creada: el único estado que NUNCA pasó por `normalize`.
   ---------------------------------------------------------------------------
   Cuando la base no tiene nada para este usuario y este navegador tampoco,
   `hydrateStateForUser` deja lo que devuelve `estadoVacio()` y listo. Si a ese
   objeto le falta una clave que el resto del código lee sin red, no se ve un
   dato faltante: se ve un botón que no hace nada, porque el `TypeError` muere
   adentro del listener y nadie lo reporta.

   Así estuvo: `estadoVacio()` no traía `templates` ni `removedTemplates`, y
   `plantillasVisibles()` hace `state.templates.map(...)`. En una cuenta nueva,
   «Plantillas» no abría y crear la primera tarea cortaba el dibujado de
   «Opciones del mes» por la mitad.

   Hoy es jueves 30 de julio de 2026 (reloj del arnés). */
import { montar } from '../harness.mjs';
import { ESTADO_VACIO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const CLAVE = 'tareas-diarias/v1/u-test';
const guardado = w => JSON.parse(w.localStorage.getItem(CLAVE) ?? 'null');
const enviar = (doc, form) => doc.querySelector(form)
  .dispatchEvent(new doc.defaultView.Event('submit', { bubbles: true, cancelable: true }));

/** Crea una tarea diaria por el «+», que es por donde la crea cualquiera. */
const crearTarea = (doc, nombre) => {
  doc.querySelector('#btn-fab').click();
  doc.querySelector('#task-name').value = nombre;
  enviar(doc, '#task-form');
};

// --- 1. la app arranca, y arranca vacía -------------------------------------
{
  const { doc, window } = await montar(undefined, { sinDatos: true });

  ok('no quedó nada guardado de arranque', guardado(window) === null);
  ok('la app dibujó el día', Boolean(doc.querySelector('#dia-lista')));
  ok('sin tareas', doc.querySelectorAll('#dia-lista .dia-fila').length === 0,
    String(doc.querySelectorAll('#dia-lista .dia-fila').length));

  /* Las categorías de arranque solo se siembran cuando la base contestó
     «vacío». Acá no contestó —no hay cliente—, así que se queda en modo local
     sin escribir, para no pisar lo que pueda haber del otro lado. */
  ok('Pendientes también dibuja', Boolean(doc.querySelector('#todos')));
}

// --- 2. «Plantillas» abre, que es lo que estaba roto ------------------------
{
  const { doc } = await montar(undefined, { sinDatos: true });

  doc.querySelector('#btn-templates').click();
  const dlg = doc.querySelector('#templates-dialog');
  ok('el diálogo de plantillas abre', dlg.hasAttribute('open'));

  const fichas = [...doc.querySelectorAll('#templates-list .tpl')];
  ok('y lista las de fábrica', fichas.length === 4, `${fichas.length} fichas`);
  ok('todas con su botón de agregar',
    fichas.every(f => Boolean(f.querySelector('.tpl-add'))));
  ok('ninguna sale apagada: la fecha arranca en hoy',
    [...doc.querySelectorAll('.tpl-add')].every(b => b.disabled === false));
}

// --- 3. borrar una de fábrica: `removedTemplates` existe y se persiste ------
{
  const { doc, window } = await montar(undefined, { sinDatos: true });

  doc.querySelector('#btn-templates').click();

  /* Con cuidado y no a lo bruto: si la lista quedó vacía —que es exactamente
     lo que pasaba— esto tiene que REPORTAR la falla, no cortar el archivo y
     dejar sin correr las comprobaciones de abajo, que son las otras dos
     claves. */
  const nombre = doc.querySelector('#templates-list .tpl-name')?.textContent ?? '(ninguna)';
  ok('hay una plantilla para borrar', nombre !== '(ninguna)', nombre);

  doc.querySelector('#templates-list .tpl-del')?.click();
  ok('pide confirmación', doc.querySelector('#confirm-dialog').hasAttribute('open'));
  doc.querySelector('#confirm-ok').click();

  const quedan = doc.querySelectorAll('#templates-list .tpl').length;
  ok('la plantilla sale de la lista', quedan === 3, `${quedan} fichas`);
  ok('el diálogo sigue abierto',
    doc.querySelector('#templates-dialog').hasAttribute('open'));
  ok('y quedó anotada en removedTemplates',
    guardado(window)?.removedTemplates?.length === 1,
    JSON.stringify(guardado(window)?.removedTemplates ?? null));
  /* Las que quedan, nombradas: pedir solamente que la borrada NO esté daría por
     buena una lista vacía, que es el síntoma del bug. */
  const restantes = [...doc.querySelectorAll('#templates-list .tpl-name')]
    .map(n => n.textContent);
  ok(`quedaron las otras tres, sin «${nombre}»`,
    restantes.length === 3 && !restantes.includes(nombre), restantes.join(' · '));
}

// --- 4. la primera tarea no corta el dibujado de «Opciones del mes» ---------
//  `motivoSinGuardar()` se llama en cada render. Sin tareas corta antes y no
//  llegaba a `plantillasVisibles()`; con una tarea sí, y ahí reventaba — justo
//  en el render, no en un clic, así que se llevaba puesto el resto del bloque.
{
  const { doc, window } = await montar(undefined, { sinDatos: true });

  crearTarea(doc, 'Leer');

  const filas = doc.querySelectorAll('#dia-lista .dia-fila');
  ok('la tarea quedó creada', filas.length === 1, `${filas.length} filas`);
  ok('y se guardó', Object.keys(guardado(window)?.months ?? {}).length === 1,
    'meses: ' + Object.keys(guardado(window)?.months ?? {}).join(', '));

  /* La prueba de que el render terminó: este botón se habilita en la última
     línea del bloque, después de la llamada que lanzaba. */
  const btn = doc.querySelector('#btn-save-template');
  ok('«Guardar como plantilla» quedó habilitado', btn.disabled === false);
  ok('con el título que nombra el día', /como plantilla/.test(btn.title), btn.title);

  // Y la papelera, que se dibuja en el mismo bloque, sigue contestando.
  ok('el bloque entero se dibujó',
    doc.querySelector('#btn-trash').disabled === true);
}

// --- 5. guardar el mes como plantilla: `templates` existe -------------------
{
  const { doc, window } = await montar(undefined, { sinDatos: true });

  crearTarea(doc, 'Correr');
  doc.querySelector('#btn-save-template').click();
  ok('abre el diálogo de guardar', doc.querySelector('#save-template-dialog').hasAttribute('open'));

  doc.querySelector('#save-template-name').value = 'Mi rutina';
  enviar(doc, '#save-template-form');

  const propias = guardado(window)?.templates ?? [];
  ok('la plantilla propia se guardó', propias.length === 1,
    JSON.stringify(propias.map(t => t.name)));
  ok('con el nombre que se puso', propias[0]?.name === 'Mi rutina', propias[0]?.name);
  ok('y con la tarea del día', propias[0]?.tasks?.length === 1,
    JSON.stringify(propias[0]?.tasks?.map(t => t.name)));

  doc.querySelector('#btn-templates').click();
  const fichas = doc.querySelectorAll('#templates-list .tpl').length;
  ok('ahora son cinco: las cuatro de fábrica más la propia', fichas === 5, `${fichas} fichas`);
}

// --- 6. la invariante: las mismas claves que un estado saneado --------------
//  Es la regla que el bug rompía. Comparar contra `normalize` y no contra una
//  lista escrita a mano: así una clave nueva del estado no necesita que nadie
//  se acuerde de venir a agregarla acá.
{
  const nueva = await montar(undefined, { sinDatos: true });
  crearTarea(nueva.doc, 'Leer');

  const saneada = await montar(ESTADO_VACIO);
  crearTarea(saneada.doc, 'Leer');

  const claves = w => Object.keys(guardado(w) ?? {}).sort();
  const deNueva = claves(nueva.window);
  const deSaneada = claves(saneada.window);

  console.log(`\n=== claves del estado ===\n  ${deNueva.join(', ')}`);

  ok('la cuenta nueva guarda las mismas claves que un estado saneado',
    deNueva.join(',') === deSaneada.join(','),
    `nueva: [${deNueva.join(', ')}] · saneada: [${deSaneada.join(', ')}]`);

  for (const clave of ['months', 'status', 'trash', 'templates',
    'removedTemplates', 'pendientes', 'recordatorioOfrecido', 'theme']) {
    ok(`  está «${clave}»`, deNueva.includes(clave));
  }
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
