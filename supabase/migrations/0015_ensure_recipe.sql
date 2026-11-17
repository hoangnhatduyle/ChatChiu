-- ============================================================================
-- 0015 ensure_recipe(name): put a typed meal name into her recipe library
-- (F-MP-05, AC-DATA-12, AC-API-13). The old route upserted with
-- onConflict 'user_id,name', which matches no constraint (the unique index is
-- on lower(name)), so it failed silently.
-- ============================================================================

create function public.ensure_recipe(p_name text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(p_name);
  v_id   bigint;
begin
  if v_user is null then
    raise exception 'ensure_recipe requires an authenticated user' using errcode = '28000';
  end if;
  if v_name is null or v_name = '' then
    raise exception 'recipe name is required' using errcode = '22023';
  end if;

  insert into public.recipes (user_id, name, ingredients)
  values (v_user, v_name, '')
  on conflict (user_id, lower(name)) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.recipes
    where user_id = v_user and lower(name) = lower(v_name);
  end if;
  return v_id;
end;
$$;

revoke all on function public.ensure_recipe(text) from public, anon;
grant execute on function public.ensure_recipe(text) to authenticated;
