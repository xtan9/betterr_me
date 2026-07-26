-- Run after migrations with a superuser connection. It proves the two negative
-- authentication cases and deterministic repeat behavior; the shell runner
-- performs the separate two-process race against the same local database.
BEGIN;

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  '33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'household-rpc@example.com',
  crypt('not-used-in-test', gen_salt('bf')), now(), '{}'::jsonb, '{}'::jsonb, now(), now()
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
  PERFORM public.initialize_my_household();
  RAISE EXCEPTION 'null-sub call was allowed';
EXCEPTION WHEN SQLSTATE '28000' THEN NULL;
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.initialize_my_household();
  RAISE EXCEPTION 'anon EXECUTE was allowed';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
CREATE TEMP TABLE household_init_repeat AS
  SELECT public.initialize_my_household() AS household_id;
DO $$
DECLARE first_id uuid; second_id uuid;
BEGIN
  SELECT household_id INTO first_id FROM household_init_repeat;
  second_id := public.initialize_my_household();
  IF first_id <> second_id THEN RAISE EXCEPTION 'repeat call returned a different household'; END IF;
  IF (SELECT count(*) FROM public.household_members WHERE user_id = '33333333-3333-3333-3333-333333333333') <> 1 THEN
    RAISE EXCEPTION 'repeat call created more than one membership';
  END IF;
END $$;
ROLLBACK;
