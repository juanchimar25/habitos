/* El día de hoy, el alta de tarea y la vista activa deben resolver al mismo
   color que la palabra «Hábitos», en los dos temas, con texto legible encima. */
import { leer } from '../harness.mjs';

const css = leer('styles.css');

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

/** Valores de las variables de un bloque, con `var(--x)` resuelto. */
function tokens(selector) {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');
  const bloque = css.match(new RegExp(`${escapado}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1];
  if (bloque === undefined) {
    console.error(`No se encontró el bloque «${selector}» en styles.css`);
    process.exit(2);
  }
  const crudos = Object.fromEntries(
    [...bloque.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  if (!Object.keys(crudos).length) {
    console.error(`El bloque «${selector}» no declaró ninguna variable: el regex falló`);
    process.exit(2);
  }
  return { crudos, bloque };
}

const claro = tokens(':root');
const oscuro = tokens(':root[data-theme="dark"]');

// Salvaguarda: si los dos temas resolvieran igual, es que uno no se leyó.
if (claro.crudos['--brand-text'] === oscuro.crudos['--brand-text']) {
  console.error('Los dos temas dieron el mismo --brand-text: la lectura está mal');
  process.exit(2);
}

/** Resuelve una variable mirando primero el tema y cayendo en :root. */
const valor = (tema, nombre) => {
  let v = tema.crudos[nombre] ?? claro.crudos[nombre];
  const ref = v?.match(/^var\((--[\w-]+)\)$/);
  return ref ? valor(tema, ref[1]) : v;
};

const lum = h => {
  const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

for (const [nombre, tema] of [['CLARO', claro], ['OSCURO', oscuro]]) {
  const marca = valor(tema, '--brand-text');
  const hoy = valor(tema, '--today');
  const fg = valor(tema, '--today-fg');
  const r = contraste(fg, hoy);

  console.log(`\n=== tema ${nombre} ===`);
  console.log(`  --brand-text  ${marca}`);
  console.log(`  --today       ${hoy}`);
  console.log(`  --today-fg    ${fg}   (${r.toFixed(2)}:1 sobre el relleno)`);

  ok(`  ${nombre}: el día de hoy usa el color de la marca`, hoy === marca, `${hoy} vs ${marca}`);
  ok(`  ${nombre}: el texto encima llega a AA (4,5:1)`, r >= 4.5, `${r.toFixed(2)}:1`);
}

// --- las tres superficies leen las mismas variables -------------------------
const superficies = [
  ['marcador del día actual', /\.col-day\.is-today \.dnum \{[^}]*\}/],
  ['botón + Agregar tarea', /\.btn-today \{[^}]*\}/],
  ['vista activa del selector', /\.seg\[aria-pressed="true"\] \{[^}]*\}/],
];

console.log('\n=== las tres superficies ===');
for (const [nombre, re] of superficies) {
  const regla = css.match(re)?.[0] ?? '';
  const usaFondo = /background:\s*var\(--today\)/.test(regla);
  const usaTexto = /color:\s*var\(--today-fg\)/.test(regla);
  ok(`  ${nombre}`, usaFondo && usaTexto,
    `fondo:${usaFondo ? 'ok' : 'NO'} texto:${usaTexto ? 'ok' : 'NO'}`);
}

// --- no debe quedar blanco fijo sobre esos rellenos ------------------------
const conBlancoFijo = superficies.filter(([, re]) => /color:\s*#fff/.test(css.match(re)?.[0] ?? ''));
ok('  ninguna deja el blanco fijo', conBlancoFijo.length === 0,
  conBlancoFijo.map(s => s[0]).join(', ') || '(ninguna)');

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
