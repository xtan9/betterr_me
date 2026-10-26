-- Phase C follows the exact deployed and verified compatible B adapters.
-- Materialize ordered per-set targets, enable commands, and close aggregate
-- content writes atomically. The private owner-only function preserves every
-- original row and leaves last_performed_at as the only direct usage update.
begin;

-- Numeric representability uses double::text. Pin its round-trip rendering
-- within this private helper, independent of the caller's display preference.
-- The function setting is restored on both normal return and caught errors.
alter function fitness_private.template_value_reason(text,text)
  set extra_float_digits=3;

select fitness_private.activate_template_contract();

commit;
