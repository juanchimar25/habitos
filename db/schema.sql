-- =============================================================
--  Diario de Hábitos — esquema Postgres (Supabase)
--
--  Ejecutar completo en el SQL Editor de Supabase, en este orden.
--  Es idempotente: se puede volver a correr sin romper nada.
--
--  Notas de diseño en los comentarios de cada tabla. Las dos
--  decisiones no obvias están en `task_identities` y en `months`.
-- =============================================================


-- -------------------------------------------------------------
--  1. Preferencias de la aplicación
-- -------------------------------------------------------------
--  Una fila por usuario. `theme` en NULL significa "seguir al
--  sistema operativo", que es el default de la app.

create table if not exists public.preferences (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  compliance_mode text not null default 'glyph'
                  check (compliance_mode in ('glyph', 'pct', 'both', 'none')),
  theme           text check (theme in ('light', 'dark')),
  updated_at      timestamptz not null default now()
);


-- -------------------------------------------------------------
--  2. Identidad de tarea
-- -------------------------------------------------------------
--  ¿Por qué una tabla solo con ids?
--
--  En el modelo actual, cuando un mes se "materializa" copia las
--  tareas del mes anterior CONSERVANDO EL MISMO id. O sea que
--  «Correr» existe como fila en julio, agosto y septiembre con el
--  mismo identificador. Eso hace que `tasks` no pueda tener el id
--  como clave primaria, y sin esta tabla `entries` no tendría a
--  qué apuntar con una foreign key.
--
--  Esta tabla representa "la tarea como concepto", separada de
--  "la tarea tal como quedó configurada en un mes puntual".
--  Es lo que hace que los estados cargados sobrevivan cuando la
--  tarea se edita o se borra en un mes posterior.
--
--  La PK compuesta (user_id, id) permite que las FK de abajo
--  arrastren el user_id, de modo que es imposible que la fila de
--  un usuario referencie la identidad de otro.

create table if not exists public.task_identities (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);


-- -------------------------------------------------------------
--  3. Meses
-- -------------------------------------------------------------
--  Dos banderas independientes, y conviene entender por qué:
--
--  `materialized` — el mes tiene lista propia de tareas. Sin esta
--    bandera, "cero filas en `tasks`" sería ambiguo: no se podría
--    distinguir un mes que el usuario vació a propósito (y que por
--    lo tanto NO debe heredar) de uno que nunca tocó (y que sí).
--    Es el caso borde que rompe la herencia si se pasa por alto.
--
--  `locked` — el mes está en solo lectura. Es independiente de lo
--    anterior: se puede bloquear un mes cuyas tareas son heredadas,
--    y ahí la fila existe con materialized = false.
--
--  Invariante que sostiene la aplicación (no la base): si hay filas
--  en `tasks` para un mes, ese mes tiene materialized = true.

create table if not exists public.months (
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- `extract` en vez de `date_trunc` porque no depende de qué sobrecarga
  -- elija el planificador, y es inmutable sin discusión.
  month        date not null check (extract(day from month) = 1),
  materialized boolean not null default false,
  locked       boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (user_id, month)
);

comment on column public.months.month is
  'Siempre el día 1 del mes. El cliente convierte su "YYYY-MM" a "YYYY-MM-01".';


-- -------------------------------------------------------------
--  4. Tareas (la configuración de cada tarea en cada mes)
-- -------------------------------------------------------------
--  `weekdays` va como array y no como tabla puente a propósito:
--  son como mucho 7 valores chicos que nunca se consultan de forma
--  independiente. Una tabla puente acá sería ceremonia sin uso.
--
--  Las frecuencias se validan con CHECK y no con un ENUM: durante
--  el desarrollo se agregaron cinco frecuencias nuevas, y alterar
--  un CHECK es bastante menos molesto que alterar un tipo.

create table if not exists public.tasks (
  user_id     uuid    not null,
  month       date    not null,
  task_id     uuid    not null,
  position    integer not null,

  name        text    not null check (char_length(btrim(name)) between 1 and 80),
  freq        text    not null
              check (freq in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'custom')),
  custom_mode text    not null default 'weekdays'
              check (custom_mode in ('weekdays', 'count')),
  weekdays    smallint[] not null default '{}',
  target      integer not null default 12 check (target between 1 and 99),
  start_date  date,
  updated_at  timestamptz not null default now(),

  primary key (user_id, month, task_id),

  foreign key (user_id, month)   references public.months (user_id, month)          on delete cascade,
  foreign key (user_id, task_id) references public.task_identities (user_id, id)    on delete cascade,

  -- 0 = domingo … 6 = sábado, igual que Date#getDay en el cliente
  constraint weekdays_en_rango check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),

  -- Un "personalizado por días" sin días elegidos no describe nada.
  -- Es la misma regla que aplica cleanTaskList() en el cliente.
  constraint custom_por_dias_necesita_dias check (
    freq <> 'custom'
    or custom_mode <> 'weekdays'
    or coalesce(array_length(weekdays, 1), 0) >= 1
  )
);

create index if not exists tasks_por_mes
  on public.tasks (user_id, month, position);


-- -------------------------------------------------------------
--  5. Estados cargados
-- -------------------------------------------------------------
--  Equivale al objeto `status` del cliente, cuya clave es
--  "idDeTarea|YYYY-MM-DD". Referencia la IDENTIDAD de la tarea, no
--  su fila mensual: por eso un estado de julio sobrevive aunque la
--  tarea se elimine en agosto.
--
--  No hay FK contra `tasks` a propósito: la tarea aparece una vez
--  por mes materializado, así que no hay una única fila a la cual
--  apuntar. La integridad la da la FK contra `task_identities`.

create table if not exists public.entries (
  user_id    uuid not null,
  task_id    uuid not null,
  day        date not null,
  status     text not null check (status in ('done', 'partial', 'missed')),
  updated_at timestamptz not null default now(),

  primary key (user_id, task_id, day),
  foreign key (user_id, task_id) references public.task_identities (user_id, id) on delete cascade
);

--  La lectura real es "todos los estados del rango visible",
--  no "todos los estados de una tarea".
create index if not exists entries_por_dia
  on public.entries (user_id, day);


-- =============================================================
--  6. Herencia mensual
-- =============================================================
--  Un mes que no fue tocado hereda la lista del mes materializado
--  más reciente que lo precede. En el cliente esto es
--  `tasksOf(year, month)`; acá son estas dos funciones.

create or replace function public.effective_month(p_month date)
returns date
language sql
stable
security invoker
set search_path = public
as $$
  select max(m.month)
  from public.months m
  where m.user_id = auth.uid()
    and m.materialized
    and m.month <= date_trunc('month', p_month)::date;
$$;

comment on function public.effective_month(date) is
  'Mes del que hereda p_month. NULL si el usuario no cargó ningún mes anterior.';


create or replace function public.tasks_for_month(p_month date)
returns setof public.tasks
language sql
stable
security invoker
set search_path = public
as $$
  select t.*
  from public.tasks t
  where t.user_id = auth.uid()
    and t.month   = public.effective_month(p_month)
  order by t.position;
$$;

comment on function public.tasks_for_month(date) is
  'Lista vigente para un mes, resolviendo la herencia. Devuelve vacío tanto si el mes se vació a propósito como si no hay meses previos.';


-- =============================================================
--  7. updated_at automático (para resolver conflictos entre
--     dispositivos con "gana la última escritura")
-- =============================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['preferences', 'months', 'tasks', 'entries'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;


-- =============================================================
--  8. Row Level Security
-- =============================================================
--  ESTA ES LA ÚNICA BARRERA entre los datos de un usuario y los de
--  otro: el navegador habla directo con Postgres y la clave anónima
--  es pública por diseño.
--
--  `using`      controla qué filas se pueden LEER (y cuáles alcanza
--               un update/delete).
--  `with check` controla qué filas se pueden ESCRIBIR.
--
--  Omitir `with check` es el error clásico: sin él, cualquier
--  usuario autenticado puede INSERTAR filas con el user_id de otro.

alter table public.preferences     enable row level security;
alter table public.task_identities enable row level security;
alter table public.months          enable row level security;
alter table public.tasks           enable row level security;
alter table public.entries         enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['preferences', 'task_identities', 'months', 'tasks', 'entries'] loop
    execute format('drop policy if exists solo_lo_propio on public.%I', t);
    execute format($p$
      create policy solo_lo_propio on public.%I
        for all
        to authenticated
        using      (auth.uid() = user_id)
        with check (auth.uid() = user_id)
    $p$, t);
  end loop;
end;
$$;

--  Ninguna tabla se expone al rol `anon`: sin sesión no se lee nada.
revoke all on public.preferences, public.task_identities,
              public.months, public.tasks, public.entries
  from anon;


-- =============================================================
--  9. Alta de usuario
-- =============================================================
--  Crea la fila de preferencias apenas se registra alguien, para
--  que el cliente nunca tenga que distinguir "sin preferencias" de
--  "preferencias por defecto".

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- =============================================================
--  10. Consultas que usa el cliente
-- =============================================================
--
--  a) Cargar un mes (dos viajes, o uno solo con .rpc + .select):
--
--     select * from tasks_for_month('2026-07-01');
--
--     select * from entries
--      where day >= '2026-07-01' and day <= '2026-07-31';
--
--     select locked from months where month = '2026-07-01';
--
--
--  b) Marcar / desmarcar una celda:
--
--     insert into entries (user_id, task_id, day, status)
--     values (auth.uid(), $1, $2, $3)
--     on conflict (user_id, task_id, day)
--       do update set status = excluded.status;
--
--     delete from entries where task_id = $1 and day = $2;   -- volver a "sin cargar"
--
--
--  c) Materializar un mes (copiar lo heredado para poder editarlo):
--
--     insert into months (user_id, month, materialized)
--     values (auth.uid(), $1, true)
--     on conflict (user_id, month) do update set materialized = true;
--
--     insert into tasks (user_id, month, task_id, position, name, freq,
--                        custom_mode, weekdays, target, start_date)
--     select auth.uid(), $1, task_id, position, name, freq,
--            custom_mode, weekdays, target, start_date
--       from tasks_for_month($1)
--     on conflict do nothing;
--
--
--  d) Borrar tareas de un mes (sin tocar meses anteriores):
--
--     delete from tasks   where month = $1 and task_id = any($2);
--     delete from entries where task_id = any($2)
--       and day >= $1 and day < ($1::date + interval '1 month');
--
--     -- Ojo: NO se borra de task_identities. La identidad sobrevive
--     -- para que los estados de meses anteriores sigan siendo válidos.
