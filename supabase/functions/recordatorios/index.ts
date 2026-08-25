/* ============================================================
   Recordatorio diario — la parte que corre en el servidor
   ------------------------------------------------------------
   La dispara `pg_cron` cada cinco minutos (ver db/notificaciones.sql).
   En cada vuelta busca a quién le toca el aviso AHORA y le manda un
   push a cada dispositivo que haya registrado.

   Va SIN PAYLOAD, a propósito. Un push con contenido hay que
   cifrarlo con la clave del navegador —ECDH, HKDF y AES-GCM—, y acá
   el texto es siempre el mismo: «Recordá completar tu día». Sin
   payload, todo lo que hace falta es la firma VAPID. El texto lo
   pone el service worker al recibirlo.

   La criptografía vive en `vapid.mjs`, aparte, para que se pueda
   probar con Node sin levantar Deno — ver `test/vapid.mjs`.

   Secretos que necesita (supabase secrets set):
     VAPID_PRIVATE_KEY  el escalar de 32 bytes, en base64url
     VAPID_PUBLIC_KEY   el punto de 65 bytes, en base64url
     VAPID_SUBJECT      mailto: de contacto
   ============================================================ */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { armarJwtVapid, importarClaveVapid, leToca } from './vapid.mjs';

Deno.serve(async () => {
  const privada = Deno.env.get('VAPID_PRIVATE_KEY');
  const publica = Deno.env.get('VAPID_PUBLIC_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');

  if (!privada || !publica || !subject) {
    return Response.json({ error: 'faltan los secretos VAPID' }, { status: 500 });
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    // La service role se saltea RLS: hace falta para leer los recordatorios de
    // todos y saber a quién le toca.
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: recordatorios, error } = await db
    .from('push_reminders')
    .select('user_id, hora, utc_offset')
    .eq('activo', true);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const ahora = new Date();
  const toca = (recordatorios ?? []).filter(r => leToca(r.hora, r.utc_offset, ahora));

  if (!toca.length) return Response.json({ enviados: 0, motivo: 'no le toca a nadie' });

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint')
    .in('user_id', toca.map(r => r.user_id));

  const clave = await importarClaveVapid(privada, publica);
  let enviados = 0;
  const caducadas: string[] = [];

  for (const sub of subs ?? []) {
    try {
      const jwt = await armarJwtVapid(clave, sub.endpoint, subject);

      const r = await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `vapid t=${jwt}, k=${publica}`,
          TTL: '3600',
          // Sin cuerpo: el aviso no lleva datos, solo despierta al worker.
          'Content-Length': '0',
        },
      });

      if (r.ok) enviados++;
      /* 404 y 410 significan que esa suscripción ya no existe: se desinstaló
         el navegador, se limpiaron los datos o caducó. Se borran, si no la
         tabla se llena de endpoints muertos que se reintentan todos los días. */
      else if (r.status === 404 || r.status === 410) caducadas.push(sub.id);
      else console.error('push rechazado', r.status, await r.text());
    } catch (err) {
      console.error('push falló', sub.endpoint, err);
    }
  }

  if (caducadas.length) {
    await db.from('push_subscriptions').delete().in('id', caducadas);
  }

  return Response.json({ enviados, usuarios: toca.length, caducadas: caducadas.length });
});
