-- BetterR.me Complete Database Schema for Supabase
-- Comprehensive self-improvement platform with habit tracking and journaling
-- PostgreSQL-optimized with JSONB, full-text search, and advanced features

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- CORE USER AND CATEGORY TABLES
-- =============================================================================

-- 1. PROFILES (Enhanced user profiles)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  
  -- Enhanced user preferences with JSONB (reminders moved to dedicated table)
  preferences JSONB DEFAULT '{
    "timezone": "UTC",
    "date_format": "MM/DD/YYYY",
    "week_start_day": 1,
    "theme": "system",
    "notifications": {
      "email": true,
      "push": true
    }
  }'::jsonb,
  
  -- Search optimization
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(full_name, '') || ' ' || coalesce(email, ''))
  ) STORED,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create GIN index for JSONB and full-text search
CREATE INDEX idx_profiles_preferences ON profiles USING GIN (preferences);
CREATE INDEX idx_profiles_search ON profiles USING GIN (search_vector);

-- 2. CATEGORIES (Habit categories)
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  
  -- Use JSONB for flexible styling
  style JSONB DEFAULT '{
    "color": "#3B82F6",
    "icon": "target",
    "gradient": null
  }'::jsonb,
  
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_user_category UNIQUE(user_id, name),
  CONSTRAINT valid_sort_order CHECK (sort_order >= 0)
);

CREATE INDEX idx_categories_user_id ON categories(user_id);
CREATE INDEX idx_categories_style ON categories USING GIN (style);

-- =============================================================================
-- TASKS / TODO LIST
-- =============================================================================

-- 3. TASKS (Todo list / one-time tasks)
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  
  -- Task details
  title TEXT NOT NULL,
  description TEXT,
  
  -- Status and priority
  is_completed BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 0 CHECK (priority >= 0 AND priority <= 3), -- 0=none, 1=low, 2=medium, 3=high
  
  -- Scheduling
  due_date DATE,
  due_time TIME,
  
  -- Completion tracking
  completed_at TIMESTAMPTZ,
  
  -- Metadata
  tags TEXT[] DEFAULT '{}',
  
  -- Full-text search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_category_id ON tasks(category_id);
CREATE INDEX idx_tasks_completed ON tasks(user_id, is_completed);
CREATE INDEX idx_tasks_due_date ON tasks(user_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_search ON tasks USING GIN (search_vector);

-- =============================================================================
-- HABIT TRACKING TABLES
-- =============================================================================

-- 4. HABITS (Enhanced with PostgreSQL features)
CREATE TABLE habits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  
  -- Basic info with search
  name TEXT NOT NULL,
  description TEXT,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) STORED,
  
  -- Flexible habit configuration with JSONB
  config JSONB DEFAULT '{
    "type": "boolean",
    "target_value": null,
    "target_unit": null,
    "difficulty_level": 1,
    "points_reward": 10,
    "style": {
      "color": "#3B82F6",
      "icon": "target"
    }
  }'::jsonb,
  
  -- Enhanced scheduling with PostgreSQL arrays and constraints
  frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'custom')),
  schedule_config JSONB DEFAULT '{
    "weekly_days": [1,2,3,4,5,6,7],
    "monthly_days": null,
    "custom_pattern": null
  }'::jsonb,
  
  -- Status with better constraints
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  
  -- Metadata
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_difficulty CHECK ((config->>'difficulty_level')::int BETWEEN 1 AND 5),
  CONSTRAINT valid_points CHECK ((config->>'points_reward')::int > 0),
  CONSTRAINT valid_sort_order CHECK (sort_order >= 0),
  CONSTRAINT archived_when_status_archived CHECK (
    (status = 'archived' AND archived_at IS NOT NULL) OR 
    (status != 'archived' AND archived_at IS NULL)
  )
);

-- Optimized indexes for PostgreSQL
CREATE INDEX idx_habits_user_id ON habits(user_id);
CREATE INDEX idx_habits_user_active ON habits(user_id, status) WHERE status = 'active';
CREATE INDEX idx_habits_category ON habits(category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_habits_config ON habits USING GIN (config);
CREATE INDEX idx_habits_schedule ON habits USING GIN (schedule_config);
CREATE INDEX idx_habits_search ON habits USING GIN (search_vector);

-- 5. HABIT_LOGS (Enhanced daily tracking)
CREATE TABLE habit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  date DATE NOT NULL,
  completed BOOLEAN DEFAULT false,
  
  -- Flexible data storage for different habit types
  log_data JSONB DEFAULT '{
    "value": null,
    "notes": null,
    "mood": null,
    "difficulty": null,
    "duration_seconds": null
  }'::jsonb,
  
  logged_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_habit_date UNIQUE(habit_id, date),
  CONSTRAINT valid_date CHECK (date <= CURRENT_DATE),
  CONSTRAINT future_limit CHECK (date >= CURRENT_DATE - INTERVAL '1 year')
);

-- Optimized indexes
CREATE INDEX idx_habit_logs_user_date ON habit_logs(user_id, date DESC);
CREATE INDEX idx_habit_logs_habit_date ON habit_logs(habit_id, date DESC);
CREATE INDEX idx_habit_logs_completed ON habit_logs(user_id, completed, date) WHERE completed = true;
CREATE INDEX idx_habit_logs_data ON habit_logs USING GIN (log_data);

-- 6. STREAKS (Enhanced streak tracking)
CREATE TABLE streaks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  current_streak INTEGER DEFAULT 0 CHECK (current_streak >= 0),
  best_streak INTEGER DEFAULT 0 CHECK (best_streak >= 0),
  last_completed_date DATE,
  streak_start_date DATE,
  
  -- Enhanced tracking
  streak_data JSONB DEFAULT '{
    "weekly_streaks": 0,
    "monthly_streaks": 0,
    "total_completions": 0,
    "completion_rate": 0.0
  }'::jsonb,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_habit_streak UNIQUE(habit_id),
  CONSTRAINT best_streak_gte_current CHECK (best_streak >= current_streak),
  CONSTRAINT valid_dates CHECK (
    (last_completed_date IS NULL AND streak_start_date IS NULL) OR
    (last_completed_date IS NOT NULL AND streak_start_date IS NOT NULL AND 
     streak_start_date <= last_completed_date)
  )
);

CREATE INDEX idx_streaks_habit ON streaks(habit_id);
CREATE INDEX idx_streaks_user ON streaks(user_id);
CREATE INDEX idx_streaks_data ON streaks USING GIN (streak_data);

-- 7. HABIT_REMINDERS (Dedicated reminders system)
CREATE TABLE habit_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Reminder timing
  reminder_time TIME NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  
  -- Scheduling flexibility
  days_of_week INTEGER[] DEFAULT ARRAY[1,2,3,4,5,6,7], -- Monday=1, Sunday=7
  is_active BOOLEAN DEFAULT true,
  
  -- Notification preferences with JSONB for flexibility
  notification_config JSONB DEFAULT '{
    "push": true,
    "email": false,
    "sms": false,
    "sound": "default",
    "vibrate": true
  }'::jsonb,
  
  -- Reminder behavior
  snooze_enabled BOOLEAN DEFAULT true,
  snooze_duration_minutes INTEGER DEFAULT 10,
  max_snoozes INTEGER DEFAULT 3,
  
  -- Metadata
  label TEXT, -- Optional custom label like "Morning workout reminder"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_days_of_week CHECK (
    array_length(days_of_week, 1) > 0 AND
    days_of_week <@ ARRAY[1,2,3,4,5,6,7]
  ),
  CONSTRAINT valid_snooze_settings CHECK (
    (snooze_enabled = false) OR 
    (snooze_duration_minutes > 0 AND max_snoozes >= 0)
  ),
  CONSTRAINT valid_timezone CHECK (timezone IS NOT NULL)
);

-- Optimized indexes for reminders
CREATE INDEX idx_habit_reminders_user_active ON habit_reminders(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_habit_reminders_time_zone ON habit_reminders(reminder_time, timezone, is_active) WHERE is_active = true;
CREATE INDEX idx_habit_reminders_habit ON habit_reminders(habit_id, is_active) WHERE is_active = true;
CREATE INDEX idx_habit_reminders_config ON habit_reminders USING GIN (notification_config);

-- =============================================================================
-- JOURNAL FEATURE TABLES
-- =============================================================================

-- 8. JOURNAL_ENTRIES (Main journaling table)
CREATE TABLE journal_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Date and time
  entry_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Content with JSONB flexibility
  content JSONB DEFAULT '{
    "title": null,
    "body": "",
    "mood": null,
    "energy_level": null,
    "gratitude": [],
    "highlights": [],
    "challenges": [],
    "tomorrow_goals": [],
    "tags": [],
    "weather": null,
    "location": null
  }'::jsonb,
  
  -- Metadata
  word_count INTEGER GENERATED ALWAYS AS (
    length(regexp_replace(content->>'body', '\s+', ' ', 'g'))
  ) STORED,
  
  -- Full-text search (updated via trigger for proper tag handling)
  search_vector TSVECTOR,
  
  -- Privacy and organization
  is_private BOOLEAN DEFAULT true,
  template_used TEXT, -- reference to journal templates
  
  CONSTRAINT unique_user_date UNIQUE(user_id, entry_date),
  CONSTRAINT valid_word_count CHECK (word_count >= 0)
);

-- Optimized indexes
CREATE INDEX idx_journal_entries_user_date ON journal_entries(user_id, entry_date DESC);
CREATE INDEX idx_journal_entries_content ON journal_entries USING GIN (content);
CREATE INDEX idx_journal_entries_search ON journal_entries USING GIN (search_vector);
CREATE INDEX idx_journal_entries_mood ON journal_entries((content->>'mood')) WHERE content->>'mood' IS NOT NULL;

-- 9. JOURNAL_TEMPLATES (Optional prompts/templates)
CREATE TABLE journal_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL for system templates
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Template structure in JSONB
  template JSONB DEFAULT '{
    "prompts": [
      {"label": "What are you grateful for today?", "field": "gratitude", "type": "list"},
      {"label": "How was your energy level?", "field": "energy_level", "type": "rating", "scale": 5},
      {"label": "What was the highlight of your day?", "field": "highlights", "type": "text"}
    ],
    "default_tags": [],
    "required_fields": ["body"]
  }'::jsonb,
  
  is_public BOOLEAN DEFAULT false, -- can be shared with other users
  usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT template_name_unique_per_user UNIQUE(user_id, name)
);

CREATE INDEX idx_journal_templates_user ON journal_templates(user_id);
CREATE INDEX idx_journal_templates_public ON journal_templates(is_public) WHERE is_public = true;

-- 10. HABIT_JOURNAL_LINKS (Connect habits to journal entries)
CREATE TABLE habit_journal_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Link metadata
  link_type TEXT DEFAULT 'reflection' CHECK (link_type IN ('reflection', 'inspiration', 'challenge', 'celebration')),
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_habit_journal_link UNIQUE(habit_id, journal_entry_id)
);

CREATE INDEX idx_habit_journal_links_habit ON habit_journal_links(habit_id);
CREATE INDEX idx_habit_journal_links_journal ON habit_journal_links(journal_entry_id);

-- 11. JOURNAL_MEDIA (Photos, voice notes, etc.)
CREATE TABLE journal_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Media details
  file_path TEXT NOT NULL, -- Supabase Storage path
  file_type TEXT NOT NULL, -- 'image', 'audio', 'video'
  file_size INTEGER,
  mime_type TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{
    "alt_text": null,
    "caption": null,
    "transcription": null,
    "duration_seconds": null,
    "dimensions": null
  }'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_file_type CHECK (file_type IN ('image', 'audio', 'video', 'document'))
);

CREATE INDEX idx_journal_media_entry ON journal_media(journal_entry_id);
CREATE INDEX idx_journal_media_user ON journal_media(user_id);
CREATE INDEX idx_journal_media_type ON journal_media(file_type);

-- =============================================================================
-- GAMIFICATION TABLES
-- =============================================================================

-- 12. USER_STATS (Enhanced with journal metrics)
CREATE TABLE user_stats (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  
  -- Core stats
  total_xp INTEGER DEFAULT 0 CHECK (total_xp >= 0),
  current_level INTEGER DEFAULT 1 CHECK (current_level >= 1),
  
  -- Daily stats (reset daily)
  daily_stats JSONB DEFAULT '{
    "habits_completed": 0,
    "habits_total": 0,
    "xp_earned": 0,
    "perfect_days": 0
  }'::jsonb,
  
  -- All-time stats
  lifetime_stats JSONB DEFAULT '{
    "habits_completed_total": 0,
    "current_daily_streak": 0,
    "best_daily_streak": 0,
    "achievements_unlocked": 0,
    "total_days_active": 0
  }'::jsonb,
  
  -- Journal stats
  journal_stats JSONB DEFAULT '{
    "entries_this_week": 0,
    "current_journal_streak": 0,
    "total_journal_entries": 0,
    "average_words_per_entry": 0
  }'::jsonb,
  
  last_daily_reset DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_level CHECK (current_level = FLOOR(SQRT(total_xp / 100)) + 1)
);

CREATE INDEX idx_user_stats_daily ON user_stats USING GIN (daily_stats);
CREATE INDEX idx_user_stats_lifetime ON user_stats USING GIN (lifetime_stats);
CREATE INDEX idx_user_stats_journal ON user_stats USING GIN (journal_stats);

-- 13. ACHIEVEMENTS (Available achievements)
CREATE TABLE achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  icon TEXT DEFAULT 'trophy',
  category TEXT DEFAULT 'general', -- 'streaks', 'habits', 'milestones', 'journal'
  
  -- Unlock Criteria
  criteria_type TEXT CHECK (criteria_type IN ('streak', 'habit_count', 'total_completions', 'consecutive_days', 'journal_streak', 'journal_entries')) NOT NULL,
  criteria_value INTEGER NOT NULL,
  
  -- Rewards
  xp_reward INTEGER DEFAULT 100,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. USER_ACHIEVEMENTS (User's unlocked achievements)
CREATE TABLE user_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE NOT NULL,
  
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_user_achievement UNIQUE(user_id, achievement_id)
);

CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_achievement ON user_achievements(achievement_id);

-- =============================================================================
-- ANALYTICS TABLES
-- =============================================================================

-- 15. DAILY_SUMMARIES (Daily progress summaries)
CREATE TABLE daily_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  date DATE NOT NULL,
  habits_completed INTEGER DEFAULT 0,
  habits_total INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2), -- Percentage
  xp_earned INTEGER DEFAULT 0,
  
  -- Journal integration
  journal_entry_exists BOOLEAN DEFAULT false,
  journal_word_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_user_date_summary UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_summaries_user_date ON daily_summaries(user_id, date);

-- 16. HABIT_ANALYTICS (Habit-specific analytics)
CREATE TABLE habit_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  period_type TEXT CHECK (period_type IN ('week', 'month')) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  completions INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2),
  average_value DECIMAL(10,2), -- For counter/duration habits
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_habit_period UNIQUE(habit_id, period_type, period_start)
);

CREATE INDEX idx_habit_analytics_habit_period ON habit_analytics(habit_id, period_type, period_start);

-- =============================================================================
-- MATERIALIZED VIEWS FOR PERFORMANCE
-- =============================================================================

-- Comprehensive dashboard summary
CREATE MATERIALIZED VIEW user_dashboard_summary AS
SELECT 
  p.id as user_id,
  p.email,
  p.full_name,
  
  -- Habit stats
  COUNT(DISTINCT h.id) FILTER (WHERE h.status = 'active') as active_habits,
  COUNT(DISTINCT hl.id) FILTER (WHERE hl.date = CURRENT_DATE AND hl.completed = true) as habits_completed_today,
  
  -- Journal stats  
  COUNT(DISTINCT je.id) as total_journal_entries,
  COUNT(DISTINCT je.id) FILTER (WHERE je.entry_date >= CURRENT_DATE - INTERVAL '7 days') as journal_entries_this_week,
  MAX(je.entry_date) as last_journal_entry,
  
  -- Combined insights
  CASE 
    WHEN COUNT(DISTINCT je.id) FILTER (WHERE je.entry_date = CURRENT_DATE) > 0 
    AND COUNT(DISTINCT hl.id) FILTER (WHERE hl.date = CURRENT_DATE AND hl.completed = true) > 0
    THEN 'productive_day'
    ELSE 'normal_day'
  END as day_status

FROM profiles p
LEFT JOIN habits h ON p.id = h.user_id
LEFT JOIN habit_logs hl ON h.id = hl.habit_id
LEFT JOIN journal_entries je ON p.id = je.user_id
GROUP BY p.id, p.email, p.full_name;

CREATE UNIQUE INDEX idx_user_dashboard_summary ON user_dashboard_summary(user_id);

-- Habit completion summary
CREATE MATERIALIZED VIEW habit_completion_summary AS
SELECT 
  h.user_id,
  h.id as habit_id,
  h.name as habit_name,
  COUNT(hl.*) as total_logs,
  COUNT(hl.*) FILTER (WHERE hl.completed = true) as completions,
  ROUND(
    COUNT(hl.*) FILTER (WHERE hl.completed = true)::numeric / 
    NULLIF(COUNT(hl.*), 0) * 100, 2
  ) as completion_rate,
  MAX(hl.date) as last_logged_date
FROM habits h
LEFT JOIN habit_logs hl ON h.id = hl.habit_id
WHERE h.status = 'active'
GROUP BY h.user_id, h.id, h.name;

CREATE UNIQUE INDEX idx_habit_completion_summary_habit ON habit_completion_summary(habit_id);

-- =============================================================================
-- POSTGRESQL FUNCTIONS
-- =============================================================================

-- Function to calculate habit streak
CREATE OR REPLACE FUNCTION calculate_streak(habit_uuid UUID, check_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
  streak_count INTEGER := 0;
  current_check_date DATE := check_date;
BEGIN
  -- Calculate current streak by looking backwards from check_date
  LOOP
    IF EXISTS (
      SELECT 1 FROM habit_logs 
      WHERE habit_id = habit_uuid 
      AND date = current_check_date 
      AND completed = true
    ) THEN
      streak_count := streak_count + 1;
      current_check_date := current_check_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
  END LOOP;
  
  RETURN streak_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate journal streak
CREATE OR REPLACE FUNCTION calculate_journal_streak(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  streak_count INTEGER := 0;
  check_date DATE := CURRENT_DATE;
BEGIN
  LOOP
    IF EXISTS (
      SELECT 1 FROM journal_entries 
      WHERE user_id = target_user_id AND entry_date = check_date
    ) THEN
      streak_count := streak_count + 1;
      check_date := check_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
  END LOOP;
  
  RETURN streak_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get comprehensive journal stats
CREATE OR REPLACE FUNCTION get_journal_stats(target_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  stats JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_entries', COUNT(*),
    'current_streak', calculate_journal_streak(target_user_id),
    'average_word_count', ROUND(AVG(word_count)),
    'most_used_tags', (
      SELECT array_agg(tag ORDER BY count DESC)
      FROM (
        SELECT jsonb_array_elements_text(content->'tags') as tag, COUNT(*) as count
        FROM journal_entries 
        WHERE user_id = target_user_id AND jsonb_typeof(content->'tags') = 'array'
        GROUP BY tag
        ORDER BY count DESC
        LIMIT 5
      ) top_tags
    ),
    'mood_distribution', (
      SELECT jsonb_object_agg(mood, count)
      FROM (
        SELECT content->>'mood' as mood, COUNT(*) as count
        FROM journal_entries 
        WHERE user_id = target_user_id AND content->>'mood' IS NOT NULL
        GROUP BY mood
      ) mood_stats
    )
  ) INTO stats
  FROM journal_entries 
  WHERE user_id = target_user_id;
  
  RETURN stats;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =============================================================================

-- Function for updating timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_habits_updated_at BEFORE UPDATE ON habits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_habit_logs_updated_at BEFORE UPDATE ON habit_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_habit_reminders_updated_at BEFORE UPDATE ON habit_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_journal_entries_updated_at BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_journal_templates_updated_at BEFORE UPDATE ON journal_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update journal entries search vector with proper tag handling
CREATE OR REPLACE FUNCTION update_journal_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract tags array and convert to searchable text
  NEW.search_vector := to_tsvector('english', 
    coalesce(NEW.content->>'title', '') || ' ' || 
    coalesce(NEW.content->>'body', '') || ' ' ||
    CASE 
      WHEN jsonb_typeof(NEW.content->'tags') = 'array' 
      THEN array_to_string(
        array(SELECT jsonb_array_elements_text(NEW.content->'tags')), ' '
      )
      ELSE ''
    END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_journal_search_vector_trigger 
  BEFORE INSERT OR UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_journal_search_vector();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all user tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_journal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_media ENABLE ROW LEVEL SECURITY;

-- Core table policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can manage own categories" ON categories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own habits" ON habits FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own habit logs" ON habit_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own streaks" ON streaks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own reminders" ON habit_reminders FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own stats" ON user_stats FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own achievements" ON user_achievements FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own summaries" ON daily_summaries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own analytics" ON habit_analytics FOR ALL USING (auth.uid() = user_id);

-- Journal table policies
CREATE POLICY "Users can manage own journal entries" ON journal_entries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own templates" ON journal_templates FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can view public templates" ON journal_templates FOR SELECT USING (is_public = true OR auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can manage own habit journal links" ON habit_journal_links FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own journal media" ON journal_media FOR ALL USING (auth.uid() = user_id);

-- Achievement table policies (achievements are public, user_achievements are private)
CREATE POLICY "Achievements are publicly readable" ON achievements FOR SELECT USING (true);

-- =============================================================================
-- PERFORMANCE MONITORING
-- =============================================================================

-- Note: pg_stat_statements extension may not be available in all Supabase instances
-- You can enable performance monitoring later if needed

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

-- Insert default system achievements
INSERT INTO achievements (name, description, icon, category, criteria_type, criteria_value, xp_reward) VALUES
('First Step', 'Complete your first habit', 'star', 'habits', 'total_completions', 1, 50),
('Getting Started', 'Create your first habit', 'plus', 'habits', 'habit_count', 1, 25),
('Week Warrior', 'Maintain a 7-day habit streak', 'flame', 'streaks', 'streak', 7, 100),
('Consistency Champion', 'Maintain a 30-day habit streak', 'crown', 'streaks', 'streak', 30, 500),
('Habit Master', 'Create 10 different habits', 'target', 'habits', 'habit_count', 10, 200),
('Century Club', 'Complete 100 habits total', 'trophy', 'milestones', 'total_completions', 100, 300),
('Journal Explorer', 'Write your first journal entry', 'book', 'journal', 'journal_entries', 1, 25),
('Daily Reflection', 'Write journal entries for 7 consecutive days', 'edit', 'journal', 'journal_streak', 7, 100),
('Wordsmith', 'Write journal entries for 30 consecutive days', 'feather', 'journal', 'journal_streak', 30, 400),
('Perfect Week', 'Complete all habits for 7 consecutive days', 'check-circle', 'milestones', 'consecutive_days', 7, 250);

-- Insert default system journal templates
INSERT INTO journal_templates (user_id, name, description, template, is_public) VALUES
(NULL, 'Daily Reflection', 'Simple daily reflection template', '{
  "prompts": [
    {"label": "How was your day overall?", "field": "body", "type": "text"},
    {"label": "What are you grateful for today?", "field": "gratitude", "type": "list"},
    {"label": "What was the highlight of your day?", "field": "highlights", "type": "text"},
    {"label": "What challenged you today?", "field": "challenges", "type": "text"},
    {"label": "How was your energy level? (1-5)", "field": "energy_level", "type": "rating", "scale": 5}
  ],
  "default_tags": ["daily", "reflection"],
  "required_fields": ["body"]
}', true),

(NULL, 'Gratitude Journal', 'Focus on gratitude and positive moments', '{
  "prompts": [
    {"label": "Three things I am grateful for today:", "field": "gratitude", "type": "list"},
    {"label": "What made me smile today?", "field": "highlights", "type": "text"},
    {"label": "How did I grow or learn today?", "field": "body", "type": "text"}
  ],
  "default_tags": ["gratitude", "positivity"],
  "required_fields": ["gratitude"]
}', true),

(NULL, 'Goal Planning', 'Plan and reflect on goals', '{
  "prompts": [
    {"label": "What did I accomplish today?", "field": "highlights", "type": "text"},
    {"label": "What challenges did I face?", "field": "challenges", "type": "text"},
    {"label": "What are my goals for tomorrow?", "field": "tomorrow_goals", "type": "list"},
    {"label": "How can I improve tomorrow?", "field": "body", "type": "text"}
  ],
  "default_tags": ["goals", "planning"],
  "required_fields": ["tomorrow_goals"]
}', true);

-- =============================================================================
-- COMMENTS AND DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE profiles IS 'Enhanced user profiles with JSONB preferences and full-text search';
COMMENT ON TABLE categories IS 'Habit categories with flexible JSONB styling';
COMMENT ON TABLE habits IS 'Core habit tracking with JSONB configuration and scheduling';
COMMENT ON TABLE habit_logs IS 'Daily habit completion records with flexible JSONB data';
COMMENT ON TABLE journal_entries IS 'Journal entries with JSONB content and full-text search';
COMMENT ON TABLE habit_journal_links IS 'Links between habits and journal entries for reflection';

COMMENT ON COLUMN habits.config IS 'JSONB containing type, targets, difficulty, points, and styling';
COMMENT ON COLUMN habits.schedule_config IS 'JSONB containing scheduling configuration for different frequencies';
COMMENT ON COLUMN habit_logs.log_data IS 'JSONB containing flexible data for different habit types';
COMMENT ON COLUMN journal_entries.content IS 'JSONB containing title, body, mood, gratitude, and other flexible fields';

-- All done! Your complete BetterR.me database schema is ready to deploy. 