# Architecture

**Analysis Date:** 2026-02-15

## Pattern Overview

**Overall:** Next.js App Router with Server Components + Client-Side State Management (SWR)

**Key Characteristics:**
- Server-first rendering with progressive enhancement via client components
- Three-tier Supabase client architecture (browser, server, proxy middleware)
- Database abstraction layer with class-based repositories (`HabitsDB`, `TasksDB`, etc.)
- API routes as thin controllers delegating to DB classes
- Client-side SWR hooks for optimistic updates and cache invalidation
- Timezone-aware date handling using browser-local dates (never UTC)

## Layers

**Presentation Layer (Server Components):**
- Purpose: Initial server-side rendering and data fetching
- Location: `app/**/page.tsx`, `app/**/layout.tsx`
- Contains: RSC pages that fetch initial data server-side, pass to client components
- Depends on: DB classes (`@/lib/db`), server Supabase client (`@/lib/supabase/server`)
- Used by: End users (initial page load)
- Example: `app/dashboard/page.tsx` fetches dashboard data server-side, passes to `DashboardContent`

**Presentation Layer (Client Components):**
- Purpose: Interactive UI with optimistic updates and real-time state
- Location: `components/**/*.tsx`
- Contains: "use client" components, SWR hooks, event handlers
- Depends on: API routes (`/api/*`), SWR hooks (`lib/hooks/*`), fetcher (`lib/fetcher.ts`)
- Used by: Server components (via composition)
- Example: `components/dashboard/dashboard-content.tsx` uses `useSWR` to revalidate data

**API Layer:**
- Purpose: HTTP endpoints for client-side mutations and queries
- Location: `app/api/**/route.ts`
- Contains: RESTful route handlers (GET, POST, PUT, DELETE)
- Depends on: DB classes, server Supabase client, validation schemas (`lib/validations/*`)
- Used by: Client components (via fetch/SWR)
- Example: `app/api/habits/route.ts` instantiates `HabitsDB(supabase)` per request

**Data Access Layer (DB Classes):**
- Purpose: Abstract Supabase queries into reusable, testable methods
- Location: `lib/db/*.ts`
- Contains: Database repository classes (`HabitsDB`, `TasksDB`, `ProfilesDB`, `HabitLogsDB`, `HabitMilestonesDB`, `InsightsDB`)
- Depends on: Supabase client (passed via constructor), type definitions (`lib/db/types.ts`)
- Used by: API routes, server components
- Example: `lib/db/habits.ts` provides `getUserHabits()`, `createHabit()`, `getHabitsWithTodayStatus()`

**Business Logic Layer:**
- Purpose: Domain logic for habits (scheduling, streaks, formatting)
- Location: `lib/habits/*.ts`, `lib/hooks/*.ts`
- Contains: Pure functions for frequency calculations, heatmap building, milestone detection, absence tracking
- Depends on: Type definitions
- Used by: DB classes, API routes, client components
- Example: `lib/habits/format.ts` exports `shouldTrackOnDate()` to determine if a habit should be tracked on a given date

**Authentication & Middleware:**
- Purpose: Session management and route protection
- Location: `lib/supabase/proxy.ts`, `proxy.ts`
- Contains: Middleware that refreshes auth tokens, redirects unauthenticated users
- Depends on: Supabase SSR client
- Used by: Every request (via middleware matcher in `proxy.ts`)
- Example: `lib/supabase/proxy.ts` `updateSession()` redirects `/` → `/dashboard` for authenticated users

**Internationalization (i18n):**
- Purpose: Multi-locale support (en, zh, zh-TW)
- Location: `i18n/request.ts`, `i18n/messages/*.json`
- Contains: Locale detection (cookie → Accept-Language → default), message loading
- Depends on: `next-intl`
- Used by: All components (server via `getTranslations()`, client via `useTranslations()`)

## Data Flow

**Server-Side Initial Render (Dashboard Example):**

1. Request arrives → `proxy.ts` middleware calls `updateSession()` (auth check, redirect if needed)
2. `app/dashboard/page.tsx` (Server Component) executes:
   - `createClient()` from `lib/supabase/server` → server Supabase client
   - Instantiate DB classes: `new HabitsDB(supabase)`, `new TasksDB(supabase)`, etc.
   - Parallel data fetch: `getHabitsWithTodayStatus()`, `getTodayTasks()`, `getTodaysMilestones()`
   - Construct `initialData: DashboardData` object
3. Pass `initialData` to `DashboardContent` client component
4. Server renders HTML with initial data, streams to browser

**Client-Side Data Revalidation:**

1. `DashboardContent` (client component) mounts
2. `useSWR` hook initializes with `fallbackData: initialData` (no loading state)
3. SWR triggers background revalidation: `fetch(/api/dashboard?date=YYYY-MM-DD)`
4. API route `app/api/dashboard/route.ts`:
   - `createClient()` → fresh server client with user's auth session
   - Instantiate DB classes with server client
   - Fetch data (includes absence calculation from logs)
   - Return JSON
5. SWR updates `data` state → component re-renders with fresh data

**Optimistic Mutation (Habit Toggle Example):**

1. User clicks habit checkbox in `DashboardContent`
2. `handleToggleHabit()` fires: `POST /api/habits/:id/toggle` with `{ date: today }`
3. API route:
   - Instantiate `HabitLogsDB(supabase)`
   - Call `toggleHabitLog(habitId, userId, date)` (upsert log, recalculate streak)
   - Return updated habit
4. After successful response: `mutate()` triggers SWR revalidation
5. Dashboard refetches, UI updates with new streak/completion status

**State Management:**
- Server state: SWR cache (keyed by URL + date for midnight refresh)
- Form state: `react-hook-form` (local component state)
- Global UI state: React Context (`ThemeProvider`, `NextIntlClientProvider`)
- Persistent preferences: Supabase `profiles.preferences` JSONB column

## Key Abstractions

**DB Repository Classes:**
- Purpose: Encapsulate all database operations for an entity
- Examples: `lib/db/habits.ts` (`HabitsDB`), `lib/db/tasks.ts` (`TasksDB`), `lib/db/profiles.ts` (`ProfilesDB`)
- Pattern: Class with optional Supabase client constructor param
  - Client-side: `new HabitsDB()` (uses browser client singleton)
  - Server-side: `new HabitsDB(await createClient())` (fresh server client per request)
- Methods: CRUD operations + domain queries (`getHabitsWithTodayStatus()`, `getTodayTasks()`)

**Discriminated Union Types:**
- Purpose: Type-safe representation of polymorphic data (habit frequencies, weekly insights)
- Examples:
  - `HabitFrequency` in `lib/db/types.ts` (5 variants: `daily`, `weekdays`, `weekly`, `times_per_week`, `custom`)
  - `WeeklyInsight` in `lib/db/insights.ts` (3 variants: `consistency`, `completion_rate`, `streak_milestone`)
- Pattern: TypeScript discriminated union with `type` discriminator field
- Usage: Zod schemas validate at API boundaries, components use type narrowing

**SWR Data Fetching Hooks:**
- Purpose: Declarative data fetching with caching, revalidation, optimistic updates
- Examples: `lib/hooks/use-habits.ts` (`useHabits`, `useHabit`), `lib/hooks/use-dashboard.ts` (`useDashboard`)
- Pattern: Thin wrapper around `useSWR` with typed response
  - Key includes date for timezone-aware midnight refresh
  - `keepPreviousData: true` prevents skeleton flash
  - `fallbackData` from server-side initial render

**Validation Schemas:**
- Purpose: Shared validation logic between client forms and API routes
- Examples: `lib/validations/habit.ts` (`habitFormSchema`), `lib/validations/task.ts` (`taskFormSchema`)
- Pattern: Zod schema exported as both type (`HabitFormValues`) and runtime validator
- Usage: `react-hook-form` uses for client-side validation, API routes use for server-side validation

## Entry Points

**Web Application:**
- Location: `app/page.tsx`
- Triggers: User visits `/`
- Responsibilities: Public landing page with hero, features, CTA. Middleware redirects authenticated users to `/dashboard`.

**Dashboard (Authenticated Home):**
- Location: `app/dashboard/page.tsx`
- Triggers: User visits `/dashboard` (or `/` while authenticated)
- Responsibilities: Fetch and render daily snapshot (habits, tasks, milestones, weekly insights). Server-side fetch → client-side revalidation.

**Middleware (Auth & Session):**
- Location: `proxy.ts` → `lib/supabase/proxy.ts` `updateSession()`
- Triggers: Every request (via matcher pattern)
- Responsibilities: Refresh Supabase auth session, redirect logic:
  - Authenticated + `/` → `/dashboard`
  - Unauthenticated + protected route → `/auth/login`
  - Set auth cookies for session persistence

**API Routes:**
- Locations: `app/api/habits/route.ts`, `app/api/tasks/route.ts`, `app/api/dashboard/route.ts`, etc.
- Triggers: Client-side `fetch()` or SWR requests
- Responsibilities:
  - Verify auth session
  - Validate request body (Zod schemas or inline validation)
  - Instantiate DB classes with fresh server client
  - Call DB methods, return JSON
  - Handle errors with `try/catch` → `console.error` → JSON error response

**Root Layout:**
- Location: `app/layout.tsx`
- Triggers: Every page render
- Responsibilities: HTML shell, font loading (Inter, Lexend), theme provider, i18n provider, toast notifications

## Error Handling

**Strategy:** Try-catch at API route boundaries, log to console, return structured JSON errors

**Patterns:**
- API routes: `try { ... } catch (error) { console.error('context:', error); return NextResponse.json({ error: 'message' }, { status: 500 }); }`
- DB classes: Throw errors, let caller handle (API route catches and logs)
- Client components: SWR `error` state → display error UI with retry button
- Form validation: `react-hook-form` + Zod → inline field errors
- Auth errors: Middleware redirects to `/auth/login`, auth callback route redirects to `/auth/error` on failure

**Special Cases:**
- Not found (404): DB classes return `null` for single-item queries (check `PGRST116` error code)
- Unauthorized (401): API routes check `user` from `supabase.auth.getUser()`, return 401 if missing
- Validation errors (400): Return `{ error: 'descriptive message' }` with 400 status
- Missing profile: API routes auto-create profile on first habit/task creation (FK constraint workaround)

## Cross-Cutting Concerns

**Logging:** `console.error()` in API routes and critical paths. No structured logging framework (uses default Next.js request logging).

**Validation:**
- Client-side: `react-hook-form` + Zod schemas from `lib/validations/*`
- Server-side: Inline validation in API routes (some use Zod, some use manual checks)
- Database layer: Relies on Postgres constraints (FK, NOT NULL, CHECK)

**Authentication:**
- Supabase Auth (email/password, magic link, OAuth)
- Session refresh: Middleware calls `supabase.auth.getUser()` on every request
- Client-side: `createClient()` from `lib/supabase/client` (browser client)
- Server-side: `await createClient()` from `lib/supabase/server` (server client with cookies)
- Row-level security (RLS): Enforced in Supabase database (all queries filtered by `auth.uid()`)

**Authorization:**
- Implicit via RLS: All queries scoped to `user_id = auth.uid()`
- API routes verify user existence via `supabase.auth.getUser()` but don't check roles (single-tenant app)

**Date/Time Handling:**
- CRITICAL: All dates are browser-local, never UTC
- `getLocalDateString(date?: Date): string` in `lib/utils.ts` returns `YYYY-MM-DD` in local timezone
- API routes accept `?date=YYYY-MM-DD` query param from client (client's local date)
- Database stores `DATE` type (no timezone) and `TIMESTAMPTZ` for audit fields
- Habit scheduling uses `shouldTrackOnDate(frequency, date)` with local Date objects

**Caching:**
- Client-side: SWR cache (automatic, keyed by URL)
- Server-side: `lib/cache.ts` TTLCache for habit stats (5-minute TTL, in-memory per-instance)
- No Redis or external cache (acceptable for MVP scale)

**Timezone Handling:**
- User preference: `profiles.preferences.week_start_day` (0=Sunday, 1=Monday, etc.)
- Date formatting: `profiles.preferences.date_format` (not yet implemented in UI)
- SWR keys include local date: `/api/dashboard?date=${getLocalDateString()}` → revalidates at midnight local time

---

*Architecture analysis: 2026-02-15*
