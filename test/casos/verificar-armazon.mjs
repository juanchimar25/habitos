/* El armazón de alto fijo: el encabezado arriba, la barra de secciones abajo y
   lo que desplaza en el medio. No cambió con el carrete, pero es lo que se
   rompe cuando alguien toca alturas o apilado, así que se sigue mirando.

   El plegado de los controles se fue con la planilla: la fila que plegaba —el
   selector de vista y sus flechas— ya no existe, y las flechas que quedan viven
   en el carrete, que es lo único que hay para moverse. */
import { leer, montar } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

// --- el armazón de alto fijo ----------------------------------------------
{
  const css = leer('styles.css');
  const bloque = re => css.match(re)?.[0] ?? '';
  const z = regla => Number(regla.match(/z-index:\s*(\d+)/)?.[1]);

  const cuerpo = bloque(/\nbody \{[\s\S]*?\n\}/);
  ok('la app ocupa la ventana y no desplaza',
    /overflow:\s*hidden/.test(cuerpo) && /height:\s*100dvh/.test(cuerpo));
  ok('con reserva en `vh` para quien no entienda `dvh`',
    /height:\s*100vh/.test(cuerpo));

  /* `min-height: 0` es lo que permite que un hijo con scroll se achique. Sin
     eso los hijos flex no bajan de su alto natural y el desborde reaparece. */
  for (const [nombre, re] of [['.app-main', /\n\.app-main \{[\s\S]*?\n\}/],
    ['.board', /\n\.board \{[\s\S]*?\n\}/], ['.dia', /\n\.dia \{[\s\S]*?\n\}/],
    ['.dia-lista', /\n\.dia-lista \{[\s\S]*?\n\}/]]) {
    ok(`  ${nombre} puede achicarse`, /min-height:\s*0/.test(bloque(re)));
  }

  /* La que desplaza es la lista del día. El carrete y el pie quedan fuera de
     ella, así que ni la tira de días ni el cumplimiento se van de la pantalla
     al recorrer una lista larga. */
  const lista = bloque(/\n\.dia-lista \{[\s\S]*?\n\}/);
  ok('la lista del día es la que desplaza', /overflow-y:\s*auto/.test(lista));

  const carrete = bloque(/\n\.carrete \{[\s\S]*?\n\}/);
  const resumen = bloque(/\n\.dia-resumen \{[\s\S]*?\n\}/);
  ok('el carrete no desplaza con ella', /flex:\s*none/.test(carrete));
  ok('ni el resumen del día', /flex:\s*none/.test(resumen));

  /* En papel el armazón sobra: la lista tiene que ocupar las hojas que haga
     falta en vez de recortarse a lo que entraba en una ventana. */
  const impresion = bloque(/@media print \{[\s\S]*?\n\}\n/);
  ok('en impresión se suelta el alto', /overflow:\s*visible/.test(impresion));

  const cabecera = bloque(/\n\.app-header \{[\s\S]*?\n\}/);

  /* Lo sutil: tiene que quedar por encima del contenido pero por DEBAJO del
     velo del menú lateral. Si se le subiera el z-index, al abrir el menú el
     encabezado quedaría flotando sobre el velo, iluminado y clickeable. */
  const velo = bloque(/\n\.drawer-backdrop \{[\s\S]*?\n\}/);
  const cajon = bloque(/\n\.drawer \{[\s\S]*?\n\}/);
  console.log(`  z-index → encabezado ${z(cabecera)} · velo ${z(velo)} · cajón ${z(cajon)}`);
  ok('por encima del contenido', z(cabecera) > 0);
  ok('y por debajo del velo del menú', z(cabecera) < z(velo),
    `${z(cabecera)} vs ${z(velo)}`);
}

// --- el menú es de Hábitos, no del encabezado ------------------------------
{
  /* Todo lo que tiene adentro opera sobre la lista de tareas. En el encabezado
     aparecía también en Análisis, en Pendientes y en Ajustes, donde no hay nada
     sobre lo que obrar; en la línea del mes se va y vuelve con la sección. */
  const { doc } = await montar(ESTADO_LLENO);

  ok('el ☰ no está en el encabezado',
    doc.querySelector('.app-header #btn-menu') === null);
  ok('  sino en la línea del mes',
    Boolean(doc.querySelector('.month-nav #btn-menu')));
  /* Y se esconde SOLO, no con su fila: la línea del mes también se muestra en
     Análisis —los dos son mensuales—, pero ahí no hay lista de tareas sobre la
     que obrar. */
  const boton = () => doc.querySelector('#btn-menu');
  ok('en Hábitos está a la vista', boton().hidden === false);

  /* En Análisis está, con otro contenido: ahí adentro se elige qué gráfico se
     mira. Donde no hay nada que elegir —Pendientes, Ajustes— no está. */
  doc.querySelector('[data-page="indicators"]').click();
  ok('en Análisis sigue, con lo suyo adentro', boton().hidden === false);
  ok('  el apartado de gráficos', doc.querySelector('#grupo-graficos').hidden === false);
  ok('  y no el de tareas', doc.querySelector('#grupo-tareas').hidden === true);

  for (const page of ['todos', 'settings']) {
    doc.querySelector(`[data-page="${page}"]`).click();
    ok(`  en «${page}» tampoco`, boton().hidden === true);
  }

  doc.querySelector('[data-page="home"]').click();
  ok('y vuelve al volver', boton().hidden === false);
}

// --- el logo, a la izquierda ----------------------------------------------
{
  /* Con el ☰ fuera del encabezado no hay nada que equilibrar del otro lado: el
     logo ocupa la primera columna en vez de quedar centrado entre un hueco y un
     botón. */
  const css = leer('styles.css');
  const bloque = re => css.match(re)?.[0] ?? '';

  const marca = bloque(/\n\.brand \{[^}]*\}/);
  ok('el logo va en la primera columna', /grid-column:\s*1/.test(marca),
    marca.replace(/\s+/g, ' ').trim());
  ok('  alineado a la izquierda', /justify-content:\s*start/.test(marca));

  const encabezado = bloque(/\n\.app-header \{[\s\S]*?\n\}/);
  ok('y el encabezado queda con dos columnas',
    /grid-template-columns:\s*1fr auto;/.test(encabezado),
    encabezado.match(/grid-template-columns:[^;]*/)?.[0]);

  const titulo = bloque(/\n\.brand-text h1 \{[\s\S]*?\n\}/);
  ok('con el nombre a cuerpo más grande', /font-size:\s*2\.2rem/.test(titulo),
    titulo.match(/font-size:[^;]*/)?.[0]);
}

// --- el cambio de tema, sin glifos ----------------------------------------
{
  /* «☾» y «☀» eran caracteres de texto: cada fuente los dibuja distinto, no
     siguen al trazo del resto de los íconos y ninguno tiene tamaño previsible.
     Ahora son dos dibujos, y cuál se ve lo decide la hoja con `data-theme`. */
  const { doc } = await montar(ESTADO_LLENO);
  const boton = doc.querySelector('#btn-theme');
  const hoja = leer('styles.css');

  ok('el botón no lleva ningún glifo', boton.textContent.trim() === '',
    JSON.stringify(boton.textContent.trim()));
  ok('  sino los dos dibujos',
    Boolean(boton.querySelector('.icon-luna')) && Boolean(boton.querySelector('.icon-sol')));
  ok('  que siguen al tema con `currentColor`',
    /\.theme-icon \{[^}]*stroke: currentColor/s.test(hoja));
  /* La luna es una silueta y no tiene nada que mostrar por dentro: va maciza. De
     contorno quedaba flaca y hueca al lado de los íconos del cajón, que son de
     línea porque sí tienen partes adentro. */
  ok('  la luna va rellena', /\.icon-luna \{ fill: currentColor; stroke: none; \}/.test(hoja));
  ok('  y el sol la acompaña con el disco lleno',
    /\.icon-sol circle \{ fill: currentColor; \}/.test(hoja));

  /* El botón enseña A DÓNDE va, que es lo mismo que dice su nombre. */
  ok('en claro ofrece el oscuro', /oscuro/.test(boton.title), boton.title);
  ok('  y lo dice también el nombre accesible',
    boton.getAttribute('aria-label') === boton.title, boton.getAttribute('aria-label'));

  boton.click();
  ok('al cambiar, ofrece el claro', /claro/.test(boton.title), boton.title);
  ok('  y el documento queda en oscuro',
    doc.documentElement.dataset.theme === 'dark', doc.documentElement.dataset.theme);

  ok('la luna es la que va por omisión', hoja.includes('.icon-luna { display: block; }'));
  ok('  y en oscuro se cambian por el sol',
    hoja.includes(':root[data-theme="dark"] .icon-sol { display: block; }'));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
