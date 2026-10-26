-- Phase C follows the verified compatible B production alias and authenticated
-- before-mode smoke. Apply through the reviewed database-migration release.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- Existing private authority captures immutable baselines, fences completed
-- direct writes, permits genuine date-only rows and enables reads atomically.
-- A successful repeated call is a no-op. Failure rolls back the transaction;
-- do not disable readiness or discard current history as a rollback strategy.
select fitness_private.activate_history_contract();

commit;
