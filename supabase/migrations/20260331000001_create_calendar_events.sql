-- Calendar & Reminder Notifications: Database Schema Foundation
-- Creates calendar_events, reminders, reminder_defaults, push_subscriptions tables
-- Adds timezone column to profiles

-- =============================================================================
-- 1. ALTER PROFILES — Add timezone column
-- =============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT;
COMMENT ON COLUMN profiles.timezone IS 'IANA timezone identifier (e.g., America/New_York). NULL = not yet detected.';

-- =============================================================================
-- 2. CREATE TABLE calendar_events
-- =============================================================================

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  start_time TIME,
  end_date DATE NOT NULL,
  end_time TIME,
  location TEXT,
  color TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule JSONB,
  end_type TEXT CHECK (end_type IN ('never', 'after_count', 'on_date')),
  end_date_recurrence DATE,
  end_count INTEGER,
  recurring_event_id UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  original_date DATE,
  is_exception BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_allday_consistency CHECK (start_time IS NOT NULL OR (start_time IS NULL AND end_time IS NULL))
);

CREATE INDEX idx_calendar_events_user_date ON calendar_events(user_id, start_date);
CREATE INDEX idx_calendar_events_user_range ON calendar_events(user_id, start_date, end_date);
CREATE INDEX idx_calendar_events_recurring ON calendar_events(recurring_event_id) WHERE is_exception = true;
CREATE INDEX idx_calendar_events_is_recurring ON calendar_events(user_id) WHERE is_recurring = true;

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own calendar_events" ON calendar_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own calendar_events" ON calendar_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own calendar_events" ON calendar_events FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own calendar_events" ON calendar_events FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- 3. CREATE TABLE reminders
-- =============================================================================

CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('calendar_event', 'task', 'habit', 'bill')),
  source_id UUID NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('relative', 'absolute')),
  relative_minutes INTEGER,
  absolute_time TIMESTAMPTZ,
  channels TEXT[] NOT NULL DEFAULT '{push}',
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'snoozed')) DEFAULT 'pending',
  fire_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reminders_fire_at ON reminders(fire_at) WHERE status = 'pending';
CREATE INDEX idx_reminders_user_source ON reminders(user_id, source_type, source_id);
CREATE INDEX idx_reminders_user ON reminders(user_id);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reminders" ON reminders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own reminders" ON reminders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reminders" ON reminders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reminders" ON reminders FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- 4. CREATE TABLE reminder_defaults
-- =============================================================================

CREATE TABLE reminder_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('calendar_event', 'task', 'habit', 'bill')),
  relative_minutes INTEGER NOT NULL,
  channels TEXT[] NOT NULL DEFAULT '{push}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, source_type)
);

ALTER TABLE reminder_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reminder_defaults" ON reminder_defaults FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own reminder_defaults" ON reminder_defaults FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reminder_defaults" ON reminder_defaults FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reminder_defaults" ON reminder_defaults FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- 5. CREATE TABLE push_subscriptions
-- =============================================================================

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push_subscriptions" ON push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own push_subscriptions" ON push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own push_subscriptions" ON push_subscriptions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own push_subscriptions" ON push_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- 6. Table comments
-- =============================================================================

COMMENT ON TABLE calendar_events IS 'User calendar events with recurrence and exception support';
COMMENT ON TABLE reminders IS 'Source-agnostic reminders for calendar events, tasks, habits, and bills';
COMMENT ON TABLE reminder_defaults IS 'Per-user smart default reminder settings by source type';
COMMENT ON TABLE push_subscriptions IS 'Web Push API subscription storage per device per user';
