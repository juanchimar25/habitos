-- =============================================================
--  Tabla para persistir el estado completo de la app en Supabase
-- =============================================================

create table if not exists public.app_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

create policy if not exists solo_lo_propio_app_state
  on public.app_state
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.app_state from anon;
