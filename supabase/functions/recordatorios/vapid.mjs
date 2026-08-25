/* ============================================================
   Firma VAPID — la parte criptográfica, aparte y sin runtime
   ------------------------------------------------------------
   Vive en su propio archivo, y en `.mjs` en vez de `.ts`, para
   poder EJECUTARSE FUERA DE DENO: `test/vapid.mjs` la prueba con
   Node. Es la pieza más fácil de equivocar de todo el push y la
   más cara de depurar —un JWT mal armado no falla acá, falla en
   el servidor de Google con un 401 y sobre suscripciones que ya
   se hicieron.

   Todo lo que usa es estándar y existe igual en los dos lados:
   `crypto.subtle`, `atob`, `btoa` y `TextEncoder`. Sin imports.
   ============================================================ */

/** base64url → bytes. Repone el relleno que base64url no lleva. */
export function b64urlToBytes(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const conRelleno = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
  return Uint8Array.from(atob(conRelleno), c => c.charCodeAt(0));
}

/**
 * bytes → base64url, sin relleno, que es lo que piden JWS y VAPID.
 *
 * Acepta `ArrayBuffer` —lo que devuelve `crypto.subtle.sign`— y cualquier
 * vista, incluido un `Buffer` de Node. Ojo con la vista: su `.buffer` es el
 * ArrayBuffer ENTERO, no el tramo que representa, así que hay que pasarle
 * también el offset y el largo. Sin eso, un `subarray` se codifica completo y
 * la clave sale mal.
 */
export function bytesToB64url(b) {
  const bytes = b instanceof Uint8Array ? b
    : b instanceof ArrayBuffer ? new Uint8Array(b)
      : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);

  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Importa el par VAPID como clave de firma ES256.
 *
 * La privada es el escalar `d`; la pública, el punto sin comprimir de 65 bytes
 * (`0x04 || X || Y`). WebCrypto no acepta el escalar suelto: pide el JWK con
 * `x` e `y`, que salen de partir ese punto.
 */
export async function importarClaveVapid(privadaB64, publicaB64) {
  const priv = b64urlToBytes(privadaB64);
  const pub = b64urlToBytes(publicaB64);

  if (priv.length !== 32) throw new Error(`la privada mide ${priv.length} bytes, no 32`);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error('la pública no es un punto P-256 sin comprimir de 65 bytes');
  }

  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      d: bytesToB64url(priv),
      x: bytesToB64url(pub.slice(1, 33)),
      y: bytesToB64url(pub.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * El JWT que identifica a este servidor ante el servicio de push.
 *
 * `aud` es el ORIGEN del endpoint y no el endpoint entero: firmar la URL
 * completa hace que el servidor devuelva 401. `exp` no puede pasarse de 24
 * horas; se usan 12, que sobra para una vuelta del cron.
 *
 * @param audienciaUrl el endpoint de la suscripción; de acá sale el origen.
 */
export async function armarJwtVapid(clave, audienciaUrl, subject, ahora = Date.now()) {
  const enc = new TextEncoder();
  const cabecera = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = bytesToB64url(enc.encode(JSON.stringify({
    aud: new URL(audienciaUrl).origin,
    exp: Math.floor(ahora / 1000) + 12 * 60 * 60,
    sub: subject,
  })));

  /* WebCrypto devuelve la firma en crudo —r||s, 64 bytes—, que es justo lo que
     pide JWS. La API de Node sin `dsaEncoding` la daría en DER y habría que
     convertirla; por eso acá se usa `crypto.subtle` en los dos lados. */
  const firma = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    clave,
    enc.encode(`${cabecera}.${cuerpo}`),
  );

  return `${cabecera}.${cuerpo}.${bytesToB64url(firma)}`;
}

/**
 * ¿A esta hora local, con este desfase, le toca el aviso ahora?
 *
 * La hora guardada es la que la persona ve en su reloj; el servidor corre en
 * UTC. `utcOffset` son los minutos que hay que SUMARLE a la hora local para
 * llegar a UTC, que es lo que devuelve `getTimezoneOffset` en el navegador.
 *
 * La ventana existe porque el cron dispara cada cinco minutos: sin ella, una
 * hora elegida a las 21:03 no coincidiría nunca con un disparo.
 *
 * Va HACIA ADELANTE —«la hora ya pasó, hace menos de `ventana` minutos»— y no
 * a ambos lados. Una ventana simétrica mide el doble que el intervalo del
 * cron, así que DOS disparos seguidos caen adentro y el recordatorio llega
 * repetido. Con esta, cae exactamente uno, sea cual sea el minuto elegido.
 *
 * El módulo cubre la vuelta de la medianoche: con el objetivo en 00:00, a las
 * 23:58 la hora todavía no llegó —faltan dos minutos, no pasaron 1438.
 */
export function leToca(hora, utcOffset, ahora = new Date(), ventana = 5) {
  const [h, m] = String(hora).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false;

  const enUtc = (((h * 60 + m + utcOffset) % 1440) + 1440) % 1440;
  const minutosUtc = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();

  const desde = (((minutosUtc - enUtc) % 1440) + 1440) % 1440;
  return desde < ventana;
}
