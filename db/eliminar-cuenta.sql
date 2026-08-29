-- ============================================================
-- Baja de la cuenta
-- ------------------------------------------------------------
-- Se ejecuta UNA vez en el SQL Editor de Supabase. Sin esto, el
-- botón «Eliminar cuenta» de Ajustes avisa que falta instalarlo.
--
-- Por qué hace falta una función y no alcanza con el navegador:
-- la clave anónima no puede tocar `auth.users`, y darle ese
-- permiso al cliente sería darle el poder de borrar CUALQUIER
-- cuenta. Con `security definer` la función corre con los
-- permisos de quien la creó, y adentro solo puede borrar una
-- fila: la de `auth.uid()`, que es quien la está llamando.
--
-- Todo lo demás se va solo: `app_state`, `push_subscriptions` y
-- `push_reminders` cuelgan de `auth.users` con
-- `on delete cascade`.
-- ============================================================

create or replace function public.eliminar_cuenta()
returns void
language plpgsql
security definer
-- `search_path` fijo: sin esto, quien llame a la función podría
-- anteponer un esquema propio y hacer que `delete from auth.users`
-- apunte a otra tabla. Es la precaución de rigor en toda función
-- `security definer`.
set search_path = auth, pg_temp
as $$
begin
  -- Sin sesión no hay a quién borrar. Se corta con un error claro
  -- en vez de borrar cero filas y devolver éxito.
  if auth.uid() is null then
    raise exception 'No hay sesión iniciada';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

-- Solo quien inició sesión: un visitante anónimo no tiene cuenta
-- que dar de baja.
revoke all on function public.eliminar_cuenta() from public, anon;
grant execute on function public.eliminar_cuenta() to authenticated;

-- ------------------------------------------------------------
-- Comprobación: tiene que devolver UNA fila, con prosecdef = true.
-- ------------------------------------------------------------
select p.proname, p.prosecdef
from   pg_proc p
join   pg_namespace n on n.oid = p.pronamespace
where  n.nspname = 'public'
and    p.proname = 'eliminar_cuenta';
