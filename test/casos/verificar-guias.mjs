/* «Cómo usar»: una guía por sección, y cada una explica solo su pantalla.

   Antes era un solo texto que las recorría todas, con Análisis y Pendientes
   metidos adentro de la guía de Hábitos: para entender Pendientes había que
   atravesar las otras dos. Ahora el ☰ de cada sección ofrece la suya.

   El cajón es UNO SOLO —el mismo nodo en las tres pantallas—, así que lo que se
   comprueba acá es sobre todo que la entrada diga y abra la que corresponde a
   la sección desde la que se la tocó.

   Arnés: hoy = jueves 30 de julio de 2026. */
import { montar, leer } from '../harness.mjs';
import { ESTADO_LLENO } from '../escenarios.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const irA = (doc, page) => doc.querySelector(`.tabbar [data-page="${page}"]`).click();
const rotulo = doc => doc.querySelector('#guia-texto')?.textContent ?? '(sin rótulo)';
const destino = doc => doc.querySelector('#guia-link')?.getAttribute('href') ?? '';
const visible = doc => [...doc.querySelectorAll('#help [data-guia]')].filter(t => !t.hidden);
const texto = tarjeta => (tarjeta?.textContent ?? '').replace(/\s+/g, ' ');

// --- 1. cada sección ofrece la suya ----------------------------------------
{
  const { doc } = await montar(ESTADO_LLENO);

  for (const [page, nombre, ruta] of [
    ['home', 'Hábitos', 'comousar'],
    ['indicators', 'Análisis', 'comousar-analisis'],
    ['todos', 'Pendientes', 'comousar-pendientes'],
  ]) {
    irA(doc, page);
    ok(`en ${nombre} la entrada está`, doc.querySelector('#grupo-guia').hidden === false);
    ok(`  y dice cuál: «Cómo usar ${nombre}»`, rotulo(doc) === `Cómo usar ${nombre}`, rotulo(doc));
    /* Es un enlace de verdad: abrirlo en otra pestaña tiene que llevar a la
       guía que el rótulo promete, no a la primera de las tres. */
    ok('    apuntando a su propia ruta', destino(doc).endsWith(ruta), destino(doc));
  }

  // En Ajustes no hay guía: no es una pantalla que se explique, es una lista.
  irA(doc, 'settings');
  ok('en Ajustes no hay guía', doc.querySelector('#grupo-guia').hidden === true);
}

// --- 2. se abre la de la sección desde la que se tocó ----------------------
{
  const { doc } = await montar(ESTADO_LLENO);

  for (const [page, guia, titulo] of [
    ['home', 'home', 'Cómo usar Hábitos'],
    ['indicators', 'indicators', 'Cómo usar Análisis'],
    ['todos', 'todos', 'Cómo usar Pendientes'],
  ]) {
    irA(doc, page);
    doc.querySelector('#guia-link').click();

    const tarjetas = visible(doc);
    ok(`desde ${page} se abre la de ${guia}`,
      tarjetas.length === 1 && tarjetas[0].dataset.guia === guia,
      tarjetas.map(t => t.dataset.guia).join(',') || '(ninguna)');
    ok('  con su título', tarjetas[0]?.querySelector('h2')?.textContent === titulo,
      tarjetas[0]?.querySelector('h2')?.textContent);
    // La pestaña del navegador también dice cuál: son tres páginas distintas.
    ok('  y la pestaña lo nombra', doc.title === `${titulo.replace('Cómo usar ', 'Cómo usar ')} · Hábitos`
      || doc.title === `${titulo} · Hábitos`, doc.title);
  }
}

// --- 3. cada una habla SOLO de lo suyo -------------------------------------
{
  /* Lo que se comprueba es lo que NO está: una guía de Hábitos que explique los
     gráficos volvería a ser la guía única de antes con otro título. Se eligen
     palabras que solo pueden venir de la otra pantalla. */
  const { doc } = await montar(ESTADO_LLENO);
  const guia = clave => doc.querySelector(`#help [data-guia="${clave}"]`);

  const ajeno = {
    home: ['Cumplimiento mensual', 'Calendarizar', 'subcategoría', 'corona'],
    indicators: ['carrete', 'Plantillas', 'Calendarizar', 'Cumplimiento diario'],
    todos: ['Cumplimiento mensual', 'carrete', 'Plantillas', 'corona'],
  };

  for (const [clave, palabras] of Object.entries(ajeno)) {
    const cuerpo = texto(guia(clave));
    ok(`la guía de «${clave}» existe y dice algo`, cuerpo.length > 200, `${cuerpo.length} caracteres`);
    for (const palabra of palabras) {
      ok(`  y no habla de «${palabra}»`, !cuerpo.includes(palabra),
        cuerpo.slice(Math.max(0, cuerpo.indexOf(palabra) - 40), cuerpo.indexOf(palabra) + 40));
    }
  }

  /* Lo que no era de ninguna de las tres —la cuenta, instalar la app, la copia
     de seguridad— salió de la guía: cada una explica una pantalla. */
  const todo = texto(doc.querySelector('#help'));
  for (const palabra of ['Eliminar cuenta', 'Agregar a inicio', 'copia de seguridad']) {
    ok(`«${palabra}» ya no está en ninguna guía`, !todo.includes(palabra));
  }

  /* Pero el recordatorio sí se quedó: estaba enterrado adentro de «Instalarla en
     el teléfono» y es una entrada de este mismo ☰. */
  const habitos = texto(guia('home'));
  ok('el recordatorio sigue en la de Hábitos', /recordatorio/i.test(habitos),
    habitos.slice(0, 80));
}

// --- 4. una sola a la vez, y la URL manda ---------------------------------
{
  /* Las tres viven en el mismo documento: si se mostraran dos, la pantalla
     serían dos guías pegadas y nadie sabría dónde termina una. */
  const { doc } = await montar(ESTADO_LLENO, { ruta: 'comousar-pendientes' });

  const tarjetas = visible(doc);
  ok('entrar por la URL abre la que la URL dice',
    tarjetas.length === 1 && tarjetas[0].dataset.guia === 'todos',
    tarjetas.map(t => t.dataset.guia).join(',') || '(ninguna)');
  ok('  y la sección es la guía', doc.querySelector('#help').hidden === false);
  ok('  con las otras dos escondidas',
    doc.querySelectorAll('#help [data-guia]').length === 3,
    String(doc.querySelectorAll('#help [data-guia]').length));
}

{
  // La ruta vieja sigue valiendo y abre la de Hábitos, que es donde estaba.
  const { doc } = await montar(ESTADO_LLENO, { ruta: 'comousar' });
  const tarjetas = visible(doc);
  ok('la ruta de siempre abre la de Hábitos',
    tarjetas.length === 1 && tarjetas[0].dataset.guia === 'home',
    tarjetas.map(t => t.dataset.guia).join(',') || '(ninguna)');
}

// --- 5. los dibujos son los controles de verdad ----------------------------
{
  /* El «+» de la guía tiene que ser EL MISMO «+» del botón de la esquina, y
     los cuadrados de estado los mismos de la leyenda del pie. Un dibujo
     parecido pero distinto es una cosa más que aprender antes de encontrar el
     botón — y se desincroniza sin que nadie se entere. */
  const { doc } = await montar(ESTADO_LLENO);

  const trazo = sel => doc.querySelector(sel)?.querySelector('path')?.getAttribute('d');
  ok('el «+» de la guía es el trazo del botón de la esquina',
    Boolean(trazo('#btn-fab')) && trazo('#help .guia-fab') === trazo('#btn-fab'),
    `${trazo('#help .guia-fab')} vs ${trazo('#btn-fab')}`);

  /* La guía no repite la referencia de los cuatro colores: el recuadro los
     recorre, y la referencia vive al pie de la lista, que es donde se la
     necesita —con los hábitos delante—. */
  ok('  y no repite la referencia de colores del pie',
    doc.querySelectorAll('#help .chip').length === 0
      && doc.querySelectorAll('#legend .chip').length === 4,
    `guía: ${doc.querySelectorAll('#help .chip').length} · pie: ${doc.querySelectorAll('#legend .chip').length}`);

  /* El recuadro de la guía recorre los estados solo. Los colores del ciclo
     tienen que ser LOS MISMOS que los de la lista: si alguien cambia el verde
     de la app, la guía enseñaría un verde que ya no existe. */
  const css = leer('styles.css');
  const ciclo = css.match(/@keyframes guia-ciclo \{[\s\S]*?\n\}/)?.[0] ?? '';
  ok('el recuadro de la guía cicla los estados', Boolean(ciclo), '(sin @keyframes)');
  ok('  y está enganchado al recuadro',
    /\n\.guia-celda \{[^}]*animation:\s*guia-ciclo/.test(css),
    css.match(/\n\.guia-celda \{[^}]*\}/)?.[0]?.replace(/\s+/g, ' '));

  const celda = css.match(/\n\.dia-fila \.cell\.st-done[^\n]*\n[^\n]*\n[^\n]*/)?.[0] ?? '';
  for (const color of ['--done-bg', '--partial-bg', '--missed-bg']) {
    ok(`  con el ${color} de la lista`,
      celda.includes(color) && ciclo.includes(color),
      `lista: ${celda.includes(color)} · guía: ${ciclo.includes(color)}`);
  }

  /* Un segundo quieto y un segundo fundiendo, cinco veces: diez segundos. */
  const vuelta = css.match(/\n\.guia-celda \{ animation: guia-ciclo ([\d.]+)s/)?.[1];
  ok('  dando la vuelta en diez segundos', vuelta === '10', `${vuelta}s`);
  ok('    con los cinco estados repartidos parejo',
    ['0%,  10%', '20%, 30%', '40%, 50%', '60%, 70%', '80%, 90%'].every(p => ciclo.includes(p)),
    ciclo.replace(/\s+/g, ' '));

  /* La regla del final del archivo le pone `.01ms` a TODA animación cuando el
     sistema pide reducir movimiento. Está para que nada se sacuda, pero a un
     ciclo infinito lo deja girando cien mil veces por segundo — que no es
     quieto, es un color embarrado— y el paso queda mostrando un solo estado de
     los cinco. Acá no se mueve nada: un recuadro cambia de color en su lugar,
     y ese cambio es el contenido del paso. Por eso se le gana con `!important`
     y por eso hay un caso: sin él, la próxima vez que alguien toque la regla
     general el recuadro se vuelve a clavar en un color y nadie se entera. */
  ok('  y la duración le gana al freno general de «reducir movimiento»',
    /\n\.guia-celda \{ animation-duration: 10s !important; \}/.test(css),
    css.match(/\n\.guia-celda \{[^}]*important[^}]*\}/)?.[0] ?? '(sin la regla)');
}

// --- 6. un dibujo y una frase, y nada más ---------------------------------
{
  /* Nadie abre «Cómo usar» para leer: se abre con una duda concreta y con la
     app delante. Un paso que se estira deja de ser un paso, y una guía que se
     estira deja de leerse. Antes la de Hábitos tenía casi 4.000 caracteres y
     explicaba además Análisis, Pendientes, la cuenta y cómo instalar la app.

     Los topes son generosos a propósito: no están para pulir la redacción,
     sino para que la guía no vuelva a convertirse en un manual sin que nadie
     lo note. */
  const { doc } = await montar(ESTADO_LLENO);

  for (const clave of ['home', 'indicators', 'todos']) {
    const tarjeta = doc.querySelector(`#help [data-guia="${clave}"]`);
    const largo = texto(tarjeta).length;
    ok(`la guía de «${clave}» entra en una pantalla`, largo < 1200, `${largo} caracteres`);

    const frases = [...tarjeta.querySelectorAll('p')].map(p => p.textContent.trim());
    const larga = frases.reduce((peor, f) => (f.length > peor.length ? f : peor), '');
    ok('  con un renglón por paso', larga.length < 200, `${larga.length}: ${larga.slice(0, 60)}…`);
    ok('  y sin subtítulos que dividan la lectura',
      tarjeta.querySelectorAll('h3').length === 0,
      String(tarjeta.querySelectorAll('h3').length));
  }
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
