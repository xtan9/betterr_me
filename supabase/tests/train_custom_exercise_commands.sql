-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('64181000-0000-4000-8000-000000000001','train-command-owner@example.test');
select public.sql_fixture_create_auth_user('64181000-0000-4000-8000-000000000002','train-command-foreign@example.test');
select set_config('request.jwt.claims','{"sub":"64181000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
insert into public.exercises(id,user_id,name,muscle_group_primary,muscle_groups_secondary,equipment,exercise_type,is_custom)
values('64181000-0000-4000-8000-000000000010',auth.uid(),'Legacy name','other',array['legacy-muscle'],'band','duration_weight',true);
do $$
declare request jsonb:='{"protocolVersion":1,"operationId":"64181000-0000-4000-8000-000000000020","command":{"kind":"update-metadata","exerciseId":"64181000-0000-4000-8000-000000000010","expectedVersion":"1","patch":{"name":"Renamed"}}}';
 accepted jsonb; rejected jsonb; newer jsonb; current_row jsonb;
begin
 accepted:=public.execute_train_exercise_command(request);
 if accepted->>'status'<>'accepted' or accepted->'receipt'->'definition'->>'name'<>'Renamed'
   or accepted->'receipt'->'definition'->>'version'<>'2'
   or accepted->'receipt'->'definition'->'secondaryMuscles'<>'["legacy-muscle"]'::jsonb
   or accepted->'receipt'->'definition'->'convention'<>'null'::jsonb then
   raise exception 'Metadata command lost identity, unknowns or exact version: %',accepted; end if;
 if public.execute_train_exercise_command(request) is distinct from accepted then raise exception 'Retry changed first acceptance'; end if;
 if public.execute_train_exercise_command(jsonb_set(request,'{command,patch,name}','"Changed bytes"'))->>'status'<>'operation_conflict' then
   raise exception 'Changed operation was not rejected'; end if;
 newer:=jsonb_set(request,'{operationId}','"64181000-0000-4000-8000-000000000021"');
 rejected:=public.execute_train_exercise_command(newer);
 if rejected->>'status'<>'version_conflict' or rejected->'rejection'->'current'->>'version'<>'2'
   or rejected ? 'receipt' then raise exception 'Stale command did not retain a distinct rejection: %',rejected; end if;
 update public.exercises set name='Concurrent legacy rename' where id='64181000-0000-4000-8000-000000000010';
 if public.execute_train_exercise_command(newer) is distinct from rejected then raise exception 'Retry rewrote first rejection'; end if;
 if public.execute_train_exercise_command(request) is distinct from accepted then raise exception 'Newer state rewrote first receipt'; end if;
 select to_jsonb(e) into current_row from public.exercises e where id='64181000-0000-4000-8000-000000000010';
 if current_row->>'name'<>'Concurrent legacy rename' or current_row->>'version'<>'3' then raise exception 'Old first receipt rolled back current state'; end if;
 -- Archive is reversible and preserves a referenced/unsupported definition.
 newer:='{"protocolVersion":1,"operationId":"64181000-0000-4000-8000-000000000022","command":{"kind":"archive","exerciseId":"64181000-0000-4000-8000-000000000010","expectedVersion":"3"}}';
 accepted:=public.execute_train_exercise_command(newer);
 if accepted->'receipt'->'definition'->>'version'<>'4' or accepted->'receipt'->'definition'->'archivedAt'='null'::jsonb then
   raise exception 'Archive failed: %',accepted; end if;
 request:=jsonb_set(jsonb_set(newer,'{operationId}','"64181000-0000-4000-8000-000000000023"'),'{command,expectedVersion}','"4"');
 rejected:=public.execute_train_exercise_command(request);
 if rejected->'receipt'->'definition'->>'version'<>'5'
   or rejected->'receipt'->'definition'->'archivedAt' is distinct from accepted->'receipt'->'definition'->'archivedAt' then
   raise exception 'No-op archive did not increment once or changed original archive time'; end if;
 request:=jsonb_set(jsonb_set(jsonb_set(request,'{operationId}','"64181000-0000-4000-8000-000000000024"'),'{command,kind}','"restore"'),'{command,expectedVersion}','"5"');
 accepted:=public.execute_train_exercise_command(request);
 if accepted->'receipt'->'definition'->>'version'<>'6' or accepted->'receipt'->'definition'->'archivedAt'<>'null'::jsonb then
   raise exception 'Restore changed identity or did not increment'; end if;
 -- A foreign principal cannot inspect the current definition via conflict.
 perform set_config('request.jwt.claims','{"sub":"64181000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 rejected:=public.execute_train_exercise_command(request);
 if rejected->>'status'<>'not_found' or rejected->'rejection' ? 'current'
   or exists(select 1 from public.train_exercise_command_outcomes where owner_id='64181000-0000-4000-8000-000000000001') then
   raise exception 'Foreign exercise or command evidence escaped ownership'; end if;
end $$;
rollback;
