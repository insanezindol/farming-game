begin;
insert into auth.users (id, raw_app_meta_data)
values
  ('f0000000-0000-4000-8000-000000000001', '{"farm_handle":"farmtest_one","farm_recovery":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'),
  ('f0000000-0000-4000-8000-000000000002', '{"farm_handle":"farmtest_two","farm_recovery":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}');

insert into auth.users (id) values ('f0000000-0000-4000-8000-000000000003');
update auth.users
set raw_app_meta_data = '{"farm_handle":"farmtest_lifecycle","farm_recovery":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'
where id = 'f0000000-0000-4000-8000-000000000003';

do $$
begin
  assert exists (select from farm_private.farms where handle = 'farmtest_lifecycle'), 'late app metadata provisions the farm';
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);

do $$
declare state jsonb;
begin
  state := public.farm_action('view');
  assert jsonb_array_length(state->'plots') = 6, 'six starter plots';
  assert (state->>'coins')::int = 12, 'starter coins';
  state := public.farm_action('plant', 0, 'wheat');
  assert state#>>'{plots,0,crop}' = 'wheat', 'planted crop';
  assert (state->>'coins')::int = 10, 'seed price deducted';
  begin
    perform public.farm_action('harvest', 0);
    raise exception 'early harvest succeeded';
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'not_ready', 'early harvest error';
  end;
  begin
    perform public.farm_action('expand');
    raise exception 'expansion succeeded without money';
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'low_coins', 'expansion cost enforced';
  end;
  assert not has_table_privilege(current_user, 'farm_private.farms', 'UPDATE'), 'players cannot write balances';
  assert not has_function_privilege(current_user, 'public.farm_recovery_user(text,text)', 'EXECUTE'), 'recovery lookup is privileged';
end
$$;

reset role;
update farm_private.farms
set plots = jsonb_set(plots, '{0,readyAt}', to_jsonb(now() - interval '1 second'))
where owner = 'f0000000-0000-4000-8000-000000000001';

set local role authenticated;
do $$
declare state jsonb;
begin
  state := public.farm_action('harvest');
  assert (state#>>'{inventory,wheat}')::int = 1, 'wheat harvested';
  assert state#>'{plots,0}' = 'null'::jsonb, 'plot cleared';
  begin
    perform public.farm_action('harvest', 0);
    raise exception 'duplicate harvest succeeded';
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'not_ready', 'duplicate harvest error';
  end;
  state := public.farm_action('sell');
  assert state->'inventory' = '{}'::jsonb, 'sold inventory cleared';
  assert (state->>'coins')::int = 17, 'sale price added';
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000002', true);
  state := public.farm_action('view');
  assert state->>'handle' = 'farmtest_two' and (state->>'coins')::int = 12, 'account isolation';
end
$$;

reset role;
update farm_private.farms set coins = 30 where owner = 'f0000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000001', true);
do $$
declare state jsonb;
begin
  state := public.farm_action('expand');
  assert jsonb_array_length(state->'plots') = 9, 'expansion adds three plots';
  assert (state->>'coins')::int = 0 and state->>'eggReadyAt' is not null, 'expansion starts the coop';
  begin
    perform public.farm_action('egg');
    raise exception 'early egg collection succeeded';
  exception when sqlstate 'P0001' then
    assert sqlerrm = 'not_ready', 'early egg collection error';
  end;
end
$$;
reset role;
update farm_private.farms set egg_ready_at = now() - interval '1 second'
where owner = 'f0000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
declare state jsonb;
begin
  state := public.farm_action('egg');
  assert (state#>>'{inventory,egg}')::int = 1, 'collected one egg';
  assert (state->>'eggReadyAt')::timestamptz > now(), 'egg timer restarted';
end
$$;
reset role;
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"some_auth_update":true}'
where id = 'f0000000-0000-4000-8000-000000000001';

do $$
begin
  assert (select jsonb_array_length(plots) from farm_private.farms
    where handle = 'farmtest_one') = 9, 'metadata update preserves the farm';
end
$$;

set local role service_role;
do $$
begin
  assert public.farm_recovery_user('farmtest_one', repeat('a', 64)) =
    'f0000000-0000-4000-8000-000000000001'::uuid, 'recovery finds account';
  assert public.farm_recovery_user('farmtest_one', repeat('b', 64)) is null, 'recovery rejects wrong code';
end
$$;
rollback;
select 'farm checks passed' as result;
