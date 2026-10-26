-- Phase C follows the exact deployed and verified compatible B adapters.
-- Materialize ordered per-set targets, enable commands, and close aggregate
-- content writes atomically. The private owner-only function preserves every
-- original row and leaves last_performed_at as the only direct usage update.
begin;

select fitness_private.activate_template_contract();

commit;
