/* ============================================================
   Par de claves VAPID — la identidad de este servidor de push
   ------------------------------------------------------------
     node tools/generar-vapid.mjs

   Web Push exige que quien manda la notificación se identifique
   con una firma. VAPID es ese mecanismo: un par de claves sobre
   la curva P-256, de las que

     · la PÚBLICA va en `config.js` y viaja al navegador. Es la
       que se le pasa a `pushManager.subscribe`, y el navegador
       la ata a la suscripción: solo quien tenga la privada podrá
       mandarle algo a ese endpoint.

     · la PRIVADA va como secreto de la Edge Function y NO SE
       VERSIONA. Con ella, cualquiera puede mandarle notificaciones
       a los suscriptores de esta app.

   Se generan UNA VEZ. Cambiarlas invalida todas las suscripciones
   existentes: los navegadores rechazan los envíos firmados con
   una clave distinta de la que registraron, y cada usuario tendría
   que volver a activar el recordatorio.

   Sin dependencias: `node:crypto` trae P-256, que es la única
   curva que Web Push admite.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairSync, sign, verify } from 'node:crypto';

/** base64url: como base64 pero sin `+`, `/` ni relleno. Es lo que pide el RFC. */
const b64url = buf => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

/* La pública se exporta en DER y se recorta el encabezado: lo que Web Push
   quiere son los 65 bytes crudos del punto —`0x04` seguido de X e Y—, no la
   envoltura SPKI. El punto siempre son los últimos 65. */
const spki = publicKey.export({ type: 'spki', format: 'der' });
const puntoPublico = spki.subarray(spki.length - 65);

if (puntoPublico[0] !== 0x04) {
  console.error('La clave pública no salió en formato sin comprimir. Abortando.');
  process.exit(1);
}

/* La privada es el escalar `d`, 32 bytes. El JWK lo trae ya aislado y en
   base64url, así que no hay que andar recortando DER a mano. */
const jwk = privateKey.export({ format: 'jwk' });

/* Antes de imprimir nada: que el par sirva de verdad. Una clave mal exportada
   no se nota hasta que el servidor de push rechaza la firma, en producción y
   sobre suscripciones que ya se hicieron — y para entonces regenerarlas
   obliga a todos a volver a activar el recordatorio. */
const prueba = Buffer.from('vapid');
const firma = sign(null, prueba, { key: privateKey, dsaEncoding: 'ieee-p1363' });
const valida = verify(null, prueba, { key: publicKey, dsaEncoding: 'ieee-p1363' }, firma);

if (!valida || firma.length !== 64) {
  console.error('El par generado no verifica su propia firma. Abortando.');
  process.exit(1);
}

const publica = b64url(puntoPublico);

/* La pública se escribe sola en `config.js`. Copiarla a mano son 87 caracteres
   sin espacios, y un solo carácter cambiado no falla acá: falla cuando el
   navegador rechaza la suscripción, o —peor— cuando el servidor de push
   devuelve 401 sobre suscripciones que ya se hicieron. */
const RUTA_CONFIG = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'config.js',
);

const config = fs.readFileSync(RUTA_CONFIG, 'utf8');
const RE_CLAVE = /(window\.VAPID_PUBLIC_KEY\s*=\s*")([^"]*)(")/;

let aviso;
if (!RE_CLAVE.test(config)) {
  aviso = `⚠ No encontré «window.VAPID_PUBLIC_KEY» en config.js. Pegala a mano:

    window.VAPID_PUBLIC_KEY = "${publica}";`;
} else {
  const anterior = RE_CLAVE.exec(config)[2];
  fs.writeFileSync(RUTA_CONFIG, config.replace(RE_CLAVE, `$1${publica}$3`));
  aviso = anterior && !anterior.startsWith('PEGAR')
    ? `✓ config.js actualizado. OJO: PISÓ una clave que ya estaba, así que las
  suscripciones hechas con la anterior dejan de recibir avisos.`
    : '✓ config.js actualizado con la clave pública.';
}

/* La privada se escribe en un archivo y no en la consola. Lo que se imprime
   termina en el scrollback de la terminal y en cualquier captura de pantalla;
   un archivo ignorado por git se copia una vez y se borra. */
const RUTA_SECRETOS = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'vapid-secretos.txt',
);

fs.writeFileSync(RUTA_SECRETOS, `# Comandos para cargar los secretos de la Edge Function.
# Generados el ${new Date().toISOString()}.
#
# Este archivo contiene la CLAVE PRIVADA. Está en .gitignore, así que no se
# versiona — pero tampoco lo pegues en un chat, un issue ni una captura: con
# ella cualquiera puede mandarle notificaciones a los usuarios de la app.
#
# Cambiá el correo del subject, corré los tres comandos y borrá el archivo.

npx supabase secrets set VAPID_PRIVATE_KEY="${jwk.d}"
npx supabase secrets set VAPID_PUBLIC_KEY="${publica}"
npx supabase secrets set VAPID_SUBJECT="mailto:TU-CORREO@ejemplo.com"
`);

console.log(`
Par VAPID generado. ${aviso}

Se usa UNA VEZ: regenerarlo invalida todas las suscripciones activas y cada
persona tendría que volver a activar su recordatorio.

──────────────────────────────────────────────────────────────────────────
Los comandos para cargar los secretos quedaron en

  vapid-secretos.txt

La CLAVE PRIVADA está ahí y NO se imprime acá a propósito: lo que sale por
consola queda en el historial de la terminal y en cualquier captura de
pantalla. Ese archivo está en .gitignore.

  1. Abrilo, cambiá el correo del subject y corré los tres comandos.
  2. Borralo.

La pública ya quedó en config.js. Esa sí es pública, como la anon key:
  ${publica}
──────────────────────────────────────────────────────────────────────────
`);
