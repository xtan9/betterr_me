-- constrained-sql-fixture: true
begin;
select public.sql_fixture_create_auth_user('61300000-0000-0000-0000-000000000001','ai-owner@example.test');
select set_config('request.jwt.claims','{"sub":"61300000-0000-0000-0000-000000000001","role":"authenticated"}',true);
create function pg_temp.fail_ai_task() returns trigger language plpgsql as $$
begin if new.title='Fail child' then raise exception using errcode='23514',message='simulated task storage failure';end if;return new;end $$;
create trigger ai_fixture_failure before insert on public.tasks for each row execute function pg_temp.fail_ai_task();
do $$
declare proposal jsonb; result jsonb; project_item uuid:=gen_random_uuid(); task jsonb; command jsonb;
begin
 set local role authenticated;
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'rollback',jsonb_build_object('message','Preview','items',jsonb_build_array(
  jsonb_build_object('id',project_item,'kind','project-create','changes',jsonb_build_object('name','Atomic project')),
  jsonb_build_object('id',gen_random_uuid(),'kind','task-create','projectItemId',project_item,'changes',jsonb_build_object('title','Fail child')))))->'proposal';
 if proposal is null then raise exception 'failed preview';end if;
 command:=jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version');
 result:=public.planner_ai_proposal_command(command);
 if result->>'status' not in ('conflict','invalid') then raise exception 'expected failure %',result;end if;
 if exists(select 1 from public.projects) or exists(select 1 from public.tasks) or exists(select 1 from public.planner_command_receipts) then raise exception 'partial proposal writes';end if;
 if not exists(select 1 from public.planner_ai_proposals where id=(proposal->>'id')::uuid and state='pending') then raise exception 'proposal not retryable';end if;
 task:=public.task_capture_command('create',gen_random_uuid(),null,null,'{"title":"Original"}')->'task';
 proposal:=public.planner_ai_store_proposal(gen_random_uuid(),'stale',jsonb_build_object('message','Edit','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','task-edit','targetId',task->>'id','expectedVersion',task->>'version','changes',jsonb_build_object('title','Old preview')))))->'proposal';
 perform public.task_capture_command('edit',gen_random_uuid(),(task->>'id')::uuid,(task->>'version')::uuid,'{"title":"Newer manual edit"}');
 result:=public.planner_ai_proposal_command(jsonb_build_object('operation','accept','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version'));
 if result->>'status'<>'conflict' or not exists(select 1 from public.tasks where title='Newer manual edit') then raise exception 'stale preview overwrote task %',result;end if;
 result:=public.planner_ai_store_proposal(gen_random_uuid(),'malformed',jsonb_build_object('message','Invalid date','items',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind','task-create','changes',jsonb_build_object('title','Invalid','due_date','2027-02-31')))));
 if result->>'status'<>'invalid' then raise exception 'invalid date stored %',result;end if;
 result:=public.planner_ai_proposal_command(jsonb_build_object('operation','reject','operationId',gen_random_uuid(),'proposalId',proposal->>'id','expectedVersion',proposal->>'version'));
 if result->>'status'<>'complete' then raise exception 'reject failed %',result;end if;
 reset role;
end $$;
rollback;
