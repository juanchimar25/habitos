/* Pantalla partida de la puerta de sesión: presentación a un lado, formulario
   al otro. No la ejercita ningún otro caso —el arnés quita `auth.js` y la
   puerta queda oculta—, así que su marcado y su contraste se comprueban acá. */
import { montar, leer } from '../harness.mjs';
import { ESTADO_VACIO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const { doc } = await montar(ESTADO_VACIO);
const css = leer('styles.css');

// --- 1. las dos mitades --------------------------------------------------
{
  const split = doc.querySelector('#auth-gate .auth-split');
  ok('la puerta de sesión es una pantalla partida', Boolean(split));

  const mitades = [...(split?.children ?? [])].map(n => n.className);
  console.log('  mitades:', mitades.join(' · '));
  ok('son dos', mitades.length === 2, String(mitades.length));

  /* El formulario va primero en el DOM aunque en pantalla ancha ocupe la mitad
     izquierda: es la acción principal, y así al apilarse queda arriba sin que
     haya que invertir el orden visual. */
  ok('el formulario va primero en el DOM', mitades[0] === 'auth-card');
  ok('y la presentación después', mitades[1] === 'auth-pitch');
}

// --- 1b. la partición ocupa la pantalla y cada mitad su columna -----------
{
  const split = css.match(/\.auth-split \{([\s\S]*?)\n\}/)?.[1] ?? '';
  ok('la partición es mitad y mitad',
    /grid-template-columns: 1fr 1fr;/.test(split), split.match(/grid-template-columns[^;]*/)?.[0]);
  ok('y ocupa el alto de la pantalla', /min-height: 100%;/.test(split));
  ok('la puerta ya no centra una tarjeta suelta',
    !/place-items: center/.test(css.match(/\.auth-gate \{([\s\S]*?)\n\}/)?.[1] ?? ''));

  const card = css.match(/\n\.auth-card \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const pitch = css.match(/\.auth-pitch \{([\s\S]*?)\n\}/)?.[1] ?? '';
  ok('el formulario cae en la columna izquierda', /grid-column: 1;/.test(card));
  ok('y flota centrado en su mitad', /place-self: center;/.test(card));
  ok('la presentación cae en la columna derecha', /grid-column: 2;/.test(pitch));
  ok('y su contenido se centra en vertical', /justify-content: center;/.test(pitch));
}

// --- 2. contenido de la presentación --------------------------------------
{
  const pitch = doc.querySelector('.auth-pitch');
  ok('tiene titular', Boolean(pitch.querySelector('.pitch-title')?.textContent.trim()));
  ok('tiene bajada', Boolean(pitch.querySelector('.pitch-lead')?.textContent.trim()));

  const items = [...pitch.querySelectorAll('.pitch-list li')];
  ok('lista unos cuantos beneficios', items.length >= 3 && items.length <= 6,
    `${items.length} beneficios`);
  ok('cada uno abre con un título en negrita',
    items.every(li => li.querySelector('strong')?.textContent.trim()));
  ok('y lleva su tilde', items.every(li => li.querySelector('.pitch-check')));
  ok('los tildes son decorativos para el lector de pantalla',
    items.every(li => li.querySelector('.pitch-check').getAttribute('aria-hidden') === 'true'));

  // Un beneficio sin desarrollo es un titular suelto: se comprueba que haya texto.
  const cortos = items.filter(li => li.textContent.replace(/\s+/g, ' ').trim().length < 60);
  ok('todos explican algo, no solo titulan', cortos.length === 0,
    cortos.map(li => li.querySelector('strong')?.textContent).join(' | '));

  ok('hay un solo h1 en la puerta',
    doc.querySelectorAll('#auth-gate h1').length === 1,
    `${doc.querySelectorAll('#auth-gate h1').length}`);
}

// --- 3. el formulario sigue entero ----------------------------------------
{
  const card = doc.querySelector('.auth-card');
  for (const sel of ['#auth-email', '#auth-password', '#auth-submit', '#auth-toggle',
    '#auth-error', '#auth-notice', '.auth-mark', '.auth-brand']) {
    ok(`  la tarjeta conserva ${sel}`, Boolean(card.querySelector(sel)));
  }
  ok('la puerta arranca oculta', doc.querySelector('#auth-gate').hidden === true);
}

// --- 4. en móvil el formulario va primero ---------------------------------
{
  const bloque = [...css.matchAll(/@media \(max-width: 860px\) \{([\s\S]*?)\n\}/g)]
    .map(m => m[1]).find(b => b.includes('.auth-split')) ?? '';
  ok('hay un breakpoint para la pantalla partida', bloque !== '');
  ok('pasa a una columna', /\.auth-split \{ grid-template-columns: 1fr; \}/.test(bloque));
  /* Al apilarse, el formulario queda arriba por el orden del DOM. Invertirlo con
     `order` volvería a separar el orden visual del de lectura, que es lo que
     esta estructura vino a evitar. */
  ok('sin invertir el orden con `order`', !/order:\s*-?\d/.test(bloque),
    bloque.match(/order:\s*-?\d+/)?.[0] ?? '(no lo usa)');
  ok('las dos mitades quedan en la misma columna',
    /\.auth-card \{ grid-column: 1;/.test(bloque) && /\.auth-pitch \{ grid-column: 1;/.test(bloque));
}

// --- 5. contraste del texto sobre el violeta ------------------------------
{
  const lum = h => {
    const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contraste = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  /* El texto de apoyo va con blanco velado: se compone contra el fondo para
     medirlo, porque el alfa no cambia el fondo, lo mezcla. */
  const velado = (alfa, fondo) => '#' + [1, 3, 5]
    .map(i => Math.round(255 * alfa + parseInt(fondo.slice(i, i + 2), 16) * (1 - alfa))
      .toString(16).padStart(2, '0')).join('');

  const regla = css.match(/\.auth-pitch \{([\s\S]*?)\n\}/)?.[1] ?? '';
  const paradas = [...regla.matchAll(/#([0-9a-f]{6})/g)].map(m => `#${m[1]}`);
  ok('el degradado se lee del CSS', paradas.length >= 2, paradas.join(' '));

  const alfas = [...css.matchAll(/rgba\(255, 255, 255, \.(\d+)\)/g)]
    .map(m => Number(`0.${m[1]}`))
    .filter(a => a >= 0.5);            // los menores son fondos, no texto
  const menorAlfa = Math.min(...alfas);

  console.log('\n  contraste sobre cada parada del degradado:');
  console.log('    parada     blanco   texto velado (' + (menorAlfa * 100) + '%)');
  let peor = Infinity;
  for (const p of paradas) {
    const blanco = contraste('#ffffff', p);
    const suave = contraste(velado(menorAlfa, p), p);
    peor = Math.min(peor, blanco, suave);
    console.log(`    ${p}   ${blanco.toFixed(2).padStart(5)}:1   ${suave.toFixed(2).padStart(5)}:1`);
  }
  ok('todo el texto del panel pasa AA (4,5:1)', peor >= 4.5, `el peor da ${peor.toFixed(2)}:1`);
}

// --- 6. nada de estilos inline, que la CSP bloquearía ---------------------
{
  const html = leer('index.html');
  const pitch = html.slice(html.indexOf('auth-pitch'), html.indexOf('/.auth-split'));
  ok('la presentación no usa atributos style=', !/style="/.test(pitch));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
