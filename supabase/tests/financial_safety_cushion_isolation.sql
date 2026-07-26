-- Executed against a local migrated Supabase database by CI. The test actor is
-- deliberately separate principals and households. Authorization assertions
-- run as authenticated JWT principals; setup is performed before SET ROLE.
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'financial-safety-owner@example.com',
  crypt('not-used-in-test', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'financial-safety-outsider@example.com',
  crypt('not-used-in-test', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

INSERT INTO households (id, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Isolation A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Isolation B');
INSERT INTO household_members (household_id, user_id) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222');
INSERT INTO financial_safety_checkups (id, household_id, inputs) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '{}'::jsonb);
INSERT INTO financial_safety_return_touches (id, checkup_id, household_id) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM financial_safety_checkups WHERE household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') THEN
    RAISE EXCEPTION 'cross-household checkup SELECT was allowed';
  END IF;
END $$;

DO $$
BEGIN
  INSERT INTO financial_safety_checkups (household_id, inputs)
  VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '{"blocked":true}'::jsonb);
  RAISE EXCEPTION 'cross-household checkup INSERT was allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM financial_safety_checkups WHERE household_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') THEN
    RAISE EXCEPTION 'cross-household checkup persisted';
  END IF;
END $$;

ROLLBACK;
