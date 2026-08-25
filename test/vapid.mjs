/* ============================================================
   Guarda de la firma VAPID
   ------------------------------------------------------------
   La firma del push es la pieza más cara de equivocar de todo el
   recordatorio: no falla acá, falla en el servidor de push con un
   401 seco, en producción, y sobre suscripciones que ya se
   hicieron. Nadie se entera hasta que alguien avisa que dejó de
   recibir el recordatorio.

   `supabase/functions/recordatorios/vapid.mjs` está aparte y sin
   nada propio de Deno justamente para poder ejecutarse acá con
   Node: las dos runtimes traen `crypto.subtle`, `atob` y `btoa`.

   Se verifica contra un par generado al vuelo, y la firma se
   valida con la clave pública — que es exactamente lo que hace el
   servidor de push del otro lado.
   ============================================================ */

import { generateKeyPairSync, webcrypto } from 'node:crypto';
import {
  armarJwtVapid, b64urlToBytes, bytesToB64url, importarClaveVapid, leToca,
} from '../supabase/functions/recordatorios/vapid.mjs';

let fallos = 0;
const ok = (n, cond, det = '') => {
  console.log(`${cond ? '  OK  ' : ' FALLA'} ${n}${det ? ' → ' + det : ''}`);
  if (!cond) fallos++;
};

/** Un par VAPID como el que produce `tools/generar-vapid.mjs`. */
function parVapid() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  return {
    publica: bytesToB64url(spki.subarray(spki.length - 65)),
    privada: privateKey.export({ format: 'jwk' }).d,
    publicKey,
  };
}

// --- ida y vuelta de base64url ---------------------------------------------
{
  /* Es donde más fácil se cuela un error: base64url no lleva relleno y cambia
     dos caracteres. Un `+` o un `/` sin traducir rompen la firma entera. */
  const casos = [[0], [0, 255], [1, 2, 3], [251, 252, 253, 254, 255]];
  const vuelven = casos.every(bytes => {
    const ida = bytesToB64url(Uint8Array.from(bytes));
    return [...b64urlToBytes(ida)].join(',') === bytes.join(',');
  });
  ok('base64url ida y vuelta', vuelven);

  const largo = bytesToB64url(Uint8Array.from({ length: 65 }, (_, i) => i));
  ok('sin relleno ni caracteres de base64 común', /^[A-Za-z0-9_-]+$/.test(largo), largo.slice(-8));
}

// --- la clave se importa y firma ------------------------------------------
{
  const { publica, privada } = parVapid();
  const clave = await importarClaveVapid(privada, publica);
  ok('la clave VAPID se importa', Boolean(clave));

  const jwt = await armarJwtVapid(clave, 'https://fcm.googleapis.com/fcm/send/abc123', 'mailto:a@b.c');
  const partes = jwt.split('.');
  console.log(`\n=== JWT ===\n  ${jwt.slice(0, 72)}…`);

  ok('tiene tres partes', partes.length === 3, String(partes.length));

  const cabecera = JSON.parse(Buffer.from(b64urlToBytes(partes[0])).toString('utf8'));
  const cuerpo = JSON.parse(Buffer.from(b64urlToBytes(partes[1])).toString('utf8'));
  console.log(`  cabecera: ${JSON.stringify(cabecera)}`);
  console.log(`  cuerpo:   ${JSON.stringify(cuerpo)}`);

  ok('firmado con ES256', cabecera.alg === 'ES256' && cabecera.typ === 'JWT',
    JSON.stringify(cabecera));

  /* `aud` es el ORIGEN, no el endpoint entero. Mandar la URL completa hace que
     el servidor de push devuelva 401, y es un error clásico. */
  ok('la audiencia es el origen, no el endpoint',
    cuerpo.aud === 'https://fcm.googleapis.com', cuerpo.aud);
  ok('con el subject declarado', cuerpo.sub === 'mailto:a@b.c', cuerpo.sub);

  const horas = (cuerpo.exp - Math.floor(Date.now() / 1000)) / 3600;
  ok('caduca dentro de las 24 horas que admite el estándar', horas > 0 && horas <= 24,
    `${horas.toFixed(1)} h`);
}

// --- la firma verifica con la clave pública -------------------------------
{
  /* Esto es lo que hace el servidor de push: toma `k=` del header, y con esa
     clave verifica la firma del JWT. Si no cierra, 401. */
  const { publica, privada } = parVapid();
  const clave = await importarClaveVapid(privada, publica);
  const jwt = await armarJwtVapid(clave, 'https://updates.push.services.mozilla.com/wpush/v2/xyz', 'mailto:a@b.c');

  const [cab, cue, firma] = jwt.split('.');
  const pub = b64urlToBytes(publica);

  const clavePublica = await webcrypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC', crv: 'P-256',
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );

  const valida = await webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    clavePublica,
    b64urlToBytes(firma),
    new TextEncoder().encode(`${cab}.${cue}`),
  );

  console.log('\n=== verificación con la pública ===');
  ok('la firma verifica', valida === true, String(valida));
  ok('y mide 64 bytes, en crudo y no en DER', b64urlToBytes(firma).length === 64,
    String(b64urlToBytes(firma).length));

  // Un byte cambiado tiene que invalidarla: si no, no se está verificando nada.
  const rota = b64urlToBytes(firma);
  rota[0] ^= 0xff;
  const invalida = await webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, clavePublica, rota,
    new TextEncoder().encode(`${cab}.${cue}`),
  );
  ok('y una firma alterada no pasa', invalida === false, String(invalida));
}

// --- claves mal formadas se rechazan al importar --------------------------
{
  const { publica, privada } = parVapid();
  const falla = async (n, priv, pub) => {
    try {
      await importarClaveVapid(priv, pub);
      ok(n, false, 'no lanzó');
    } catch (err) {
      ok(n, true, err.message);
    }
  };
  console.log('\n=== claves inválidas ===');
  await falla('  una privada corta se rechaza', bytesToB64url(new Uint8Array(31)), publica);
  await falla('  una pública sin el 0x04 se rechaza', privada,
    bytesToB64url(Uint8Array.from({ length: 65 }, () => 1)));
}

// --- a quién le toca -------------------------------------------------------
{
  /* La hora guardada es la local; el servidor corre en UTC. Buenos Aires es
     UTC-3, así que `getTimezoneOffset` devuelve 180: hay que sumarle 180
     minutos a la hora local para llegar a UTC. Las 21:00 de allá son las
     00:00 UTC del día siguiente. */
  const utc = (h, m = 0) => new Date(Date.UTC(2026, 7, 24, h, m));
  console.log('\n=== a quién le toca (hora local 21:00, UTC-3) ===');

  ok('  a las 00:00 UTC sí', leToca('21:00', 180, utc(0)) === true);
  ok('  a las 00:04 UTC todavía', leToca('21:00', 180, utc(0, 4)) === true);
  ok('  a las 00:05 UTC ya no', leToca('21:00', 180, utc(0, 5)) === false);
  ok('  a las 21:00 UTC no —esa es otra hora—', leToca('21:00', 180, utc(21)) === false);

  /* La ventana va hacia adelante: antes de la hora no dispara. Si mirara a los
     dos lados mediría diez minutos —el doble que el intervalo del cron— y el
     aviso saldría dos veces. */
  ok('  a las 23:58 UTC todavía no llegó', leToca('21:00', 180, utc(23, 58)) === false);
  ok('  ni a las 23:59', leToca('21:00', 180, utc(23, 59)) === false);

  /* Lo que de verdad importa: sobre los disparos REALES del cron —cada cinco
     minutos, en punto— tiene que dar exactamente uno por día. Es la
     comprobación que hubiera evitado el aviso repetido. */
  console.log('\n=== una sola vez por día, sobre los disparos del cron ===');
  for (const [hora, offset, etiqueta] of [
    ['21:00', 180, 'hora en punto, UTC-3'],
    ['21:03', 180, 'hora fuera de la grilla del cron'],
    ['03:00', -180, 'cruzando la medianoche, UTC+3'],
    ['00:00', 0, 'medianoche exacta, UTC'],
  ]) {
    let veces = 0;
    for (let min = 0; min < 1440; min += 5) {          // el cron: */5
      if (leToca(hora, offset, utc(Math.floor(min / 60), min % 60))) veces++;
    }
    ok(`  ${etiqueta}: dispara una sola vez`, veces === 1, `${veces} veces`);
  }

  ok('  una hora ilegible no dispara nada', leToca('cualquiera', 0, utc(0)) === false);
  ok('  con offset 0 la hora local es la UTC', leToca('08:00', 0, utc(8)) === true);
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo en verde.');
process.exit(fallos ? 1 : 0);
