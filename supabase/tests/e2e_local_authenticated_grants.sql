-- Test-only privileges for the disposable authenticated E2E database.
--
-- These grants are intentionally not a migration and must never be applied to
-- a shared or production database. The repository migrations define RLS
-- policies for the retained primary user journey, but the disposable reset
-- does not inherit the grants present in the hosted database. Keep this list
-- limited to tables exercised by the Chromium journey and registered SQL
-- acceptance suites.

grant usage on schema public to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'tasks',
    'habits',
    'habit_logs',
    'habit_milestones',
    'habit_graduations',
    'categories',
    'projects',
    'journal_entries',
    'journal_entry_links',
    'exercise_media',
    'workouts',
    'workout_exercises',
    'workout_sets'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'grant select, insert, update, delete on table public.%I to authenticated',
        table_name
      );
    end if;
  end loop;
end
$$;

do $$
declare template_ready boolean:=false;
begin
  if to_regclass('public.exercises') is not null then
    -- Respect the shipped command-only exercise boundary after Train C.
    -- Do not let disposable setup conceal an accidental direct-write bypass.
    revoke insert,update,delete,truncate,references,trigger on public.exercises from authenticated;
    grant select on public.exercises to authenticated;
  end if;
  if to_regclass('public.routines') is not null then
    if to_regclass('fitness_private.template_rollout') is not null then
      execute 'select ready from fitness_private.template_rollout where singleton' into template_ready;
    end if;
    if template_ready then
      -- C deliberately leaves only usage updates outside the content command.
      revoke insert,update,delete,truncate,references,trigger on public.routines,public.routine_exercises from authenticated;
      grant select on public.routines,public.routine_exercises to authenticated;
      grant update(last_performed_at) on public.routines to authenticated;
    else
      grant select,insert,update,delete on public.routines,public.routine_exercises to authenticated;
    end if;
  end if;
  if to_regclass('public.finance_cushions') is not null then
    revoke all on table public.finance_cushions from authenticated;
    grant select on table public.finance_cushions to authenticated;
  end if;
  if to_regclass('public.finance_cushion_snapshots') is not null then
    revoke all on table public.finance_cushion_snapshots from authenticated;
    grant select on table public.finance_cushion_snapshots to authenticated;
  end if;
end
$$;
