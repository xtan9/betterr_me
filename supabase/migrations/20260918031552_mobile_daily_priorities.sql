-- Additive dated references; no legacy task/calendar data is rewritten.
create table public.daily_priority_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  version uuid not null default gen_random_uuid(),
  task_ids uuid[] not null default '{}',
  primary key(user_id,date)
);
create table public.daily_priority_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  outcome jsonb not null,
  primary key(user_id,operation_id)
);
alter table public.daily_priority_state enable row level security;
alter table public.daily_priority_receipts enable row level security;
revoke all on public.daily_priority_state,public.daily_priority_receipts from public,anon,authenticated;
grant select on public.daily_priority_state,public.daily_priority_receipts to authenticated;
create policy priority_owner on public.daily_priority_state for select to authenticated using ((select auth.uid())=user_id);
create policy priority_receipt_owner on public.daily_priority_receipts for select to authenticated using ((select auth.uid())=user_id);

create function public.priority_snapshot(p_date date) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
  select jsonb_build_object('date',p_date,'version',s.version,'taskIds',coalesce(to_jsonb(s.task_ids),'[]'::jsonb))
  from (select 1) seed left join public.daily_priority_state s on s.user_id=auth.uid() and s.date=p_date
$$;
revoke all on function public.priority_snapshot(date) from public,anon;
grant execute on function public.priority_snapshot(date) to authenticated;

create function planner_private.priority_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  owner_id uuid := auth.uid();
  request_id uuid := (p_request->>'operationId')::uuid;
  target_date date := (p_request->>'date')::date;
  receipt public.daily_priority_receipts;
  current_state public.daily_priority_state;
  ids uuid[];
  new_task public.tasks;
  outcome jsonb;
begin
  if owner_id is null then return jsonb_build_object('status','not-found'); end if;
  if request_id is null or target_date is null or jsonb_typeof(p_request) is distinct from 'object'
    or not p_request ? 'expectedVersion' or coalesce(p_request->>'operation','') not in ('set','create')
    or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','date','expectedVersion','taskIds','title')) then
    return jsonb_build_object('status','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':priorities',0));
  select * into receipt from public.daily_priority_receipts where user_id=owner_id and operation_id=request_id;
  if found then
    if receipt.request is distinct from p_request then return jsonb_build_object('status','conflict'); end if;
    return jsonb_set(receipt.outcome,'{status}','"already-applied"');
  end if;
  select * into current_state from public.daily_priority_state where user_id=owner_id and date=target_date for update;
  if current_state.version is distinct from (p_request->>'expectedVersion')::uuid then return jsonb_build_object('status','conflict'); end if;
  if p_request->>'operation'='set' then
    if jsonb_typeof(p_request->'taskIds') is distinct from 'array' or p_request ? 'title' then return jsonb_build_object('status','invalid'); end if;
    select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(p_request->'taskIds');
    if cardinality(ids) <> (select count(distinct id) from unnest(ids) id) then return jsonb_build_object('status','invalid'); end if;
    -- Retained completed references remain valid; no state is inferred from time.
    perform 1 from public.tasks where user_id=owner_id and id=any(ids) order by id for key share;
    if exists(select 1 from unnest(ids) id where not exists(select 1 from public.tasks t where t.id=id and t.user_id=owner_id)) then
      return jsonb_build_object('status','not-found');
    end if;
  else
    if jsonb_typeof(p_request->'title') is distinct from 'string' or length(btrim(p_request->>'title'))=0
      or length(p_request->>'title')>100 or p_request ? 'taskIds' then return jsonb_build_object('status','invalid'); end if;
    insert into public.tasks(user_id,title) values(owner_id,p_request->>'title') returning * into new_task;
    ids := array_append(coalesce(current_state.task_ids,'{}'),new_task.id);
  end if;
  insert into public.daily_priority_state(user_id,date,task_ids) values(owner_id,target_date,ids)
    on conflict(user_id,date) do update set task_ids=excluded.task_ids,version=gen_random_uuid()
    returning * into current_state;
  outcome := jsonb_build_object('status','complete','version',current_state.version,'taskIds',ids);
  insert into public.daily_priority_receipts values(owner_id,request_id,p_request,outcome);
  return outcome;
exception when invalid_text_representation or datetime_field_overflow then
  return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.priority_command(jsonb) from public,anon;
grant execute on function planner_private.priority_command(jsonb) to authenticated;
create function public.priority_command(p_request jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select planner_private.priority_command(p_request) $$;
revoke all on function public.priority_command(jsonb) from public,anon;
grant execute on function public.priority_command(jsonb) to authenticated;
