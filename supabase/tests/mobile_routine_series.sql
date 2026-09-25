-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('62000000-0000-0000-0000-000000000001','series-owner@example.test');
select public.sql_fixture_create_auth_user('62000000-0000-0000-0000-000000000002','series-other@example.test');
select set_config('request.jwt.claims','{"sub":"62000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare result jsonb; rows jsonb; item jsonb; request jsonb; preview jsonb; occurrence jsonb; series_id uuid;
 preserved jsonb; completed jsonb; before_rows jsonb; stale jsonb;
begin
 set local role authenticated;
 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Monday walk','date','2090-03-13','startTime','09:00','endTime','10:00','timezone','UTC','protected',true,'rule','{"frequency":"weekly","interval":1,"days_of_week":[1]}'::jsonb));
 if result->>'status' <> 'complete' then raise exception 'create failed %',result; end if;
 rows:=public.planner_routine_series_snapshot()->'rows';
 if jsonb_array_length(rows) <> 1 or rows->0->>'title' <> 'Monday walk' or rows->0->>'nextDate' <> '2090-03-13' then raise exception 'library must include future rules with computed next date %',rows; end if;
 series_id:=(rows->0->>'id')::uuid;
 occurrence:=public.planner_routine_snapshot('2090-03-13')->'rows'->0;
 item:=rows->0;
 request:=jsonb_build_object('operation','pause','seriesId',series_id,'effectiveDate','2090-03-13','expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion');
 preview:=public.planner_routine_series_preview(request);
 if preview->>'status' <> 'complete' or (preview->>'affected')::integer <> 1 then raise exception 'pause preview %',preview; end if;
 request:=request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token');
 result:=public.planner_routine_series_command(request);
 if result->>'status' <> 'complete' then raise exception 'pause %',result; end if;
 if public.planner_routine_series_command(request)->>'status' <> 'already-applied' then raise exception 'retry not idempotent'; end if;
 occurrence:=public.planner_routine_snapshot('2090-03-13')->'rows'->0;
 if occurrence->'occurrence'->>'state' <> 'withdrawn' or occurrence->'event' <> 'null'::jsonb then raise exception 'pause must remove reservation %',occurrence; end if;
 item:=public.planner_routine_series_snapshot()->'rows'->0;
 request:=jsonb_build_object('operation','resume','seriesId',series_id,'effectiveDate','2090-03-20','expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion');
 preview:=public.planner_routine_series_preview(request);
 result:=public.planner_routine_series_command(request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token'));
 if result->>'status' <> 'complete' then raise exception 'resume %',result; end if;
 occurrence:=public.planner_routine_snapshot('2090-03-20')->'rows'->0;
 if occurrence->'occurrence'->>'state' <> 'open' or occurrence->'event'->>'start_time' <> '09:00:00' then raise exception 'resume must restore reservation %',occurrence; end if;
 occurrence:=public.planner_routine_snapshot('2090-03-13')->'rows'->0;
 if occurrence->'occurrence'->>'state' <> 'withdrawn' then raise exception 'resume backfilled pause'; end if;
 item:=public.planner_routine_series_snapshot()->'rows'->0;
 request:=jsonb_build_object('operation','revise','seriesId',series_id,'effectiveDate','2090-03-20','expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion','title','Evening walk','startTime','18:00','endTime','19:00','protected',false,'rule','{"frequency":"daily","interval":1}'::jsonb);
 preview:=public.planner_routine_series_preview(request);
 request:=request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token');
 result:=public.planner_routine_series_command(request);
 if result->>'status' <> 'complete' then raise exception 'revise %',result; end if;
 occurrence:=public.planner_routine_snapshot('2090-03-20')->'rows'->0;
 if occurrence->'event'->>'title' <> 'Evening walk' or occurrence->'task'->>'title' <> 'Evening walk' or occurrence->'event'->>'start_time' <> '18:00:00' then raise exception 'revision did not synchronize task and time %',occurrence; end if;
 -- An individually moved occurrence survives a following revision verbatim.
 occurrence:=public.planner_routine_snapshot('2090-03-21')->'rows'->0;
 result:=public.planner_routine_command(jsonb_build_object('operation','edit','operationId',gen_random_uuid(),'seriesId',series_id,
   'occurrenceId',occurrence->'occurrence'->>'id','expectedSeriesToken',occurrence->'series'->'revision_token','expectedOccurrenceVersion',occurrence->'occurrence'->'version',
   'expectedTaskVersion',occurrence->'task'->'version','expectedEventVersion',occurrence->'event'->'version','title','My one-off walk','date','2090-03-21','startTime','20:00','endTime','21:00'));
 if result->>'status'<>'complete' then raise exception 'individual edit %',result; end if;
 preserved:=public.planner_routine_snapshot('2090-03-21')->'rows'->0;
 occurrence:=public.planner_routine_snapshot('2090-03-22')->'rows'->0;
 preview:=public.planner_completion_preview((occurrence->'task'->>'id')::uuid);
 result:=public.planner_command(jsonb_build_object('operation','complete','operationId',gen_random_uuid(),'taskId',occurrence->'task'->>'id','expectedVersion',occurrence->'task'->>'version',
   'plan',preview->'plan','occurrenceVersion',preview->'occurrenceVersion','seriesToken',preview->'seriesToken'));
 if result->>'status'<>'complete' then raise exception 'completion %',result; end if;
 completed:=public.planner_routine_snapshot('2090-03-22')->'rows'->0;
 item:=public.planner_routine_series_snapshot()->'rows'->0;
 request:=jsonb_build_object('operation','revise','seriesId',series_id,'effectiveDate','2090-03-20','expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion',
   'title','Morning walk','startTime','08:00','endTime','09:00','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb);
 preview:=public.planner_routine_series_preview(request);
 if (preview->>'preserved')::integer <> 2 then raise exception 'preview does not count preserved work %',preview; end if;
 request:=request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token');
 before_rows:=public.planner_routine_series_snapshot();
 begin
   result:=public.planner_routine_series_command(request);
   if result->>'status'<>'complete' then raise exception 'second revision %',result; end if;
   raise exception using errcode='PT499',message='enclosing transaction failed';
 exception when sqlstate 'PT499' then null;
 end;
 if public.planner_routine_series_snapshot() is distinct from before_rows then raise exception 'partial series mutation after rollback'; end if;
 result:=public.planner_routine_series_command(request);
 if result->>'status'<>'complete' then raise exception 'retry after rollback %',result; end if;
 occurrence:=public.planner_routine_snapshot('2090-03-21')->'rows'->0;
 if occurrence->'event' is distinct from preserved->'event' or occurrence->'task'->>'title' <> 'My one-off walk' then raise exception 'individual edit rewritten'; end if;
 occurrence:=public.planner_routine_snapshot('2090-03-22')->'rows'->0;
 if occurrence->'event' is distinct from completed->'event' or occurrence->'task' is distinct from completed->'task' or occurrence->'occurrence' is distinct from completed->'occurrence' then raise exception 'completed history rewritten'; end if;
 -- Pause/resume must restore an existing withdrawn reservation, not only inserts.
 item:=public.planner_routine_series_snapshot()->'rows'->0;
 request:=jsonb_build_object('operation','pause','seriesId',series_id,'effectiveDate','2090-03-20','expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion');
 preview:=public.planner_routine_series_preview(request);
 stale:=request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token');
 result:=public.planner_routine_series_command(stale);
 if result->>'status'<>'complete' then raise exception 'second pause %',result; end if;
 item:=public.planner_routine_series_snapshot()->'rows'->0;
 request:=jsonb_build_object('operation','resume','seriesId',series_id,'effectiveDate','2090-03-20','expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion');
 preview:=public.planner_routine_series_preview(request);
 result:=public.planner_routine_series_command(request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token'));
 if result->>'status'<>'complete' then raise exception 'second resume %',result; end if;
 occurrence:=public.planner_routine_snapshot('2090-03-20')->'rows'->0;
 if occurrence->'event'->>'start_time' <> '08:00:00' or occurrence->'occurrence'->>'state'<>'open' then raise exception 'existing withdrawal not restored %',occurrence; end if;
 if public.planner_routine_series_command(stale||jsonb_build_object('operationId',gen_random_uuid()))->>'status'<>'conflict' then raise exception 'stale preview accepted'; end if;
 -- End is terminal, retains history, and cannot be replayed with altered intent.
 item:=public.planner_routine_series_snapshot()->'rows'->0;
 request:=jsonb_build_object('operation','end','seriesId',series_id,'effectiveDate','2090-03-20','expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion');
 preview:=public.planner_routine_series_preview(request);
 request:=request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token');
 result:=public.planner_routine_series_command(request);
 if result->>'status'<>'complete' then raise exception 'end failed %',result; end if;
 if public.planner_routine_series_command(request||'{"operation":"resume"}'::jsonb)->>'status'<>'conflict' then raise exception 'reused receipt accepted'; end if;
 item:=public.planner_routine_series_snapshot()->'rows'->0;
 if item->>'status'<>'ended' then raise exception 'end missing from library'; end if;
 if public.planner_routine_series_preview(jsonb_build_object('operation','resume','seriesId',series_id,'effectiveDate','2090-03-23','expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion'))->>'status'<>'invalid' then raise exception 'terminal series resumed'; end if;
 perform set_config('request.jwt.claims','{"sub":"62000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 if public.planner_routine_series_snapshot()->'rows'<>'[]'::jsonb or exists(select 1 from public.planner_routine_schedule_revisions) then raise exception 'cross-account read'; end if;
 if public.planner_routine_series_command(request)->>'status'<>'not-found' then raise exception 'cross-account write'; end if;
end $$;
select set_config('request.jwt.claims','{"sub":"62000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare result jsonb; item jsonb; before_row jsonb; after_row jsonb; request jsonb; preview jsonb;
 series_id uuid; today date:=(statement_timestamp() at time zone 'UTC')::date;
begin
 set local role authenticated;
 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Already started','date',today,
   'startTime','00:00','endTime','23:59','timezone','UTC','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb));
 if result->>'status' is distinct from 'complete' then raise exception 'create started %',result; end if;
 series_id:=(result->>'seriesId')::uuid;
 before_row:=public.planner_routine_snapshot(today)->'rows'->0;
 select value into item from jsonb_array_elements(public.planner_routine_series_snapshot()->'rows') where value->>'id'=series_id::text;
 request:=jsonb_build_object('operation','pause','seriesId',series_id,'effectiveDate',today,'expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion');
 preview:=public.planner_routine_series_preview(request);
 if preview->>'preserved' is distinct from '1' or preview->>'affected' is distinct from '0' then raise exception 'started preview %',preview; end if;
 result:=public.planner_routine_series_command(request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token'));
 if result->>'status' is distinct from 'complete' then raise exception 'pause started %',result; end if;
 after_row:=public.planner_routine_snapshot(today)->'rows'->0;
 if after_row->'event' is distinct from before_row->'event' or after_row->'task'->>'title' is distinct from 'Already started' then raise exception 'started work changed'; end if;

 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Future end','date',today+2,
   'startTime','09:00','endTime','10:00','timezone','UTC','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb));
 series_id:=(result->>'seriesId')::uuid;
 select value into item from jsonb_array_elements(public.planner_routine_series_snapshot()->'rows') where value->>'id'=series_id::text;
 request:=jsonb_build_object('operation','end','seriesId',series_id,'effectiveDate',today+4,'expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion');
 preview:=public.planner_routine_series_preview(request);
 result:=public.planner_routine_series_command(request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token'));
 if result->>'status' is distinct from 'complete' then raise exception 'future end %',result; end if;
 select value into after_row from jsonb_array_elements(public.planner_routine_snapshot(today+3)->'rows') where value->'series'->>'id'=series_id::text;
 if after_row->'event'->>'start_time' is distinct from '09:00:00' then raise exception 'pre-end active date lost %',after_row; end if;

 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Future pause','date',today+6,
   'startTime','09:00','endTime','10:00','timezone','UTC','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb));
 series_id:=(result->>'seriesId')::uuid;
 select value into item from jsonb_array_elements(public.planner_routine_series_snapshot()->'rows') where value->>'id'=series_id::text;
 request:=jsonb_build_object('operation','pause','seriesId',series_id,'effectiveDate',today+8,'expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion');
 preview:=public.planner_routine_series_preview(request);
 result:=public.planner_routine_series_command(request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token'));
 if result->>'status' is distinct from 'complete' then raise exception 'future pause %',result; end if;
 select value into after_row from jsonb_array_elements(public.planner_routine_snapshot(today+7)->'rows') where value->'series'->>'id'=series_id::text;
 if after_row->'event'->>'start_time' is distinct from '09:00:00' then raise exception 'pre-pause active date lost %',after_row; end if;
end $$;
do $$
declare result jsonb; item jsonb; occurrence jsonb; series_id uuid;
begin
 set local role authenticated;
 perform set_config('request.jwt.claims','{"sub":"62000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 result:=public.planner_routine_command(jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Tokyo routine','date','2090-03-13',
   'startTime','09:00','endTime','10:00','timezone','Asia/Tokyo','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb));
 series_id:=(result->>'seriesId')::uuid;
 select value into item from jsonb_array_elements(public.planner_routine_series_snapshot()->'rows') where value->>'id'=series_id::text;
 if (item->>'nextStartInstant')::timestamptz is distinct from '2090-03-13T00:00:00Z'::timestamptz then raise exception 'next instant missing %',item; end if;
 select value into occurrence from jsonb_array_elements(public.planner_routine_snapshot('2090-03-13')->'rows') where value->'series'->>'id'=series_id::text;
 result:=public.calendar_capture_command('edit',gen_random_uuid(),(occurrence->'event'->>'id')::uuid,(occurrence->'event'->>'version')::uuid,
   '{"start_date":"2090-03-14","end_date":"2090-03-14","start_time":"00:30","end_time":"01:30","timezone":"UTC"}'::jsonb);
 if result->>'status' is distinct from 'complete' then raise exception 'cross-zone edit %',result; end if;
 select value into item from jsonb_array_elements(public.planner_routine_series_snapshot()->'rows') where value->>'id'=series_id::text;
 if (item->>'nextStartInstant')::timestamptz is distinct from '2090-03-14T00:00:00Z'::timestamptz or item->>'nextStartTime' is distinct from '09:00:00'
 then raise exception 'next must compare absolute instants and display the series zone %',item; end if;
end $$;
rollback;
