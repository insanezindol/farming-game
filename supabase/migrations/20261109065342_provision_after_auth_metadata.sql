create or replace function farm_private.create_farm() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.raw_app_meta_data ? 'farm_handle' then
    insert into farm_private.farms (owner, handle, recovery_digest)
    values (new.id, new.raw_app_meta_data->>'farm_handle', new.raw_app_meta_data->>'farm_recovery')
    on conflict (owner) do nothing;
  end if;
  return new;
end
$$;

-- Auth may persist trusted app metadata after inserting its user row.
create or replace trigger provision_farm
after insert or update of raw_app_meta_data on auth.users
for each row execute function farm_private.create_farm();

insert into farm_private.farms (owner, handle, recovery_digest)
select id, raw_app_meta_data->>'farm_handle', raw_app_meta_data->>'farm_recovery'
from auth.users
where raw_app_meta_data ? 'farm_handle'
on conflict (owner) do nothing;
