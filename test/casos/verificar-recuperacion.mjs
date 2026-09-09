/* Recuperación de contraseña, de punta a punta: pedir el correo, volver desde
   el enlace y guardar la contraseña nueva.

   Se ejecuta `auth.js` de verdad, con el doble de `auth-doble.mjs`: lo que se
   comprueba es NUESTRO cableado —qué se llama, con qué, y qué queda en
   pantalla—, sin tocar la red. */
import { montarAuth, SESION, enviar, esperar } from '../auth-doble.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

// --- 1. el enlace existe y solo en el inicio de sesión --------------------
{
  const a = await montarAuth();
  ok('el enlace está en la pantalla', Boolean(a.doc.querySelector('#auth-forgot')));
  ok('dice «¿Olvidaste tu contraseña?»',
    a.doc.querySelector('#auth-forgot').textContent.trim() === '¿Olvidaste tu contraseña?');
  ok('se ve al iniciar sesión', a.modo().olvidaste === true);

  a.doc.querySelector('#auth-toggle').click();
  ok('se esconde al crear cuenta', a.modo().olvidaste === false);
  ok('y el modo cambió a crear', a.modo().enviar === 'Crear cuenta', a.modo().enviar);
}

// --- 2. el modo recuperar solo pide el email ------------------------------
{
  const a = await montarAuth();
  a.doc.querySelector('#auth-email').value = 'ana@ejemplo.com';
  a.doc.querySelector('#auth-forgot').click();

  const m = a.modo();
  console.log('  modo recuperar:', JSON.stringify(m));
  ok('cambia el título', m.titulo === 'Recuperar acceso', m.titulo);
  ok('pide el email', m.email === true);
  ok('esconde la contraseña', m.password === false);
  ok('el botón dice enviar', m.enviar === 'Enviar correo', m.enviar);
  ok('ofrece volver', m.alterno === 'Volver a iniciar sesión', String(m.alterno));
  ok('conserva el email ya escrito',
    a.doc.querySelector('#auth-email').value === 'ana@ejemplo.com');
}

// --- 3. envía el correo con el destino de vuelta --------------------------
{
  const a = await montarAuth();
  a.doc.querySelector('#auth-forgot').click();
  a.doc.querySelector('#auth-email').value = 'ana@ejemplo.com';
  enviar(a.doc);
  await esperar();

  const reset = a.llamadas.find(l => l[0] === 'reset');
  ok('llama a resetPasswordForEmail', Boolean(reset));
  ok('con el email escrito', reset?.[1] === 'ana@ejemplo.com', String(reset?.[1]));
  ok('y con un redirectTo', Boolean(reset?.[2]?.redirectTo), String(reset?.[2]?.redirectTo));

  const aviso = a.doc.querySelector('#auth-notice');
  ok('avisa en pantalla', aviso.hidden === false);
  /* No confirma si la cuenta existe: hacerlo convertiría la pantalla en un
     verificador de quién está registrado. */
  ok('sin confirmar que la cuenta exista', /^Si hay una cuenta/.test(aviso.textContent),
    aviso.textContent.slice(0, 45) + '…');
}

// --- 4. sin email no se envía nada ----------------------------------------
{
  const a = await montarAuth();
  a.doc.querySelector('#auth-forgot').click();
  a.doc.querySelector('#auth-email').value = '';
  enviar(a.doc);
  await esperar();

  ok('no llama a Supabase', !a.llamadas.some(l => l[0] === 'reset'));
  ok('y muestra el error', a.doc.querySelector('#auth-error').hidden === false,
    a.doc.querySelector('#auth-error').textContent);
}

// --- 5. volver desde el enlace NO abre la app -----------------------------
{
  const a = await montarAuth();
  a.emitir('PASSWORD_RECOVERY', SESION);

  const m = a.modo();
  console.log('  tras el enlace:', JSON.stringify(m));
  ok('la puerta sigue cerrada', m.puertaAbierta === false);
  ok('pide la contraseña nueva', m.titulo === 'Elegí una contraseña nueva', m.titulo);
  ok('sin pedir el email', m.email === false);
  ok('con el campo de contraseña', m.password === true);
  ok('rotulado como nueva',
    a.doc.querySelector('#auth-password-label').textContent === 'Contraseña nueva');
  ok('el navegador la trata como nueva',
    a.doc.querySelector('#auth-password').getAttribute('autocomplete') === 'new-password');
  ok('sin salida alterna', m.alterno === null, String(m.alterno));
  ok('la app sigue oculta', a.doc.querySelector('#app-root').hidden === true);
}

// --- 6. guardar la contraseña nueva abre la app ---------------------------
{
  const a = await montarAuth();
  a.emitir('PASSWORD_RECOVERY', SESION);
  a.doc.querySelector('#auth-password').value = 'unaNueva123';
  enviar(a.doc);
  await esperar();
  await esperar();

  const upd = a.llamadas.find(l => l[0] === 'updateUser');
  ok('llama a updateUser', Boolean(upd));
  ok('con la contraseña escrita', upd?.[1]?.password === 'unaNueva123');
  ok('la puerta se abre', a.doc.querySelector('#auth-gate').hidden === true);
  ok('y la app aparece', a.doc.querySelector('#app-root').hidden === false);
  ok('el campo queda vacío', a.doc.querySelector('#auth-password').value === '');
  ok('vuelve al modo iniciar sesión',
    a.doc.querySelector('#auth-title').textContent === 'Iniciar sesión');
}

// --- 7. sin contraseña no se guarda ---------------------------------------
{
  const a = await montarAuth();
  a.emitir('PASSWORD_RECOVERY', SESION);
  a.doc.querySelector('#auth-password').value = '';
  enviar(a.doc);
  await esperar();

  ok('no llama a updateUser', !a.llamadas.some(l => l[0] === 'updateUser'));
  ok('muestra el error', a.doc.querySelector('#auth-error').hidden === false);
  ok('y la puerta sigue cerrada', a.doc.querySelector('#auth-gate').hidden === false);
}

// --- 8. una sesión normal sí entra ----------------------------------------
{
  const a = await montarAuth();
  a.emitir('SIGNED_IN', SESION);
  ok('el inicio de sesión normal abre la app',
    a.doc.querySelector('#auth-gate').hidden === true
    && a.doc.querySelector('#app-root').hidden === false);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
