-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('68120000-0000-0000-0000-000000000001','delete-owner@example.test');
select public.sql_fixture_create_auth_user('68120000-0000-0000-0000-000000000002','delete-other@example.test');
select set_config('request.jwt.claims','{"sub":"68120000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare task jsonb; project jsonb; child jsonb; event jsonb; preview jsonb; result jsonb;
  op uuid:=gen_random_uuid(); future timestamp:=(now() at time zone 'UTC')+interval '1 day';
begin
  task:=public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Delete me"}')->'task';
  event:=public.calendar_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object(
    'title','Protected future block','start_date',future::date,'end_date',(future+interval '1 hour')::date,
    'start_time',to_char(future,'HH24:MI:SS'),'end_time',to_char(future+interval '1 hour','HH24:MI:SS'),'timezone','UTC','task_id',task->>'id','is_protected',true))->'event';
  if event is null then raise exception 'event fixture failed'; end if;
  insert into public.calendar_events(user_id,title,start_date,end_date,start_time,end_time,timezone,app_owned,is_protected,task_id)
    values('68120000-0000-0000-0000-000000000001','Past work',current_date-2,current_date-2,'09:00','10:00','UTC',true,false,(task->>'id')::uuid),
    ('68120000-0000-0000-0000-000000000001','External commitment',current_date+3,current_date+3,'09:00','10:00','UTC',false,true,(task->>'id')::uuid);
  preview:=public.item_deletion_preview('task',(task->>'id')::uuid);
  perform public.update_calendar_event_with_reminders('68120000-0000-0000-0000-000000000001',
    (event->>'id')::uuid,'{}','[{"reminder_type":"relative","relative_minutes":15,"channels":["push"]}]');
  if public.item_delete_command(op,preview)->>'status'<>'conflict' then raise exception 'accepted added reminder'; end if;
  preview:=public.item_deletion_preview('task',(task->>'id')::uuid);
  if jsonb_array_length(preview->'reminders')<>1 then raise exception 'reminder impact missing'; end if;
  perform public.transition_calendar_event_reminder('68120000-0000-0000-0000-000000000001',
    (preview->'reminders'->0->>'id')::uuid,'snoozed');
  if public.item_delete_command(op,preview)->>'status'<>'conflict' then raise exception 'accepted reminder-only edit'; end if;
  preview:=public.item_deletion_preview('task',(task->>'id')::uuid);
  if jsonb_array_length(preview->'plan')<>1 then raise exception 'future protected block absent: %',preview; end if;
  if jsonb_array_length(preview->'retained')<>2 then raise exception 'retained commitments absent'; end if;
  -- Preview is not deletion. Stale preview must cause no partial effects.
  update public.tasks set title='Changed' where id=(task->>'id')::uuid;
  if public.item_delete_command(op,preview)->>'status'<>'conflict' then raise exception 'accepted stale preview'; end if;
  if not exists(select 1 from public.calendar_events where id=(event->>'id')::uuid) then raise exception 'partial removal'; end if;
  preview:=public.item_deletion_preview('task',(task->>'id')::uuid);
  perform set_config('request.jwt.claims','{"sub":"68120000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if public.item_delete_command(op,preview)->>'status'<>'not-found' then raise exception 'cross-owner deletion'; end if;
  perform set_config('request.jwt.claims','{"sub":"68120000-0000-0000-0000-000000000001","role":"authenticated"}',true);
  begin
    result:=public.item_delete_command(op,preview);
    if result->>'status'<>'complete' then raise exception 'delete failed: %',result; end if;
    raise exception using errcode='PT499',message='simulate rollback';
  exception when sqlstate 'PT499' then null;
  end;
  if not exists(select 1 from public.tasks where id=(task->>'id')::uuid) or not exists(select 1 from public.calendar_events where id=(event->>'id')::uuid) then raise exception 'partial transaction'; end if;
  result:=public.item_delete_command(op,preview);
  if result->>'status'<>'complete' then raise exception 'delete failed: %',result; end if;
  if public.item_delete_command(op,preview)->>'status'<>'already-applied' then raise exception 'receipt replay failed'; end if;
  if public.item_delete_command(op,jsonb_set(preview,'{title}','"different"'))->>'status'<>'conflict' then raise exception 'changed replay accepted'; end if;
  if exists(select 1 from public.tasks where id=(task->>'id')::uuid) then raise exception 'deleted task visible'; end if;
  if exists(select 1 from public.calendar_events where id=(event->>'id')::uuid) then raise exception 'future block not removed'; end if;
  if (select count(*) from public.calendar_events where title in ('Past work','External commitment') and task_id is null)<>2 then raise exception 'history/commitment lost'; end if;
  if public.action_queue_snapshot()->'tasks' @> jsonb_build_array(jsonb_build_object('id',task->>'id')) then raise exception 'deleted task in queue snapshot'; end if;
  if not exists(select 1 from public.planner_changes where id=(result->>'changeId')::uuid) then raise exception 'missing history'; end if;
  begin
    perform public.task_capture_command('edit',gen_random_uuid(),(task->>'id')::uuid,(preview->>'version')::uuid,'{"title":"Resurrect"}');
  exception when check_violation then null;
  end;
  if exists(select 1 from public.tasks where id=(task->>'id')::uuid) then raise exception 'resurrected task'; end if;
  project:=public.project_capture_command('create',gen_random_uuid(),null,null,'{"name":"Delete project"}')->'project';
  child:=public.task_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','Keep child',
    'project_id',project->>'id','expected_project_version',project->>'version'))->'task';
  preview:=public.item_deletion_preview('project',(project->>'id')::uuid);
  if jsonb_array_length(preview->'children')<>1 then raise exception 'child missing'; end if;
  result:=public.item_delete_command(gen_random_uuid(),preview);
  if result->>'status'<>'complete' then raise exception 'project delete failed: %',result; end if;
  if exists(select 1 from public.projects where id=(project->>'id')::uuid) then raise exception 'deleted project visible'; end if;
  if not exists(select 1 from public.tasks where id=(child->>'id')::uuid and project_id is null and not is_completed) then raise exception 'child lost or changed'; end if;
  begin
    perform public.task_capture_command('archive',gen_random_uuid(),(child->>'id')::uuid,(select version from public.tasks where id=(child->>'id')::uuid),'{}');
    raise exception 'legacy archive accepted';
  exception when check_violation then null;
  end;
  -- A single RPC can wait while a future block starts. The execution preview
  -- must use the clock after its locks, not the original statement timestamp.
  task:=public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Starting now"}')->'task';
  future:=(clock_timestamp() at time zone 'UTC')+interval '1 second';
  insert into public.calendar_events(user_id,title,start_date,end_date,start_time,end_time,timezone,app_owned,is_protected,task_id)
    values('68120000-0000-0000-0000-000000000001','Starting block',future::date,(future+interval '1 hour')::date,
      future::time,(future+interval '1 hour')::time,'UTC',true,false,(task->>'id')::uuid);
  preview:=public.item_deletion_preview('task',(task->>'id')::uuid);
  if jsonb_array_length(preview->'plan')<>1 then raise exception 'starting block fixture missing'; end if;
  perform pg_sleep(1.1);
  if public.item_delete_command(gen_random_uuid(),preview)->>'status'<>'conflict' then raise exception 'removed newly started block'; end if;
  if not exists(select 1 from public.calendar_events where task_id=(task->>'id')::uuid) then raise exception 'current block lost'; end if;
  preview:=public.item_deletion_preview('task',(task->>'id')::uuid);
  if public.item_delete_command(gen_random_uuid(),preview)->>'status'<>'complete' then raise exception 'fresh current-block review failed'; end if;
  if not exists(select 1 from public.calendar_events where title='Starting block' and task_id is null) then raise exception 'current commitment not retained'; end if;
end $$;
rollback;
