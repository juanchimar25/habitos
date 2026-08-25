-- ============================================================
-- Recordatorio diario por Web Push
-- ------------------------------------------------------------
-- Se ejecuta entero en el SQL Editor de Supabase, UNA VEZ.
-- Termina con una consulta de comprobación que tiene que devolver
-- tres filas; si devuelve menos, algo no quedó creado.
--
-- Son dos tablas porque son dos cosas distintas:
--
--   · `push_subscriptions` es POR DISPOSITIVO. Cada navegador donde
--     se active el recordatorio deja su propio endpoint, y el mismo
--     usuario puede tener el teléfono y la computadora.
--
--   · `push_reminders` es POR USUARIO: a qué hora quiere que le
--     avisen y si lo quiere. Guardarlo por dispositivo obligaría a
--     configurar la hora en cada uno.
-- ============================================================

-- ---------- suscripciones ----------------------------------------

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- El endpoint identifica al dispositivo: es la URL a la que se le manda el
  -- push. Único, porque el navegador puede volver a mandar la misma.
  endpoint    text not null unique,
  -- Claves de cifrado del navegador. Hoy no se usan —los avisos van sin
  -- payload— pero se guardan igual: sin ellas, mandar un texto variable más
  -- adelante obligaría a que todos volvieran a suscribirse.
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- ---------- preferencia del recordatorio -------------------------

create table if not exists public.push_reminders (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  activo      boolean not null default false,
  -- Hora LOCAL de quien lo configuró, no UTC: es lo que eligió en la app.
  hora        time not null default '21:00',
  -- Minutos que hay que sumarle a la hora local para llegar a UTC. Se guarda
  -- el desfase y no el nombre de la zona porque es lo que el navegador sabe
  -- decir sin ambigüedad (`getTimezoneOffset`), y alcanza para saber cuándo
  -- disparar. Se reescribe en cada visita: si la persona viaja, o si entra o
  -- sale el horario de verano, la hora sigue siendo la que ve en su reloj.
  utc_offset  smallint not null default 0,
  updated_at  timestamptz not null default now()
);

-- ---------- Row Level Security -----------------------------------
-- Sin estas políticas la base rechaza todo, incluso al dueño de los datos.

alter table public.push_subscriptions enable row level security;
alter table public.push_reminders     enable row level security;

drop policy if exists "propias" on public.push_subscriptions;
create policy "propias" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "propio" on public.push_reminders;
create policy "propio" on public.push_reminders
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- La Edge Function entra con la service role key, que se saltea RLS: necesita
-- leer los recordatorios de TODOS para saber a quién le toca.

-- ---------- permisos de tabla ------------------------------------
-- RLS decide QUÉ FILAS ve cada uno, pero antes hace falta el permiso de
-- Postgres sobre la tabla. Son dos capas distintas y hay que dar las dos.
--
-- Sin estos grants la base contesta «permission denied for table», que NO es
-- un mensaje de RLS y justamente por eso despista: parece que faltara una
-- política cuando lo que falta es el permiso.

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_reminders     to authenticated;

-- La Edge Function lee con service_role. Le alcanza con leer, pero también
-- borra las suscripciones que el servicio de push da por caducadas.
grant select, delete on public.push_subscriptions to service_role;
grant select          on public.push_reminders     to service_role;

-- ---------- el reloj ---------------------------------------------
-- `pg_cron` dispara y `pg_net` hace el HTTP. Los dos vienen con Supabase pero
-- hay que habilitarlos.

create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;

/* La clave con permisos de servidor va al VAULT, no dentro del cron.

   Guardarla en la definición del cron la deja legible para cualquiera que
   mire `cron.job` —y, sobre todo, deja la clave a la vista en la pantalla del
   editor cada vez que se toca el cron, que es como se filtra de verdad: en
   una captura, en una pantalla compartida, en un video—. En el Vault se
   escribe UNA vez y el cron la busca por nombre.

   ⚠ PASO 1. Reemplazar la marca de abajo por la clave y ejecutar SOLO esa
   línea. Es la única vez que la clave aparece en pantalla.

     Settings → API Keys → «Publishable and secret API keys»
       → sección «Secret keys», el ojito.  Empieza con `sb_secret_`.

   Es la que conviene, y no la `service_role` de la pestaña «Legacy»: las
   nuevas se revocan de a una desde el panel, mientras que las legacy cuelgan
   todas del mismo JWT secret y solo se cambian rotándolo entero —lo que
   además cierra las sesiones de todos los usuarios—.

   NO es la `publishable` ni la `anon`: esas son las que ya están en
   `config.js` y no tienen permiso para leer los recordatorios de nadie.

   El gateway acepta las claves del formato nuevo aunque la función se publique
   con verificación de JWT: está comprobado contra este mismo proyecto. No hace
   falta `--no-verify-jwt`. */

select vault.create_secret('<SERVICE_KEY>', 'clave_cron_recordatorios',
                           'Invoca la Edge Function de recordatorios');

/* Si la clave se rota, se actualiza así —el cron no se toca:

     select vault.update_secret(
       (select id from vault.secrets where name = 'clave_cron_recordatorios'),
       'sb_secret_LA_NUEVA');

   El Vault es una comodidad, no un requisito. La alternativa es poner la clave
   directamente en el `Authorization` del cron de abajo, en lugar del `select`
   que la busca por nombre. Funciona igual; lo que cambia es que entonces la
   clave queda a la vista cada vez que se abre o se edita el cron. */

-- ---------- PASO 2: el reloj -------------------------------------
-- Esto ya no lleva ninguna clave: se puede ejecutar, releer y compartir sin
-- exponer nada.
--
-- Cada cinco minutos. No cada minuto —sería disparar 288 veces al día para
-- nada— ni cada hora, que obligaría a que la hora elegida fuera en punto. Con
-- cinco minutos, la app puede ofrecer cualquier hora terminada en 0 o 5.
--
-- La URL ya apunta al proyecto de `config.js`. Si cambiás de proyecto, hay que
-- actualizarla acá también.

select cron.unschedule('recordatorios-habitos')
  where exists (select 1 from cron.job where jobname = 'recordatorios-habitos');

select cron.schedule(
  'recordatorios-habitos',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://kbeqyhsblsczhhtqwfrj.supabase.co/functions/v1/recordatorios',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
         where name = 'clave_cron_recordatorios'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- ---------- comprobación -----------------------------------------
-- Tiene que devolver TRES filas: las dos tablas con su RLS activa y el cron.
-- Si `rls` sale en false, la base va a rechazar todo desde la app.

select 'tabla' as que, tablename as nombre, rowsecurity as rls
  from pg_tables
 where schemaname = 'public'
   and tablename in ('push_subscriptions', 'push_reminders')
union all
select 'cron', jobname, active
  from cron.job
 where jobname = 'recordatorios-habitos';

-- ---------- para cuando algo no llegue ---------------------------
-- No hace falta ejecutarlo ahora. Es lo que conviene mirar, en este orden,
-- si el recordatorio deja de aparecer.

-- 1) ¿El cron está corriendo, y qué contestó la función?
--    `status` a 'failed' es el cron; un `succeeded` acá solo dice que la
--    llamada salió, no que el push haya llegado — eso está en los logs de la
--    Edge Function (Dashboard → Edge Functions → recordatorios → Logs).
--
--    select j.jobname, r.status, r.return_message, r.start_time
--      from cron.job_run_details r
--      join cron.job j on j.jobid = r.jobid
--     where j.jobname = 'recordatorios-habitos'
--     order by r.start_time desc
--     limit 10;

-- 2) ¿Quedó registrado mi dispositivo, y a qué hora pedí el aviso?
--    Si `push_subscriptions` está vacía, el navegador nunca llegó a
--    suscribirse: el problema está del lado de la app, no del servidor.
--
--    select r.user_id, r.activo, r.hora, r.utc_offset,
--           count(s.id) as dispositivos
--      from public.push_reminders r
--      left join public.push_subscriptions s on s.user_id = r.user_id
--     group by r.user_id, r.activo, r.hora, r.utc_offset;

-- 3) ¿A qué hora UTC debería dispararme?  `hora + utc_offset`, que es la
--    misma cuenta que hace la función. Comparalo con `start_time` de arriba.
--
--    select hora, utc_offset,
--           ((extract(hour from hora) * 60 + extract(minute from hora)
--             + utc_offset)::int % 1440 + 1440) % 1440 as minuto_utc
--      from public.push_reminders
--     where activo;
