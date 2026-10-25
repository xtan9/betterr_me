-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('64100000-0000-0000-0000-000000000001','training-plan-owner@example.test');
select public.sql_fixture_create_auth_user('64100000-0000-0000-0000-000000000002','training-plan-other@example.test');
select set_config('request.jwt.claims','{"sub":"64100000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare request jsonb; result jsonb; item jsonb; sibling jsonb; preview jsonb;
  once_id uuid; recurring_id uuid; old_id uuid; once_occurrence uuid;
begin
 request:=jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Strength plan',
   'activityKind','training','repeatMode','once','date','2090-03-13','startTime','09:00','endTime','10:00',
   'timezone','America/Los_Angeles','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb);
 result:=public.planner_routine_command(request);
 if result->>'status' is distinct from 'complete' then raise exception 'training create rejected: %',result; end if;
 once_id:=(result->>'seriesId')::uuid;
 if public.planner_routine_command(request)->>'status' is distinct from 'already-applied' then raise exception 'retry lost identity'; end if;
 if public.planner_routine_command(request||'{"repeatMode":"recurring"}')->>'status' is distinct from 'conflict' then raise exception 'retry changed repeat mode'; end if;
 select r into item from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-13')->'rows') r where r->'series'->>'id'=once_id::text;
 once_occurrence:=(item->'occurrence'->>'id')::uuid;
 if item->'schedule'->>'activity_kind' is distinct from 'training' or item->'schedule'->>'repeat_mode' is distinct from 'once'
   or item->'event'->>'routine_occurrence_id' is distinct from once_occurrence::text then raise exception 'missing planned occurrence identity: %',item; end if;
 perform public.planner_routine_snapshot_v2('2090-03-14');
 perform public.planner_routine_snapshot_v2('2090-03-20');
 if (select count(*) from public.recurring_task_occurrences where series_id=once_id)<>1 then raise exception 'one-off produced siblings'; end if;
 if not exists(select 1 from jsonb_array_elements(public.planner_routine_series_snapshot_v2()->'rows') r
   where r->>'id'=once_id::text and r->>'activityKind'='training' and r->>'repeatMode'='once') then raise exception 'library lost training identity'; end if;

 request:=request||jsonb_build_object('operationId',gen_random_uuid(),'repeatMode','recurring','title','Weekly plan',
   'rule','{"frequency":"weekly","interval":1,"days_of_week":[1,3]}'::jsonb);
 result:=public.planner_routine_command(request); recurring_id:=(result->>'seriesId')::uuid;
 if result->>'status' is distinct from 'complete' then raise exception 'recurring training rejected: %',result; end if;
 select r into sibling from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-15')->'rows') r where r->'series'->>'id'=recurring_id::text;
 if sibling is null then raise exception 'missing selected weekday'; end if;
 if exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-14')->'rows') r where r->'series'->>'id'=recurring_id::text) then raise exception 'extra weekday'; end if;
 select r into item from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-13')->'rows') r where r->'series'->>'id'=recurring_id::text;
 request:=jsonb_build_object('operation','edit','operationId',gen_random_uuid(),'seriesId',recurring_id,'occurrenceId',item->'occurrence'->>'id',
   'expectedSeriesToken',item->'series'->'revision_token','expectedOccurrenceVersion',item->'occurrence'->>'version',
   'expectedTaskVersion',item->'task'->>'version','expectedEventVersion',item->'event'->>'version',
   'title','Short training','date','2090-03-13','startTime','10:00','endTime','10:30');
 if public.planner_routine_command(request||jsonb_build_object('expectedTaskVersion',gen_random_uuid()))->>'status' is distinct from 'conflict' then raise exception 'stale edit accepted'; end if;
 if public.planner_routine_command(request)->>'status' is distinct from 'complete' then raise exception 'single edit rejected'; end if;
 if not exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-15')->'rows') r where r=sibling) then raise exception 'edit changed sibling'; end if;
 select r into item from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-13')->'rows') r where r->'series'->>'id'=recurring_id::text;
 preview:=public.planner_completion_preview((item->'task'->>'id')::uuid);
 request:=jsonb_build_object('operation','complete','operationId',gen_random_uuid(),'taskId',item->'task'->>'id',
   'expectedVersion',item->'task'->>'version','plan',preview->'plan','occurrenceVersion',preview->>'occurrenceVersion','seriesToken',preview->'seriesToken');
 if public.planner_command(request)->>'status' is distinct from 'complete' or public.planner_command(request)->>'status' is distinct from 'already-applied' then raise exception 'completion/retry rejected'; end if;
 if not exists(select 1 from public.recurring_task_occurrences where id=(item->'occurrence'->>'id')::uuid and state='completed') then raise exception 'occurrence not fulfilled'; end if;
 if not exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-15')->'rows') r where r=sibling) then raise exception 'completion changed sibling'; end if;
 if exists(select 1 from public.workouts) or exists(select 1 from public.workout_sets) or exists(select 1 from public.workout_exercises)
   or exists(select 1 from public.work_sessions where worked_seconds is not null or actual_start is not null) then raise exception 'plan completion fabricated exercise or measured time'; end if;

 -- Old clients keep the existing routine defaults and all current fields.
 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Existing routine',
   'date','2090-03-13','startTime','11:00','endTime','12:00','timezone','UTC','protected',false,'rule','{"frequency":"daily","interval":1}'::jsonb));
 old_id:=(result->>'seriesId')::uuid;
 if result->>'status' is distinct from 'complete' or not exists(select 1 from public.planner_routine_schedules where series_id=old_id and activity_kind='routine' and repeat_mode='recurring' and not is_protected) then raise exception 'old client changed'; end if;
 perform set_config('request.jwt.claims','{"sub":"64100000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 if public.planner_command(request)->>'status' not in ('not-found','invalid') or exists(select 1 from public.planner_command_receipts) or jsonb_array_length(public.planner_routine_snapshot_v2('2090-03-13')->'rows')<>0
   or jsonb_array_length(public.planner_routine_series_snapshot_v2()->'rows')<>0 then raise exception 'cross-owner plan access: %, %, %',public.planner_command(request), public.planner_routine_snapshot_v2('2090-03-13'),public.planner_routine_series_snapshot_v2(); end if;
end $$;
rollback;
