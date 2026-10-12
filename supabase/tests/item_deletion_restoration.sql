begin;
select public.sql_fixture_create_auth_user('68120000-0000-0000-0000-000000000001','delete-owner@example.test');
-- Model pre-migration archived rows, then apply the restoration statements.
alter table public.tasks disable trigger aaaa_guard_deleted_task;
alter table public.projects disable trigger aaaa_guard_deleted_project;
alter table public.tasks disable trigger planner_guard_project_child;
insert into public.projects(id,user_id,name,status,completed_at) values
  ('68120000-0000-0000-0000-000000000010','68120000-0000-0000-0000-000000000001','Restored completed project','archived',now());
insert into public.tasks(id,user_id,title,project_id,archived_at) values
  ('68120000-0000-0000-0000-000000000011','68120000-0000-0000-0000-000000000001','Restored open child','68120000-0000-0000-0000-000000000010',now());
update public.tasks set archived_at=null where id='68120000-0000-0000-0000-000000000011';
update public.projects set status='active' where id='68120000-0000-0000-0000-000000000010';
set constraints all immediate;
alter table public.tasks enable trigger planner_guard_project_child;
alter table public.tasks enable trigger aaaa_guard_deleted_task;
alter table public.projects enable trigger aaaa_guard_deleted_project;
select set_config('request.jwt.claims','{"sub":"68120000-0000-0000-0000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ begin
  update public.tasks set title='Ordinary edit after restoration' where id='68120000-0000-0000-0000-000000000011';
  if (select completed_at from public.projects where id='68120000-0000-0000-0000-000000000010') is null then
    raise exception 'ordinary edit silently reopened restored project';
  end if;
end $$;
rollback;

