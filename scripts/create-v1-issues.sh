#!/bin/bash

# V1.0 GitHub Issues Creation Script
# Run this after authenticating with: gh auth login
#
# Usage: ./scripts/create-v1-issues.sh
#
# This creates all issues for the V1.0 implementation plan.

set -e

echo "🚀 Creating V1.0 GitHub Issues..."
echo ""

# Check if gh is authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ GitHub CLI not authenticated. Run 'gh auth login' first."
    exit 1
fi

# Create labels first
echo "📋 Creating labels..."
gh label create "P0" --description "Critical priority" --color "d73a4a" 2>/dev/null || true
gh label create "P1" --description "Important" --color "fbca04" 2>/dev/null || true
gh label create "P2" --description "Nice to have" --color "0e8a16" 2>/dev/null || true
gh label create "database" --description "Database related" --color "1d76db" 2>/dev/null || true
gh label create "backend" --description "Backend/API" --color "5319e7" 2>/dev/null || true
gh label create "frontend" --description "Frontend/UI" --color "006b75" 2>/dev/null || true
gh label create "api" --description "API endpoints" --color "d4c5f9" 2>/dev/null || true
gh label create "component" --description "UI Component" --color "c5def5" 2>/dev/null || true
gh label create "page" --description "Page/Route" --color "bfdadc" 2>/dev/null || true
gh label create "testing" --description "Tests" --color "fef2c0" 2>/dev/null || true
gh label create "e2e" --description "End-to-end tests" --color "d93f0b" 2>/dev/null || true
gh label create "i18n" --description "Internationalization" --color "c2e0c6" 2>/dev/null || true
gh label create "accessibility" --description "Accessibility" --color "0052cc" 2>/dev/null || true
gh label create "performance" --description "Performance" --color "ff7619" 2>/dev/null || true
gh label create "security" --description "Security" --color "ee0701" 2>/dev/null || true

# Create milestones
echo "📅 Creating milestones..."
gh api repos/:owner/:repo/milestones -f title="V1.0 Phase 1 - Database & APIs" -f description="Days 1-3: Database migrations, API routes" -f due_on="2026-02-06T00:00:00Z" 2>/dev/null || true
gh api repos/:owner/:repo/milestones -f title="V1.0 Phase 2 - Frontend" -f description="Days 4-8: UI components, pages, dashboard" -f due_on="2026-02-11T00:00:00Z" 2>/dev/null || true
gh api repos/:owner/:repo/milestones -f title="V1.0 Phase 3 - Testing & Polish" -f description="Days 9-11: E2E tests, accessibility, performance" -f due_on="2026-02-14T00:00:00Z" 2>/dev/null || true

echo ""
echo "📝 Creating issues..."
echo ""

# ============================================
# EPIC 1: Database Foundation
# ============================================
echo "Epic 1: Database Foundation"

gh issue create \
  --title "DB-001: Create habits table migration" \
  --label "database,backend,P0" \
  --body "## Description
Create the PostgreSQL migration for the \`habits\` table.

## Requirements
- [ ] Create migration file \`supabase/migrations/20260203_001_create_habits_table.sql\`
- [ ] Include all columns: id, user_id, name, description, category, frequency (JSONB), status, current_streak, best_streak, paused_at, created_at, updated_at
- [ ] Add indexes: user_id, (user_id, status), active habits
- [ ] Add CHECK constraints for category and status enums
- [ ] Test migration runs successfully with \`supabase db reset\`

## Acceptance Criteria
- Migration applies without errors
- Table visible in Supabase dashboard
- Indexes created correctly

## Reference
Engineering Plan Section 6.2"

gh issue create \
  --title "DB-002: Create habit_logs table migration" \
  --label "database,backend,P0" \
  --body "## Description
Create the PostgreSQL migration for the \`habit_logs\` table.

## Requirements
- [ ] Create migration file \`supabase/migrations/20260203_002_create_habit_logs_table.sql\`
- [ ] Include columns: id, habit_id, user_id, logged_date, completed, created_at, updated_at
- [ ] Add UNIQUE constraint on (habit_id, logged_date)
- [ ] Add foreign keys to habits and profiles tables
- [ ] Add indexes for common queries

## Acceptance Criteria
- Migration applies without errors
- Unique constraint prevents duplicate logs per day
- Cascade delete works when habit is deleted"

gh issue create \
  --title "DB-003: Add RLS policies for habit tables" \
  --label "database,backend,security,P0" \
  --body "## Description
Add Row Level Security policies to ensure users can only access their own data.

## Requirements
- [ ] Create migration file \`supabase/migrations/20260203_003_add_rls_policies.sql\`
- [ ] Enable RLS on habits table
- [ ] Enable RLS on habit_logs table
- [ ] Add SELECT/INSERT/UPDATE/DELETE policies for both tables
- [ ] Policies should use \`auth.uid()\` for user verification

## Acceptance Criteria
- User A cannot see User B's habits
- User A cannot modify User B's habit logs
- Verified with test queries"

gh issue create \
  --title "DB-004: Add updated_at triggers" \
  --label "database,backend,P0" \
  --body "## Description
Add triggers to automatically update \`updated_at\` timestamp on row modifications.

## Requirements
- [ ] Create migration file \`supabase/migrations/20260203_004_add_triggers.sql\`
- [ ] Reuse existing \`update_updated_at_column()\` function if it exists
- [ ] Apply trigger to habits table
- [ ] Apply trigger to habit_logs table

## Acceptance Criteria
- Updating a habit row updates its updated_at timestamp
- Updating a habit_log row updates its updated_at timestamp"

gh issue create \
  --title "DB-005: Add category column to tasks table" \
  --label "database,backend,P1" \
  --body "## Description
Add optional category column to existing tasks table.

## Requirements
- [ ] Create migration file \`supabase/migrations/20260203_005_alter_tasks_add_category.sql\`
- [ ] Add category column with CHECK constraint
- [ ] Categories: 'work', 'personal', 'shopping', 'other'
- [ ] Column should be nullable (existing tasks don't have category)

## Acceptance Criteria
- Migration applies without affecting existing data
- New tasks can have category assigned"

gh issue create \
  --title "DB-006: Generate TypeScript types for habits" \
  --label "database,P0" \
  --body "## Description
Generate and update TypeScript types to include new habit tables.

## Requirements
- [ ] Run \`supabase gen types typescript --local > lib/types/database.ts\`
- [ ] Verify Habit and HabitLog types are generated
- [ ] Create manual type definitions in \`lib/db/types.ts\` for app use
- [ ] Add Zod validation schemas for habit frequency

## Acceptance Criteria
- TypeScript compilation passes
- Types match database schema exactly
- Frequency JSONB has proper discriminated union type"

# ============================================
# EPIC 2: Database Layer
# ============================================
echo "Epic 2: Database Layer"

gh issue create \
  --title "DAL-001: Implement HabitsDB class" \
  --label "backend,P0" \
  --body "## Description
Create the database access layer for habits following the existing pattern.

## Requirements
- [ ] Create \`lib/db/habits.ts\`
- [ ] Implement methods: getAll, getById, create, update, delete
- [ ] Add filtering by status (active, paused, archived)
- [ ] Add updateStreak method
- [ ] Follow existing error handling patterns

## Acceptance Criteria
- All CRUD operations work correctly
- Filtering returns correct results
- Errors are handled consistently

## Reference
Follow patterns in existing \`lib/db/tasks.ts\`"

gh issue create \
  --title "DAL-002: Implement HabitLogsDB class" \
  --label "backend,P0" \
  --body "## Description
Create the database access layer for habit logs.

## Requirements
- [ ] Create \`lib/db/habit-logs.ts\`
- [ ] Implement toggle method (create or delete log for date)
- [ ] Implement getByDateRange for heatmap
- [ ] Implement getByDate for dashboard (all habits for a day)
- [ ] Handle the 7-day edit window constraint

## Acceptance Criteria
- Toggle creates log if not exists, deletes if exists
- Date range query returns correct logs
- Rejects edits older than 7 days"

gh issue create \
  --title "DAL-003: Implement streak calculation" \
  --label "backend,P0" \
  --body "## Description
Implement the streak calculation algorithm that handles all frequency types.

## Requirements
- [ ] Create \`lib/habits/streak.ts\`
- [ ] Handle daily frequency
- [ ] Handle weekdays (Mon-Fri) frequency
- [ ] Handle weekly frequency
- [ ] Handle times_per_week (2x, 3x)
- [ ] Handle custom days frequency
- [ ] Handle paused habits (freeze streak)
- [ ] Skip today if not yet completed

## Acceptance Criteria
- All frequency types calculate correctly
- Edge cases handled
- Returns both current_streak and best_streak

## Reference
PRD Section 6 (Streak Calculation Rules)"

gh issue create \
  --title "DAL-004: Unit tests for HabitsDB" \
  --label "testing,backend,P1" \
  --body "## Description
Write comprehensive unit tests for the HabitsDB class.

## Requirements
- [ ] Create \`tests/lib/db/habits.test.ts\`
- [ ] Test all CRUD operations
- [ ] Test filtering by status
- [ ] Test error cases (not found, unauthorized)
- [ ] Mock Supabase client following existing patterns

## Acceptance Criteria
- 80%+ code coverage for HabitsDB
- All tests pass"

gh issue create \
  --title "DAL-005: Unit tests for streak calculation" \
  --label "testing,backend,P0" \
  --body "## Description
Write comprehensive unit tests for streak calculation covering all edge cases.

## Test Cases Required
- [ ] Daily: consecutive days, missed day breaks streak
- [ ] Weekdays: skips weekends, breaks on missed weekday
- [ ] Weekly: counts weeks with completion
- [ ] Times per week: 2x and 3x patterns
- [ ] Custom days: Mon/Wed/Fri pattern
- [ ] Edge: habit created today
- [ ] Edge: habit paused and resumed
- [ ] Edge: timezone boundary
- [ ] Edge: no logs yet (streak = 0)
- [ ] Edge: skip today if not completed

## Acceptance Criteria
- 100% code coverage for streak.ts
- All edge cases documented and tested"

gh issue create \
  --title "DAL-006: Implement DashboardDB class" \
  --label "backend,P0" \
  --body "## Description
Create aggregated data fetching for the dashboard endpoint.

## Requirements
- [ ] Create \`lib/db/dashboard.ts\`
- [ ] Implement getTodayData method
- [ ] Aggregate: habits completed today, tasks completed today
- [ ] Get comparison with yesterday
- [ ] Get top streaks
- [ ] Get motivational message based on progress

## Acceptance Criteria
- Single method returns all dashboard data
- Efficient queries (avoid N+1)
- Handles first-day user (no yesterday data)"

# ============================================
# EPIC 3: API Routes
# ============================================
echo "Epic 3: API Routes"

gh issue create \
  --title "API-001: GET /api/habits endpoint" \
  --label "api,backend,P0" \
  --body "## Description
Create endpoint to list user's habits with optional filtering.

## Requirements
- [ ] Create \`app/api/habits/route.ts\`
- [ ] Require authentication
- [ ] Support query param: \`?status=active|paused|archived\`
- [ ] Return habits sorted by created_at desc
- [ ] Include current_streak in response

## Acceptance Criteria
- Returns 401 if not authenticated
- Returns only user's own habits
- Filtering works correctly"

gh issue create \
  --title "API-002: POST /api/habits endpoint" \
  --label "api,backend,P0" \
  --body "## Description
Create endpoint to create a new habit.

## Requirements
- [ ] Add POST handler to \`app/api/habits/route.ts\`
- [ ] Validate request body with Zod schema
- [ ] Validate frequency JSONB structure
- [ ] Set user_id from authenticated user
- [ ] Return created habit with 201 status

## Acceptance Criteria
- Returns 400 for invalid data
- Returns 401 if not authenticated
- Frequency validation rejects invalid types"

gh issue create \
  --title "API-006: POST /api/habits/[id]/toggle endpoint" \
  --label "api,backend,P0" \
  --body "## Description
Create endpoint to toggle habit completion for a specific date.

## Requirements
- [ ] Create \`app/api/habits/[id]/toggle/route.ts\`
- [ ] Accept body: \`{ logged_date: \"2026-02-03\" }\`
- [ ] If log exists for date, delete it (toggle off)
- [ ] If log doesn't exist, create it (toggle on)
- [ ] Recalculate streak after toggle
- [ ] Update best_streak if current exceeds it
- [ ] Reject dates > 7 days ago
- [ ] Reject future dates

## Response
\`\`\`json
{
  \"completed\": true,
  \"current_streak\": 24,
  \"best_streak\": 45
}
\`\`\`

## Acceptance Criteria
- Toggle on/off works correctly
- Streak updates in response
- Rejects invalid dates with clear error"

gh issue create \
  --title "API-009: GET /api/dashboard/today endpoint" \
  --label "api,backend,P0" \
  --body "## Description
Create aggregated dashboard endpoint for efficient data loading.

## Requirements
- [ ] Create \`app/api/dashboard/today/route.ts\`
- [ ] Return habits summary (completed/total today)
- [ ] Return tasks summary (completed/total today)
- [ ] Return comparison with yesterday (or null for day 1)
- [ ] Return top streaks (top 3)
- [ ] Return full habits list with today's completion status
- [ ] Return today's tasks list
- [ ] Return motivational message

## Acceptance Criteria
- Single request returns all dashboard data
- Handles first-day users gracefully
- Performance: <500ms response time"

# ============================================
# EPIC 4-8: Summary issues
# ============================================
echo "Creating epic summary issues..."

gh issue create \
  --title "Epic 4: Core UI Components" \
  --label "frontend,component" \
  --body "## Components to Build

- [ ] UI-001: HabitForm component
- [ ] UI-002: FrequencySelector component
- [ ] UI-003: HabitCard component
- [ ] UI-004: HabitList component
- [ ] UI-005: StreakCounter component
- [ ] UI-006: Heatmap30Day component
- [ ] UI-007: HabitEmptyState component
- [ ] UI-008: Component tests

## Reference
See \`.github/ISSUES_V1.md\` for detailed requirements"

gh issue create \
  --title "Epic 5: Habit Pages" \
  --label "frontend,page" \
  --body "## Pages to Build

- [ ] PG-001: /habits page
- [ ] PG-002: /habits/new page
- [ ] PG-003: /habits/[id] detail page
- [ ] PG-004: /habits/[id]/edit page
- [ ] PG-005: Add habits to navigation
- [ ] PG-006: i18n for habit strings

## Reference
See \`.github/ISSUES_V1.md\` for detailed requirements"

gh issue create \
  --title "Epic 6: Dashboard Integration" \
  --label "frontend,P0" \
  --body "## Tasks

- [ ] DASH-001: DailySnapshot component
- [ ] DASH-002: HabitChecklist component
- [ ] DASH-003: TasksToday component
- [ ] DASH-004: MotivationMessage component
- [ ] DASH-005: Refactor dashboard with real data
- [ ] DASH-006: Dashboard empty states
- [ ] DASH-007: Dashboard loading states

## Reference
See \`.github/ISSUES_V1.md\` for detailed requirements"

gh issue create \
  --title "Epic 7: Settings & Polish" \
  --label "frontend" \
  --body "## Tasks

- [ ] SET-001: Timezone selector
- [ ] SET-002: Week start day setting
- [ ] SET-003: Data export (CSV)
- [ ] SET-004: Settings i18n

## Reference
See \`.github/ISSUES_V1.md\` for detailed requirements"

gh issue create \
  --title "Epic 8: Testing & Quality" \
  --label "testing" \
  --body "## Tasks

- [ ] QA-001: E2E test - Create habit flow
- [ ] QA-002: E2E test - Complete habit flow
- [ ] QA-003: E2E test - Dashboard load
- [ ] QA-004: Accessibility audit
- [ ] QA-005: Performance audit
- [ ] QA-006: Cross-browser testing
- [ ] QA-007: Mobile responsive testing
- [ ] QA-008: Bug fixes

## Reference
See \`.github/ISSUES_V1.md\` for detailed requirements"

echo ""
echo "✅ Done! Issues created successfully."
echo ""
echo "Next steps:"
echo "1. Go to GitHub Issues to see all created issues"
echo "2. Assign issues to team members"
echo "3. Set up a Project board if desired"
echo ""
