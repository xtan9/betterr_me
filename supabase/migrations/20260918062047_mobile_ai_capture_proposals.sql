create table public.planner_ai_proposals (
 id uuid primary key, user_id uuid not null references public.profiles(id) on delete cascade,
 request_fingerprint text not null, body jsonb not null, version uuid not null default gen_random_uuid(),
 state text not null default 'pending' check(state in ('pending','accepted','rejected')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes',
 outcome jsonb
);
alter table public.planner_ai_proposals enable row level security;
revoke all on public.planner_ai_proposals from public,anon,authenticated;
grant select on public.planner_ai_proposals to authenticated;
create policy ai_proposal_owner on public.planner_ai_proposals for select to authenticated using ((select auth.uid())=user_id);
create index ai_proposal_owner_created on public.planner_ai_proposals(user_id,created_at);

create function planner_private.ai_store_proposal(p_id uuid,p_fingerprint text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); proposal public.planner_ai_proposals; item jsonb; c jsonb; day date; zone text; starts time; ends time;
begin
 if owner_id is null then return jsonb_build_object('status','not-found');end if;
 if p_id is null or length(coalesce(p_fingerprint,'')) not between 1 and 128 or jsonb_typeof(p_body) is distinct from 'object' then return jsonb_build_object('status','invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':ai-preview:'||p_id::text,0));
 select * into proposal from public.planner_ai_proposals where id=p_id and user_id=owner_id;
 if found then
  if proposal.request_fingerprint<>p_fingerprint then return jsonb_build_object('status','conflict');end if;
  return jsonb_build_object('status','complete','proposal',to_jsonb(proposal));
 end if;
 if jsonb_typeof(p_body->'message') is distinct from 'string' or length(p_body->>'message')>8000
  or jsonb_typeof(p_body->'items') is distinct from 'array' then return jsonb_build_object('status','invalid');end if;
 if octet_length(p_body::text)>65536 or jsonb_array_length(p_body->'items')>10 or exists(select 1 from jsonb_object_keys(p_body) k where k not in ('message','items')) then return jsonb_build_object('status','invalid');end if;
 if (select count(*) from jsonb_array_elements(p_body->'items'))<>(select count(distinct value->>'id') from jsonb_array_elements(p_body->'items')) then return jsonb_build_object('status','invalid');end if;
 for item in select value from jsonb_array_elements(p_body->'items') loop
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'changes') is distinct from 'object' then return jsonb_build_object('status','invalid');end if;
  if (item->>'id')::uuid is null or coalesce(item->>'kind','') not in ('task-create','task-edit','project-create','project-edit','routine-create')
   or exists(select 1 from jsonb_object_keys(item) k where k not in ('id','kind','targetId','expectedVersion','projectId','projectVersion','projectItemId','changes','before')) then return jsonb_build_object('status','invalid');end if;
  c:=item->'changes';
  if c='{}'::jsonb then return jsonb_build_object('status','invalid');end if;
  if item->>'kind'<>'task-create' and (item ? 'projectId' or item ? 'projectVersion' or item ? 'projectItemId') then return jsonb_build_object('status','invalid');end if;
  if item->>'kind' like 'task-%' then
   if c ? 'estimate_minutes' and c->'estimate_minutes'<>'null'::jsonb and (jsonb_typeof(c->'estimate_minutes') is distinct from 'number' or (c->>'estimate_minutes')!~'^[0-9]+$' or (c->>'estimate_minutes')::numeric not between 1 and 2147483647) then return jsonb_build_object('status','invalid');end if;
   if c ? 'due_date' and c->'due_date'<>'null'::jsonb then
    if jsonb_typeof(c->'due_date') is distinct from 'string' or (c->>'due_date')!~'^\d{4}-\d{2}-\d{2}$' then return jsonb_build_object('status','invalid');end if;
    day:=(c->>'due_date')::date;
   end if;
   if exists(select 1 from jsonb_object_keys(item->'changes') k where k not in ('title','estimate_minutes','due_date'))
    or (item->>'kind'='task-create' and not item->'changes' ? 'title') then return jsonb_build_object('status','invalid');end if;
   if item->'changes' ? 'title' and (jsonb_typeof(item->'changes'->'title') is distinct from 'string' or length(btrim(item->'changes'->>'title')) not between 1 and 100) then return jsonb_build_object('status','invalid');end if;
  elsif item->>'kind' like 'project-%' then
   if exists(select 1 from jsonb_object_keys(item->'changes') k where k<>'name') or jsonb_typeof(item->'changes'->'name') is distinct from 'string'
    or length(btrim(item->'changes'->>'name')) not between 1 and 50 then return jsonb_build_object('status','invalid');end if;
  else
   if jsonb_typeof(c->'title') is distinct from 'string' or length(btrim(c->>'title')) not between 1 and 100
    or coalesce(c->>'date','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(c->>'startTime','')!~'^([01]\d|2[0-3]):[0-5]\d$'
    or coalesce(c->>'endTime','')!~'^([01]\d|2[0-3]):[0-5]\d$' or jsonb_typeof(c->'protected') is distinct from 'boolean' then return jsonb_build_object('status','invalid');end if;
   day:=(c->>'date')::date;zone:=c->>'timezone';starts:=(c->>'startTime')::time;ends:=(c->>'endTime')::time;
   if not exists(select 1 from pg_timezone_names where name=zone) or ends<=starts then return jsonb_build_object('status','invalid');end if;
   if (((day+starts) at time zone zone) at time zone zone)<>day+starts or (((day+ends) at time zone zone) at time zone zone)<>day+ends then return jsonb_build_object('status','invalid');end if;
   if exists(select 1 from jsonb_object_keys(item->'changes') k where k not in ('title','date','startTime','endTime','timezone','protected','rule'))
    or not coalesce(planner_private.routine_rule_supported(item->'changes'->'rule'),false) then return jsonb_build_object('status','invalid');end if;
  end if;
  if item->>'kind' in ('task-edit','project-edit') then
   if (select count(*) from jsonb_array_elements(p_body->'items') v where v->>'targetId'=item->>'targetId')<>1 then return jsonb_build_object('status','invalid');end if;
   if item->>'targetId' is null or item->>'expectedVersion' is null then return jsonb_build_object('status','invalid');end if;
   if item->>'kind'='task-edit' and not exists(select 1 from public.tasks where id=(item->>'targetId')::uuid and user_id=owner_id) then return jsonb_build_object('status','not-found');end if;
   if item->>'kind'='project-edit' and not exists(select 1 from public.projects where id=(item->>'targetId')::uuid and user_id=owner_id) then return jsonb_build_object('status','not-found');end if;
  elsif item ? 'targetId' or item ? 'expectedVersion' then return jsonb_build_object('status','invalid');end if;
  if item->>'projectId' is not null then
   if item->>'projectVersion' is null or not exists(select 1 from public.projects where id=(item->>'projectId')::uuid and user_id=owner_id) then return jsonb_build_object('status','not-found');end if;
  end if;
  if item->>'projectItemId' is not null and (item->>'projectId' is not null or not exists(select 1 from jsonb_array_elements(p_body->'items') p where p->>'id'=item->>'projectItemId' and p->>'kind'='project-create')) then return jsonb_build_object('status','invalid');end if;
 end loop;
 insert into public.planner_ai_proposals(id,user_id,request_fingerprint,body) values(p_id,owner_id,p_fingerprint,p_body) returning * into proposal;
 return jsonb_build_object('status','complete','proposal',to_jsonb(proposal));
exception when invalid_text_representation or datetime_field_overflow or invalid_parameter_value then return jsonb_build_object('status','invalid');
 when unique_violation then return jsonb_build_object('status','conflict');
end $$;
revoke all on function planner_private.ai_store_proposal(uuid,text,jsonb) from public,anon;
grant execute on function planner_private.ai_store_proposal(uuid,text,jsonb) to authenticated;
create function public.planner_ai_store_proposal(p_id uuid,p_fingerprint text,p_body jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.ai_store_proposal(p_id,p_fingerprint,p_body) $$;
revoke all on function public.planner_ai_store_proposal(uuid,text,jsonb) from public,anon;
grant execute on function public.planner_ai_store_proposal(uuid,text,jsonb) to authenticated;

create function planner_private.ai_proposal_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
<<acceptance>>
declare owner_id uuid:=auth.uid(); request_id uuid:=(p_request->>'operationId')::uuid; proposal public.planner_ai_proposals;
 receipt public.planner_command_receipts; item jsonb; result jsonb; changes jsonb; results jsonb:='[]'; mapping jsonb:='{}'; outcome jsonb;
 project_id uuid; project_version uuid; task public.tasks;
begin
 if owner_id is null then return jsonb_build_object('status','not-found');end if;
 if jsonb_typeof(p_request) is distinct from 'object' then return jsonb_build_object('status','invalid');end if;
 if request_id is null or coalesce(p_request->>'operation','') not in ('accept','reject')
  or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','proposalId','expectedVersion')) then return jsonb_build_object('status','invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':planner:'||request_id::text,0));
 select * into receipt from public.planner_command_receipts where user_id=owner_id and operation_id=request_id;
 if found then
  if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict');end if;
  return jsonb_set(receipt.outcome,'{status}','"already-applied"');
 end if;
 select * into proposal from public.planner_ai_proposals where id=(p_request->>'proposalId')::uuid and user_id=owner_id for update;
 if not found then return jsonb_build_object('status','not-found');end if;
 if proposal.version is distinct from (p_request->>'expectedVersion')::uuid or proposal.state<>'pending' then return jsonb_build_object('status','conflict');end if;
 if p_request->>'operation'='accept' then
  if proposal.expires_at<=statement_timestamp() or jsonb_array_length(proposal.body->'items')=0 then return jsonb_build_object('status','conflict');end if;
  -- Lock existing parents before children; verify the entire preview before writes.
  perform 1 from public.projects where user_id=owner_id and id in (
   select (value->>'projectId')::uuid from jsonb_array_elements(proposal.body->'items') where value->>'projectId' is not null
   union select (value->>'targetId')::uuid from jsonb_array_elements(proposal.body->'items') where value->>'kind'='project-edit') order by id for update;
  perform 1 from public.tasks where user_id=owner_id and id in(select (value->>'targetId')::uuid from jsonb_array_elements(proposal.body->'items') where value->>'kind'='task-edit') order by id for update;
  for item in select value from jsonb_array_elements(proposal.body->'items') loop
   if item->>'kind'='task-edit' and not exists(select 1 from public.tasks where id=(item->>'targetId')::uuid and user_id=owner_id and version=(item->>'expectedVersion')::uuid) then return jsonb_build_object('status','conflict');end if;
   if item->>'kind'='project-edit' and not exists(select 1 from public.projects where id=(item->>'targetId')::uuid and user_id=owner_id and version=(item->>'expectedVersion')::uuid) then return jsonb_build_object('status','conflict');end if;
   if item->>'projectId' is not null and not exists(select 1 from public.projects where id=(item->>'projectId')::uuid and user_id=owner_id and version=(item->>'projectVersion')::uuid and status='active' and completed_at is null) then return jsonb_build_object('status','conflict');end if;
  end loop;
  for item in select value from jsonb_array_elements(proposal.body->'items') with ordinality x(value,n) order by case when value->>'kind'='project-create' then 0 else 1 end,n loop
   changes:=item->'changes';
   if item->>'kind' in ('project-create','project-edit') then
    select version into project_version from public.projects where id=(item->>'targetId')::uuid and user_id=owner_id;
    result:=public.project_capture_command(case when item->>'kind'='project-create' then 'create' else 'edit' end,(item->>'id')::uuid,(item->>'targetId')::uuid,project_version,changes);
    if result->>'status' is distinct from 'complete' then raise exception using errcode='PT409',message='Proposal project changed';end if;
    mapping:=mapping||jsonb_build_object(item->>'id',result->'project'->>'id');
    results:=results||jsonb_build_array(jsonb_build_object('itemId',item->>'id','kind',item->>'kind','recordId',result->'project'->>'id'));
   elsif item->>'kind' in ('task-create','task-edit') then
    project_id:=coalesce((item->>'projectId')::uuid,(mapping->>(item->>'projectItemId'))::uuid);
    if project_id is not null then
     select version into project_version from public.projects where id=project_id and user_id=owner_id;
     changes:=changes||jsonb_build_object('project_id',project_id,'expected_project_version',project_version);
    end if;
    select * into task from public.tasks where id=(item->>'targetId')::uuid and user_id=owner_id;
    result:=public.task_capture_command(case when item->>'kind'='task-create' then 'create' else 'edit' end,(item->>'id')::uuid,(item->>'targetId')::uuid,task.version,changes);
    if result->>'status' is distinct from 'complete' then raise exception using errcode='PT409',message='Proposal task changed';end if;
    results:=results||jsonb_build_array(jsonb_build_object('itemId',item->>'id','kind',item->>'kind','recordId',result->'task'->>'id'));
   else
    result:=planner_private.routine_command(changes||jsonb_build_object('operation','create','operationId',item->>'id'));
    if result->>'status' is distinct from 'complete' then raise exception using errcode='PT409',message='Proposal routine changed';end if;
    results:=results||jsonb_build_array(jsonb_build_object('itemId',item->>'id','kind',item->>'kind','recordId',result->>'seriesId'));
   end if;
  end loop;
 end if;
 outcome:=jsonb_build_object('status','complete','proposalId',proposal.id,'results',results);
 update public.planner_ai_proposals set state=case when p_request->>'operation'='accept' then 'accepted' else 'rejected' end,version=gen_random_uuid(),outcome=acceptance.outcome where id=proposal.id and user_id=owner_id;
 insert into public.planner_command_receipts values(owner_id,request_id,p_request,outcome);
 return outcome;
exception when sqlstate 'PT409' or integrity_constraint_violation or serialization_failure or deadlock_detected then return jsonb_build_object('status','conflict');
 when invalid_text_representation or invalid_parameter_value then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.ai_proposal_command(jsonb) from public,anon;
grant execute on function planner_private.ai_proposal_command(jsonb) to authenticated;
create function public.planner_ai_proposal_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.ai_proposal_command(p_request) $$;
revoke all on function public.planner_ai_proposal_command(jsonb) from public,anon;
grant execute on function public.planner_ai_proposal_command(jsonb) to authenticated;
notify pgrst,'reload schema';



