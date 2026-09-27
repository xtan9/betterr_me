-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('63000000-0000-0000-0000-000000000001','overnight-owner@example.test');
select public.sql_fixture_create_auth_user('63000000-0000-0000-0000-000000000002','overnight-other@example.test');
select set_config('request.jwt.claims','{"sub":"63000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
declare request jsonb; result jsonb; item jsonb; row jsonb; sibling jsonb; preview jsonb; series_id uuid; dst_id uuid;
begin
 set local role authenticated;
 request:=jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Sleep','date','2090-12-31','startTime','22:00','endTime','06:00','timezone','America/Los_Angeles','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb);
 result:=public.planner_routine_command(request);
 if result->>'status' is distinct from 'complete' then raise exception 'overnight create %',result; end if;
 series_id:=(result->>'seriesId')::uuid;
 if public.planner_routine_command(request)->>'status' is distinct from 'already-applied' then raise exception 'retry changed identity'; end if;
 row:=public.planner_routine_snapshot('2090-12-31')->'rows'->0;
 if row->'event'->>'end_date' is distinct from '2091-01-01' or row->'event'->>'start_time' is distinct from '22:00:00'
   or row->'event'->>'end_time' is distinct from '06:00:00' then raise exception 'wrong overnight interval %',row; end if;
 if not exists(select 1 from public.calendar_events where routine_occurrence_id=(row->'occurrence'->>'id')::uuid and start_date<='2091-01-01' and end_date>='2091-01-01') then raise exception 'missing next-morning reservation'; end if;
 sibling:=public.planner_routine_snapshot('2091-01-01')->'rows'->0;
 request:=jsonb_build_object('operation','edit','operationId',gen_random_uuid(),'seriesId',series_id,'occurrenceId',row->'occurrence'->>'id',
   'expectedSeriesToken',row->'series'->'revision_token','expectedOccurrenceVersion',row->'occurrence'->>'version','expectedTaskVersion',row->'task'->>'version','expectedEventVersion',row->'event'->>'version',
   'title','Sleep exception','date','2090-12-31','startTime','23:00','endTime','07:00');
 result:=public.planner_routine_command(request);
 if result->>'status' is distinct from 'complete' then raise exception 'overnight edit %',result; end if;
 row:=public.planner_routine_snapshot('2090-12-31')->'rows'->0;
 if row->'event'->>'end_date' is distinct from '2091-01-01' or row->'event'->>'end_time' is distinct from '07:00:00' then raise exception 'edit lost next day'; end if;
 if public.planner_routine_snapshot('2091-01-01')->'rows'->0 is distinct from sibling then raise exception 'edit changed sibling'; end if;
 item:=public.planner_routine_series_snapshot()->'rows'->0;
 request:=jsonb_build_object('operation','revise','seriesId',series_id,'effectiveDate','2091-01-01','expectedSeriesToken',item->'seriesToken','expectedScheduleVersion',item->'scheduleVersion',
   'title','Earlier sleep','startTime','21:00','endTime','05:00','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb);
 preview:=public.planner_routine_series_preview(request);
 if preview->>'status' is distinct from 'complete' or (preview->>'affected')::integer<1 then raise exception 'overnight incorrectly preserved as an exception %',preview; end if;
 request:=request||jsonb_build_object('operationId',gen_random_uuid(),'previewToken',preview->>'token');
 if public.planner_routine_series_command(request)->>'status' is distinct from 'complete' then raise exception 'overnight revision failed'; end if;
 if public.planner_routine_series_command(request)->>'status' is distinct from 'already-applied' then raise exception 'revision retry failed'; end if;
 sibling:=public.planner_routine_snapshot('2091-01-01')->'rows'->0;
 if sibling->'event'->>'end_date' is distinct from '2091-01-02' or sibling->'event'->>'end_time' is distinct from '05:00:00' then raise exception 'revision lost rollover'; end if;
 if public.planner_routine_snapshot('2090-12-31')->'rows'->0->'event' is distinct from row->'event' then raise exception 'revision changed history'; end if;
 request:=jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Equal','date','2091-01-01','startTime','06:00','endTime','06:00','timezone','UTC','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb);
 if public.planner_routine_command(request)->>'status' is distinct from 'invalid' then raise exception 'equal clocks accepted'; end if;
 -- Weekly membership is tied to the start weekday (2090-03-13 is Monday).
 request:=request||jsonb_build_object('operationId',gen_random_uuid(),'date','2090-03-13','startTime','22:00','endTime','06:00','rule','{"frequency":"weekly","interval":1,"days_of_week":[1]}'::jsonb);
 result:=public.planner_routine_command(request); dst_id:=(result->>'seriesId')::uuid;
 if result->>'status' is distinct from 'complete' then raise exception 'weekly create %',result; end if;
 if exists(select 1 from jsonb_array_elements(public.planner_routine_snapshot('2090-03-14')->'rows') r where r->'series'->>'id'=dst_id::text) then raise exception 'end date generated a second occurrence'; end if;
 -- Civil next-day dates yield 7h / 9h across the spring/fall transition.
 for request in select jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','DST sleep','date',day,'startTime','22:00','endTime','06:00','timezone','America/Los_Angeles','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb)
   from (values('2027-03-13'),('2027-11-06')) d(day) loop
   result:=public.planner_routine_command(request); dst_id:=(result->>'seriesId')::uuid;
   select r into row from jsonb_array_elements(public.planner_routine_snapshot((request->>'date')::date)->'rows') r where r->'series'->>'id'=dst_id::text;
   if extract(epoch from (((row->'event'->>'end_date')::date+(row->'event'->>'end_time')::time) at time zone 'America/Los_Angeles' - ((row->'event'->>'start_date')::date+(row->'event'->>'start_time')::time) at time zone 'America/Los_Angeles'))/3600
      is distinct from (case when request->>'date'='2027-03-13' then 7 else 9 end) then raise exception 'DST elapsed duration wrong %',row; end if;
 end loop;
 -- A gap on the ending day stays visible without a shifted reservation.
 request:=jsonb_build_object('operation','create','operationId',gen_random_uuid(),'title','Gap','date','2027-03-13','startTime','22:00','endTime','02:30','timezone','America/Los_Angeles','protected',true,'rule','{"frequency":"daily","interval":1}'::jsonb);
 result:=public.planner_routine_command(request); dst_id:=(result->>'seriesId')::uuid;
 select r into item from jsonb_array_elements(public.planner_routine_snapshot('2027-03-13')->'rows') r where r->'series'->>'id'=dst_id::text;
 if item is null or item->>'timeIssue' is distinct from 'true' or item->'event' <> 'null'::jsonb then raise exception 'gap silently shifted %',item; end if;
 perform set_config('request.jwt.claims','{"sub":"63000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
 if jsonb_array_length(public.planner_routine_series_snapshot()->'rows')<>0 then raise exception 'cross-owner exposure'; end if;
 if exists(select 1 from public.calendar_events) then raise exception 'cross-owner reservations exposed'; end if;
end $$;
rollback;
