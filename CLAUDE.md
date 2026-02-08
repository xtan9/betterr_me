# CLAUDE.md

This file provides context for AI assistants working on this codebase.

## Project Overview

**BetterR.Me** is a habit tracking web app built with Next.js 15 (App Router), Supabase, and TypeScript. It supports three locales (en, zh, zh-TW), dark mode, and is fully tested with Vitest and Playwright.

## Quick Reference

```bash
pnpm dev              # Start dev server (Turbopack)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm test             # Vitest watch mode
pnpm test:run         # Vitest single run (55 files, 661 tests)
pnpm test:coverage    # Vitest with v8 coverage
pnpm test:e2e         # Playwright (all browsers)
pnpm test:e2e:chromium  # Playwright (Chromium only — fastest)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.5 (App Router) |
| Language | TypeScript (strict) |
| Auth & DB | Supabase SSR (`@supabase/ssr`) |
| UI | shadcn/ui + Radix UI (unified `radix-ui` package) + Tailwind CSS 3 |
| Forms | react-hook-form + zod |
| Data fetching | SWR (client), fetch (server) |
| i18n | next-intl (en, zh, zh-TW) |
| Theming | next-themes (class-based dark mode) |
| Testing | Vitest + Testing Library + vitest-axe + Playwright |
| Package manager | pnpm 10.11 |

## Project Structure

```
app/
  api/                  # API routes (habits, tasks, dashboard, profile, export)
  auth/                 # Auth pages (login, sign-up, forgot-password, etc.)
  dashboard/            # Dashboard + settings pages
  habits/               # Habits list, detail, create, edit pages
components/
  ui/                   # shadcn/ui primitives (do not edit directly)
  dashboard/            # Dashboard components
  habits/               # Habit components
  layouts/              # AppLayout (header, nav, switchers)
  settings/             # Settings components
lib/
  db/                   # Database classes (HabitsDB, HabitLogsDB, TasksDB, ProfilesDB)
  supabase/             # Supabase client creation (client.ts, server.ts, middleware.ts)
  hooks/                # Custom hooks (use-habits, use-dashboard, etc.)
  habits/               # Habit utilities (format, heatmap)
  validations/          # Zod schemas
  export/               # CSV export utilities
  utils.ts              # cn(), getLocalDateString(), hasEnvVars
  fetcher.ts            # SWR fetcher
  cache.ts              # TTLCache for stats
i18n/
  request.ts            # Locale detection (cookie → Accept-Language → default)
  messages/             # Translation files (en.json, zh.json, zh-TW.json)
tests/                  # Vitest tests (mirrors source structure)
e2e/                    # Playwright E2E tests
supabase/migrations/    # SQL migrations
scripts/                # Lighthouse auth, bundle analysis
.github/workflows/      # CI (lint+test), E2E, Lighthouse, DB migration
```

## Architecture Decisions

### Supabase Client Pattern

Three Supabase clients for different contexts:

- **Browser** (`lib/supabase/client.ts`): `createBrowserClient()` — used by SWR hooks
- **Server** (`lib/supabase/server.ts`): `createServerClient()` with `cookies()` — used in API routes
- **Middleware** (`lib/supabase/middleware.ts`): `createServerClient()` with `request.cookies` — session refresh + auth redirects

API routes instantiate DB classes with a server client:
```ts
const supabase = await createClient();  // server client
const habitsDB = new HabitsDB(supabase);
```

Do NOT use singleton DB instances in API routes. Always pass the server client.

### Timezone Handling

Dates are always **browser-local**, never UTC. Use `getLocalDateString()` from `lib/utils.ts`:

```ts
import { getLocalDateString } from "@/lib/utils";
const today = getLocalDateString(); // "2026-02-08" in user's timezone
```

Never use `new Date().toISOString().split("T")[0]` — this returns UTC and will be wrong for users west of Greenwich after midnight UTC.

APIs accept a `date` query parameter from the client. No server-side timezone storage.

### SWR Data Fetching

SWR keys include the local date so data refreshes at midnight:
```ts
const today = getLocalDateString();
useSWR(`/api/dashboard?date=${today}`, fetcher, {
  keepPreviousData: true, // prevents skeleton flash when date changes at midnight
});
```

Always use `keepPreviousData: true` when the SWR key contains a date.

### i18n

Locale detection: cookie `locale` → `Accept-Language` header → default `en`.

In client components:
```tsx
import { useTranslations } from "next-intl";
const t = useTranslations("habits");
return <span>{t("card.currentStreak")}</span>;
```

In server components:
```tsx
import { getTranslations } from "next-intl/server";
const t = await getTranslations("home");
```

When adding new user-facing strings, add translations to all three locale files.

### Middleware Auth Flow

`middleware.ts` → `updateSession()`:
1. Refreshes Supabase session cookies
2. Authenticated users on `/` → redirect to `/dashboard`
3. Unauthenticated users on protected routes → redirect to `/auth/login`
4. Skips if env vars not set

## Environment Variables

```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# E2E only (CI)
E2E_TEST_EMAIL=...
E2E_TEST_PASSWORD=...
```

## Testing

### Vitest (Unit + Integration)

- Config: `vitest.config.ts` — jsdom environment, globals enabled
- Setup: `tests/setup.ts` — polyfills (ResizeObserver, pointer capture), global Supabase mock
- Coverage threshold: 50% (lines, functions, branches, statements)
- shadcn/ui components (`components/ui/`) are excluded from coverage

**Known:** 2 pre-existing test failures in `habit-logs.test.ts` (times_per_week getDetailedHabitStats) — tracked in issue #98.

### Mocking Patterns

**Supabase (DB layer tests):** Use the global `mockSupabaseClient` from setup:
```ts
import { mockSupabaseClient } from "../../setup";
mockSupabaseClient.setMockResponse([mockData]);
```

**Supabase (API route tests):** Use `vi.hoisted` + mock DB classes:
```ts
const { mockGetUserHabits } = vi.hoisted(() => ({
  mockGetUserHabits: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  HabitsDB: class { getUserHabits = mockGetUserHabits; },
}));
```

**SWR:**
```ts
const mockSWR = vi.fn();
vi.mock("swr", () => ({ default: (...args: unknown[]) => mockSWR(...args) }));
```

**next-intl:**
```ts
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
```

For components that need real translations, wrap with `NextIntlClientProvider`:
```tsx
import { NextIntlClientProvider } from "next-intl";
render(
  <NextIntlClientProvider locale="en" messages={messages}>
    <Component />
  </NextIntlClientProvider>
);
```

**Accessibility:**
```ts
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
expect.extend(matchers);

const { container } = render(<Component />);
expect(await axe(container)).toHaveNoViolations();
```

### Playwright (E2E)

- Config: `playwright.config.ts`
- Projects: chromium, firefox, webkit, mobile-chrome, mobile-safari, tablet, mobile-small
- Auth helper: `e2e/helpers/auth.ts` (`login()`, `ensureAuthenticated()`)
- Global teardown: deletes test data (habits matching `E2E Test -` prefix)
- E2E tests prefix test data with `E2E Test -` for cleanup

## CI/CD Workflows

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yml` | push/PR to main | Lint + Vitest |
| `e2e.yml` | push/PR to main, weekly | Playwright (Chromium on PRs, full matrix on main) |
| `performance.yml` | PR to main | Bundle analysis + Lighthouse CI |
| `db-migrate.yml` | push to main | Supabase migrations |

E2E and performance workflows use a **two-job pattern**: `check-secrets` job validates required secrets exist, then the real job runs conditionally. This prevents confusing failures when secrets aren't configured.

## Coding Conventions

- **Files:** kebab-case (`habit-card.tsx`, `use-habits.ts`)
- **Components:** PascalCase (`HabitCard`, `AppLayout`)
- **DB classes:** PascalCase with DB suffix (`HabitsDB`, `TasksDB`)
- **Path alias:** `@/` maps to project root (`@/lib/utils`, `@/components/ui/button`)
- **Client components:** Marked with `"use client"` only when needed
- **Error handling in API routes:** `try/catch` → `console.error` → `NextResponse.json({ error }, { status })`
- **Validation:** Zod schemas at API boundaries (`lib/validations/`)
- **Categories:** `"health" | "wellness" | "learning" | "productivity" | "other"`
- **Frequency types:** `"daily" | "weekdays" | "weekly" | "times_per_week" | "custom"`
