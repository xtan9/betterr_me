-- Additive execution feedback. Existing planner commands and memory are untouched.
create table public.assistant_execution_events (
 user_id uuid not null references public.profiles(id) on delete cascade,
 operation_id uuid not null,
 task_id uuid not null references public.tasks(id) on delete cascade,
 operation text not null check(operation in ('start','later')),
 request jsonb not null,
 created_at timestamptz not null default now(),
 until_at timestamptz not null,
 primary key(user_id,operation_id)
);
create index assistant_execution_active on public.assistant_execution_events(user_id,until_at);
alter table public.assistant_execution_events enable row level security;
revoke all on public.assistant_execution_events from public,anon,authenticated;
grant select on public.assistant_execution_events to authenticated;
create policy execution_owner on public.assistant_execution_events for select to authenticated using ((select auth.uid())=user_id);

create table public.assistant_reminder_settings (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default false,
 timezone text not null,
 start_minute integer not null check(start_minute between 0 and 1439),
 end_minute integer not null check(end_minute between 1 and 1440 and end_minute>start_minute),
 locale text not null check(locale in ('en','zh')),
 version uuid not null default gen_random_uuid(),
 snoozed_until timestamptz,
 last_sent_at timestamptz,
 sent_date date,
 sent_count integer not null default 0
);
create table public.assistant_push_devices (
 token text primary key check(length(token)<250 and token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
 user_id uuid not null references public.profiles(id) on delete cascade,
 session_id uuid not null,
 updated_at timestamptz not null default now()
);
alter table public.assistant_reminder_settings enable row level security;
alter table public.assistant_push_devices enable row level security;
revoke all on public.assistant_reminder_settings,public.assistant_push_devices from public,anon,authenticated;
grant select on public.assistant_reminder_settings to authenticated;
create policy reminder_owner on public.assistant_reminder_settings for select to authenticated using ((select auth.uid())=user_id);
grant all on public.assistant_execution_events,public.assistant_reminder_settings,public.assistant_push_devices to service_role;

create function planner_private.execution_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); previous public.assistant_execution_events; task public.tasks; target_until timestamptz; op uuid; snapshot jsonb;
begin
 if owner_id is null then return jsonb_build_object('status','not-found');end if;
 if p_request->>'operation' not in ('start','later') or not p_request ?& array['operation','operationId','taskId','expectedVersion','until']
  or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('operation','operationId','taskId','expectedVersion','until')) then return jsonb_build_object('status','invalid');end if;
 op:=(p_request->>'operationId')::uuid; target_until:=(p_request->>'until')::timestamptz;
 if op is null then return jsonb_build_object('status','invalid');end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':execution',0));
 select * into previous from public.assistant_execution_events where user_id=owner_id and operation_id=op;
 if found then return jsonb_build_object('status',case when previous.request=p_request then 'already-applied' else 'conflict' end);end if;
 if target_until is null or not isfinite(target_until) or target_until<=now() or target_until>now()+interval '7 days' then return jsonb_build_object('status','invalid');end if;
 select * into task from public.tasks where id=(p_request->>'taskId')::uuid and user_id=owner_id for update;
 if not found then return jsonb_build_object('status','not-found');end if;
 if task.version is distinct from (p_request->>'expectedVersion')::uuid or task.is_completed or task.archived_at is not null then return jsonb_build_object('status','conflict');end if;
 if p_request->>'operation'='start' then
  if task.estimate_minutes is null or target_until>now()+make_interval(mins=>task.estimate_minutes)+interval '1 minute' then return jsonb_build_object('status','invalid');end if;
  snapshot:=public.action_queue_snapshot(now(),task.estimate_minutes);
  if not exists(select 1 from jsonb_array_elements(snapshot->'tasks') item where item->>'id'=task.id::text and (item->'facts'->>'actionable')::boolean) then return jsonb_build_object('status','conflict');end if;
 end if;
 insert into public.assistant_execution_events(user_id,operation_id,task_id,operation,request,until_at) values(owner_id,op,task.id,p_request->>'operation',p_request,target_until);
 if p_request->>'operation'='later' then update public.assistant_reminder_settings set snoozed_until=greatest(snoozed_until,target_until) where user_id=owner_id;end if;
 return jsonb_build_object('status','complete');
exception when invalid_text_representation or datetime_field_overflow then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.execution_command(jsonb) from public,anon;
grant execute on function planner_private.execution_command(jsonb) to authenticated;
create function public.assistant_execution_command(p_request jsonb) returns jsonb language sql security invoker set search_path=pg_catalog,public as $$select planner_private.execution_command(p_request)$$;
revoke all on function public.assistant_execution_command(jsonb) from public,anon;
grant execute on function public.assistant_execution_command(jsonb) to authenticated;

create function planner_private.reminder_settings_command(p_request jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare owner_id uuid:=auth.uid(); current_settings public.assistant_reminder_settings; token_owner uuid;
begin
 if owner_id is null then return jsonb_build_object('status','not-found');end if;
 perform pg_advisory_xact_lock(hashtextextended(owner_id::text||':execution',0));
 if p_request->>'operation'='unregister' then
  delete from public.assistant_push_devices where user_id=owner_id and token=p_request->>'token';
  return jsonb_build_object('status','complete');
 end if;
 if not p_request ?& array['enabled','timezone','startMinute','endMinute','locale','expectedVersion','token']
  or exists(select 1 from jsonb_object_keys(p_request) k where k not in ('enabled','timezone','startMinute','endMinute','locale','expectedVersion','token'))
  or jsonb_typeof(p_request->'enabled')<>'boolean'
  or not exists(select 1 from pg_timezone_names where name=p_request->>'timezone') then return jsonb_build_object('status','invalid');end if;
 select * into current_settings from public.assistant_reminder_settings where user_id=owner_id for update;
 if current_settings.version is distinct from (p_request->>'expectedVersion')::uuid then return jsonb_build_object('status','conflict');end if;
 if (p_request->>'enabled')::boolean then
  if p_request->>'token' is null then return jsonb_build_object('status','invalid');end if;
  select user_id into token_owner from public.assistant_push_devices where token=p_request->>'token';
  if found and token_owner<>owner_id then return jsonb_build_object('status','conflict');end if;
  insert into public.assistant_push_devices(token,user_id,session_id) values(p_request->>'token',owner_id,(auth.jwt()->>'session_id')::uuid) on conflict(token) do update set updated_at=now(),session_id=excluded.session_id where assistant_push_devices.user_id=owner_id;
 end if;
 insert into public.assistant_reminder_settings(user_id,enabled,timezone,start_minute,end_minute,locale)
 values(owner_id,(p_request->>'enabled')::boolean,p_request->>'timezone',(p_request->>'startMinute')::integer,(p_request->>'endMinute')::integer,p_request->>'locale')
 on conflict(user_id) do update set enabled=excluded.enabled,timezone=excluded.timezone,start_minute=excluded.start_minute,end_minute=excluded.end_minute,locale=excluded.locale,version=gen_random_uuid();
 if not (p_request->>'enabled')::boolean then delete from public.assistant_push_devices where user_id=owner_id;end if;
 return jsonb_build_object('status','complete');
exception when invalid_text_representation or check_violation or not_null_violation then return jsonb_build_object('status','invalid');
end $$;
revoke all on function planner_private.reminder_settings_command(jsonb) from public,anon;
grant execute on function planner_private.reminder_settings_command(jsonb) to authenticated;
create function public.assistant_reminder_settings_command(p_request jsonb) returns jsonb language sql security invoker set search_path=pg_catalog,public as $$select planner_private.reminder_settings_command(p_request)$$;
revoke all on function public.assistant_reminder_settings_command(jsonb) from public,anon;
grant execute on function public.assistant_reminder_settings_command(jsonb) to authenticated;

-- Service-only read adapter: reuse the same owner-filtered selector RPCs in cron.
-- The temporary claims are scoped to this transaction and restored before return.
create function public.assistant_dispatch_snapshot(p_user_id uuid,p_at timestamptz,p_end timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare old_sub text:=current_setting('request.jwt.claim.sub',true); old_claims text:=current_setting('request.jwt.claims',true); result jsonb; zone text;
begin
 select timezone into zone from public.profiles where id=p_user_id;
 perform set_config('request.jwt.claim.sub',p_user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user_id)::text,true);
 result:=jsonb_build_object('queue',public.action_queue_snapshot(p_at,floor(extract(epoch from p_end-p_at)/60)::integer),'priorities',public.priority_snapshot((p_at at time zone coalesce(zone,'UTC'))::date));
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 return result;
end $$;
revoke all on function public.assistant_dispatch_snapshot(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.assistant_dispatch_snapshot(uuid,timestamptz,timestamptz) to service_role;

-- A claim counts even if the provider times out: prefer a missed reminder to duplicates.
create function public.assistant_claim_reminder(p_user_id uuid,p_version uuid) returns boolean
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare s public.assistant_reminder_settings; local_now timestamp; local_minute integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':execution',0));
 select * into s from public.assistant_reminder_settings where user_id=p_user_id for update;
 if not found or not s.enabled or s.version<>p_version or s.snoozed_until>now() or s.last_sent_at>now()-interval '2 hours' then return false;end if;
 local_now:=now() at time zone s.timezone;local_minute:=extract(hour from local_now)::integer*60+extract(minute from local_now)::integer;
 if local_minute<s.start_minute or local_minute>=s.end_minute or (s.sent_date=local_now::date and s.sent_count>=3) then return false;end if;
 update public.assistant_reminder_settings set last_sent_at=now(),sent_date=local_now::date,sent_count=case when sent_date=local_now::date then sent_count+1 else 1 end where user_id=p_user_id;
 return true;
end $$;
revoke all on function public.assistant_claim_reminder(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assistant_claim_reminder(uuid,uuid) to service_role;

-- Do not send to revoked/logged-out sessions, even if unregister failed offline.
create function public.assistant_active_push_devices(p_user_id uuid) returns table(token text)
language sql security definer set search_path=pg_catalog,public as $$
 select d.token from public.assistant_push_devices d join auth.sessions s on s.id=d.session_id and s.user_id=d.user_id
 where d.user_id=p_user_id and (s.not_after is null or s.not_after>now()) order by d.updated_at desc limit 10
$$;
revoke all on function public.assistant_active_push_devices(uuid) from public,anon,authenticated;
grant execute on function public.assistant_active_push_devices(uuid) to service_role;
notify pgrst,'reload schema';

