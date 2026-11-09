create schema farm_private;
revoke all on schema farm_private from public;
grant usage on schema farm_private to authenticated, service_role;

create table farm_private.farms (
  owner uuid primary key references auth.users(id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  recovery_digest text not null check (recovery_digest ~ '^[0-9a-f]{64}$'),
  coins integer not null default 12 check (coins >= 0),
  plots jsonb not null default '[null,null,null,null,null,null]',
  inventory jsonb not null default '{}',
  egg_ready_at timestamptz
);
alter table farm_private.farms enable row level security;
grant select (owner, handle, recovery_digest) on farm_private.farms to service_role;

create function farm_private.create_farm() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.raw_app_meta_data ? 'farm_handle' then
    insert into farm_private.farms (owner, handle, recovery_digest)
    values (new.id, new.raw_app_meta_data->>'farm_handle', new.raw_app_meta_data->>'farm_recovery');
  end if;
  return new;
end
$$;
revoke all on function farm_private.create_farm() from public;
create trigger provision_farm after insert on auth.users
for each row execute function farm_private.create_farm();

create function farm_private.act(action text, plot integer, crop text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  f farm_private.farms;
  now_at timestamptz;
  catalog constant jsonb := '{
    "wheat": {"name":"밀","seed":2,"price":7,"seconds":45},
    "carrot":{"name":"당근","seed":4,"price":13,"seconds":480},
    "berry":{"name":"딸기","seed":7,"price":25,"seconds":7200},
    "egg":{"name":"달걀","price":12}
  }';
  expansion_cost constant integer := 30;
  slot jsonb;
  crop_key text;
  sale integer;
  seed integer;
  changed boolean := false;
begin
  if (select auth.uid()) is null then raise exception 'sign_in'; end if;
  if action = 'view' then
    select * into f from farm_private.farms where owner = (select auth.uid());
  else
    select * into f from farm_private.farms where owner = (select auth.uid()) for update;
  end if;
  if not found then raise exception 'no_farm'; end if;
  now_at := clock_timestamp();

  if plot is not null and (plot < 0 or plot >= jsonb_array_length(f.plots)) then
    raise exception 'bad_plot';
  end if;
  case action
    when 'view' then null;
    when 'plant' then
      seed := (catalog->crop->>'seed')::integer;
      if plot is null or seed is null then raise exception 'bad_crop'; end if;
      if f.plots->plot <> 'null'::jsonb then raise exception 'occupied'; end if;
      if f.coins < seed then raise exception 'low_coins'; end if;
      f.coins := f.coins - seed;
      f.plots := jsonb_set(f.plots, array[plot::text], jsonb_build_object(
        'crop', crop, 'readyAt', now_at + make_interval(secs => (catalog->crop->>'seconds')::integer)
      ));
      changed := true;
    when 'harvest' then
      for i in 0..jsonb_array_length(f.plots)-1 loop
        if plot is not null and i <> plot then continue; end if;
        slot := f.plots->i;
        if (slot->>'readyAt')::timestamptz <= now_at then
          crop_key := slot->>'crop';
          f.inventory := jsonb_set(f.inventory, array[crop_key],
            to_jsonb(coalesce((f.inventory->>crop_key)::integer, 0) + 1));
          f.plots := jsonb_set(f.plots, array[i::text], 'null');
          changed := true;
        end if;
      end loop;
      if not changed then raise exception 'not_ready'; end if;
    when 'sell' then
      select sum(item.value::integer * (catalog->item.key->>'price')::integer)
        into sale from jsonb_each_text(f.inventory) as item;
      if sale is null then raise exception 'empty_storage'; end if;
      f.coins := f.coins + sale;
      f.inventory := '{}';
      changed := true;
    when 'expand' then
      if f.egg_ready_at is not null then raise exception 'already_expanded'; end if;
      if f.coins < expansion_cost then raise exception 'low_coins'; end if;
      f.coins := f.coins - expansion_cost;
      f.plots := f.plots || '[null,null,null]'::jsonb;
      f.egg_ready_at := now_at + interval '30 minutes';
      changed := true;
    when 'egg' then
      if f.egg_ready_at is null or f.egg_ready_at > now_at then raise exception 'not_ready'; end if;
      f.inventory := jsonb_set(f.inventory, '{egg}', to_jsonb(coalesce((f.inventory->>'egg')::integer, 0) + 1));
      f.egg_ready_at := now_at + interval '30 minutes';
      changed := true;
    else raise exception 'bad_action';
  end case;

  if changed then
    update farm_private.farms set coins = f.coins, plots = f.plots, inventory = f.inventory,
      egg_ready_at = f.egg_ready_at where owner = f.owner;
  end if;
  return jsonb_build_object('handle', f.handle, 'coins', f.coins, 'plots', f.plots,
    'inventory', f.inventory, 'eggReadyAt', f.egg_ready_at, 'now', now_at,
    'catalog', catalog, 'expansionCost', expansion_cost);
end
$$;
revoke all on function farm_private.act(text, integer, text) from public;
grant execute on function farm_private.act(text, integer, text) to authenticated;

create function public.farm_action(action text, plot integer default null, crop text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select farm_private.act(action, plot, crop) $$;
revoke all on function public.farm_action(text, integer, text) from public, anon, service_role;
grant execute on function public.farm_action(text, integer, text) to authenticated;

create function public.farm_recovery_user(account_handle text, code_digest text)
returns uuid language sql stable security invoker set search_path = ''
as $$
  select owner from farm_private.farms where handle = account_handle and recovery_digest = code_digest
$$;
revoke all on function public.farm_recovery_user(text, text) from public, anon, authenticated;
grant execute on function public.farm_recovery_user(text, text) to service_role;
