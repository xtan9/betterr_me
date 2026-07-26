-- Financial Safety Cushion V1: minimal retained inputs, immutable acquisition
-- attribution, append-only return touches, and exactly-once eligible actions.

CREATE TABLE financial_safety_checkups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  selected_scenario TEXT CHECK (selected_scenario IN ('my_income_stops', 'partner_income_stops', 'both_incomes_stop')),
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  latest_result JSONB,
  completed_at TIMESTAMPTZ,
  first_touch_acquisition_source TEXT,
  first_touch_video_id TEXT,
  first_touch_cta_placement TEXT,
  first_touch_campaign TEXT,
  first_touch_language TEXT,
  first_touch_landing_variant TEXT,
  first_touch_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  UNIQUE(id, household_id)
);

CREATE INDEX idx_financial_safety_checkups_household ON financial_safety_checkups(household_id, updated_at DESC);

CREATE TABLE financial_safety_return_touches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkup_id UUID NOT NULL,
  household_id UUID NOT NULL,
  return_touch_acquisition_source TEXT,
  return_touch_video_id TEXT,
  return_touch_cta_placement TEXT,
  return_touch_campaign TEXT,
  return_touch_language TEXT,
  return_touch_landing_variant TEXT,
  return_touch_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (checkup_id, household_id)
    REFERENCES financial_safety_checkups(id, household_id) ON DELETE CASCADE
);

CREATE INDEX idx_financial_safety_return_touches_checkup ON financial_safety_return_touches(checkup_id, return_touch_at DESC);

CREATE TABLE financial_safety_funnel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkup_id UUID NOT NULL,
  household_id UUID NOT NULL,
  event_name TEXT NOT NULL CHECK (event_name IN ('checkup_started', 'checkup_completed', 'result_reviewed', 'input_edited', 'checkup_updated_30d')),
  action_id UUID NOT NULL,
  review_action TEXT CHECK (review_action IN ('scenario_switched', 'calculation_opened', 'inputs_reviewed', 'recommended_action_expanded')),
  attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((event_name = 'result_reviewed') = (review_action IS NOT NULL)),
  UNIQUE(checkup_id, event_name, action_id),
  FOREIGN KEY (checkup_id, household_id)
    REFERENCES financial_safety_checkups(id, household_id) ON DELETE CASCADE
);

CREATE INDEX idx_financial_safety_funnel_events_reporting ON financial_safety_funnel_events(event_name, occurred_at DESC);

CREATE OR REPLACE FUNCTION financial_safety_prevent_first_touch_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(OLD.first_touch_acquisition_source, OLD.first_touch_video_id, OLD.first_touch_cta_placement, OLD.first_touch_campaign, OLD.first_touch_language, OLD.first_touch_landing_variant, OLD.first_touch_at)
     IS DISTINCT FROM ROW(NEW.first_touch_acquisition_source, NEW.first_touch_video_id, NEW.first_touch_cta_placement, NEW.first_touch_campaign, NEW.first_touch_language, NEW.first_touch_landing_variant, NEW.first_touch_at) THEN
    RAISE EXCEPTION 'first-touch attribution is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_safety_checkups_preserve_first_touch
  BEFORE UPDATE ON financial_safety_checkups
  FOR EACH ROW EXECUTE FUNCTION financial_safety_prevent_first_touch_mutation();

CREATE OR REPLACE FUNCTION financial_safety_prevent_household_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.household_id IS DISTINCT FROM NEW.household_id THEN
    RAISE EXCEPTION 'financial safety checkup household is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER financial_safety_checkups_preserve_household
  BEFORE UPDATE ON financial_safety_checkups
  FOR EACH ROW EXECUTE FUNCTION financial_safety_prevent_household_mutation();

CREATE TRIGGER update_financial_safety_checkups_updated_at
  BEFORE UPDATE ON financial_safety_checkups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE financial_safety_checkups ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_safety_return_touches ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_safety_funnel_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON financial_safety_checkups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_safety_return_touches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON financial_safety_funnel_events TO authenticated;

CREATE POLICY "Household members manage their financial safety checkups" ON financial_safety_checkups FOR ALL TO authenticated
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (household_id IN (SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())));

CREATE POLICY "Household members read their financial safety return touches" ON financial_safety_return_touches FOR SELECT TO authenticated
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Household members append their financial safety return touches" ON financial_safety_return_touches FOR INSERT TO authenticated
  WITH CHECK (household_id IN (SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Financial safety return touches are immutable" ON financial_safety_return_touches FOR UPDATE TO authenticated
  USING (false);

CREATE POLICY "Household members read their financial safety funnel events" ON financial_safety_funnel_events FOR SELECT TO authenticated
  USING (household_id IN (SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Household members append their financial safety funnel events" ON financial_safety_funnel_events FOR INSERT TO authenticated
  WITH CHECK (household_id IN (SELECT household_id FROM household_members WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Financial safety funnel events are immutable" ON financial_safety_funnel_events FOR UPDATE TO authenticated
  USING (false);
