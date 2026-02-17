# Codebase Structure

**Analysis Date:** 2026-02-15

## Directory Layout

```
betterr_me/
├── app/                      # Next.js App Router (pages, layouts, API routes)
│   ├── api/                  # API route handlers
│   ├── auth/                 # Authentication pages (login, signup, callback)
│   ├── dashboard/            # Dashboard page and settings
│   ├── habits/               # Habit management pages
│   ├── tasks/                # Task management pages
│   ├── layout.tsx            # Root layout (theme, i18n providers)
│   ├── page.tsx              # Landing page (public)
│   └── globals.css           # Global styles (Tailwind)
├── components/               # React components
│   ├── dashboard/            # Dashboard-specific components
│   ├── habits/               # Habit-specific components
│   ├── tasks/                # Task-specific components
│   ├── settings/             # Settings page components
│   ├── layouts/              # Layout components (AppLayout)
│   └── ui/                   # shadcn/ui primitives (DO NOT EDIT)
├── lib/                      # Shared utilities and business logic
│   ├── db/                   # Database repository classes
│   ├── supabase/             # Supabase client configurations
│   ├── habits/               # Habit-specific logic (scheduling, formatting)
│   ├── hooks/                # React hooks (SWR wrappers)
│   ├── validations/          # Zod schemas for forms and API
│   ├── export/               # CSV export utilities
│   └── utils.ts              # Shared utilities (cn, date helpers)
├── i18n/                     # Internationalization (next-intl)
│   ├── messages/             # Translation JSON files (en, zh, zh-TW)
│   └── request.ts            # Locale detection logic
├── hooks/                    # Legacy hooks directory (deprecated, use lib/hooks)
├── tests/                    # Vitest unit tests (mirrors app/ structure)
├── e2e/                      # Playwright E2E tests
├── scripts/                  # Utility scripts (CSV generation, etc.)
├── supabase/                 # Supabase migrations and config
├── docs/                     # Planning and design docs
├── .planning/                # GSD codebase mapping docs (this file)
├── proxy.ts                  # Middleware entry point (auth, session refresh)
└── [config files]            # next.config.ts, tsconfig.json, etc.
```

## Directory Purposes

**app/ (Next.js App Router):**
- Purpose: Pages, layouts, and API routes using Next.js 16 App Router
- Contains: Server Components (`page.tsx`), layouts (`layout.tsx`), API routes (`route.ts`)
- Key files:
  - `app/layout.tsx`: Root layout with theme and i18n providers
  - `app/page.tsx`: Public landing page
  - `app/dashboard/page.tsx`: Dashboard (server-fetched initial data)
  - `app/api/habits/route.ts`: Habit CRUD API

**app/api/ (API Routes):**
- Purpose: RESTful HTTP endpoints for client-side mutations and queries
- Contains: Route handlers following Next.js route segment conventions
- Key files:
  - `app/api/dashboard/route.ts`: Dashboard data endpoint (with absence calculation)
  - `app/api/habits/route.ts`: GET (list/filter), POST (create)
  - `app/api/habits/[id]/route.ts`: GET (read), PUT (update), DELETE (delete)
  - `app/api/habits/[id]/toggle/route.ts`: POST toggle habit completion
  - `app/api/habits/[id]/logs/route.ts`: GET habit logs (heatmap data)
  - `app/api/habits/[id]/stats/route.ts`: GET habit statistics (streaks, completion rates)
  - `app/api/tasks/route.ts`: Task CRUD
  - `app/api/tasks/[id]/toggle/route.ts`: Toggle task completion
  - `app/api/insights/weekly/route.ts`: Weekly insights (consistency, completion rate, streaks)
  - `app/api/export/route.ts`: CSV export (habits, logs, milestones)

**app/auth/ (Authentication Pages):**
- Purpose: User authentication flows
- Contains: Login, signup, password reset, email confirmation, OAuth callback
- Key files:
  - `app/auth/login/page.tsx`: Login form
  - `app/auth/sign-up/page.tsx`: Signup form
  - `app/auth/callback/route.ts`: OAuth callback handler (exchanges code for session)
  - `app/auth/confirm/route.ts`: Email confirmation handler (token exchange)
  - `app/auth/forgot-password/page.tsx`: Password reset request
  - `app/auth/update-password/page.tsx`: Password reset form

**app/dashboard/ (Dashboard Pages):**
- Purpose: Main authenticated home view
- Contains: Dashboard page, settings page
- Key files:
  - `app/dashboard/page.tsx`: Dashboard server component (initial data fetch)
  - `app/dashboard/settings/page.tsx`: User settings (profile, preferences)
  - `app/dashboard/layout.tsx`: Dashboard layout (wraps with AppLayout)

**app/habits/ (Habit Pages):**
- Purpose: Habit management views
- Contains: List, detail, create, edit pages
- Key files:
  - `app/habits/page.tsx`: Habits list page (server-fetched)
  - `app/habits/new/page.tsx`: Create habit page
  - `app/habits/[id]/page.tsx`: Habit detail (heatmap, stats, logs)
  - `app/habits/[id]/edit/page.tsx`: Edit habit page

**app/tasks/ (Task Pages):**
- Purpose: Task management views
- Contains: List, detail, create, edit pages
- Key files:
  - `app/tasks/page.tsx`: Tasks list page
  - `app/tasks/new/page.tsx`: Create task page
  - `app/tasks/[id]/page.tsx`: Task detail
  - `app/tasks/[id]/edit/page.tsx`: Edit task page

**components/ (React Components):**
- Purpose: Reusable UI components (client and server)
- Contains: Feature-specific components, shared components, UI primitives
- Subdirectories:
  - `components/dashboard/`: Dashboard-specific (snapshot, checklist, motivation, insights)
  - `components/habits/`: Habit-specific (forms, cards, heatmap, milestone cards)
  - `components/tasks/`: Task-specific (forms, list, cards)
  - `components/settings/`: Settings forms
  - `components/layouts/`: Layout wrappers (`app-layout.tsx` with nav/sidebar)
  - `components/ui/`: shadcn/ui primitives (button, card, dialog, etc.) — DO NOT EDIT DIRECTLY

**components/ui/ (shadcn/ui Primitives):**
- Purpose: Radix UI + Tailwind CSS base components (managed by shadcn CLI)
- Contains: Low-level UI primitives (button, card, dialog, dropdown, etc.)
- IMPORTANT: Do not edit directly. Use `pnpx shadcn@latest add <component>` to update.

**lib/ (Shared Libraries):**
- Purpose: Business logic, utilities, database access, hooks
- Subdirectories:
  - `lib/db/`: Database repository classes (see "Data Access Layer" below)
  - `lib/supabase/`: Supabase client configurations (browser, server, proxy)
  - `lib/habits/`: Habit domain logic (scheduling, formatting, absence, milestones, heatmap)
  - `lib/hooks/`: React hooks (SWR wrappers for data fetching)
  - `lib/validations/`: Zod schemas for form and API validation
  - `lib/export/`: CSV export utilities
  - `lib/utils.ts`: Shared utilities (cn for classnames, date helpers)
  - `lib/fetcher.ts`: SWR fetcher function (JSON error handling)
  - `lib/cache.ts`: TTL cache for habit stats (in-memory, 5-min TTL)

**lib/db/ (Data Access Layer):**
- Purpose: Encapsulate all Supabase queries
- Contains: Repository classes for each entity
- Key files:
  - `lib/db/index.ts`: Barrel export of all DB classes
  - `lib/db/types.ts`: TypeScript types for database entities (matches Supabase schema)
  - `lib/db/habits.ts`: `HabitsDB` class (CRUD, filters, today status, counts)
  - `lib/db/habit-logs.ts`: `HabitLogsDB` class (CRUD, toggle, streak calculation)
  - `lib/db/habit-milestones.ts`: `HabitMilestonesDB` class (milestone tracking)
  - `lib/db/tasks.ts`: `TasksDB` class (CRUD, filters, today/tomorrow queries)
  - `lib/db/profiles.ts`: `ProfilesDB` class (user profile CRUD)
  - `lib/db/insights.ts`: `InsightsDB` class (weekly insights generation)

**lib/supabase/ (Supabase Clients):**
- Purpose: Three-tier Supabase client configuration
- Key files:
  - `lib/supabase/client.ts`: Browser client (`createClient()`) — singleton, use in client components
  - `lib/supabase/server.ts`: Server client (`await createClient()`) — fresh instance per request, use in API routes and server components
  - `lib/supabase/proxy.ts`: Middleware client (`updateSession()`) — session refresh, auth redirects

**lib/habits/ (Habit Domain Logic):**
- Purpose: Pure functions for habit-specific calculations
- Key files:
  - `lib/habits/format.ts`: Frequency formatting, category colors/icons, `shouldTrackOnDate()`
  - `lib/habits/heatmap.ts`: Build heatmap data from logs
  - `lib/habits/milestones.ts`: Milestone thresholds (7, 14, 30, 60, 90, 180, 365 days)
  - `lib/habits/absence.ts`: Calculate missed scheduled days and previous streak

**lib/hooks/ (React Hooks):**
- Purpose: SWR wrappers for data fetching
- Key files:
  - `lib/hooks/use-habits.ts`: `useHabits(filters)`, `useHabit(id)`
  - `lib/hooks/use-dashboard.ts`: `useDashboard(date)`
  - `lib/hooks/use-habit-logs.ts`: `useHabitLogs(habitId, days)`
  - `lib/hooks/use-habit-toggle.ts`: `useHabitToggle()` (optimistic toggle mutation)
  - `lib/hooks/use-debounce.ts`: Generic debounce hook

**lib/validations/ (Validation Schemas):**
- Purpose: Shared Zod schemas for client and server validation
- Key files:
  - `lib/validations/habit.ts`: `habitFormSchema` (name, description, category, frequency)
  - `lib/validations/task.ts`: `taskFormSchema` (title, description, due date/time, priority, category)
  - `lib/validations/profile.ts`: `profileFormSchema` (full_name, preferences)

**i18n/ (Internationalization):**
- Purpose: Multi-locale support (en, zh, zh-TW)
- Contains: Locale detection, message loading
- Key files:
  - `i18n/request.ts`: Locale detection (cookie → Accept-Language → default)
  - `i18n/messages/en.json`: English translations
  - `i18n/messages/zh.json`: Simplified Chinese translations
  - `i18n/messages/zh-TW.json`: Traditional Chinese translations

**tests/ (Unit Tests):**
- Purpose: Vitest unit tests (mirrors `app/` structure)
- Contains: Component tests, API route tests, lib function tests
- Key files:
  - `tests/setup.ts`: Global test setup (polyfills, Supabase mock)
  - `tests/app/api/habits/route.test.ts`: Habit API tests
  - `tests/components/dashboard/dashboard-content.test.tsx`: Dashboard component tests
  - `tests/lib/db/habits.test.ts`: HabitsDB class tests

**e2e/ (Playwright E2E Tests):**
- Purpose: End-to-end browser tests
- Contains: Page object models, auth helpers, test specs
- Key files:
  - `e2e/helpers/auth.ts`: `login()`, `ensureAuthenticated()` helpers
  - `e2e/pages/*.ts`: Page object models
  - `e2e/*.spec.ts`: Test specs

**supabase/ (Database Migrations):**
- Purpose: Supabase database schema and migrations
- Contains: SQL migration files
- Key files: `supabase/migrations/*.sql` (initial schema, RLS policies)

**docs/ (Documentation):**
- Purpose: Planning docs, architecture decisions
- Contains: Feature plans, implementation phases

**.planning/ (GSD Codebase Mapping):**
- Purpose: Auto-generated codebase analysis for GSD commands
- Contains: ARCHITECTURE.md, STRUCTURE.md, STACK.md, etc.

## Key File Locations

**Entry Points:**
- `app/page.tsx`: Public landing page
- `app/dashboard/page.tsx`: Authenticated home (dashboard)
- `proxy.ts`: Middleware entry point (calls `lib/supabase/proxy.ts`)

**Configuration:**
- `next.config.ts`: Next.js configuration (i18n, Turbopack, experimental features)
- `tsconfig.json`: TypeScript configuration (strict mode, path aliases)
- `tailwind.config.ts`: Tailwind CSS configuration (theme, plugins)
- `vitest.config.ts`: Vitest test configuration (jsdom, globals, coverage)
- `playwright.config.ts`: Playwright E2E test configuration
- `eslint.config.mjs`: ESLint configuration (Next.js, TypeScript rules)
- `components.json`: shadcn/ui configuration (style, aliases, RSC mode)

**Core Logic:**
- `lib/db/habits.ts`: Habit database operations
- `lib/db/habit-logs.ts`: Habit log operations, streak calculation
- `lib/habits/format.ts`: Frequency scheduling logic (`shouldTrackOnDate()`)
- `lib/habits/absence.ts`: Missed days calculation
- `lib/utils.ts`: Date helpers (`getLocalDateString()`, `getNextDateString()`)

**Testing:**
- `tests/setup.ts`: Global test setup
- `e2e/helpers/auth.ts`: E2E auth helpers

## Naming Conventions

**Files:**
- Server components: `page.tsx` (Next.js convention)
- Client components: `kebab-case.tsx` (e.g., `dashboard-content.tsx`, `habit-checklist.tsx`)
- API routes: `route.ts` (Next.js convention)
- DB classes: `kebab-case.ts` (e.g., `habits.ts`, `habit-logs.ts`)
- Utilities: `kebab-case.ts` (e.g., `utils.ts`, `fetcher.ts`)
- Types: `types.ts` (per module)

**Components:**
- PascalCase: `DashboardContent`, `HabitChecklist`, `TaskCard`
- Client components: Explicitly marked with `"use client"` directive at top of file
- Server components: No directive (default in App Router)

**Functions:**
- camelCase: `getUserHabits()`, `toggleHabitLog()`, `getLocalDateString()`
- React hooks: `use` prefix (e.g., `useHabits()`, `useDashboard()`)
- Event handlers: `handle` prefix (e.g., `handleToggleHabit()`, `handleCreateTask()`)

**Variables:**
- camelCase: `userId`, `habitId`, `todayDate`
- Constants: UPPER_SNAKE_CASE (e.g., `VALID_CATEGORIES`, `CLEANUP_INTERVAL`)

**Types:**
- PascalCase: `Habit`, `Task`, `Profile`, `DashboardData`
- Interfaces: PascalCase (e.g., `HabitWithTodayStatus`, `TaskFilters`)
- Enums (as union types): lowercase literals (e.g., `'active' | 'paused' | 'archived'`)

**Directories:**
- kebab-case: `habit-logs`, `weekly-insight`, `task-list`
- Single word when possible: `dashboard`, `habits`, `tasks`

**DB Classes:**
- PascalCase with `DB` suffix: `HabitsDB`, `TasksDB`, `ProfilesDB`, `HabitLogsDB`, `HabitMilestonesDB`

## Where to Add New Code

**New Feature (Habit/Task-related):**
- Primary code:
  - Database operations: `lib/db/<entity>.ts` (add methods to existing class or create new class)
  - Business logic: `lib/<domain>/*.ts` (pure functions)
  - API routes: `app/api/<resource>/route.ts` or `app/api/<resource>/[id]/<action>/route.ts`
  - Pages: `app/<resource>/page.tsx` (server component) or `app/<resource>/[id]/page.tsx`
  - Components: `components/<domain>/<component-name>.tsx`
- Tests:
  - Unit tests: `tests/lib/db/<entity>.test.ts`, `tests/app/api/<resource>/route.test.ts`
  - Component tests: `tests/components/<domain>/<component>.test.tsx`
  - E2E tests: `e2e/<feature>.spec.ts`

**New Component/Module:**
- Implementation:
  - Feature component: `components/<domain>/<component-name>.tsx`
  - Shared component: `components/<component-name>.tsx`
  - UI primitive: Add via `pnpx shadcn@latest add <component>` (DO NOT create manually in `components/ui/`)
- Tests: `tests/components/<domain>/<component>.test.tsx`

**Utilities:**
- Shared helpers: `lib/utils.ts` (if general-purpose) or `lib/<domain>/utils.ts` (if domain-specific)
- React hooks: `lib/hooks/use-<feature>.ts`
- Validation schemas: `lib/validations/<entity>.ts`

**Database Changes:**
- Migrations: `supabase/migrations/<timestamp>_<description>.sql`
- Type definitions: Update `lib/db/types.ts` to match new schema
- DB class: Update or create class in `lib/db/<entity>.ts`

**New API Endpoint:**
- Route handler: `app/api/<resource>/route.ts` (for collection) or `app/api/<resource>/[id]/route.ts` (for single item)
- Validation: Add Zod schema to `lib/validations/<entity>.ts` if complex
- Tests: `tests/app/api/<resource>/route.test.ts`

**New Page:**
- Server component: `app/<path>/page.tsx` (with optional `loading.tsx`, `error.tsx`)
- Layout: `app/<path>/layout.tsx` (if custom layout needed)
- Client content component: `components/<domain>/<feature>-content.tsx` (for interactivity)

**Internationalization:**
- Add translation keys to ALL THREE files:
  - `i18n/messages/en.json`
  - `i18n/messages/zh.json`
  - `i18n/messages/zh-TW.json`
- Use in server components: `const t = await getTranslations('namespace'); t('key')`
- Use in client components: `const t = useTranslations('namespace'); t('key')`

## Special Directories

**components/ui/:**
- Purpose: shadcn/ui base components (Radix UI + Tailwind)
- Generated: Yes (via `pnpx shadcn@latest add <component>`)
- Committed: Yes
- IMPORTANT: Do not edit manually. Use shadcn CLI to add/update components.

**node_modules/:**
- Purpose: npm dependencies
- Generated: Yes (via `pnpm install`)
- Committed: No (in `.gitignore`)

**.next/:**
- Purpose: Next.js build output and cache
- Generated: Yes (via `pnpm build` or `pnpm dev`)
- Committed: No (in `.gitignore`)

**coverage/:**
- Purpose: Vitest coverage reports (v8 provider)
- Generated: Yes (via `pnpm test:coverage`)
- Committed: No (in `.gitignore`)

**test-results/:**
- Purpose: Playwright test results and screenshots
- Generated: Yes (via `pnpm test:e2e`)
- Committed: No (in `.gitignore`)

**e2e/.auth/:**
- Purpose: Playwright auth state storage (reuse login sessions)
- Generated: Yes (via E2E tests)
- Committed: No (in `.gitignore`)

**.worktrees/:**
- Purpose: Git worktrees for parallel branch development
- Generated: Yes (manually via `git worktree`)
- Committed: No (in `.gitignore`)

**.planning/:**
- Purpose: GSD-generated codebase analysis documents
- Generated: Yes (via `/gsd:map-codebase` command)
- Committed: Yes (helps future planning commands)

**supabase/.temp/:**
- Purpose: Supabase CLI temporary files
- Generated: Yes (via `supabase` CLI)
- Committed: No (in `.gitignore`)

---

*Structure analysis: 2026-02-15*
