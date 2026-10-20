-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('62000000-0000-0000-0000-000000000001','routine-period-owner@example.test');
select public.sql_fixture_create_auth_user('62000000-0000-0000-0000-000000000002','routine-period-other@example.test');
select set_config('request.jwt.claims','{"sub":"62000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare request jsonb; result jsonb; rows jsonb; series_id uuid; row jsonb; preview jsonb; series jsonb; action text; day date;
begin
 set local role authenticated;
 request:=jsonb_build_object('operation','create','operationId',gen_random_uuid(),
   'title','Walk the dog','date','2090-03-13','timezone','America/Los_Angeles',
   'timingMode','period','periods',jsonb_build_array('morning','midday','evening'),
   'rule','{"frequency":"daily","interval":1}'::jsonb);
 result:=public.planner_routine_command(request);
 if result->>'status' is distinct from 'complete' then raise exception 'Untimed routine creation failed: %',result; end if;
 series_id:=(result->>'seriesId')::uuid;
 rows:=public.planner_routine_snapshot_v2('2090-03-13')->'rows';
 if jsonb_array_length(rows)<>3 then raise exception 'Expected three separately identifiable daily occurrences: %',rows; end if;
 if (select count(distinct r->'occurrence'->>'id') from jsonb_array_elements(rows) r)<>3
   or (select count(distinct r->'task'->>'id') from jsonb_array_elements(rows) r)<>3 then
   raise exception 'Daily periods must not share occurrence or task identity';
 end if;
 if exists(select 1 from jsonb_array_elements(rows) r where r->'event' <> 'null'::jsonb
   or r->'schedule'->>'start_time' is not null or r->'schedule'->>'end_time' is not null) then
   raise exception 'An untimed routine must not invent a reservation';
 end if;
 if public.planner_routine_command(request)->>'status' is distinct from 'already-applied'
   or public.planner_routine_snapshot_v2('2090-03-13')->'rows' is distinct from rows then
   raise exception 'Retry or read changed the saved occurrences';
 end if;
 if (select count(*) from jsonb_array_elements(public.planner_routine_series_snapshot_v2()->'rows') r
     where r->>'id'=series_id::text)<>1 then raise exception 'One routine must have one series row'; end if;
 if not exists(select 1 from jsonb_array_elements(public.planner_routine_series_snapshot_v2()->'rows') r
   where r->>'id'=series_id::text and r->>'nextDate'='2090-03-13' and r->>'nextPeriod'='morning'
     and r->>'nextStartInstant' is null) then raise exception 'Next occurrence must be a real date and period, without a clock'; end if;
 select r into row from jsonb_array_elements(rows) r where r->>'period'='morning';
 preview:=public.planner_completion_preview((row->'task'->>'id')::uuid);
 result:=public.planner_command(jsonb_build_object('operation','complete','operationId',gen_random_uuid(),
   'taskId',row->'task'->>'id','expectedVersion',row->'task'->>'version','plan',preview->'plan',
   'occurrenceVersion',preview->>'occurrenceVersion','seriesToken',preview->'seriesToken'));
 if result->>'status' is distinct from 'complete' then raise exception 'Period completion failed: %',result; end if;
 rows:=public.planner_routine_snapshot_v2('2090-03-13')->'rows';
 if (select count(*) from jsonb_array_elements(rows) r where (r->'task'->>'is_completed')::boolean)<>1 then
   raise exception 'Completing morning changed another period'; end if;
 select r into row from jsonb_array_elements(rows) r where r->>'period'='midday';
 request:=jsonb_build_object('operation','skip','timingMode','period','operationId',gen_random_uuid(),
   'seriesId',series_id,'occurrenceId',row->'occurrence'->>'id','expectedSeriesToken',row->'series'->'revision_token',
   'expectedOccurrenceVersion',row->'occurrence'->>'version','expectedTaskVersion',row->'task'->>'version','expectedEventVersion',null);
 result:=public.planner_routine_command(request);
 if result->>'status' is distinct from 'complete' then raise exception 'Period skip failed: %',result; end if;
 rows:=public.planner_routine_snapshot_v2('2090-03-13')->'rows';
 if not exists(select 1 from jsonb_array_elements(rows) r where r->>'period'='midday' and r->'occurrence'->>'state'='skipped')
   or not exists(select 1 from jsonb_array_elements(rows) r where r->>'period'='evening' and r->'occurrence'->>'state'='open') then
   raise exception 'Skip did not remain scoped to midday'; end if;
 if jsonb_array_length(public.planner_routine_snapshot_v2('2090-03-14')->'rows')<>3 then
   raise exception 'Today completion/skip changed tomorrow'; end if;
 select r into row from jsonb_array_elements(rows) r where r->>'period'='evening';
 request:=jsonb_build_object('operation','edit','timingMode','period','operationId',gen_random_uuid(),
   'seriesId',series_id,'occurrenceId',row->'occurrence'->>'id','expectedSeriesToken',row->'series'->'revision_token',
   'expectedOccurrenceVersion',row->'occurrence'->>'version','expectedTaskVersion',row->'task'->>'version','expectedEventVersion',null,
   'title','Dog outing today','date','2090-03-13','period','morning');
 if public.planner_routine_command(request)->>'status' is distinct from 'conflict' then
   raise exception 'Moving a period over its completed sibling must conflict'; end if;
 request:=request||jsonb_build_object('operationId',gen_random_uuid(),'period','afternoon');
 result:=public.planner_routine_command(request);
 if result->>'status' is distinct from 'complete' then raise exception 'Single period edit failed: %',result; end if;
 if not exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-13')->'rows') r
   where r->'occurrence'->>'id'=row->'occurrence'->>'id' and r->>'period'='afternoon'
   and r->'occurrence'->>'scheduled_period'='evening') then raise exception 'Moving lost immutable occurrence identity'; end if;
 select r into series from jsonb_array_elements(public.planner_routine_series_snapshot_v2()->'rows') r where r->>'id'=series_id::text;
 request:=jsonb_build_object('operation','revise','seriesId',series_id,'effectiveDate','2090-03-14',
   'expectedSeriesToken',series->'seriesToken','expectedScheduleVersion',series->>'scheduleVersion',
   'title','Dog outings','timingMode','period','periods',jsonb_build_array('morning','afternoon'),
   'rule','{"frequency":"daily","interval":1}'::jsonb);
 preview:=public.planner_routine_series_preview(request);
 if preview->>'status' is distinct from 'complete' then raise exception 'Period series preview failed: %',preview; end if;
 result:=public.planner_routine_series_command(request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token'));
 if result->>'status' is distinct from 'complete' then raise exception 'Period series revision failed: %',result; end if;
 rows:=public.planner_routine_snapshot_v2('2090-03-14')->'rows';
 if (select count(*) from jsonb_array_elements(rows) r where r->'occurrence'->>'state'='open')<>2
   or not exists(select 1 from jsonb_array_elements(rows) r where r->>'period'='afternoon' and r->'occurrence'->>'state'='open') then
   raise exception 'Revision did not replace only future untouched periods: %',rows; end if;
 if not exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-13')->'rows') r
   where r->>'period'='morning' and r->'occurrence'->>'state'='completed') then raise exception 'Revision rewrote completed history'; end if;
 foreach action in array array['pause','resume','time','period','end'] loop
   day:=case action when 'pause' then '2090-03-15' when 'resume' then '2090-03-17' when 'time' then '2090-03-18'
     when 'period' then '2090-03-19' else '2090-03-20' end;
   select r into series from jsonb_array_elements(public.planner_routine_series_snapshot_v2()->'rows') r where r->>'id'=series_id::text;
   request:=jsonb_build_object('operation',case when action in ('time','period') then 'revise' else action end,
     'seriesId',series_id,'effectiveDate',day,'expectedSeriesToken',series->'seriesToken','expectedScheduleVersion',series->>'scheduleVersion');
   if action in ('time','period') then
     request:=request||jsonb_build_object('title','Daily outings','rule','{"frequency":"daily","interval":1}'::jsonb,'timingMode',action)
       ||case when action='time' then jsonb_build_object('startTime','09:00','endTime','10:00','protected',false)
         else jsonb_build_object('periods',jsonb_build_array('morning','midday','evening')) end;
   end if;
   preview:=public.planner_routine_series_preview(request);
   if preview->>'status' is distinct from 'complete' then raise exception '% preview failed: %',action,preview; end if;
   request:=request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token');
   result:=public.planner_routine_series_command(request);
   if result->>'status' is distinct from 'complete' then raise exception '% command failed: %',action,result; end if;
   if public.planner_routine_series_command(request)->>'status' is distinct from 'already-applied' then raise exception 'Series retry failed'; end if;
   rows:=public.planner_routine_snapshot_v2(day)->'rows';
   if action in ('pause','end') and exists(select 1 from jsonb_array_elements(rows) r where r->'occurrence'->>'state' in ('open','extra')) then
     raise exception '% left future activities active',action; end if;
   if action='resume' and (select count(*) from jsonb_array_elements(rows) r where r->'occurrence'->>'state'='open')<>2 then
     raise exception 'Resume did not restore two periods: %',rows; end if;
   if action='time' and (select count(*) from jsonb_array_elements(rows) r where r->'event'->>'start_time'='09:00:00')<>1 then
     raise exception 'Switching to clock time did not create one reservation: %',rows; end if;
   if action='period' and ((select count(*) from jsonb_array_elements(rows) r where r->'occurrence'->>'state'='open')<>3
     or exists(select 1 from jsonb_array_elements(rows) r where r->'event' <> 'null'::jsonb)) then
     raise exception 'Switching back to periods created the wrong activities: %',rows; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-16')->'rows') r
   where r->'occurrence'->>'state' in ('open','extra')) then raise exception 'Resume backfilled a paused date'; end if;
end $$;
do $$
declare result jsonb;
begin
 result:=public.task_capture_command('create',gen_random_uuid(),null,null,
   '{"title":"Lunch task","planned_date":"2090-03-13","planned_period":"midday"}'::jsonb);
 if result->>'status' is distinct from 'complete' or result->'task'->>'planned_period' is distinct from 'midday' then
   raise exception 'Ordinary task cannot choose Midday: %',result; end if;
end $$;
do $$
declare result jsonb; row jsonb; series_id uuid; step_id uuid:=gen_random_uuid(); change public.planner_changes;
begin
 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Morning checklist',
   'date','2090-03-13','timezone','America/Los_Angeles','timingMode','period','periods',jsonb_build_array('morning'),
   'rule','{"frequency":"daily","interval":1}'::jsonb,'steps',jsonb_build_array(jsonb_build_object('id',step_id,'title','Put on shoes','checked',false))));
 if result->>'status' is distinct from 'complete' then raise exception 'Period with steps failed: %',result; end if;
 series_id:=(result->>'seriesId')::uuid;
 select r into row from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-13')->'rows') r where r->'series'->>'id'=series_id::text;
 result:=public.planner_routine_command(jsonb_build_object('operation','edit','timingMode','period','operationId',gen_random_uuid(),
   'seriesId',series_id,'occurrenceId',row->'occurrence'->>'id','expectedSeriesToken',row->'series'->'revision_token',
   'expectedOccurrenceVersion',row->'occurrence'->>'version','expectedTaskVersion',row->'task'->>'version','expectedEventVersion',null,
   'title','Afternoon checklist','date','2090-03-13','period','afternoon',
   'steps',jsonb_build_array(jsonb_build_object('id',step_id,'title','Put on shoes','checked',true))));
 if result->>'status' is distinct from 'complete' or result->>'changeId' is null then raise exception 'Step completion edit failed: %',result; end if;
 select * into change from public.planner_changes where id=(result->>'changeId')::uuid;
 result:=public.planner_command(jsonb_build_object('operation','undo','operationId',gen_random_uuid(),'changeId',change.id,'expectedVersion',change.version));
 if result->>'status' is distinct from 'complete' then raise exception 'Period completion Undo failed: %',result; end if;
 if not exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-13')->'rows') r
   where r->'series'->>'id'=series_id::text and r->>'period'='morning' and r->'task'->>'title'='Morning checklist'
     and r->'task'->'steps'->0->>'checked'='false' and r->'task'->>'is_completed'='false') then
   raise exception 'Undo did not restore the entire period edit'; end if;
end $$;
do $$
declare request jsonb; result jsonb; row jsonb; bad jsonb; before_count bigint; series_id uuid; today date;
begin
 if has_function_privilege('anon','public.planner_routine_snapshot_v2(date)','execute')
   or has_function_privilege('authenticated','planner_private.edit_period_routine(jsonb)','execute') then
   raise exception 'Period RPC permissions exposed an internal or anonymous entry point'; end if;
 select count(*) into before_count from public.recurring_task_series;
 request:=jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','School drop-off',
   'date','2090-03-13','timezone','America/Los_Angeles','timingMode','period','periods',jsonb_build_array('morning'),
   'rule','{"frequency":"weekly","interval":1,"days_of_week":[1,2,3,4,5]}'::jsonb);
 for bad in select value from jsonb_array_elements('[{"periods":[]},{"periods":["morning","morning"]},{"periods":["night"]},{"startTime":"09:00"},{"protected":true}]') loop
   result:=public.planner_routine_command(request||bad||jsonb_build_object('operationId',gen_random_uuid()));
   if result->>'status' is distinct from 'invalid' then raise exception 'Invalid period request accepted: % %',bad,result; end if;
 end loop;
 if (select count(*) from public.recurring_task_series)<>before_count then raise exception 'Invalid create wrote a series'; end if;
 result:=public.planner_routine_command(request);
 if result->>'status' is distinct from 'complete' then raise exception 'Weekday create failed: %',result; end if;
 series_id:=(result->>'seriesId')::uuid;
 if exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot('2090-03-13')->'rows') r where r->'series'->>'id'=series_id::text)
   or exists(select 1 from jsonb_array_elements(public.planner_routine_series_snapshot()->'rows') r where r->>'id'=series_id::text) then
   raise exception 'Legacy clock-only reads leaked nullable-time routines'; end if;
 if exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-18')->'rows') r where r->'series'->>'id'=series_id::text) then
   raise exception 'Weekday routine appeared on Saturday'; end if;
 select r into row from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-13')->'rows') r where r->'series'->>'id'=series_id::text;
 request:=jsonb_build_object('operation','edit','timingMode','period','operationId',gen_random_uuid(),
   'seriesId',series_id,'occurrenceId',row->'occurrence'->>'id','expectedSeriesToken',row->'series'->'revision_token',
   'expectedOccurrenceVersion',row->'occurrence'->>'version','expectedTaskVersion',row->'task'->>'version','expectedEventVersion',null,
   'title','School drop-off moved','date','2090-03-14','period','morning');
 if public.planner_routine_command(request)->>'status' is distinct from 'conflict' then raise exception 'Moving onto a not-yet-materialized sibling should conflict'; end if;
 request:=request||jsonb_build_object('operationId',gen_random_uuid(),'period','afternoon');
 result:=public.planner_routine_command(request);
 if result->>'status' is distinct from 'complete' then raise exception 'Date and period move failed: %',result; end if;
 if exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-13')->'rows') r where r->'occurrence'->>'id'=row->'occurrence'->>'id')
   or not exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-14')->'rows') r
     where r->'occurrence'->>'id'=row->'occurrence'->>'id' and r->>'period'='afternoon' and r->'event'='null') then
   raise exception 'Moved occurrence rendered on the wrong day'; end if;
 if public.planner_routine_command(request)->>'status' is distinct from 'already-applied' then raise exception 'Moved occurrence retry failed'; end if;
 if public.planner_routine_command(request||jsonb_build_object('operationId',gen_random_uuid()))->>'status' is distinct from 'conflict' then raise exception 'Stale edit did not conflict'; end if;
 perform set_config('request.jwt.claims','{"sub":"62000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 if jsonb_array_length(public.planner_routine_snapshot_v2('2090-03-14')->'rows')<>0
   or jsonb_array_length(public.planner_routine_series_snapshot_v2()->'rows')<>0
   or exists(select 1 from public.planner_routine_period_placements) then raise exception 'Another owner can read routine placements'; end if;
 result:=public.planner_routine_command(request||jsonb_build_object('operationId',gen_random_uuid()));
 if result->>'status' not in ('not-found','conflict') then raise exception 'Another owner can edit occurrence: %',result; end if;
 perform set_config('request.jwt.claims','{"sub":"62000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
 perform set_config('request.jwt.claims','{"sub":"62000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 today:=(clock_timestamp() at time zone 'Pacific/Kiritimati')::date;
 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Today all periods',
   'date',today,'timezone','Pacific/Kiritimati','timingMode','period','periods',jsonb_build_array('morning','midday','afternoon','evening'),
   'rule','{"frequency":"daily","interval":1}'::jsonb));
 if result->>'status' is distinct from 'complete' then raise exception 'Today period creation failed: %',result; end if;
 if (select count(*) from jsonb_array_elements(public.planner_routine_snapshot_v2(today)->'rows') r where r->'series'->>'id'=result->>'seriesId')<>4 then
   raise exception 'Today periods were expired by an invented clock cutoff'; end if;
 perform set_config('request.jwt.claims','{"sub":"62000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
end $$;
do $$
declare request jsonb; result jsonb; row jsonb; series jsonb; preview jsonb; series_id uuid; moved_id text;
begin
 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Moved walk',
   'date','2090-03-21','timezone','UTC','timingMode','period','periods',jsonb_build_array('morning'),
   'rule','{"frequency":"daily","interval":1}'::jsonb));
 if result->>'status'<>'complete' then raise exception 'Create moved routine failed: %',result; end if;
 series_id:=(result->>'seriesId')::uuid;
 select r into row from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-21')->'rows') r where r->'series'->>'id'=series_id::text;
 moved_id:=row->'occurrence'->>'id';
 result:=public.planner_routine_command(jsonb_build_object('operation','edit','timingMode','period','operationId',gen_random_uuid(),
   'seriesId',series_id,'occurrenceId',moved_id,'expectedSeriesToken',row->'series'->'revision_token',
   'expectedOccurrenceVersion',row->'occurrence'->>'version','expectedTaskVersion',row->'task'->>'version','expectedEventVersion',null,
   'title','Moved afternoon walk','date','2090-03-22','period','afternoon'));
 if result->>'status'<>'complete' then raise exception 'Move failed: %',result; end if;
 select r into series from jsonb_array_elements(public.planner_routine_series_snapshot_v2()->'rows') r where r->>'id'=series_id::text;
 request:=jsonb_build_object('operation','revise','seriesId',series_id,'effectiveDate','2090-03-22',
   'expectedSeriesToken',series->'seriesToken','expectedScheduleVersion',series->>'scheduleVersion',
   'title','Morning and afternoon walks','timingMode','period','periods',jsonb_build_array('morning','afternoon'),
   'rule','{"frequency":"daily","interval":1}'::jsonb);
 preview:=public.planner_routine_series_preview(request);
 if preview->>'status'<>'complete' or (preview->>'affected')::int<1 then raise exception 'Period impact did not count existing ordinary occurrences: %',preview; end if;
 result:=public.planner_routine_series_command(request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token'));
 if result->>'status'<>'complete' then raise exception 'Preserved moved placement blocked series revision: %',result; end if;
 if (select count(*) from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-22')->'rows') r
   where r->'series'->>'id'=series_id::text and r->'occurrence'->>'state' in ('open','extra','completed'))<>2
   or not exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-22')->'rows') r
     where r->'occurrence'->>'id'=moved_id and r->>'period'='afternoon' and r->'task'->>'title'='Moved afternoon walk') then
   raise exception 'Revision duplicated or replaced an individually moved occurrence'; end if;
 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Delete multi-period',
   'date','2090-03-23','timezone','UTC','timingMode','period','periods',jsonb_build_array('morning','midday','evening'),
   'rule','{"frequency":"daily","interval":1}'::jsonb));
 if result->>'status'<>'complete' then raise exception 'Create deletion routine failed: %',result; end if;
 result:=public.recurring_task_delete_series('delete-series',jsonb_build_object('userId',auth.uid(),
   'seriesId',result->>'seriesId','effectiveDate','2090-03-23','idempotencyKey',gen_random_uuid()));
 if result->>'status'<>'complete' then raise exception 'Retained deletion helper failed with multiple periods: %',result; end if;
end $$;
do $$
declare request jsonb; result jsonb; row jsonb; series jsonb; preview jsonb; series_id uuid; moved_id text; withdrawn_id text;
begin
 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Restored afternoon walk',
   'date','2090-03-24','timezone','UTC','timingMode','period','periods',jsonb_build_array('morning','afternoon'),
   'rule','{"frequency":"daily","interval":1}'::jsonb));
 if result->>'status' is distinct from 'complete' then raise exception 'Create restoration routine failed: %',result; end if;
 series_id:=(result->>'seriesId')::uuid;
 select r->'occurrence'->>'id' into withdrawn_id from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-25')->'rows') r
   where r->'series'->>'id'=series_id::text and r->>'period'='afternoon';
 if withdrawn_id is null then raise exception 'Restoration setup did not materialize the target occurrence'; end if;
 select r into series from jsonb_array_elements(public.planner_routine_series_snapshot_v2()->'rows') r where r->>'id'=series_id::text;
 request:=jsonb_build_object('operation','revise','seriesId',series_id,'effectiveDate','2090-03-25',
   'expectedSeriesToken',series->'seriesToken','expectedScheduleVersion',series->>'scheduleVersion',
   'title','Morning walks','timingMode','period','periods',jsonb_build_array('morning'),
   'rule','{"frequency":"daily","interval":1}'::jsonb);
 preview:=public.planner_routine_series_preview(request);
 result:=public.planner_routine_series_command(request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token'));
 if result->>'status' is distinct from 'complete' then raise exception 'Removing the target period failed: %',result; end if;
 if not exists(select 1 from public.recurring_task_occurrences where id=withdrawn_id::uuid and state='withdrawn') then
   raise exception 'Removing the period did not withdraw its ordinary occurrence'; end if;
 select r into row from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-24')->'rows') r
   where r->'series'->>'id'=series_id::text and r->>'period'='morning';
 moved_id:=row->'occurrence'->>'id';
 result:=public.planner_routine_command(jsonb_build_object('operation','edit','timingMode','period','operationId',gen_random_uuid(),
   'seriesId',series_id,'occurrenceId',moved_id,'expectedSeriesToken',row->'series'->'revision_token',
   'expectedOccurrenceVersion',row->'occurrence'->>'version','expectedTaskVersion',row->'task'->>'version','expectedEventVersion',null,
   'title','Individually moved afternoon walk','date','2090-03-25','period','afternoon'));
 if result->>'status' is distinct from 'complete' then raise exception 'Moving into the withdrawn period failed: %',result; end if;
 select r into series from jsonb_array_elements(public.planner_routine_series_snapshot_v2()->'rows') r where r->>'id'=series_id::text;
 request:=request||jsonb_build_object('expectedSeriesToken',series->'seriesToken','expectedScheduleVersion',series->>'scheduleVersion',
   'title','Morning and afternoon walks again','periods',jsonb_build_array('morning','afternoon'));
 preview:=public.planner_routine_series_preview(request);
 result:=public.planner_routine_series_command(request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token'));
 if result->>'status' is distinct from 'complete' then raise exception 'Restoring a withdrawn period must preserve the moved placement: %',result; end if;
 if (select count(*) from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-25')->'rows') r
   where r->'series'->>'id'=series_id::text and r->'occurrence'->>'state' in ('open','extra','completed'))<>2
   or not exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot_v2('2090-03-25')->'rows') r
     where r->'occurrence'->>'id'=moved_id and r->>'period'='afternoon' and r->'task'->>'title'='Individually moved afternoon walk')
   or not exists(select 1 from public.recurring_task_occurrences where id=withdrawn_id::uuid and state='withdrawn') then
   raise exception 'Restoring a period replaced the moved occurrence or resurrected a duplicate'; end if;
end $$;
rollback;
