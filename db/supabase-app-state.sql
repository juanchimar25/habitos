-- =============================================================
--  Tabla para persistir el estado completo de la app en Supabase
--  ------------------------------------------------------------
--  Se puede correr las veces que haga falta: cada paso es idempotente.
--  Pegar entero en el SQL Editor de Supabase y ejecutar.
-- =============================================================

create table if not exists public.app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

--  Postgres NO admite `create policy if not exists` (en ninguna versión):
--  esa forma es un error de sintaxis. Se borra y se recrea, que además
--  deja la política al día si cambian las condiciones.
drop policy if exists solo_lo_propio_app_state on public.app_state;

create policy solo_lo_propio_app_state
  on public.app_state
  for all
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

--  RLS y permisos de tabla son dos capas distintas: hacen falta las dos.
--  Con RLS activa y la política puesta, `authenticated` solo alcanza su
--  propia fila; sin el grant no alcanzaría ninguna.
grant select, insert, update, delete on public.app_state to authenticated;

--  Sin sesión no se lee nada.
revoke all on public.app_state from anon;


-- =============================================================
--  Comprobación
--  ------------------------------------------------------------
--  Tiene que devolver UNA fila: solo_lo_propio_app_state / {authenticated} / ALL
--  Cero filas significa RLS activa sin política, que en Postgres deniega
--  todo — incluso al dueño de los datos.
-- =============================================================

select policyname, roles, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename  = 'app_state';
