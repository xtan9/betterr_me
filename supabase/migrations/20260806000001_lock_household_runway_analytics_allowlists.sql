-- Keep the amount-free analytics contract enforceable even when a caller
-- bypasses the application schema and invokes the server function directly.

alter table public.finance_cushion_events
  drop constraint if exists finance_cushion_events_event_name_check,
  drop constraint if exists finance_cushion_events_attribution_check;

alter table public.finance_cushion_events
  add constraint finance_cushion_events_event_name_allowlist check (
    event_name = any (array[
      'landing_view',
      'started',
      'skipped',
      'completed',
      'result_interaction',
      'registration_clicked'
    ]::text[])
  ),
  add constraint finance_cushion_events_step_allowlist check (
    step_id is null or step_id = any (array[
      'landing',
      'new',
      'resume',
      'location',
      'household',
      'employment',
      'myIncome',
      'partnerIncome',
      'otherIncome',
      'cash',
      'assets',
      'expenses',
      'reductions',
      'review',
      'result',
      'scenario_switch'
    ]::text[])
  ),
  add constraint finance_cushion_events_locale_allowlist check (
    locale is null or locale = any (array['en', 'zh', 'zh-TW']::text[])
  ),
  add constraint finance_cushion_events_attribution_allowlist check (
    jsonb_typeof(attribution) = 'object'
    and attribution - array[
      'video', 'campaign', 'cta', 'landing_variant', 'language'
    ]::text[] = '{}'::jsonb
    and (not (attribution ? 'video') or jsonb_typeof(attribution -> 'video') = 'string')
    and (not (attribution ? 'campaign') or jsonb_typeof(attribution -> 'campaign') = 'string')
    and (not (attribution ? 'cta') or jsonb_typeof(attribution -> 'cta') = 'string')
    and (not (attribution ? 'landing_variant') or jsonb_typeof(attribution -> 'landing_variant') = 'string')
    and (not (attribution ? 'language') or jsonb_typeof(attribution -> 'language') = 'string')
    and char_length(coalesce(attribution ->> 'video', '')) <= 120
    and char_length(coalesce(attribution ->> 'campaign', '')) <= 120
    and char_length(coalesce(attribution ->> 'cta', '')) <= 120
    and char_length(coalesce(attribution ->> 'landing_variant', '')) <= 120
    and char_length(coalesce(attribution ->> 'language', '')) <= 20
  );

create or replace function public.record_finance_cushion_event(
  p_client_key text,
  p_action_id uuid,
  p_session_id uuid,
  p_event_name text,
  p_step_id text,
  p_locale text,
  p_attribution jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean;
begin
  if p_event_name is null or p_event_name not in (
    'landing_view', 'started', 'skipped', 'completed',
    'result_interaction', 'registration_clicked'
  ) then
    raise exception 'event kind is not allowlisted' using errcode = '22023';
  end if;

  if p_step_id is not null and p_step_id not in (
    'landing', 'new', 'resume', 'location', 'household', 'employment',
    'myIncome', 'partnerIncome', 'otherIncome', 'cash', 'assets',
    'expenses', 'reductions', 'review', 'result', 'scenario_switch'
  ) then
    raise exception 'interview stage is not allowlisted' using errcode = '22023';
  end if;

  if p_locale is not null and p_locale not in ('en', 'zh', 'zh-TW') then
    raise exception 'locale is not allowlisted' using errcode = '22023';
  end if;

  if p_attribution is null
     or jsonb_typeof(p_attribution) <> 'object'
     or p_attribution - array[
       'video', 'campaign', 'cta', 'landing_variant', 'language'
     ]::text[] <> '{}'::jsonb then
    raise exception 'campaign attribution is not allowlisted' using errcode = '22023';
  end if;

  insert into public.finance_cushion_event_rate_limits as limits (
    client_key, window_started_at, event_count
  )
  values (p_client_key, now(), 1)
  on conflict (client_key) do update
  set
    window_started_at = case
      when limits.window_started_at <= now() - interval '1 minute' then now()
      else limits.window_started_at
    end,
    event_count = case
      when limits.window_started_at <= now() - interval '1 minute' then 1
      else limits.event_count + 1
    end
  returning event_count <= 60 into allowed;

  if not allowed then
    return false;
  end if;

  insert into public.finance_cushion_events (
    action_id, session_id, event_name, step_id, locale, attribution
  )
  values (
    p_action_id, p_session_id, p_event_name, p_step_id, p_locale, p_attribution
  )
  on conflict (action_id) do nothing;

  return true;
end;
$$;

revoke all on function public.record_finance_cushion_event(text, uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_finance_cushion_event(text, uuid, uuid, text, text, text, jsonb) to service_role;

