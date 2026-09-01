/* La puerta de entrada: la página que ve quien todavía no entró.

   No la ejercita ningún otro caso —el arnés quita `auth.js` y la puerta queda
   oculta—, así que su marcado y su contraste se comprueban acá.

   Fue una pantalla partida al medio: formulario a un lado, presentación al
   otro. Eso le daba media pantalla a la acción de quien YA tiene cuenta, justo
   en la visita de quien todavía no sabe qué es esto. Ahora la página presenta y
   entrar es un botón arriba a la derecha. */
import { montar, leer } from '../harness.mjs';
import { ESTADO_VACIO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const { doc } = await montar(ESTADO_VACIO);
const css = leer('styles.css');
const bloque = re => css.match(re)?.[0] ?? '';

// --- 1. la franja de arriba ------------------------------------------------
{
  const banner = doc.querySelector('#auth-gate .landing-banner');
  ok('la puerta abre con una franja arriba', Boolean(banner));

  /* Nada más que el ingreso: el nombre estaba también acá y en grande dos
     centímetros más abajo, que es decir dos veces lo mismo en dos tamaños. */
  ok('  que no lleva más que el ingreso',
    banner?.children.length === 1 && banner.firstElementChild.id === 'btn-ingresar',
    [...(banner?.children ?? [])].map(n => n.id || n.className).join(', '));
  ok('    diciendo que abre algo',
    doc.querySelector('#btn-ingresar')?.getAttribute('aria-haspopup') === 'dialog');

  /* Pegada mientras se scrollea: la única acción de la página no puede quedar
     arriba de todo y fuera de alcance apenas se baja a leer. */
  const regla = bloque(/\n\.landing-banner \{[^}]*\}/);
  ok('  y queda a la vista al bajar', /position:\s*sticky/.test(regla),
    regla.replace(/\s+/g, ' '));
  /* Del fondo de la app al violeta del pie, de derecha a izquierda: el botón
     queda sobre el tono limpio y la franja abre con el color del pie. */
  ok('  con el degradado hacia la izquierda',
    regla.includes('linear-gradient(270deg') && regla.includes('var(--landing-pie)'),
    regla.replace(/\s+/g, ' '));

  /* Con un solo hijo, `space-between` lo dejaba contra el borde izquierdo. */
  ok('  con el ingreso contra la derecha', /justify-content:\s*flex-end/.test(regla),
    regla.replace(/\s+/g, ' '));
}

// --- 2. la marca, en grande ------------------------------------------------
{
  const hero = doc.querySelector('#auth-gate .landing-hero');
  ok('debajo va la marca en grande', Boolean(hero));
  ok('  con el logo', Boolean(hero?.querySelector('.landing-logo')));
  ok('  y su nombre al lado',
    hero?.querySelector('.landing-nombre')?.textContent.trim() === 'Hábitos',
    hero?.querySelector('.landing-nombre')?.textContent);
  /* El único `h1` de la página: es el encabezado de todo lo que sigue. El del
     formulario es un `h2`, que es una firma sobre un panel y no un título. */
  ok('  que es el único h1 de la puerta',
    doc.querySelectorAll('#auth-gate h1').length === 1
      && doc.querySelector('#auth-gate h1').className === 'landing-nombre',
    String(doc.querySelectorAll('#auth-gate h1').length));

  const logo = bloque(/\n\.landing-logo \{[^}]*\}/);
  ok('  y el logo es grande de verdad', /clamp\(84px/.test(logo), logo.replace(/\s+/g, ' '));

  /* Uno al lado del otro y no apilados: apilado, el nombre queda flotando
     debajo del dibujo y los dos se leen como dos cosas; en fila, como una. */
  const fila = bloque(/\n\.landing-hero \{[^}]*\}/);
  ok('  y van en una fila, no apilados',
    /display:\s*flex/.test(fila) && !/flex-direction:\s*column/.test(fila),
    fila.replace(/\s+/g, ' '));
  /* Y contra el margen izquierdo, no en el medio: la fila ocupa todo el ancho,
     así que hay que decirlo. Arranca en la misma vertical que las tarjetas. */
  ok('  arrimados al margen izquierdo', /justify-content:\s*flex-start/.test(fila),
    fila.replace(/\s+/g, ' '));
}

// --- 3. las características, en tarjetas -----------------------------------
{
  /* Eran una lista con tildes: en una columna angosta se leían como los
     renglones de un contrato, y lo que hay son cuatro cosas independientes que
     se miran de un vistazo. */
  const cards = [...doc.querySelectorAll('#auth-gate .landing-card')];
  ok('las características son tarjetas', cards.length >= 3 && cards.length <= 6,
    `${cards.length} tarjetas`);
  ok('  cada una con su título', cards.every(c => c.querySelector('h2')?.textContent.trim()));
  ok('  y su explicación', cards.every(c => c.querySelector('p')?.textContent.trim()));
  ok('  con el tilde de la marca, decorativo',
    cards.every(c => c.querySelector('.landing-card-icono')?.getAttribute('aria-hidden') === 'true'));

  /* Que alguna hable de los pendientes: son la otra mitad de la app, y sin
     esto la puerta prometía solo hábitos. */
  ok('  y alguna cuenta lo de los pendientes',
    cards.some(c => /pendiente/i.test(c.textContent)),
    cards.map(c => c.querySelector('h2')?.textContent).join(' | '));

  // Un beneficio sin desarrollo es un titular suelto.
  const cortas = cards.filter(c => c.textContent.replace(/\s+/g, ' ').trim().length < 60);
  ok('  todas explican algo, no solo titulan', cortas.length === 0,
    cortas.map(c => c.querySelector('h2')?.textContent).join(' | '));

  /* El tilde y el título, en el mismo renglón: el gesto acompaña al título, y
     en un renglón propio quedaba separado de él y pegado a la tarjeta de
     arriba. El cuerpo, en cambio, cruza las dos columnas. */
  const caja = bloque(/\n\.landing-card \{[^}]*\}/);
  ok('  con el tilde en el renglón del título',
    /display:\s*grid/.test(caja) && /grid-template-columns:\s*auto 1fr/.test(caja),
    caja.replace(/\s+/g, ' '));
  const cuerpo = bloque(/\n\.landing-card p \{[^}]*\}/);
  ok('    y la explicación cruzando las dos columnas',
    /grid-column:\s*1 \/ -1/.test(cuerpo), cuerpo.replace(/\s+/g, ' '));

  /* En rejilla y no en columna: entran las que quepan y el resto baja. */
  const rejilla = bloque(/\n\.landing-cards \{[^}]*\}/);
  ok('  repartidas en una rejilla que se acomoda',
    /repeat\(auto-fit, minmax\(/.test(rejilla), rejilla.replace(/\s+/g, ' '));
}

// --- 4. el fondo: el de la app, bajando al violeta -------------------------
{
  const gate = bloque(/\n\.auth-gate \{[^}]*\}/);
  ok('el fondo arranca en el de la app', /var\(--bg\)/.test(gate), gate.replace(/\s+/g, ' '));
  ok('  y baja en degradado vertical', /linear-gradient\(180deg/.test(gate));
  ok('    hasta el pie de la puerta', /var\(--landing-pie\)/.test(gate));

  /* Un tono por tema: el mismo violeta diluido no sirve para los dos fondos. */
  const veces = (css.match(/--landing-pie:/g) ?? []).length;
  ok('  con un tono para cada tema', veces === 2, `${veces} definiciones`);
}

// --- 5. el formulario, detrás del botón ------------------------------------
{
  const dialogo = doc.querySelector('#auth-dialog');
  ok('el formulario vive en un diálogo', Boolean(dialogo));
  ok('  cerrado hasta que alguien lo pida', dialogo?.hasAttribute('open') === false);

  const card = dialogo?.querySelector('.auth-card');
  for (const sel of ['#auth-email', '#auth-password', '#auth-submit', '#auth-toggle',
    '#auth-error', '#auth-notice', '.auth-mark', '.auth-brand', '[data-close-dialog]']) {
    ok(`  la tarjeta conserva ${sel}`, Boolean(card?.querySelector(sel)));
  }

  // Y el botón lo abre.
  doc.querySelector('#btn-ingresar').click();
  ok('el botón del banner lo abre', dialogo.hasAttribute('open'));
  ok('  con el foco en el email, que es lo primero que se escribe',
    doc.activeElement?.id === 'auth-email', doc.activeElement?.id);
  doc.querySelector('#auth-dialog [data-close-dialog]').click();
  ok('  y la ✕ lo cierra', dialogo.hasAttribute('open') === false);

  ok('la puerta arranca oculta', doc.querySelector('#auth-gate').hidden === true);
}

// --- 6. sobre el pie del degradado no cae texto suelto --------------------
{
  /* La presentación dejó de ir sobre un violeta pleno: ahora es texto de la app
     sobre el fondo de la app. Y abajo, donde el degradado se pone más hondo, lo
     único que hay son tarjetas — que traen su propio fondo OPACO, así que su
     texto nunca se apoya en el violeta.

     Eso es lo que hay que cuidar: mientras el fondo de la tarjeta sea opaco, el
     degradado puede ser el que sea. Con una tarjeta translúcida habría que
     medir cada parada, y bastaría con oscurecer un poco el pie para que el
     texto de las últimas dejara de leerse. */
  const card = bloque(/\n\.landing-card \{[^}]*\}/);
  ok('las tarjetas traen su propio fondo', /background:\s*var\(--bg-elev\)/.test(card),
    card.replace(/\s+/g, ' '));
  ok('  opaco, sin nada del degradado por debajo',
    !/rgba|opacity|transparent/.test(card), card.replace(/\s+/g, ' '));

  /* Y ya no hay ningún texto suelto ahí abajo: la bajada y el pie se fueron. */
  ok('no queda texto suelto sobre el degradado',
    doc.querySelector('#auth-gate .landing-lead') === null
      && doc.querySelector('#auth-gate .landing-foot') === null);
  const sueltos = [...doc.querySelectorAll('#auth-gate .landing > *')]
    .filter(n => !n.classList.contains('landing-hero') && !n.classList.contains('landing-cards'))
    .map(n => n.className);
  ok('  el cuerpo es la marca y las tarjetas, nada más', sueltos.length === 0,
    sueltos.join(', ') || '(nada más)');
}

// --- 7. nada de estilos inline, que la CSP bloquearía ----------------------
{
  const html = leer('index.html');
  const puerta = html.slice(html.indexOf('class="auth-gate"'), html.indexOf('id="app-root"'));
  ok('la puerta no lleva estilos inline', !/\sstyle="/.test(puerta),
    puerta.match(/\sstyle="[^"]*"/)?.[0]);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
