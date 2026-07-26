-- Executed against a local migrated Supabase database by CI. The test actor is
-- deliberately a member of both households; only the composite relationship
-- can deny an attempt to label a check-up from household A as household B.
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'financial-safety-test@example.com',
  crypt('not-used-in-test', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

INSERT INTO households (id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Isolation A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Isolation B');
INSERT INTO household_members (household_id, user_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111');
INSERT INTO financial_safety_checkups (id, household_id, inputs) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{}'::jsonb);
INSERT INTO financial_safety_return_touches (id, checkup_id, household_id) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$
BEGIN
  INSERT INTO financial_safety_return_touches (checkup_id, household_id)
  VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  RAISE EXCEPTION 'cross-household return touch insert was allowed';
EXCEPTION WHEN foreign_key_violation THEN NULL;
END;
$$;

DO $$
BEGIN
  UPDATE financial_safety_return_touches
  SET household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  IF FOUND THEN RAISE EXCEPTION 'cross-household return touch update was allowed'; END IF;
END;
$$;

DO $$
BEGIN
  INSERT INTO financial_safety_funnel_events (checkup_id, household_id, event_name, action_id)
  VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'checkup_started', 'dddddddd-dddd-dddd-dddd-dddddddddddd');
  RAISE EXCEPTION 'cross-household funnel event insert was allowed';
EXCEPTION WHEN foreign_key_violation THEN NULL;
END;
$$;

DO $$
BEGIN
  UPDATE financial_safety_checkups
  SET household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
  WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  RAISE EXCEPTION 'checkup household update was allowed';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'financial safety checkup household is immutable' THEN RAISE; END IF;
END;
$$;

ROLLBACK;
