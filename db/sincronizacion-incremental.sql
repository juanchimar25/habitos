-- ============================================================
-- Sincronización incremental
-- ------------------------------------------------------------
-- Se ejecuta UNA vez en el SQL Editor de Supabase. Sin esto la
-- app sigue funcionando: sube el estado entero, como hasta ahora.
--
-- El problema que resuelve: `app_state` guarda todo el estado en
-- un solo `jsonb`, así que cada cambio —marcar una celda— subía
-- el historial completo. Con 24 tareas eso son 40 KB hoy y cerca
-- de 1 MB en tres años, por cada clic agrupado.
--
-- La solución: el cliente manda solo lo que cambió y Postgres lo
-- mezcla contra lo que ya hay. El formato del parche es JSON
-- Merge Patch (RFC 7386), que es el que ya conocen los dos lados:
--
--   { "months": { "2026-08": [ … ] } }   reemplaza ese mes
--   { "status": { "t1|2026-08-05": "done" } }   agrega esa marca
--   { "status": { "t1|2026-08-05": null } }     borra esa marca
--
-- La fila sigue siendo la misma y el payload sigue teniendo la
-- misma forma, así que un cliente viejo —el teléfono que todavía
-- no se actualizó— lo lee y lo escribe como siempre.
-- ============================================================

-- ------------------------------------------------------------
-- El merge, recursivo. Postgres trae `||`, pero es de un nivel:
-- mezclar { "status": { "a": 1 } } reemplazaría TODO `status` en
-- vez de agregarle una clave. Y `null` borra, que es lo que dice
-- RFC 7386 y lo que necesita esta app para desmarcar una celda.
-- ------------------------------------------------------------
create or replace function public.jsonb_merge_patch(destino jsonb, parche jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    -- Un parche que no es objeto reemplaza el valor entero.
    when jsonb_typeof(parche) <> 'object' then parche
    when destino is null or jsonb_typeof(destino) <> 'object' then
      public.jsonb_merge_patch('{}'::jsonb, parche)
    else coalesce(
      (
        select jsonb_object_agg(clave, valor)
        from (
          -- Lo que ya estaba y el parche no nombra: queda tal cual.
          select k as clave, destino -> k as valor
          from   jsonb_object_keys(destino) as k
          where  not (parche ? k)
          union all
          -- Lo que el parche trae, mezclado si los dos son objetos.
          select k as clave,
                 case
                   when jsonb_typeof(parche -> k) = 'object'
                        and jsonb_typeof(destino -> k) = 'object'
                     then public.jsonb_merge_patch(destino -> k, parche -> k)
                   else parche -> k
                 end as valor
          from   jsonb_object_keys(parche) as k
          where  jsonb_typeof(parche -> k) <> 'null'
        ) as mezcla
      ),
      '{}'::jsonb
    )
  end;
$$;

-- ------------------------------------------------------------
-- Lo que llama la app. Corre con los permisos de quien la invoca
-- —no es `security definer`—, así que la RLS de `app_state` sigue
-- decidiendo: cada uno solo puede tocar su propia fila.
-- ------------------------------------------------------------
create or replace function public.merge_app_state(parche jsonb)
returns timestamptz
language plpgsql
as $$
declare
  cuando timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'No hay sesión iniciada';
  end if;

  -- La primera vez no hay fila que mezclar: el parche ES el estado.
  insert into public.app_state (user_id, payload, updated_at)
  values (auth.uid(), public.jsonb_merge_patch('{}'::jsonb, parche), cuando)
  on conflict (user_id) do update
    set payload    = public.jsonb_merge_patch(public.app_state.payload, parche),
        updated_at = cuando;

  return cuando;
end;
$$;

revoke all on function public.merge_app_state(jsonb) from public, anon;
grant execute on function public.merge_app_state(jsonb) to authenticated;

-- ------------------------------------------------------------
-- Comprobación: tiene que devolver {"a": {"x": 1, "z": 3}, "b": 2}
-- —agrega `z`, conserva `x`, borra `y` y deja `b` como estaba—.
-- ------------------------------------------------------------
select public.jsonb_merge_patch(
  '{"a": {"x": 1, "y": 9}, "b": 2}'::jsonb,
  '{"a": {"z": 3, "y": null}}'::jsonb
) as resultado;
