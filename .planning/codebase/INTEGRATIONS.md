# External Integrations

**Analysis Date:** 2026-02-15

## APIs & External Services

**Supabase (Backend-as-a-Service):**
- Primary backend service for authentication, database, and real-time features
  - SDK/Client: `@supabase/ssr` (v0.8.0) for SSR, `@supabase/supabase-js` (v2.95.2) for core client
  - Auth: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (environment variables)
  - Three client patterns:
    - Browser: `lib/supabase/client.ts` (`createBrowserClient`)
    - Server: `lib/supabase/server.ts` (`createServerClient` with Next.js cookies)
    - Proxy/Middleware: `lib/supabase/proxy.ts` (`updateSession` for auth flow)
  - Session management: Cookie-based, refreshed via middleware in `proxy.ts`
  - Auth callbacks: `app/auth/callback/route.ts`, `app/auth/confirm/route.ts`

**Unsplash (Image CDN):**
- Remote image optimization via Next.js Image component
  - Domain: `images.unsplash.com`
  - Protocol: HTTPS
  - Configuration: `next.config.ts` `remotePatterns`

## Data Storage

**Databases:**
- PostgreSQL (via Supabase)
  - Connection: Managed by Supabase SDK (uses `NEXT_PUBLIC_SUPABASE_URL`)
  - Client: Supabase client instances
  - ORM/Query Builder: Direct Supabase client queries (no separate ORM)
  - Local dev: PostgreSQL 15 (configurable in `supabase/config.toml`, port 54322)
  - Schema management: SQL migrations in `supabase/migrations/`
    - Initial schema: `20260129_initial_schema.sql`
    - Tables: habits, habit_logs, tasks, profiles, habit_milestones
    - Features: RLS policies, triggers, indexes

**File Storage:**
- Not currently used (no Supabase Storage integration detected)
- Export feature generates CSV/ZIP files in-memory (`lib/export/csv.ts` with `jszip`)

**Caching:**
- Client-side: SWR cache (in-memory, browser-based)
  - Configuration: `lib/cache.ts` for cache keys
  - Pattern: `keepPreviousData: true` for date-based keys
- Server-side: None detected (Next.js default fetch caching applies)

## Authentication & Identity

**Auth Provider:**
- Supabase Auth
  - Implementation: Cookie-based sessions via `@supabase/ssr`
  - Flow:
    1. OAuth callback handled in `app/auth/callback/route.ts`
    2. Session refresh via `proxy.ts` middleware (`updateSession`)
    3. Authenticated users redirected `/` → `/dashboard`
    4. Unauthenticated users redirected to `/auth/login` for protected routes
  - User context: Retrieved via `supabase.auth.getUser()` in server components and API routes
  - Profile data: Stored in `profiles` table (user_id foreign key to auth.users)

**Social Login:**
- Not explicitly configured in codebase (Supabase dashboard config)

## Monitoring & Observability

**Error Tracking:**
- Console-based logging only (`console.error` in API routes)
- No third-party service (Sentry, Rollbar, etc.) detected

**Logs:**
- Server: `console.log`, `console.error` in API routes and middleware
- Client: Browser console

**Performance:**
- Lighthouse CI script: `scripts/analyze-bundle.ts` (run via `pnpm perf:lighthouse`)
- Bundle analysis: `@next/bundle-analyzer` (enabled with `ANALYZE=true pnpm build`)

## CI/CD & Deployment

**Hosting:**
- Not explicitly configured (deployment-agnostic Next.js app)
- Compatible with: Vercel, AWS Amplify, Docker, etc.

**CI Pipeline:**
- GitHub Actions (implied by `process.env.CI` checks in configs)
  - Playwright runs with `pnpm start` (production build)
  - Coverage reporting enabled in Vitest
  - Retries and workers configured for CI environment

**Environment Variables:**
- Development: `.env.local` (not committed, checked in `.gitignore`)
- Production: Must be configured in hosting platform
- Example file: Not present (no `.env.example` or `.env.local.example`)

## Environment Configuration

**Required env vars:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (public)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public key (public)
- `PLAYWRIGHT_BASE_URL` - E2E test base URL (optional, CI only)
- `OPENAI_API_KEY` - Supabase Studio AI features (optional, local dev only)
- `NODE_ENV` - Environment (development/production, set automatically)
- `ANALYZE` - Bundle analyzer toggle (optional, development)
- `CI` - CI environment flag (set by CI platform)

**Secrets location:**
- `.env.local` file (local development)
- Hosting platform environment variable settings (production)

**Validation:**
- `lib/utils.ts` exports `hasEnvVars` helper to check Supabase env vars
- Middleware skips auth checks if env vars missing

## Webhooks & Callbacks

**Incoming:**
- OAuth callback: `GET /auth/callback` (Supabase auth code exchange)
  - Handles OAuth flow completion
  - Exchanges code for session
  - Redirects to `next` parameter or `/dashboard`
- Email confirmation: `GET /auth/confirm` (Supabase email verification)

**Outgoing:**
- None detected (no webhook subscriptions to external services)

## Internationalization (i18n)

**Provider:**
- `next-intl` 4.8.2 (custom integration, not an external API)
  - Locales: en (English), zh (Simplified Chinese), zh-TW (Traditional Chinese)
  - Messages: `i18n/messages/en.json`, `i18n/messages/zh.json`, `i18n/messages/zh-TW.json`
  - Detection: Cookie `locale` → `Accept-Language` header → default `en`
  - Configuration: `i18n/request.ts` with `getRequestConfig`

## Database Schema Management

**Migrations:**
- Tool: Supabase CLI (local development)
  - Migrations path: `supabase/migrations/`
  - Seed data: `supabase/seed.sql` (enabled in `config.toml`)
  - Migration files:
    - `20260129_initial_schema.sql` - Base schema
    - `20260203_001_create_habits_table.sql` - Habits table
    - `20260204000001_create_habit_logs_table.sql` - Habit logs
    - `20260204000002_add_habits_rls_policies.sql` - Row-level security
    - `20260204000003_add_habits_triggers.sql` - Database triggers
    - `20260204000004_alter_tasks_add_category.sql` - Tasks schema
    - `20260206000001_add_profiles_insert_policy.sql` - Profiles RLS
    - `20260206000002_add_habit_logs_stats_index.sql` - Performance indexes
    - `20260209000001_add_task_intention.sql` - Task intention field
    - `20260209100001_create_habit_milestones.sql` - Milestones feature

**Type Generation:**
- Database types: `lib/types/database.ts` (Supabase TypeScript types)
- Application types: `lib/db/types.ts` (application-specific type definitions)

## Data Layer Architecture

**Database Classes:**
- Pattern: Class-based DB abstraction with optional Supabase client injection
  - `lib/db/habits.ts` - HabitsDB class
  - `lib/db/habit-logs.ts` - HabitLogsDB class
  - `lib/db/tasks.ts` - TasksDB class
  - `lib/db/profiles.ts` - ProfilesDB class
  - `lib/db/insights.ts` - InsightsDB class
  - `lib/db/habit-milestones.ts` - HabitMilestonesDB class
- Server usage: `new HabitsDB(await createClient())` from `@/lib/supabase/server`
- Client usage: `new HabitsDB()` (defaults to browser client from `@/lib/supabase/client`)

**API Routes:**
- All routes instantiate fresh server clients (no singletons)
- Pattern:
  ```typescript
  const supabase = await createClient(); // from @/lib/supabase/server
  const habitsDB = new HabitsDB(supabase);
  ```

**Client Data Fetching:**
- SWR hooks: `lib/hooks/use-habits.ts`, `lib/hooks/use-dashboard.ts`, etc.
- Fetcher: `lib/fetcher.ts` (simple fetch wrapper with error handling)
- Cache keys: Include local date for midnight refresh (`lib/cache.ts`)

---

*Integration audit: 2026-02-15*
