-- constrained-sql-fixture: true
-- Legacy unreviewed deletion must not bypass the new preview/receipt contract.
-- Reviewed deletion, retained children and ownership are covered by item_deletion.sql.
begin;
select public.sql_fixture_create_auth_user('65300000-0000-0000-0000-000000000001','legacy-delete@example.test');
select set_config('request.jwt.claims','{"sub":"65300000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$
declare project jsonb; child jsonb;
begin
  project:=public.project_capture_command('create',gen_random_uuid(),null,null,'{"name":"Keep project"}')->'project';
  child:=public.task_capture_command('create',gen_random_uuid(),null,null,jsonb_build_object('title','Keep child','project_id',project->>'id','expected_project_version',project->>'version'))->'task';
  begin
    perform public.delete_project_atomically((project->>'id')::uuid,'65300000-0000-0000-0000-000000000001');
    raise exception 'unreviewed legacy deletion accepted';
  exception when check_violation then null;
  end;
  if not exists(select 1 from public.projects where id=(project->>'id')::uuid) then raise exception 'project lost'; end if;
  if not exists(select 1 from public.tasks where id=(child->>'id')::uuid and project_id=(project->>'id')::uuid) then raise exception 'partial child detach'; end if;
end $$;
rollback;
