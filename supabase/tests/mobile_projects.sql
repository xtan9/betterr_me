-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('68400000-0000-0000-0000-000000000001', 'mobile-project-owner@example.test');
select public.sql_fixture_create_auth_user('68400000-0000-0000-0000-000000000002', 'mobile-project-other@example.test');
select set_config('request.jwt.claims', '{"sub":"68400000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare result jsonb; project jsonb; child jsonb; replay jsonb; original_version uuid;
begin
  result := public.project_capture_command('create','68400000-0000-0000-0000-000000000003',null,null,'{"name":"Garden"}');
  if result->>'status' <> 'complete' then raise exception 'project capture failed: %',result; end if;
  project := result->'project';
  replay := public.project_capture_command('create','68400000-0000-0000-0000-000000000003',null,null,'{"name":"Garden"}');
  if replay->>'status' <> 'already-applied' or replay->'project' <> project then raise exception 'project replay failed'; end if;
  original_version := (project->>'version')::uuid;
  update public.projects set color='teal',section='work',sort_order=12 where id=(project->>'id')::uuid;
  result := public.project_capture_command('edit',gen_random_uuid(),(project->>'id')::uuid,original_version,'{"name":"Stale"}');
  if result->>'status' <> 'conflict' then raise exception 'stale project overwrite'; end if;
  select to_jsonb(p) into project from public.projects p where id=(project->>'id')::uuid;
  result := public.project_capture_command('edit',gen_random_uuid(),(project->>'id')::uuid,(project->>'version')::uuid,'{"name":"Renamed"}');
  project := result->'project';
  if project->>'color'<>'teal' or project->>'section'<>'work' or project->>'sort_order'<>'12' then raise exception 'lost web fields'; end if;
  result := public.task_capture_command('create','68400000-0000-0000-0000-000000000004',null,null,
    jsonb_build_object('title','Soil','project_id',project->>'id','expected_project_version',project->>'version'));
  if result->>'status'<>'complete' then raise exception 'child capture failed: %',result; end if;
  child := result->'task';
  if child->>'project_id'<>project->>'id' then raise exception 'missing child link'; end if;
  result := public.task_capture_command('edit',gen_random_uuid(),(child->>'id')::uuid,(child->>'version')::uuid,'{"project_id":null}');
  if result->>'status'<>'complete' or result->'task'->>'project_id' is not null or result->'task'->>'id'<>child->>'id' then raise exception 'detach lost identity'; end if;
  result := public.task_capture_command('edit',gen_random_uuid(),(child->>'id')::uuid,(child->>'version')::uuid,'{"project_id":null}');
  if result->>'status'<>'conflict' then raise exception 'stale relationship write accepted'; end if;
  if (select status from public.projects where id=(project->>'id')::uuid)<>'active' then raise exception 'empty project was closed'; end if;
  select to_jsonb(t) into child from public.tasks t where id=(child->>'id')::uuid;
  result := public.task_capture_command('edit',gen_random_uuid(),(child->>'id')::uuid,(child->>'version')::uuid,
    jsonb_build_object('project_id',project->>'id','expected_project_version',project->>'version'));
  child := result->'task';
  result := public.project_capture_command('archive',gen_random_uuid(),(project->>'id')::uuid,(project->>'version')::uuid);
  if result->>'status'<>'complete' or result->'project'->>'status'<>'archived' then raise exception 'project archive failed'; end if;
  if (select to_jsonb(t) from public.tasks t where id=(child->>'id')::uuid)<>child then raise exception 'archive changed child'; end if;
  perform set_config('request.jwt.claims','{"sub":"68400000-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists(select 1 from public.projects) or exists(select 1 from public.project_capture_receipts) then raise exception 'cross-owner read'; end if;
  result := public.task_capture_command('create',gen_random_uuid(),null,null,
    jsonb_build_object('title','Foreign','project_id',project->>'id','expected_project_version',project->>'version'));
  if result->>'status'<>'not-found' or exists(select 1 from public.tasks) then raise exception 'cross-owner child created'; end if;
end $$;
rollback;
