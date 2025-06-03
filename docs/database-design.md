# BetterR.me Complete Database Design

## Overview
This database design supports a comprehensive self-improvement platform combining habit tracking and journaling with PostgreSQL optimizations. The architecture includes user authentication, habit management, journaling capabilities, progress tracking, gamification features, and advanced analytics.

## PostgreSQL Optimizations
- **JSONB Fields**: Flexible data storage for preferences, configurations, and content
- **Full-Text Search**: TSVECTOR generated columns with GIN indexes
- **Materialized Views**: Pre-computed analytics for dashboard performance
- **Custom Functions**: PostgreSQL functions for streak calculations and statistics
- **Advanced Indexing**: GIN indexes for JSONB fields, optimized composite indexes
- **Row Level Security**: Comprehensive RLS policies for data protection

## Database Schema

### Core User Tables

#### 1. `profiles` (Enhanced User Profiles)
Extends Supabase Auth with JSONB preferences and full-text search.

```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  
  -- Enhanced user preferences with JSONB
  preferences JSONB DEFAULT '{
    "timezone": "UTC",
    "date_format": "MM/DD/YYYY",
    "week_start_day": 1,
    "theme": "system",
    "notifications": {
      "email": true,
      "push": true,
      "reminder_time": "09:00"
    }
  }'::jsonb,
  
  -- Search optimization
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(full_name, '') || ' ' || coalesce(email, ''))
  ) STORED,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. `categories` (Habit Categories)
Organize habits with flexible JSONB styling.

```sql
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
  
  CONSTRAINT unique_user_category UNIQUE(user_id, name)
);
```

### Habit Tracking Tables

#### 3. `habits` (Enhanced Habit Management)
Core table with JSONB configuration and advanced scheduling.

```sql
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
  
  -- Enhanced scheduling
  frequency TEXT DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'custom')),
  schedule_config JSONB DEFAULT '{
    "weekly_days": [1,2,3,4,5,6,7],
    "monthly_days": null,
    "custom_pattern": null
  }'::jsonb,
  
  -- Status with constraints
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
```

#### 4. `habit_logs` (Enhanced Daily Tracking)
Flexible daily habit completion records with JSONB data.

```sql
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
  
  CONSTRAINT unique_habit_date UNIQUE(habit_id, date)
);
```

#### 5. `streaks` (Enhanced Streak Tracking)
Advanced streak calculations with JSONB analytics.

```sql
CREATE TABLE streaks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  current_streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  last_completed_date DATE,
  streak_start_date DATE,
  
  -- Enhanced tracking with JSONB
  streak_data JSONB DEFAULT '{
    "weekly_streaks": 0,
    "monthly_streaks": 0,
    "total_completions": 0,
    "completion_rate": 0.0
  }'::jsonb,
  
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_habit_streak UNIQUE(habit_id)
);
```

### Journal Feature Tables

#### 6. `journal_entries` (Main Journaling)
Comprehensive journaling with JSONB content and full-text search.

```sql
CREATE TABLE journal_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
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
  
  -- Generated metadata
  word_count INTEGER GENERATED ALWAYS AS (
    length(regexp_replace(content->>'body', '\s+', ' ', 'g'))
  ) STORED,
  
  -- Full-text search
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', 
      coalesce(content->>'title', '') || ' ' || 
      coalesce(content->>'body', '') || ' ' ||
      array_to_string(
        CASE 
          WHEN jsonb_typeof(content->'tags') = 'array' 
          THEN array(SELECT jsonb_array_elements_text(content->'tags'))
          ELSE ARRAY[]::text[]
        END, ' '
      )
    )
  ) STORED,
  
  is_private BOOLEAN DEFAULT true,
  template_used TEXT,
  
  CONSTRAINT unique_user_date UNIQUE(user_id, entry_date)
);
```

#### 7. `journal_templates` (Template System)
Customizable journaling templates with JSONB structure.

```sql
CREATE TABLE journal_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE, -- NULL for system templates
  
  name TEXT NOT NULL,
  description TEXT,
  
  -- Template structure in JSONB
  template JSONB DEFAULT '{
    "prompts": [
      {"label": "What are you grateful for today?", "field": "gratitude", "type": "list"},
      {"label": "How was your energy level?", "field": "energy_level", "type": "rating", "scale": 5}
    ],
    "default_tags": [],
    "required_fields": ["body"]
  }'::jsonb,
  
  is_public BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 8. `habit_journal_links` (Habit-Journal Integration)
Connect habits to journal entries for reflection and insights.

```sql
CREATE TABLE habit_journal_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  link_type TEXT DEFAULT 'reflection' CHECK (link_type IN ('reflection', 'inspiration', 'challenge', 'celebration')),
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_habit_journal_link UNIQUE(habit_id, journal_entry_id)
);
```

#### 9. `journal_media` (Media Attachments)
Photos, voice notes, and other media for journal entries.

```sql
CREATE TABLE journal_media (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  file_path TEXT NOT NULL, -- Supabase Storage path
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'audio', 'video', 'document')),
  file_size INTEGER,
  mime_type TEXT,
  
  -- Metadata with JSONB
  metadata JSONB DEFAULT '{
    "alt_text": null,
    "caption": null,
    "transcription": null,
    "duration_seconds": null,
    "dimensions": null
  }'::jsonb,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Gamification Tables

#### 10. `user_stats` (Enhanced User Statistics)
Comprehensive user statistics with journal integration.

```sql
CREATE TABLE user_stats (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  
  total_xp INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  
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
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 11. `achievements` (Available Achievements)
Extended achievement system supporting journal milestones.

```sql
CREATE TABLE achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  icon TEXT DEFAULT 'trophy',
  category TEXT DEFAULT 'general', -- 'streaks', 'habits', 'milestones', 'journal'
  
  -- Extended criteria types
  criteria_type TEXT CHECK (criteria_type IN ('streak', 'habit_count', 'total_completions', 'consecutive_days', 'journal_streak', 'journal_entries')) NOT NULL,
  criteria_value INTEGER NOT NULL,
  
  xp_reward INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 12. `user_achievements` (User's Unlocked Achievements)
Track user's earned achievements.

```sql
CREATE TABLE user_achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  achievement_id UUID REFERENCES achievements(id) ON DELETE CASCADE NOT NULL,
  
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_user_achievement UNIQUE(user_id, achievement_id)
);
```

### Analytics Tables

#### 13. `daily_summaries` (Enhanced Daily Analytics)
Daily progress summaries with journal integration.

```sql
CREATE TABLE daily_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  date DATE NOT NULL,
  habits_completed INTEGER DEFAULT 0,
  habits_total INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2),
  xp_earned INTEGER DEFAULT 0,
  
  -- Journal integration
  journal_entry_exists BOOLEAN DEFAULT false,
  journal_word_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_user_date_summary UNIQUE(user_id, date)
);
```

#### 14. `habit_analytics` (Habit Analytics)
Detailed habit-specific analytics and insights.

```sql
CREATE TABLE habit_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  
  period_type TEXT CHECK (period_type IN ('week', 'month')) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  completions INTEGER DEFAULT 0,
  completion_rate DECIMAL(5,2),
  average_value DECIMAL(10,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_habit_period UNIQUE(habit_id, period_type, period_start)
);
```

## PostgreSQL Functions

### Streak Calculation Functions
```sql
-- Calculate habit streak
CREATE OR REPLACE FUNCTION calculate_streak(habit_uuid UUID, check_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
  streak_count INTEGER := 0;
  current_check_date DATE := check_date;
BEGIN
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

-- Calculate journal streak
CREATE OR REPLACE FUNCTION calculate_journal_streak(target_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  streak_count INTEGER := 0;
  current_date DATE := CURRENT_DATE;
BEGIN
  LOOP
    IF EXISTS (
      SELECT 1 FROM journal_entries 
      WHERE user_id = target_user_id AND entry_date = current_date
    ) THEN
      streak_count := streak_count + 1;
      current_date := current_date - INTERVAL '1 day';
    ELSE
      EXIT;
    END IF;
  END LOOP;
  
  RETURN streak_count;
END;
$$ LANGUAGE plpgsql;

-- Get comprehensive journal stats
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
```

## Materialized Views

### Dashboard Summary View
```sql
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
```

## Optimized Indexes

### JSONB Indexes
```sql
-- JSONB GIN indexes for fast queries
CREATE INDEX idx_profiles_preferences ON profiles USING GIN (preferences);
CREATE INDEX idx_categories_style ON categories USING GIN (style);
CREATE INDEX idx_habits_config ON habits USING GIN (config);
CREATE INDEX idx_habits_schedule ON habits USING GIN (schedule_config);
CREATE INDEX idx_habit_logs_data ON habit_logs USING GIN (log_data);
CREATE INDEX idx_journal_entries_content ON journal_entries USING GIN (content);
```

### Full-Text Search Indexes
```sql
-- Full-text search indexes
CREATE INDEX idx_profiles_search ON profiles USING GIN (search_vector);
CREATE INDEX idx_habits_search ON habits USING GIN (search_vector);
CREATE INDEX idx_journal_entries_search ON journal_entries USING GIN (search_vector);
```

### Performance Indexes
```sql
-- User-based queries
CREATE INDEX idx_habits_user_active ON habits(user_id, status) WHERE status = 'active';
CREATE INDEX idx_habit_logs_user_date ON habit_logs(user_id, date DESC);
CREATE INDEX idx_journal_entries_user_date ON journal_entries(user_id, entry_date DESC);

-- Habit-specific queries
CREATE INDEX idx_habit_logs_habit_date ON habit_logs(habit_id, date DESC);
CREATE INDEX idx_habit_logs_completed ON habit_logs(user_id, completed, date) WHERE completed = true;

-- Analytics queries
CREATE INDEX idx_daily_summaries_user_date ON daily_summaries(user_id, date);
CREATE INDEX idx_habit_analytics_habit_period ON habit_analytics(habit_id, period_type, period_start);
```

## Row Level Security (RLS)

### Core Table Policies
```sql
-- Enable RLS on all user tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_journal_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

-- User data policies
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can manage own categories" ON categories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own habits" ON habits FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own habit logs" ON habit_logs FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own journal entries" ON journal_entries FOR ALL USING (auth.uid() = user_id);

-- Template policies (support public templates)
CREATE POLICY "Users can manage own templates" ON journal_templates FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users can view public templates" ON journal_templates FOR SELECT USING (is_public = true OR auth.uid() = user_id OR user_id IS NULL);

-- Achievement policies (achievements are public, user_achievements are private)
CREATE POLICY "Achievements are publicly readable" ON achievements FOR SELECT USING (true);
CREATE POLICY "Users can manage own achievements" ON user_achievements FOR ALL USING (auth.uid() = user_id);
```

## Initial Data

### Default Achievements
```sql
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
```

### System Journal Templates
```sql
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
```

## Key Relationships

### Core Relationships
1. **profiles** ↔ **habits**: One-to-many (user has multiple habits)
2. **profiles** ↔ **journal_entries**: One-to-many (user has multiple journal entries)
3. **categories** ↔ **habits**: One-to-many (category contains multiple habits)
4. **habits** ↔ **habit_logs**: One-to-many (habit has multiple daily logs)
5. **habits** ↔ **streaks**: One-to-one (each habit has one streak record)
6. **profiles** ↔ **user_stats**: One-to-one (each user has one stats record)

### Journal Relationships
7. **journal_entries** ↔ **habit_journal_links**: One-to-many (entry can link to multiple habits)
8. **habits** ↔ **habit_journal_links**: One-to-many (habit can link to multiple entries)
9. **journal_entries** ↔ **journal_media**: One-to-many (entry can have multiple media files)
10. **journal_templates** ↔ **journal_entries**: One-to-many (template used by multiple entries)

### Gamification Relationships
11. **achievements** ↔ **user_achievements**: Many-to-many (users unlock multiple achievements)
12. **profiles** ↔ **user_achievements**: One-to-many (user has multiple achievements)

## Features Supported

### Habit Tracking
- ✅ Flexible habit types (boolean, counter, duration, rating)
- ✅ Advanced scheduling (daily, weekly, monthly, custom patterns)
- ✅ Streak tracking with PostgreSQL functions
- ✅ Categories with JSONB styling
- ✅ Performance analytics and insights
- ✅ Full-text search across habits

### Journaling
- ✅ Rich JSONB content (title, body, mood, gratitude, tags, etc.)
- ✅ Template system for guided journaling
- ✅ Media attachments (photos, voice notes)
- ✅ Habit-journal linking for reflection
- ✅ Full-text search across journal entries
- ✅ Word count tracking and analytics

### Gamification
- ✅ XP system and level progression
- ✅ Achievement system with journal milestones
- ✅ Daily/weekly/monthly analytics
- ✅ Streak tracking for both habits and journaling
- ✅ User statistics with JSONB flexibility

### Technical Features
- ✅ PostgreSQL optimizations (JSONB, GIN indexes, materialized views)
- ✅ Full-text search with TSVECTOR
- ✅ Row Level Security for data protection
- ✅ Custom PostgreSQL functions
- ✅ Automatic triggers for timestamps
- ✅ Performance monitoring capabilities

This comprehensive database design supports a full-featured self-improvement platform with both habit tracking and journaling capabilities, optimized for PostgreSQL performance and scalability. 