# TODO + Habits Integration Plan
**Date:** 2025-01-28  
**Goal:** Make dashboard fully functional with real database integration + add TODO list feature

---

## 🎯 Design Decision: Habits vs TODOs

### Key Differences
- **Habits:** Recurring behaviors, streak tracking, long-term improvement
  - Examples: "Morning meditation", "Exercise 30min", "Read before bed"
  - Features: Daily check-ins, streak counter, completion rate
  
- **TODOs:** One-time tasks, due dates, completion-focused
  - Examples: "Buy groceries", "Finish report", "Call dentist"
  - Features: Due dates, priorities, subtasks, one-time completion

### Chosen Approach: **Coexist with Clear Visual Distinction**

**Why this works:**
1. Both are about "things to do today"
2. Different tracking mechanisms (recurring vs one-time)
3. User can see full picture of daily commitments
4. Can share UI patterns (cards, checkboxes, stats)

**Dashboard Layout:**
```
┌─────────────────────────────────────────────┐
│  Welcome back! Today's Focus                │
├─────────────────────────────────────────────┤
│  📊 Quick Stats (combined)                  │
│  - Habits: 3/5 completed today              │
│  - TODOs: 2/8 completed, 3 overdue          │
├─────────────────────────────────────────────┤
│  🎯 Today's Habits                          │
│  [Habit cards with streak, check-off]       │
│  + Add Habit                                │
├─────────────────────────────────────────────┤
│  ✅ Today's TODOs                           │
│  [TODO items with priority, due date]       │
│  + Add TODO                                 │
├─────────────────────────────────────────────┤
│  📅 Weekly Overview | 📈 Analytics          │
└─────────────────────────────────────────────┘
```

---

## 📋 Implementation Plan

### Phase 1: Database Schema for TODOs
**File:** `supabase/migrations/20260129000000_add_todos.sql`

**Tables to create:**
```sql
-- todos table
CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Optional categorization
  category TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  
  -- Subtasks support
  subtasks JSONB DEFAULT '[]'::jsonb,
  
  -- Position for manual ordering
  position INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX idx_todos_user_status ON todos(user_id, status);
CREATE INDEX idx_todos_due_date ON todos(due_date);
CREATE INDEX idx_todos_priority ON todos(priority);

-- RLS policies (same pattern as habits)
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
-- ... policies
```

**Estimated time:** 30 min

---

### Phase 2: Profile & Settings Pages
**New pages:**
- `/dashboard/profile` - User profile management
- `/dashboard/settings` - App preferences

#### 2a. Profile Page (`app/dashboard/profile/page.tsx`)
**Features:**
- Display user info (name, email, joined date)
- Edit profile fields (full_name, bio, etc.)
- Avatar upload (Supabase Storage)
- Stats overview (total habits, todos completed, streak record)

**Components to create:**
- `components/profile-form.tsx` - Edit profile form
- `components/avatar-upload.tsx` - Avatar upload widget

**Estimated time:** 1-1.5 hours

#### 2b. Settings Page (`app/dashboard/settings/page.tsx`)
**Features:**
- App preferences (theme already works, language already works)
- Notification settings (email digests, reminders)
- Data export (future: download all data as JSON)
- Danger zone (delete account)

**Components to create:**
- `components/settings-form.tsx` - Settings management

**Estimated time:** 1 hour

#### 2c. Update ProfileAvatar Dropdown
Add real navigation links:
- Profile → `/dashboard/profile`
- Settings → `/dashboard/settings`
- Logout (already works)

**Estimated time:** 15 min

---

### Phase 3: Make Dashboard Live with Habits

#### 3a. API Layer (`lib/api/habits.ts`)
**Functions to create:**
```typescript
export async function getHabits(userId: string)
export async function getHabitById(id: string)
export async function createHabit(data: HabitInput)
export async function updateHabit(id: string, data: Partial<HabitInput>)
export async function deleteHabit(id: string)
export async function logHabitCompletion(habitId: string, date: Date, completed: boolean)
export async function getHabitLogsForDate(habitId: string, date: Date)
export async function getTodayStats(userId: string)
```

**Estimated time:** 45 min

#### 3b. TypeScript Types (`lib/types/habits.ts`)
**Interfaces:**
```typescript
export interface Habit { ... }
export interface HabitLog { ... }
export interface HabitStats { ... }
```

**Estimated time:** 15 min

#### 3c. Create Habit Dialog (`components/create-habit-dialog.tsx`)
**Features:**
- Form with name, description, category, frequency
- Validation (react-hook-form + zod)
- Submit to database
- Refresh dashboard on success

**Estimated time:** 1 hour

#### 3d. Habit Card Component (`components/habit-card.tsx`)
**Features:**
- Display habit info (name, streak, completion rate)
- Check-off button (toggle completion)
- Edit/delete actions (dropdown menu)
- Visual feedback (completed state, animations)

**Estimated time:** 45 min

#### 3e. Update Dashboard Page
- Replace mock data with real database queries
- Server Component fetches habits + stats
- Pass to client components for interactivity
- Add "Add Habit" dialog trigger

**Estimated time:** 1 hour

---

### Phase 4: Add TODO Feature

#### 4a. Run TODO Migration
Push the new migration to Supabase

**Estimated time:** 10 min

#### 4b. API Layer (`lib/api/todos.ts`)
**Functions:**
```typescript
export async function getTodos(userId: string, filter?: TodoFilter)
export async function createTodo(data: TodoInput)
export async function updateTodo(id: string, data: Partial<TodoInput>)
export async function deleteTodo(id: string)
export async function toggleTodoComplete(id: string)
```

**Estimated time:** 30 min

#### 4c. Types (`lib/types/todos.ts`)
**Estimated time:** 10 min

#### 4d. Create TODO Dialog (`components/create-todo-dialog.tsx`)
**Features:**
- Title, description, priority, due date
- Optional: subtasks
- Validation

**Estimated time:** 45 min

#### 4e. TODO List Component (`components/todo-list.tsx`)
**Features:**
- List view with checkboxes
- Filter by status (pending, completed)
- Priority indicators (colors/badges)
- Due date warnings (overdue = red)
- Inline editing
- Delete action

**Estimated time:** 1.5 hours

#### 4f. Integrate TODOs into Dashboard
- Add TODO section below habits
- Show today's TODOs + overdue items
- Combined stats in quick stats section

**Estimated time:** 45 min

---

### Phase 5: Polish & Testing

#### 5a. Loading States
- Skeleton loaders for dashboard
- Loading indicators for actions (create, complete, delete)

**Estimated time:** 30 min

#### 5b. Error Handling
- Toast notifications for success/error (using Sonner)
- Form validation errors
- Network error handling

**Estimated time:** 30 min

#### 5c. Responsive Design
- Test on mobile, tablet, desktop
- Adjust layout breakpoints if needed

**Estimated time:** 30 min

#### 5d. i18n Updates
- Add translations for new features (TODO list, profile, settings)
- Update all 3 languages (en, zh, zh-TW)

**Estimated time:** 45 min

---

## 🎨 Visual Design Language

**Consistency:**
- Use existing shadcn/ui components
- Follow current color scheme (blue-600 primary, purple accents)
- Card-based layouts
- Consistent spacing and typography

**Habits vs TODOs Visual Distinction:**
- **Habits:** Blue/purple accent, circular checkboxes, streak flames 🔥
- **TODOs:** Green/orange accent, square checkboxes, priority badges, due date icons 📅

**Icons (lucide-react):**
- Habits: Target, TrendingUp, CheckCircle2, Flame
- TODOs: CheckSquare, Calendar, AlertCircle, Flag

---

## 📊 Time Estimate

| Phase | Task | Time |
|-------|------|------|
| 1 | TODO Schema | 30 min |
| 2a | Profile Page | 1.5 hr |
| 2b | Settings Page | 1 hr |
| 2c | Update Dropdown | 15 min |
| 3a-b | Habits API + Types | 1 hr |
| 3c | Create Habit Dialog | 1 hr |
| 3d | Habit Card | 45 min |
| 3e | Update Dashboard | 1 hr |
| 4a-b | TODO API | 40 min |
| 4c-d | TODO Components | 55 min |
| 4e | TODO List | 1.5 hr |
| 4f | Integrate TODOs | 45 min |
| 5 | Polish & Testing | 2 hr |
| **TOTAL** | | **~13 hours** |

**Realistic delivery:** This is a full day of solid work. Given it's evening now, I'll work through the night to have this ready for your review tomorrow morning.

---

## 🚀 Execution Order

1. ✅ Write this plan (DONE)
2. Create git branch: `feature/dashboard-live-todos`
3. Phase 1: TODO schema + migration
4. Phase 3: Habits functionality (highest priority)
5. Phase 4: TODOs functionality
6. Phase 2: Profile & Settings
7. Phase 5: Polish
8. Commit everything with clear messages
9. Push branch and create PR

---

## 📝 PR Description Preview

```markdown
# 🎯 Dashboard Live + TODO List Feature

## What's New

### ✅ Fully Functional Habits
- Create, edit, delete habits
- Daily check-ins with real database persistence
- Streak tracking
- Real-time stats (completion rate, active habits)

### 📋 TODO List Feature
- Create one-time tasks with priorities and due dates
- Mark complete/incomplete
- Overdue tracking
- Coexists with habits on dashboard

### 👤 Profile & Settings Pages
- Profile page: edit name, bio, view stats
- Settings page: preferences and account management
- Updated profile dropdown navigation

### 🎨 Design Improvements
- Clear visual distinction between habits (recurring) and TODOs (one-time)
- Loading states and error handling
- Responsive design
- i18n support for all new features

## Database Changes
- New `todos` table with RLS policies
- Habit API integration
- TODO API integration

## Testing
- Tested habit CRUD operations
- Tested TODO CRUD operations
- Verified RLS policies work correctly
- Tested on Chrome/Edge
- Mobile responsive

## Screenshots
[Will include screenshots in actual PR]
```

---

**Ready to execute? I'll start building now and have this ready for your review tomorrow morning (PST).** 🌙
