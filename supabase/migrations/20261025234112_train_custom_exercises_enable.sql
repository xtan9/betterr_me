-- Phase C follows the separately deployed and verified compatible B adapters.
-- Enable commands and close ordinary writes in the same migration transaction.
-- Service-role preset/media maintenance still uses INSERT/UPDATE/DELETE; the
-- existing database trigger preserves custom identity and recording meaning.
begin;

revoke insert, update, delete, truncate, references, trigger
  on public.exercises from anon, authenticated;
revoke truncate, trigger on public.exercises from service_role;

update fitness_private.custom_exercise_rollout
  set ready = true
  where singleton;

commit;
