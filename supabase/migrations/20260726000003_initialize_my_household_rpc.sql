-- Atomic authenticated household initialization. This preserves the existing
-- RLS policies and table grants by executing as the caller.
CREATE FUNCTION public.initialize_my_household()
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  existing_household_id uuid;
  membership_count integer;
  new_household_id uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'authenticated user is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(caller_id::text, 0));

  SELECT count(*)
  INTO membership_count
  FROM public.household_members
  WHERE user_id = caller_id;

  IF membership_count > 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0003', MESSAGE = 'multiple household memberships found';
  END IF;

  IF membership_count = 1 THEN
    SELECT household_id INTO existing_household_id
    FROM public.household_members
    WHERE user_id = caller_id;
    RETURN existing_household_id;
  END IF;

  new_household_id := gen_random_uuid();
  INSERT INTO public.households (id, name) VALUES (new_household_id, 'My Household');
  INSERT INTO public.household_members (household_id, user_id, role)
  VALUES (new_household_id, caller_id, 'owner');
  RETURN new_household_id;
END;
$$;

ALTER FUNCTION public.initialize_my_household() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.initialize_my_household() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initialize_my_household() TO authenticated;
