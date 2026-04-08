# CLAUDE.md

## IMPORTANT Rules

- **Git workflow**: ALWAYS create a feature branch and open a PR. NEVER push directly to main unless explicitly told to.
- **Testing**: ALWAYS add tests when creating a PR if possible. Especially when fixing a bug, add tests to prevent the bug from regressing.
- **Documentation lookup**: ALWAYS use the `context7-plugin:documentation-lookup` skill FIRST when looking up docs for any library/framework. Only fall back to WebSearch/WebFetch if the skill doesn't return sufficient results.
- **GitHub issues**: ALWAYS use the `/github-issues` skill for creating, updating, and managing GitHub issues. Do NOT use `gh` CLI directly for issue operations.

## Project Overview

**BetterR.Me** — personal productivity & finance web app. Next.js 16 (App Router), Supabase, TypeScript (strict), three locales (en, zh, zh-TW), dark mode, tested with Vitest + Playwright.

### App Domains

| Domain | Route | DB Classes |
|--------|-------|------------|
| Dashboard | `app/dashboard` | — |
| Admin | `app/dashboard/admin` | `ProfilesDB` (role-based access via `lib/auth/admin.ts`) |
| Habits | `app/habits` | `HabitsDB`, `HabitLogsDB`, `HabitMilestonesDB` |
| Tasks | `app/tasks` | `TasksDB`, `RecurringTasksDB` |
| Projects | `app/projects` | `ProjectsDB` |
| Journal | `app/journal` | `JournalEntriesDB`, `JournalEntryLinksDB` |
| Workouts | `app/workouts` | `WorkoutsDB`, `WorkoutExercisesDB`, `ExercisesDB`, `RoutinesDB` |
| Money | `app/money` | `TransactionsDB`, `BudgetsDB`, `RecurringBillsDB`, `SavingsGoalsDB`, `NetWorthSnapshotsDB`, `ManualAssetsDB`, `BankConnectionsDB`, `MerchantRulesDB`, `TransactionSplitsDB`, `AccountsMoneyDB` |
| Calendar | `app/calendar` | `CalendarEventsDB`, `RemindersDB` |
| Chat | `app/chat` | `ConversationsDB`, `ChatMessagesDB` |
| Auth | `app/auth` | `ProfilesDB` |
| MCP | `app/mcp` | — |

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
| Framework | Next.js 16 (App Router) |
| Auth & DB | Supabase SSR (`@supabase/ssr`) |
| UI | shadcn/ui + Radix UI (unified `radix-ui` package) + Tailwind CSS 3 |
| Forms | react-hook-form + zod |
| Data fetching | SWR (client), fetch (server) |
| AI/LLM | Vercel AI SDK (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`) via OpenAI-compatible proxy |
| i18n | next-intl |
| Theming | next-themes (class-based dark mode) |
| Logging | `lib/logger.ts` — Sentry-ready wrapper (`log.error`, `log.warn`, `log.info`) |
| Testing | Vitest + Testing Library + vitest-axe + Playwright |
| Package manager | pnpm 10.11 |

## Key Architecture

### Supabase Client Pattern

Four clients: **Browser** (`lib/supabase/client.ts`), **Server** (`lib/supabase/server.ts`), **Proxy** (`lib/supabase/proxy.ts`), **Admin** (`lib/supabase/admin.ts` — service-role, bypasses RLS).

API routes must always instantiate DB classes with a fresh server client — no singletons:
```ts
const supabase = await createClient();
const habitsDB = new HabitsDB(supabase);
```

### Proxy Auth Flow

`proxy.ts` → `updateSession()`: refreshes session, redirects authenticated `/` → `/dashboard`, unauthenticated protected routes → `/auth/login`.

### AI Chat Architecture

- **LLM Proxy**: Self-hosted CLIProxyAPI gateway — infrastructure managed in [`xtan9/llm-gateway`](https://github.com/xtan9/llm-gateway) (Docker + CI/CD).
- **LLM Provider** (`lib/ai/provider.ts`): OpenAI-compatible client via `@ai-sdk/openai`, configured with `LLM_BASE_URL` (defaults to `https://llm.betterr.me/v1`).
- **Streaming endpoint** (`app/api/chat/route.ts`): Validates auth, converts `UIMessage[]` to model messages via `convertToModelMessages()`, streams via `streamText()`.
- **Client** (`components/chat/chat-content.tsx`): Uses `useChat()` hook with `TextStreamChatTransport`. Two decoupled state IDs:
  - `chatId` — drives `useChat` internal message buffer (only changes on explicit user actions)
  - `activeConversationId` — drives DB persistence and sidebar highlighting
- **Persistence**: User messages saved BEFORE LLM call, assistant messages saved AFTER stream completes. Title auto-generated after first exchange.
- **Conversation API**: `GET/POST /api/conversations`, `GET/POST /api/conversations/[id]/messages`, `POST /api/conversations/[id]/title`, `DELETE /api/conversations/[id]`.

### Admin & Roles

- **Role column** on `profiles` table: `"user"` (default) or `"admin"`
- **Auth helper** (`lib/auth/admin.ts`): `requireAdmin()` checks role before granting access
- **Admin dashboard** (`app/dashboard/admin`): Protected admin page, currently hosts exercise media sync

### Timezone Handling

Dates are always **browser-local**, never UTC. Use `getLocalDateString()` from `lib/utils.ts`. Never use `new Date().toISOString().split("T")[0]`. APIs accept a `date` query param from the client.

### SWR Data Fetching

SWR keys include the local date for midnight refresh. Always use `keepPreviousData: true` when the SWR key contains a date.

### i18n

- Client: `useTranslations()` / Server: `await getTranslations()`
- Locale detection: cookie `locale` → `Accept-Language` → default `en`
- When adding new strings, add translations to **all three** locale files

### Logging

Use `log` from `lib/logger.ts` instead of `console.error`/`console.warn`. Prefix messages with `[feature]` scope:
```ts
log.error("[chat] Failed to save message", err, { conversationId });
log.warn("POST /api/chat: invalid JSON body", { error: String(error) });
```

## Environment Variables (LLM)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_API_KEY` | Yes | — | API key for OpenAI-compatible proxy |
| `LLM_BASE_URL` | No | `https://llm.betterr.me/v1` | LLM proxy base URL |
| `LLM_MODEL` | No | `claude-haiku-4-5-20251001` | Default model for chat |
| `LLM_MAX_TOKENS` | No | `4096` | Max output tokens |

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
- **API error handling:** `try/catch` → `log.error("[scope] message", error)` → `NextResponse.json({ error }, { status })`
- **Validation:** Zod schemas at API boundaries (`lib/validations/`)
- **Categories:** User-defined via `categories` table (`category_id` UUID FK on tasks/habits/recurring_tasks). Seeded with 12 defaults on first API call.
- **Frequency types:** `"daily" | "weekdays" | "weekly" | "times_per_week" | "custom"`
- **UI primitives:** Do not edit `components/ui/` directly (shadcn/ui managed)
- **Unused vars:** ESLint enforces as error. Prefix with `_` to suppress (`_unused`).
