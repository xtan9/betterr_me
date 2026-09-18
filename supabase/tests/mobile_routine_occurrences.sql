-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('61000000-0000-0000-0000-000000000001','routine-owner@example.test');
select set_config('request.jwt.claims','{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare result jsonb; row jsonb; preview jsonb; command_request jsonb; change public.planner_changes; before_rows jsonb;
begin
 set local role authenticated;
 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Atomic chore','date','2090-03-13','startTime','09:00','endTime','10:00','timezone','America/Los_Angeles','protected',false,'rule','{"frequency":"daily","interval":1}'::jsonb));
 if result->>'status' is distinct from 'complete' then raise exception 'create failed %',result;end if;
 row:=public.planner_routine_snapshot('2090-03-13')->'rows'->0;
 preview:=public.planner_completion_preview((row->'task'->>'id')::uuid);
 command_request:=jsonb_build_object('operation','complete','operationId',gen_random_uuid(),'taskId',row->'task'->>'id','expectedVersion',row->'task'->>'version','plan',preview->'plan','occurrenceVersion',preview->>'occurrenceVersion','seriesToken',preview->'seriesToken');
 before_rows:=public.planner_routine_snapshot('2090-03-13');
 begin
  result:=public.planner_command(command_request);
  if result->>'status' is distinct from 'complete' then raise exception 'completion failed %',result;end if;
  raise exception using errcode='PT499',message='simulated enclosing transaction failure';
 exception when sqlstate 'PT499' then null;
 end;
 if public.planner_routine_snapshot('2090-03-13') is distinct from before_rows
   or exists(select 1 from public.planner_changes) or exists(select 1 from public.planner_command_receipts where operation_id=(command_request->>'operationId')::uuid)
   then raise exception 'partial occurrence completion';end if;
 result:=public.planner_command(command_request);
 if result->>'status' is distinct from 'complete' then raise exception 'completion retry failed %',result;end if;
 select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
 before_rows:=public.planner_routine_snapshot('2090-03-13');
 command_request:=jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version);
 begin
  result:=public.planner_command(command_request);
  if result->>'status' is distinct from 'complete' then raise exception 'undo failed %',result;end if;
  raise exception using errcode='PT499',message='simulated enclosing transaction failure';
 exception when sqlstate 'PT499' then null;
 end;
 if public.planner_routine_snapshot('2090-03-13') is distinct from before_rows or (select undone_at from public.planner_changes where id=change.id) is not null then raise exception 'partial occurrence undo';end if;
 if public.planner_command(command_request)->>'status' is distinct from 'complete' then raise exception 'undo retry failed';end if;
 row:=public.planner_routine_snapshot('2090-03-13')->'rows'->0;
 if row->'occurrence'->>'state' is distinct from 'open' or row->'event'->>'id' is null or (row->'task'->>'is_completed')::boolean then raise exception 'restore missed exact occurrence';end if;
end $$;
rollback;


