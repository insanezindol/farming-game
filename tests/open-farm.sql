begin;
insert into auth.users (id) values
  ('f0000000-0000-4000-8000-000000000011'), ('f0000000-0000-4000-8000-000000000012');
set local role service_role;
do $$
declare
  owner uuid := 'f0000000-0000-4000-8000-000000000011';
  guest uuid := 'f0000000-0000-4000-8000-000000000012';
  first jsonb := '{"handle":"host","coins":150,"share":{"enabled":true,"code":"test-code"}}';
  second jsonb := '{"handle":"guest","coins":150}';
begin
  assert (public.open_farm_load(owner, first)->>'revision')::integer = 0, 'initial snapshot';
  assert (public.open_farm_load(guest, second)->>'revision')::integer = 0, 'guest snapshot';
  assert public.open_farm_shared('test-code')->>'owner' = owner::text, 'enabled link lookup';
  assert public.open_farm_save(owner, 0, first || '{"coins":140}'), 'first update';
  assert not public.open_farm_save(owner, 0, first || '{"coins":5}'), 'stale update rejected';
  assert not public.open_farm_pair(owner, 0, first, guest, 0, second || '{"coins":1}'), 'stale pair rejected';
  assert public.open_farm_load(guest)->'state'->>'coins' = '150', 'pair did not partially write';
  assert public.open_farm_pair(owner, 1, first || '{"coins":151}', guest, 0, second || '{"coins":149}'), 'pair saves both';
  assert public.open_farm_load(owner)->'state'->>'coins' = '151', 'owner saved';
  assert public.open_farm_load(guest)->'state'->>'coins' = '149', 'guest saved';
  assert public.open_farm_save(owner, 2, first || '{"share":{"enabled":false,"code":"test-code"}}'), 'close link';
  assert public.open_farm_shared('test-code') is null, 'closed link unavailable';
end
$$;
reset role;
do $$
begin
  assert not has_function_privilege('anon','public.open_farm_load(uuid,jsonb)','EXECUTE'), 'anonymous access denied';
  assert not has_function_privilege('authenticated','public.open_farm_save(uuid,integer,jsonb)','EXECUTE'), 'direct player writes denied';
end
$$;
rollback;
select 'open farm persistence checks passed' as result;
