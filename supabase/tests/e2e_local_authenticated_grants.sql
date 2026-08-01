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
    'exercises',
    'exercise_media',
    'routines',
    'routine_exercises',
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
begin
  if to_regclass('public.finance_cushions') is not null then
    revoke all on table public.finance_cushions from authenticated;
    grant select, insert, update on table public.finance_cushions to authenticated;
  end if;
  if to_regclass('public.finance_cushion_snapshots') is not null then
    revoke all on table public.finance_cushion_snapshots from authenticated;
    grant select, insert on table public.finance_cushion_snapshots to authenticated;
  end if;
end
$$;
