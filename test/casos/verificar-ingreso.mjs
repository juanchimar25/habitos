/* Entrar y salir: qué queda en pantalla y en qué sección abre la app.

   Se ejecuta `auth.js` de verdad con el doble de `auth-doble.mjs`, porque las
   dos cosas que se comprueban acá viven entre los dos módulos: `auth.js` decide
   cuándo hay sesión y `app.js` decide qué se dibuja.

   Las dos nacieron de un mismo síntoma —«inicio sesión y me deja en Ajustes sin
   poder tocar nada, hasta que cierro y abro»— que eran dos fallas encimadas: el
   formulario quedaba abierto (y un `<dialog>` modal deja inerte al resto del
   documento) y la ruta seguía en `/ajustes`, que es donde vive el botón de
   salir. */
import { montarAuth, SESION, esperar } from '../auth-doble.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

const abierto = doc => doc.querySelector('#auth-dialog').open === true;
const ruta = win => win.location.pathname;

// --- 1. sin sesión: la puerta se ve y el formulario está guardado ---------
{
  const a = await montarAuth();
  ok('la puerta está a la vista', a.doc.querySelector('#auth-gate').hidden === false);
  ok('  con la app escondida detrás', a.doc.querySelector('#app-root').hidden === true);
  ok('  y el formulario cerrado', abierto(a.doc) === false);

  a.doc.querySelector('#btn-ingresar').click();
  ok('el botón del banner lo abre', abierto(a.doc) === true);
}

// --- 2. al entrar, el formulario se cierra -------------------------------
{
  /* La falla: `showModal` pone el diálogo en la capa de arriba y deja INERTE
     todo lo demás. Esconder la puerta no alcanza —el diálogo está adentro de
     ella—, así que la app se veía dibujada y no respondía a un solo clic. */
  const a = await montarAuth();
  a.doc.querySelector('#btn-ingresar').click();
  ok('con el formulario abierto…', abierto(a.doc) === true);

  a.emitir('SIGNED_IN', SESION);
  await esperar();

  ok('…entrar lo cierra', abierto(a.doc) === false);
  ok('  y deja la app a la vista', a.doc.querySelector('#app-root').hidden === false);
  ok('  con la puerta guardada', a.doc.querySelector('#auth-gate').hidden === true);
}

// --- 3. la ruta compartida se respeta al entrar --------------------------
{
  /* Lo de abajo NO puede arreglarse mandando siempre al diario: quien abre un
     enlace a otra sección estando afuera tiene que llegar ahí al identificarse.
     Por eso la vuelta al diario cuelga de la salida y no del arranque. */
  const a = await montarAuth({ url: 'https://ejemplo.test/pendientes' });
  a.emitir('SIGNED_IN', SESION);
  await esperar();

  ok('entrar por un enlace abre esa sección',
    a.doc.querySelector('#todos').hidden === false, ruta(a.doc.defaultView));
  ok('  y la ruta se mantiene', ruta(a.doc.defaultView) === '/pendientes',
    ruta(a.doc.defaultView));
}

// --- 4. salir devuelve la ruta al diario ---------------------------------
{
  /* El botón de salir vive en Ajustes: sin esto la ruta quedaba en `/ajustes` y
     el ingreso siguiente abría ahí, que es lo que se veía. */
  const a = await montarAuth({ url: 'https://ejemplo.test/ajustes' });
  a.emitir('SIGNED_IN', SESION);
  await esperar();
  ok('estando en Ajustes…', a.doc.querySelector('#settings').hidden === false,
    ruta(a.doc.defaultView));

  a.doc.querySelector('#btn-sign-out').click();
  await esperar();
  await esperar();

  ok('…salir pide la salida a Supabase', a.llamadas.some(l => l[0] === 'signOut'));
  ok('  y deja la ruta en el diario', ruta(a.doc.defaultView) === '/diario',
    ruta(a.doc.defaultView));
  ok('  con la puerta otra vez a la vista',
    a.doc.querySelector('#auth-gate').hidden === false);

  // Y el ingreso siguiente abre en el día de hoy, que era el pedido.
  a.emitir('SIGNED_IN', SESION);
  await esperar();
  ok('el ingreso siguiente abre en Hábitos',
    a.doc.querySelector('#settings').hidden === true
      && a.doc.querySelector('#todos').hidden === true,
    ruta(a.doc.defaultView));
  ok('  con la sección marcada en la barra',
    a.doc.querySelector('[data-page="home"]').getAttribute('aria-current') === 'page');
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
