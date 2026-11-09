create table farm_private.open_farms (
  owner uuid primary key references auth.users(id) on delete cascade,
  revision integer not null default 0,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object')
);
alter table farm_private.open_farms enable row level security;
grant select, insert, update on farm_private.open_farms to service_role;

create unique index open_farm_share_code
on farm_private.open_farms ((snapshot #>> '{share,code}'))
where snapshot #>> '{share,code}' is not null;

create function public.open_farm_load(account uuid, initial jsonb default null)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
begin
  if initial is not null then
    insert into farm_private.open_farms (owner, snapshot)
    values (account, initial) on conflict (owner) do nothing;
  end if;

  return (select jsonb_build_object('revision', revision, 'state', snapshot)
    from farm_private.open_farms where owner = account);
end
$$;

create function public.open_farm_save(account uuid, expected integer, payload jsonb)
returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
  update farm_private.open_farms set snapshot = payload, revision = revision + 1
  where owner = account and revision = expected;
  return found;
end
$$;

create function public.open_farm_shared(code text)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select jsonb_build_object('owner', owner, 'revision', revision, 'state', snapshot)
  from farm_private.open_farms
  where snapshot #>> '{share,code}' = code and snapshot #>> '{share,enabled}' = 'true'
$$;

create function public.open_farm_pair(
  target uuid, target_revision integer, target_data jsonb,
  sender uuid, sender_revision integer, sender_data jsonb
) returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
  if target = sender then return false; end if;
  perform owner from farm_private.open_farms where owner in (target, sender) order by owner for update;
  if not exists (select 1 from farm_private.open_farms where owner = target and revision = target_revision)
    or not exists (select 1 from farm_private.open_farms where owner = sender and revision = sender_revision) then
    return false;
  end if;
  update farm_private.open_farms set snapshot = target_data, revision = revision + 1 where owner = target;
  if sender_data is not null then
    update farm_private.open_farms set snapshot = sender_data, revision = revision + 1 where owner = sender;
  end if;
  return true;
end
$$;

revoke all on function public.open_farm_load(uuid,jsonb), public.open_farm_save(uuid,integer,jsonb),
  public.open_farm_shared(text), public.open_farm_pair(uuid,integer,jsonb,uuid,integer,jsonb)
from public, anon, authenticated;
grant execute on function public.open_farm_load(uuid,jsonb), public.open_farm_save(uuid,integer,jsonb),
  public.open_farm_shared(text), public.open_farm_pair(uuid,integer,jsonb,uuid,integer,jsonb)
to service_role;
