# CLAUDE.md

## IMPORTANT Rules

- **Documentation lookup**: ALWAYS use the `context7-plugin:documentation-lookup` skill FIRST when looking up docs for any library/framework. Only fall back to WebSearch/WebFetch if the skill doesn't return sufficient results.
- **GitHub issues**: ALWAYS use the `/github-issues` skill for creating, updating, and managing GitHub issues. Do NOT use `gh` CLI directly for issue operations.

## Project Overview

**BetterR.Me** — habit tracking web app. Next.js 15.5 (App Router), Supabase, TypeScript (strict), three locales (en, zh, zh-TW), dark mode, tested with Vitest + Playwright.

## Quick Reference

```bash
pnpm dev              # Start dev server (Turbopack)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm test:run         # Vitest single run
pnpm test:coverage    # Vitest with v8 coverage
pnpm test:e2e:chromium  # Playwright (Chromium only — fastest)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15.5 (App Router) |
| Auth & DB | Supabase SSR (`@supabase/ssr`) |
| UI | shadcn/ui + Radix UI (unified `radix-ui` package) + Tailwind CSS 3 |
| Forms | react-hook-form + zod |
| Data fetching | SWR (client), fetch (server) |
| i18n | next-intl |
| Theming | next-themes (class-based dark mode) |
| Testing | Vitest + Testing Library + vitest-axe + Playwright |
| Package manager | pnpm 10.11 |

## Key Architecture

### Supabase Client Pattern

Three clients: **Browser** (`lib/supabase/client.ts`), **Server** (`lib/supabase/server.ts`), **Middleware** (`lib/supabase/middleware.ts`).

API routes must always instantiate DB classes with a fresh server client — no singletons:
```ts
const supabase = await createClient();
const habitsDB = new HabitsDB(supabase);
```

### Middleware Auth Flow

`middleware.ts` → `updateSession()`: refreshes session, redirects authenticated `/` → `/dashboard`, unauthenticated protected routes → `/auth/login`.

### Timezone Handling

Dates are always **browser-local**, never UTC. Use `getLocalDateString()` from `lib/utils.ts`. Never use `new Date().toISOString().split("T")[0]`. APIs accept a `date` query param from the client.

### SWR Data Fetching

SWR keys include the local date for midnight refresh. Always use `keepPreviousData: true` when the SWR key contains a date.

### i18n

- Client: `useTranslations()` / Server: `await getTranslations()`
- Locale detection: cookie `locale` → `Accept-Language` → default `en`
- When adding new strings, add translations to **all three** locale files

## Testing

- Config: `vitest.config.ts` (jsdom, globals). Setup: `tests/setup.ts` (polyfills, global Supabase mock)
- Coverage threshold: 50%. `components/ui/` excluded from coverage
- **Known:** 2 pre-existing failures in `habit-logs.test.ts` (`times_per_week getDetailedHabitStats`) — issue #98

### Mocking Patterns

**Supabase (DB layer):** `mockSupabaseClient.setMockResponse([mockData])` from `tests/setup.ts`

**Supabase (API routes):** `vi.hoisted` + mock DB classes:
```ts
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }));
vi.mock("@/lib/db", () => ({ HabitsDB: class { getUserHabits = mockFn; } }));
```

**SWR:** `vi.mock("swr", () => ({ default: (...args) => mockSWR(...args) }))`

**next-intl:** `vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }))` — or wrap with `NextIntlClientProvider` for real translations.

**Accessibility:** `expect(await axe(container)).toHaveNoViolations()`

### Playwright (E2E)

- Auth helper: `e2e/helpers/auth.ts` (`login()`, `ensureAuthenticated()`)
- E2E test data prefixed with `E2E Test -` for cleanup in global teardown

## Coding Conventions

- **Files:** kebab-case. **Components:** PascalCase. **DB classes:** PascalCase + `DB` suffix
- **Path alias:** `@/` maps to project root
- **Client components:** `"use client"` only when needed
- **API error handling:** `try/catch` → `console.error` → `NextResponse.json({ error }, { status })`
- **Validation:** Zod schemas at API boundaries (`lib/validations/`)
- **Categories:** `"health" | "wellness" | "learning" | "productivity" | "other"`
- **Frequency types:** `"daily" | "weekdays" | "weekly" | "times_per_week" | "custom"`
- **UI primitives:** Do not edit `components/ui/` directly (shadcn/ui managed)
