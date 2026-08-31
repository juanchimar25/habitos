/* La barra de secciones del pie: cuatro entradas —Hábitos, Análisis, Pendientes
   y Ajustes—, siempre a la vista, con la ruta de cada sección.

   Es la navegación principal desde que «Análisis» dejó el encabezado y el cajón
   dejó de repetir las secciones. Por eso se comprueban las tres cosas juntas:
   que las cuatro estén, que cada una muestre lo suyo y que no queden restos de
   la navegación anterior.

   Arnés: hoy = jueves 30/07/2026. */
import { montar, leer } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

/* Las cuatro, en el orden en que se leen de izquierda a derecha: lo que se
   carga, lo que se lee de lo cargado, lo que todavía no está, y los ajustes.

   `titulo` es el de la pestaña del navegador, que no siempre repite el rótulo:
   la sección principal se llama como la app, y «Hábitos · Hábitos» sería decir
   el nombre dos veces. */
const TABS = [
  { page: 'home', ruta: 'diario', texto: 'Hábitos', titulo: 'Hábitos', seccion: '#board' },
  { page: 'indicators', ruta: 'analisis', texto: 'Análisis', seccion: '#analysis' },
  { page: 'todos', ruta: 'pendientes', texto: 'Pendientes', seccion: '#todos' },
  { page: 'settings', ruta: 'ajustes', texto: 'Ajustes', seccion: '#settings' },
];

// --- 1. las cuatro entradas -------------------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const tabs = [...doc.querySelectorAll('#tabbar .tab')];

  ok('son cuatro', tabs.length === 4, String(tabs.length));
  ok('en orden', tabs.map(t => t.dataset.page).join(' · ')
    === TABS.map(t => t.page).join(' · '), tabs.map(t => t.dataset.page).join(' · '));
  ok('con sus rótulos', tabs.map(t => t.querySelector('.tab-text').textContent).join(' · ')
    === TABS.map(t => t.texto).join(' · '));

  /* Enlaces de verdad, no botones: ctrl/cmd + clic tiene que poder abrir la
     sección en otra pestaña, y para eso hace falta un `href` de verdad. Lo
     apunta `start()`, que es cuando se conoce la carpeta base. */
  ok('son enlaces con la ruta de cada sección',
    tabs.every((t, i) => t.tagName === 'A' && t.getAttribute('href') === `/${TABS[i].ruta}`),
    tabs.map(t => t.getAttribute('href')).join(' · '));

  /* Los glifos de tilde, cuaderno y torta no tienen cobertura pareja en las
     fuentes de sistema —el problema que ya había dado U+23FB en el cajón—, así
     que van dibujados. */
  ok('cada una lleva su ícono dibujado, no un glifo',
    tabs.every(t => t.querySelector('svg.tab-icon')));
  ok('y los íconos no los lee el lector de pantalla',
    tabs.every(t => t.querySelector('svg.tab-icon').getAttribute('aria-hidden') === 'true'));

  ok('la barra se nombra', doc.querySelector('#tabbar').getAttribute('aria-label') === 'Secciones');

  /* Última franja del armazón: hermana de `.app-main`, no hija, y lo último de
     todo. Lo que desplaza queda entre el encabezado y ella; en el medio está el
     botón de alta, que flota y no ocupa franja. */
  const barra = doc.querySelector('#tabbar');
  ok('vive en el armazón, después del contenido',
    barra.parentElement?.id === 'app-root' && barra.nextElementSibling === null,
    barra.parentElement?.id);
}

// --- 2. cada una lleva a lo suyo -------------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO);

  for (const destino of TABS) {
    doc.querySelector(`#tabbar [data-page="${destino.page}"]`).click();

    const visibles = TABS.filter(t => !doc.querySelector(t.seccion).hidden).map(t => t.page);
    ok(`${destino.texto}: muestra lo suyo y nada más`,
      visibles.join(',') === destino.page, visibles.join(',') || '(ninguna)');
    ok(`  la dirección queda en /${destino.ruta}`,
      window.location.pathname === `/${destino.ruta}`, window.location.pathname);
    ok('  y el título acompaña',
      doc.title === (destino.titulo ?? `${destino.texto} · Hábitos`), doc.title);

    const activas = [...doc.querySelectorAll('#tabbar .tab.is-active')];
    ok('  solo esa entrada queda marcada',
      activas.length === 1 && activas[0].dataset.page === destino.page,
      activas.map(t => t.dataset.page).join(',') || '(ninguna)');
    ok('  y se anuncia como la página actual',
      activas[0]?.getAttribute('aria-current') === 'page');

    // La barra no se va nunca: es el único camino de vuelta.
    ok('  la barra sigue a la vista', doc.querySelector('#tabbar').hidden === false);
  }
}

// --- 3. la guía sigue estando, aunque no tenga entrada propia --------------
{
  const { doc } = await montar(ESTADO_LLENO);
  doc.querySelector('#drawer [data-page="help"]').click();

  ok('«Cómo usar» se abre desde el cajón', doc.querySelector('#help').hidden === false);
  ok('y ninguna entrada de la barra queda marcada',
    doc.querySelectorAll('#tabbar .tab.is-active').length === 0);
  ok('con la planilla y el análisis ocultos',
    doc.querySelector('#board').hidden === true
    && doc.querySelector('#analysis').hidden === true);
}

// --- 4. las secciones nuevas responden a su dirección ----------------------
{
  const { doc } = await montar(ESTADO_LLENO, { ruta: 'ajustes' });
  ok('abrir en /ajustes cae en Ajustes', doc.querySelector('#settings').hidden === false);
  ok('con la planilla guardada', doc.querySelector('#board').hidden === true);
  /* No hay período que elegir en Ajustes: la barra del mes entera se va, como
     en la guía. */
  ok('y sin la barra del mes', doc.querySelector('.controls').hidden === true);
}
{
  const { doc } = await montar(ESTADO_LLENO, { ruta: 'pendientes' });
  ok('abrir en /pendientes cae en Pendientes', doc.querySelector('#todos').hidden === false);
  ok('con la planilla guardada', doc.querySelector('#board').hidden === true);
}
{
  const { doc } = await montar(ESTADO_LLENO, { ruta: 'inventada' });
  ok('una ruta que no existe sigue cayendo en Hábitos',
    doc.querySelector('#board').hidden === false);
}

// --- 5. Ajustes: la sesión y el plan --------------------------------------
{
  const { window, doc } = await montar(ESTADO_LLENO, { ruta: 'ajustes' });

  /* El reloj de la cuenta atrás, manejado desde acá: esperar diez segundos de
     verdad sería diez segundos de suite por una comprobación. Se reemplaza el
     `setInterval` de la ventana ANTES de que nadie lo use, y `tic()` corre lo
     que la app le pasó. Es el camino real, sin el reloj. */
  const relojes = [];
  window.setInterval = fn => relojes.push(fn);
  window.clearInterval = () => relojes.length = 0;
  const tic = () => relojes.forEach(fn => fn());

  /* El arnés no carga `auth.js` —importa un módulo por CDN—, así que los datos
     de la sesión llegan vacíos. Lo que se comprueba acá es que el lugar donde
     los escribe siga existiendo con esos ids: si se renombran, auth.js escribe
     en la nada y nadie se entera. */
  for (const id of ['settings-session', 'session-user', 'session-since', 'btn-sign-out']) {
    ok(`  Ajustes tiene #${id}`, Boolean(doc.querySelector(`#${id}`)));
  }
  ok('cerrar sesión es un botón, no un enlace',
    doc.querySelector('#btn-sign-out').tagName === 'BUTTON');

  /* Las dos salidas van juntas y en ese orden: primero la que no destruye
     nada. Y se distinguen a la vista —contorno contra relleno—, que es lo que
     evita el clic equivocado. */
  const salidas = [...doc.querySelectorAll('.session-acciones .btn')].map(b => b.id);
  ok('  y al lado está el de eliminar la cuenta',
    salidas.join(',') === 'btn-sign-out,btn-delete-account', salidas.join(','));
  /* El rojo lo lleva la que no tiene vuelta, y solo ella: con las dos en rojo
     ninguna avisaba nada. */
  ok('  y el rojo se lo queda la que no tiene vuelta',
    doc.querySelector('#btn-delete-account').className.includes('session-delete')
      && !doc.querySelector('#btn-sign-out').className.includes('session-delete'));

  /* Eliminar la cuenta pasa por DOS puertas. No es una confirmación repetida
     por las dudas: son dos preguntas distintas —«¿sabés qué se borra?» y
     «¿estás seguro?»— y la segunda existe porque acá no hay papelera, ni
     deshacer, ni una copia en la base que alguien pueda restaurar. Todo lo
     demás que borra la app se puede recuperar; esto no. */
  doc.querySelector('#btn-delete-account').click();
  const dialogo = doc.querySelector('#confirm-dialog');
  const texto = () => doc.querySelector('#confirm-text');

  ok('  y pide confirmación antes de nada', dialogo.hasAttribute('open'));
  ok('    diciendo qué se elimina',
    /Se elimina tu cuenta y todo lo que cargaste/.test(texto().textContent),
    texto().textContent);
  ok('    qué se lleva puesto',
    /pendientes/.test(doc.querySelector('#confirm-note').textContent),
    doc.querySelector('#confirm-note').textContent);
  ok('    y ofreciendo la copia antes de borrar',
    /Exportar/.test(doc.querySelector('#confirm-note').textContent));
  /* La primera no borra: continúa. Un botón que dice «Eliminar cuenta» y no la
     elimina prometería lo que no hace. */
  ok('    con un botón que no promete borrar todavía',
    doc.querySelector('#confirm-ok').textContent === 'Continuar',
    doc.querySelector('#confirm-ok').textContent);
  ok('    y sin el rojo del aviso, que es de la última puerta',
    !texto().classList.contains('es-irreversible'), texto().className);

  // La segunda: la pregunta sola, en rojo.
  doc.querySelector('#confirm-ok').click();
  ok('  confirmar abre una segunda pantalla', dialogo.hasAttribute('open'));
  ok('    preguntando si de verdad', /¿Seguro\?/.test(texto().textContent),
    texto().textContent);
  ok('    diciendo que es irreversible y que se pierde todo',
    /irreversible/.test(texto().textContent)
      && /no hay manera de recuperarla/.test(texto().textContent),
    texto().textContent);
  ok('    en rojo', texto().classList.contains('es-irreversible'), texto().className);
  ok('    y ahí sí el botón lo dice',
    doc.querySelector('#confirm-ok').textContent.startsWith('Eliminar definitivamente'),
    doc.querySelector('#confirm-ok').textContent);

  /* Sin nada más que leer: la lista y la nota ya se leyeron en la primera, y
     repetirlas acá enterraría la única pregunta que queda. */
  ok('    sin nada más en la pantalla',
    doc.querySelector('#confirm-list').hidden && doc.querySelector('#confirm-note').hidden);

  /* Y el botón espera diez segundos antes de abrirse. Disponible en el mismo
     lugar donde el anterior acaba de estar, se puede tocar sin haber leído
     nada, arrastrado por el impulso del clic que abrió esta pantalla.

     La cuenta se ve: un botón apagado y mudo se lee como roto, y el número dice
     que la espera termina. */
  const boton = () => doc.querySelector('#confirm-ok');
  ok('    arrancando apagado', boton().disabled === true);
  ok('    con los segundos a la vista, desde el primer dibujado',
    boton().textContent === 'Eliminar definitivamente (10)', boton().textContent);
  /* Contorno mientras espera y relleno cuando se abre: el «todavía no» y el
     «ahora sí» se distinguen sin leer el número.

     Y no alcanza con apagarlo: `.btn:disabled` lo deja al 45%, y un rojo al 45%
     con texto blanco al 45% se ve como un botón VACÍO. */
  ok('    y con el aspecto de lo que todavía no se puede tocar',
    boton().classList.contains('btn-espera') && !boton().classList.contains('btn-danger'),
    boton().className);

  // El reloj es el de la ventana: se lo maneja desde acá para no esperarlo.
  tic();
  ok('    que bajan', boton().textContent === 'Eliminar definitivamente (9)',
    boton().textContent);
  ok('      todavía apagado', boton().disabled === true);

  for (let i = 0; i < 9; i++) tic();
  ok('    y al llegar a cero se abre', boton().disabled === false);
  ok('      con el rótulo limpio', boton().textContent === 'Eliminar definitivamente',
    boton().textContent);
  ok('      y el relleno rojo, que es el de la acción que ya se puede hacer',
    !boton().classList.contains('btn-espera') && boton().classList.contains('btn-danger'),
    boton().className);

  /* Y los dos aspectos, leídos de la hoja. El que espera fue un rectángulo
     vacío durante dos versiones: era `.btn-danger` con parches encima, y había
     que ganarle a dos reglas —el relleno del rojo y el 45% de `.btn:disabled`—.
     Un rojo al 45% con texto blanco al 45% no es un botón apagado, es un botón
     invisible. Ahora es otro botón, sin nada que sobreescribir. */
  const css = leer('styles.css');
  const bloque = re => css.match(re)?.[0] ?? '';

  const espera = bloque(/\n\.btn\.btn-espera,\n\.btn\.btn-espera:disabled \{[^}]*\}/);
  ok('el que espera se pinta con su propia regla', Boolean(espera), '(sin regla)');
  ok('  de contorno rojo y sin relleno',
    /background:\s*transparent/.test(espera) && /color:\s*var\(--danger\)/.test(espera),
    espera.replace(/\s+/g, ' '));
  /* Lo que lo volvía invisible. La regla se nombra a sí misma con `:disabled`
     para ganarle a `.btn:disabled` por especificidad y no por orden. */
  ok('  reponiendo la opacidad que le saca «.btn:disabled»',
    /opacity:\s*1/.test(espera) && espera.includes('.btn.btn-espera:disabled'),
    espera.replace(/\s+/g, ' '));

  const rojo = bloque(/\n\.btn-danger \{[^}]*\}/);
  ok('y el que ya se puede tocar va rojo sólido con letras blancas',
    /background:\s*var\(--danger\)/.test(rojo) && /color:\s*#fff/.test(rojo),
    rojo.replace(/\s+/g, ' '));

  /* El botón no cambia de ancho en toda la cuenta. No es cosmética: con el
     diálogo en la capa superior, un botón que se achica con cada dígito deja al
     navegador pintando donde ya no está, y se veía VACÍO hasta que algo forzaba
     un recálculo — abrir el inspector, por ejemplo—.

     El rótulo y el número son dos huecos: el segundo mide siempre lo mismo, así
     que el que cambia no mueve al otro. */
  ok('el rótulo y la cuenta son dos huecos',
    Boolean(doc.querySelector('#confirm-ok-texto'))
      && Boolean(doc.querySelector('#confirm-ok-cuenta')));

  const hueco = bloque(/\n#confirm-ok\.con-cuenta \.confirm-cuenta \{[^}]*\}/);
  ok('  y el del número mide siempre lo mismo', /min-width/.test(hueco),
    hueco.replace(/\s+/g, ' ') || '(sin regla)');
  ok('    también cuando ya está vacío, al final de la cuenta',
    doc.querySelector('#confirm-ok').classList.contains('con-cuenta'),
    doc.querySelector('#confirm-ok').className);
  /* Y por dentro, cifras de ancho parejo: sin eso el 1 es más angosto que el 8
     y el rótulo tiembla aunque la caja no se mueva. */
  ok('  con cifras de ancho parejo',
    /font-variant-numeric:\s*tabular-nums/.test(bloque(/\n\.confirm-cuenta \{[^}]*\}/)),
    bloque(/\n\.confirm-cuenta \{[^}]*\}/).replace(/\s+/g, ' '));

  /* Y el hueco no se le queda a la próxima confirmación, que no cuenta nada. */
  doc.querySelector('#confirm-dialog [data-close-dialog]').click();
  doc.querySelector('#btn-delete-account').click();
  ok('    y no se le queda a la que no cuenta nada',
    !doc.querySelector('#confirm-ok').classList.contains('con-cuenta'),
    doc.querySelector('#confirm-ok').className);
  doc.querySelector('#confirm-dialog [data-close-dialog]').click();

  /* Y lo que un navegador hace y jsdom no: `close()` NO dispara su evento en el
     acto, lo ENCOLA. Encadenando dos confirmaciones, el orden real es cerrar,
     armar la segunda, y recién entonces correr la tarea encolada — que llega
     tarde, sobre el botón de la segunda.

     Había un oyente de `close` que reponía el rótulo por defecto, y eso es
     exactamente lo que le pisaba: aparecía «Eliminar» con la cuenta atrás
     andando por dentro. Acá se dispara el evento a mano, que es la única forma
     de que un caso vea ese orden. */
  doc.querySelector('#confirm-dialog [data-close-dialog]').click();
  doc.querySelector('#btn-delete-account').click();
  doc.querySelector('#confirm-ok').click();
  doc.querySelector('#confirm-dialog')
    .dispatchEvent(new doc.defaultView.Event('close'));

  ok('el «close» que llega tarde no le pisa el botón a la segunda puerta',
    boton().textContent === 'Eliminar definitivamente (10)', boton().textContent);
  ok('  ni le devuelve el color del que ya se puede tocar',
    boton().classList.contains('btn-espera') && !boton().classList.contains('btn-danger'),
    boton().className);
  doc.querySelector('#confirm-dialog [data-close-dialog]').click();

  /* Y la espera no se le pega a la próxima confirmación: cualquier otra abre
     con su botón listo. */
  doc.querySelector('#confirm-dialog [data-close-dialog]').click();
  doc.querySelector('#btn-delete-account').click();
  ok('  la primera puerta no hace esperar',
    boton().disabled === false && !boton().classList.contains('btn-espera'),
    boton().className);

  /* Y el rojo tampoco se queda pegado: la próxima confirmación de cualquier
     otra cosa no tiene por qué heredarlo. */
  ok('  y el rojo no se arrastra a la siguiente',
    !texto().classList.contains('es-irreversible'), texto().className);
  doc.querySelector('#confirm-dialog [data-close-dialog]').click();
  ok('el plan tiene su tarjeta', Boolean(doc.querySelector('#plan-name')));

  // Y no quedó una segunda copia en el cajón.
  ok('la sesión ya no está en el cajón',
    doc.querySelector('#drawer #btn-sign-out') === null
    && doc.querySelector('#drawer-session') === null);
}

// --- 6. el cajón dejó de repetir las secciones ----------------------------
{
  const { doc } = await montar(ESTADO_LLENO);
  const enCajon = [...doc.querySelectorAll('#drawer [data-page]')].map(i => i.dataset.page);
  ok('en el cajón solo queda la guía', enCajon.join(',') === 'help', enCajon.join(',') || '(ninguna)');
}

// --- 7. la franja, leída de la hoja ---------------------------------------
{
  /* jsdom no apila ni mide, así que esto se lee del CSS. */
  const css = leer('styles.css');
  const bloque = re => css.match(re)?.[0] ?? '';
  const z = regla => Number(regla.match(/z-index:\s*(\d+)/)?.[1]);

  const barra = bloque(/\n\.tabbar \{[\s\S]*?\n\}/);

  /* Franja del armazón y no `position: fixed`: así no tapa el final del
     contenido ni hay que reservarle lugar con padding en cada sección. */
  ok('es una franja del armazón', /flex:\s*none/.test(barra));
  ok('y no flota sobre el contenido', !/position:\s*fixed/.test(barra));

  /* El pie del teléfono tiene el indicador de inicio encima: sin esto los
     rótulos quedan debajo de la barra del sistema. */
  ok('respeta el área segura del teléfono',
    /padding-bottom:\s*calc\([^)]*env\(safe-area-inset-bottom/.test(barra), barra.match(/padding-bottom:[^;]*;/)?.[0]);

  const cabecera = bloque(/\n\.app-header \{[\s\S]*?\n\}/);
  const velo = bloque(/\n\.drawer-backdrop \{[\s\S]*?\n\}/);
  console.log(`  z-index → encabezado ${z(cabecera)} · barra ${z(barra)} · velo ${z(velo)}`);
  ok('se apila como el encabezado', z(barra) === z(cabecera));
  ok('y el velo del cajón también la atenúa', z(barra) < z(velo));

  /* El aviso flotante es fijo contra la ventana, así que la franja del armazón
     no lo empuja: si no se lo subiera a mano, cada «tarea agregada» saldría
     detrás de la barra. */
  const aviso = bloque(/\n\.toast \{[\s\S]*?\n\}/);
  ok('el aviso flotante pasa por encima de la barra',
    /bottom:\s*calc\([^;]*var\(--tabbar-h\)/.test(aviso), aviso.match(/bottom:[^;]*;/)?.[0]);

  const impresion = bloque(/@media print \{[\s\S]*?\n\}\n/);
  ok('en papel no se imprime', /\.tabbar/.test(impresion));

  /* Las secciones nuevas desplazan por dentro, como el análisis y la guía: el
     armazón no desplaza. */
  const scroll = bloque(/\n\.analysis, \.help, \.todos, \.settings \{[^}]*\}/);
  ok('Pendientes y Ajustes desplazan por dentro',
    /overflow-y:\s*auto/.test(scroll) && /min-height:\s*0/.test(scroll), scroll.trim());
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
