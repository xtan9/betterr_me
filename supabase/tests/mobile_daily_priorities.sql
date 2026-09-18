-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('68600000-0000-0000-0000-000000000001','priority-owner@example.test');
select public.sql_fixture_create_auth_user('68600000-0000-0000-0000-000000000002','priority-other@example.test');
select set_config('request.jwt.claims','{"sub":"68600000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare request jsonb := '{"operation":"create","operationId":"68600000-0000-0000-0000-000000000003","date":"2026-09-15","expectedVersion":null,"title":"Video"}';
  result jsonb; saved jsonb; changed jsonb;
begin
  result := public.priority_command(request);
  if result->>'status'<>'complete' then raise exception 'create failed %',result; end if;
  saved := public.priority_snapshot('2026-09-15');
  if jsonb_array_length(saved->'taskIds')<>1 or (select count(*) from public.tasks)<>1
    or exists(select 1 from public.calendar_events) then raise exception 'creation has side effects'; end if;
  if public.priority_command(request)->>'status'<>'already-applied' then raise exception 'replay failed'; end if;
  if public.priority_command(request||'{"title":"Changed"}'::jsonb)->>'status'<>'conflict' then raise exception 'changed retry accepted'; end if;
  if public.priority_command(request||jsonb_build_object('operationId',gen_random_uuid()))->>'status'<>'conflict' then raise exception 'stale create accepted'; end if;
  if (select count(*) from public.tasks)<>1 then raise exception 'failed create left task'; end if;
  if public.priority_snapshot('2026-09-16')->'taskIds'<>'[]'::jsonb then raise exception 'automatic rollover'; end if;
  changed := jsonb_build_object('operation','set','operationId',gen_random_uuid(),'date','2026-09-15','expectedVersion',saved->'version','taskIds',saved->'taskIds'||saved->'taskIds');
  if public.priority_command(changed)->>'status'<>'invalid' then raise exception 'duplicates accepted'; end if;
  begin
    update public.daily_priority_state set task_ids='{}';
    raise exception 'direct write accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims','{"sub":"68600000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists(select 1 from public.daily_priority_state) or exists(select 1 from public.daily_priority_receipts) then raise exception 'private data leaked'; end if;
  changed := changed||jsonb_build_object('expectedVersion',null,'taskIds',saved->'taskIds');
  if public.priority_command(changed)->>'status'<>'not-found' then raise exception 'foreign task accepted'; end if;
end $$;
rollback;
