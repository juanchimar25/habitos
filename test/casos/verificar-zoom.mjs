/* Zoom de la planilla en móvil: control, ciclo, persistencia y saneado.
   También la aritmética de los niveles sobre las medidas del breakpoint. */
import { montar, leer } from '../harness.mjs';
import { ESTADO_LLENO, ESTADO_VACIO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};
const guardado = w => JSON.parse(w.localStorage.getItem('tareas-diarias/v1/u-test'));

// --- 1. el control existe y arranca en «Normal» ----------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const btn = doc.querySelector('#btn-zoom');
  ok('el botón vive en la barra del mes', btn?.parentElement?.id === 'month-bar',
    btn?.parentElement?.id);

  const orden = [...doc.querySelectorAll('#month-bar > button')].map(b => b.id);
  console.log('  barra del mes:', orden.join(' · '));
  ok('está pegado al de bloquear período',
    orden.indexOf('btn-lock') - orden.indexOf('btn-zoom') === 1,
    `zoom en ${orden.indexOf('btn-zoom')}, lock en ${orden.indexOf('btn-lock')}`);
  ok('ya no está en el bloque de vistas', btn?.closest('#controls-center') === null);
  ok('arranca en Normal', doc.querySelector('#zoom-text').textContent === 'Normal',
    doc.querySelector('#zoom-text').textContent);
  ok('el <html> publica el nivel', doc.documentElement.dataset.zoom === 'normal',
    doc.documentElement.dataset.zoom);
  ok('el título dice el siguiente paso', /compacto/i.test(btn.title), btn.title);
  ok('lleva ícono SVG', Boolean(btn.querySelector('.zoom-icon')));
}

// --- 2. el ciclo recorre los tres y vuelve ---------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);
  const btn = doc.querySelector('#btn-zoom');
  const visto = [];
  for (let i = 0; i < 4; i++) {
    visto.push(doc.documentElement.dataset.zoom);
    btn.click();
  }
  console.log('  ciclo:', visto.join(' → '));
  ok('recorre normal → compacto → cómodo → normal',
    visto.join(',') === 'normal,compacto,comodo,normal');
  ok('el rótulo acompaña', doc.querySelector('#zoom-text').textContent === 'Compacto',
    doc.querySelector('#zoom-text').textContent);
  ok('queda guardado', guardado(window).zoom === 'compacto', String(guardado(window).zoom));
}

// --- 3. se recupera de lo guardado -----------------------------------------
{
  const { doc } = await montar({ ...ESTADO_LLENO, zoom: 'comodo' });
  ok('rehidrata el nivel guardado', doc.documentElement.dataset.zoom === 'comodo',
    doc.documentElement.dataset.zoom);
  ok('con su rótulo', doc.querySelector('#zoom-text').textContent === 'Cómodo');
}

// --- 4. un valor inválido cae en normal ------------------------------------
{
  const { window, doc } = await montar({ ...ESTADO_VACIO, zoom: 'gigante' });
  ok('descarta el valor inventado', doc.documentElement.dataset.zoom === 'normal',
    doc.documentElement.dataset.zoom);

  /* Cargar no reescribe el almacenamiento —eso vale para todos los campos—,
     así que el saneo se comprueba después del primer guardado. */
  doc.querySelector('#btn-zoom').click();
  ok('el primer guardado deja un valor válido',
    ['normal', 'compacto', 'comodo'].includes(guardado(window).zoom),
    String(guardado(window).zoom));
}

// --- 5. las medidas: el CSS multiplica, no reemplaza ------------------------
{
  const css = leer('styles.css');

  /* Hay más de un bloque de 640px en la hoja: hay que quedarse con el que
     declara el zoom, no con el primero que aparezca. */
  const bloques640 = [...css.matchAll(/@media \(max-width: 640px\) \{([\s\S]*?)\n\}/g)]
    .map(m => m[1]);
  const movil = bloques640.find(b => b.includes('--zoom')) ?? '';
  ok('el zoom vive en un bloque de móvil', movil !== '',
    `${bloques640.length} bloque(s) de 640px`);

  const tareaW = Number(movil.match(/--task-w:\s*calc\((\d+)px \* var\(--zoom-task\)\)/)?.[1]);
  const totalW = Number(movil.match(/--total-w:\s*calc\((\d+)px \* var\(--zoom\)\)/)?.[1]);
  const mesCelda = Number(movil.match(/view-month \{ --cell-w: calc\((\d+)px/)?.[1]);

  const niveles = Object.fromEntries(
    [...movil.matchAll(/data-zoom="(\w+)"\]\s*\{\s*--zoom:\s*([\d.]+);\s*--zoom-task:\s*([\d.]+);\s*\}/g)]
      .map(m => [m[1], { zoom: Number(m[2]), task: Number(m[3]) }]));
  niveles.normal = { zoom: 1, task: 1 };

  ok('la columna de tareas usa su propio multiplicador', tareaW === 152, String(tareaW));
  ok('las celdas de día usan --zoom', Number.isFinite(mesCelda) && Number.isFinite(totalW));
  ok('los tres niveles se leen', ['comodo', 'normal', 'compacto'].every(n => niveles[n]),
    Object.keys(niveles).join(', '));

  /* La clave del arreglo: la columna de tareas tiene que moverse MENOS que las
     celdas de día. Si se movieran igual, zoom out volvería a recortar los
     nombres, que es el problema que esto vino a resolver. */
  for (const n of ['comodo', 'compacto']) {
    const desvioTarea = Math.abs(niveles[n].task - 1);
    const desvioDia = Math.abs(niveles[n].zoom - 1);
    ok(`  ${n}: la columna de tareas se mueve menos que los días`,
      desvioTarea < desvioDia, `tareas ±${desvioTarea.toFixed(2)} vs días ±${desvioDia.toFixed(2)}`);
  }

  // Cuántos días entran en un viewport de 390px, descontando el ancho fijo.
  const ancho = 390 - 24;
  const dias = n => Math.floor(
    (ancho - tareaW * niveles[n].task - totalW * niveles[n].zoom) / (mesCelda * niveles[n].zoom));
  console.log('\n  días visibles en la vista mensual, viewport de 390px:');
  for (const n of ['comodo', 'normal', 'compacto']) {
    console.log(`    ${n.padEnd(9)}  →  ${dias(n)} días`);
  }
  ok('compacto muestra más días que normal', dias('compacto') > dias('normal'));
  ok('normal muestra más días que cómodo', dias('normal') > dias('comodo'));

  // --- el nombre ya no se corta en una sola línea --------------------------
  const reglaNombre = movil.match(/\.task-name \{([\s\S]*?)\n  \}/)?.[1] ?? '';
  ok('el nombre se parte en varias líneas', /white-space:\s*normal/.test(reglaNombre));
  ok('con tope de dos líneas', /line-clamp:\s*2/.test(reglaNombre));
  ok('y parte las palabras largas', /overflow-wrap:\s*anywhere/.test(reglaNombre));

  // El bloque de 380px tiene que seguir multiplicando, no fijar medidas.
  const angosto = css.match(/@media \(max-width: 380px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  ok('el bloque de 380px conserva los multiplicadores',
    /--task-w: calc\(\d+px \* var\(--zoom-task\)\)/.test(angosto)
    && /--total-w: calc\(\d+px \* var\(--zoom\)\)/.test(angosto),
    angosto.split('\n')[1]?.trim());

  // --- alto de fila uniforme -----------------------------------------------
  //  Lo que hace que todas las filas midan igual es que la celda de tarea use
  //  `height` y no `min-height`: con un mínimo, un nombre de dos líneas empuja
  //  su fila y la planilla queda escalonada.
  ok('la celda de tarea fija el alto', /\.task-cell \{ height: var\(--row-h\); \}/.test(movil));
  ok('y NO lo deja al contenido', !/\.task-cell \{[^}]*min-height/.test(movil));
  ok('las celdas de día se estiran hasta él',
    /\.cell \{ min-height: var\(--row-h\); \}/.test(movil));

  /** Resuelve el calc de --row-h para un zoom dado, con la raíz en 14px. */
  const filaAlto = (bloque, z) => {
    const crudo = bloque.match(/--row-h:\s*calc\(([\s\S]*?)\);/)?.[1];
    if (!crudo) return NaN;
    const expr = crudo
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/var\(--zoom\)/g, String(z))
      .replace(/([\d.]+)rem/g, (_, n) => String(Number(n) * 14));
    return Function(`"use strict";return (${expr})`)();
  };

  const alto = z => filaAlto(movil, z);
  ok('--row-h se resuelve', Number.isFinite(alto(1)), String(alto(1)));

  // `.task-name` ya no es una línea suelta: se lee de su regla completa.
  const nombre = Number(reglaNombre.match(/font-size: calc\(([\d.]+)rem \* var\(--zoom\)\)/)?.[1]);
  const frecuencia = Number(movil.match(/\.task-freq \{ font-size: calc\(([\d.]+)rem \* var\(--zoom\)\)/)?.[1]);

  ok('el nombre de la tarea escala con --zoom', nombre === 0.875, String(nombre));
  ok('y la frecuencia acompaña', frecuencia === 0.7, String(frecuencia));

  console.log('\n  medidas verticales por nivel (raíz de 14px en móvil):');
  console.log('    nivel      alto fila   nombre');
  for (const n of ['comodo', 'normal', 'compacto']) {
    const z = niveles[n].zoom;
    console.log(`    ${n.padEnd(9)}  ${alto(z).toFixed(1).padStart(6)}px`
      + `  ${(nombre * 14 * z).toFixed(1).padStart(6)}px`);
  }
  ok('compacto achica la fila', alto(niveles.compacto.zoom) < alto(1));
  ok('cómodo la agranda', alto(niveles.comodo.zoom) > alto(1));
  ok('la fila más chica sigue sobre el mínimo AA de 24px',
    alto(niveles.compacto.zoom) >= 24, `${alto(niveles.compacto.zoom).toFixed(1)}px`);

  /* El alto tiene que cubrir el peor caso —dos líneas de nombre más la
     frecuencia—; si no, el clamp cortaría texto que sí entra en la fila. */
  for (const n of ['comodo', 'normal', 'compacto']) {
    const z = niveles[n].zoom;
    const contenido = 2 * 1.22 * nombre * 14 * z + 1.45 * frecuencia * 14 * z;
    ok(`  ${n}: el alto cubre nombre de dos líneas + frecuencia`,
      alto(z) >= contenido, `${alto(z).toFixed(1)}px para ${contenido.toFixed(1)}px`);
  }

  // En ≤380px la frecuencia se oculta: el alto no debe seguir reservándole sitio.
  const alto380 = filaAlto(angosto, 1);
  ok('en 380px el alto descuenta la frecuencia oculta',
    Number.isFinite(alto380) && alto380 < alto(1),
    `${alto380.toFixed(1)}px vs ${alto(1).toFixed(1)}px`);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
