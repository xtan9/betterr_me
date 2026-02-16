# Phase 3: Code Quality - Research

**Researched:** 2026-02-16
**Domain:** Dead code removal, debug log cleanup, constructor hardening, error logging patterns
**Confidence:** HIGH

## Summary

Phase 3 is a cleanup/hardening phase with no new features. The codebase has six concrete issues to address: debug console.logs (theme-switcher + auth callback + codebase-wide), dead in-memory cache module, manual DOM class manipulation in theme-switcher, optional-argument DB constructors, and silent error swallowing in the dashboard's computeMissedDays catch block. Additionally, a thin logger wrapper module needs to be created to replace meaningful console.* calls with future-Sentry-ready logging.

Investigation reveals that the theme-switcher's manual DOM manipulation (lines 23-41) is redundant. The existing ThemeProvider configuration (`attribute="class"`, `enableSystem`, `defaultTheme="system"`, `darkMode: ["class"]` in Tailwind config, `suppressHydrationWarning` on `<html>`) is correct and complete. next-themes 0.4.6 handles class toggling on the `<html>` element natively via an injected blocking script. The manual useEffect that reads `document.documentElement.className` and adds/removes `dark`/`light` classes is fighting the library's own behavior and can be safely removed.

**Primary recommendation:** Execute as six discrete cleanup tasks: (1) create logger module, (2) remove cache module + all references, (3) fix theme-switcher, (4) harden DB constructors, (5) add `_warnings` to dashboard route, (6) codebase-wide console.log audit. Each task is self-contained and testable.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Theme switching fix:** Instant swap, no transition animation. Respect OS/system color scheme preference by default (three options: light/dark/system). If the DOM workaround exists due to a real next-themes bug, use the smallest possible workaround and document why. Current theme switching works fine visually -- this is a code quality cleanup, not a UX fix.
- **Error surfacing:** Establish a reusable `_warnings` pattern as a convention for any API route (not just dashboard). When computeMissedDays fails: show last known good / stale data if available, rather than omitting or showing zeros. Server-side logging: log error message plus relevant context (user ID, date range, habit IDs involved).
- **Debug log strategy:** Replace console.logs with proper logging where meaningful, delete pure debug noise. Sentry will be added later so keep logs that would be useful for error tracking. Create a thin logger wrapper module (log.error, log.warn, log.info) that wraps console methods now but can swap to Sentry later with one change. Scan all source files for stray console.logs, not just the two files in SC#1 -- clean up the entire codebase while we're at it.

### Claude's Discretion
- Logger wrapper API design (method signatures, context parameter shape)
- Whether user-facing warning indicators are needed (vs dev-only _warnings in API response)
- Logging approach choice (console methods vs lightweight library) -- leaning console methods with thin wrapper
- Which console.logs across the codebase are meaningful enough to keep as proper logs vs delete

### Deferred Ideas (OUT OF SCOPE)
- Sentry integration -- future phase/milestone
- Comprehensive observability/monitoring -- out of scope for cleanup
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-themes | 0.4.6 | Theme switching (class-based, system preference) | Already in use; handles class toggling natively |
| TypeScript | 5.x (strict) | Type safety for constructor enforcement | Already configured; `strict: true` in tsconfig |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.0.18 | Unit testing for all changed modules | Every task needs verification |
| @testing-library/react | 16.3.2 | Component testing for theme-switcher | Theme-switcher cleanup tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Thin console wrapper | pino / winston | Overkill for browser+serverless; user prefers thin wrapper for future Sentry swap |
| Manual `_warnings` type | zod union | Too much ceremony for a simple string array convention |

**Installation:**
No new packages needed. All work uses existing dependencies.

## Architecture Patterns

### Recommended Project Structure (new files only)
```
lib/
  logger.ts            # NEW: thin logger wrapper module
```

### Pattern 1: Logger Wrapper Module
**What:** A thin module exporting `log.error()`, `log.warn()`, `log.info()` that wraps `console.*` now but provides one-file swap to Sentry later.
**When to use:** All error/warning logging in API routes, DB classes, and components.
**Design recommendation:**

```typescript
// lib/logger.ts
type LogContext = Record<string, unknown>;

function formatMessage(message: string, context?: LogContext): string {
  if (!context) return message;
  return `${message} ${JSON.stringify(context)}`;
}

export const log = {
  /** Errors that need investigation. Will route to Sentry.captureException later. */
  error(message: string, error?: unknown, context?: LogContext): void {
    console.error(formatMessage(message, context), error ?? '');
  },

  /** Degraded behavior that still works. Will route to Sentry.captureMessage later. */
  warn(message: string, context?: LogContext): void {
    console.warn(formatMessage(message, context));
  },

  /** Informational (development only). Stripped or gated in production later. */
  info(message: string, context?: LogContext): void {
    console.info(formatMessage(message, context));
  },
} as const;
```

**Rationale:**
- The `error` signature takes `(message, error?, context?)` because Sentry's `captureException` wants the Error object separately from the message string. Keeping them as separate arguments now means the Sentry swap is literally changing 3 function bodies.
- The `context` parameter is `Record<string, unknown>` -- flat key-value pairs that become Sentry "extra" data. This covers the user decision's requirement for "user ID, date range, habit IDs involved."
- No log levels, no transports, no configuration -- just a facade over console methods. This is intentional; complexity belongs to Sentry, not to a wrapper.

### Pattern 2: `_warnings` Convention for API Routes
**What:** Any API route that degrades gracefully includes a `_warnings: string[]` array in its response when non-fatal errors occur. The underscore prefix signals "metadata, not domain data."
**When to use:** Any API catch block that falls back to degraded data instead of returning 500.

```typescript
// In any API route handler:
const warnings: string[] = [];

// ... when a non-fatal error occurs:
try {
  result = computeExpensiveThing();
} catch (err) {
  log.error('computeExpensiveThing failed', err, { userId: user.id, habitId: habit.id });
  warnings.push('Some data may be stale due to a computation error');
  result = fallbackValue;
}

// ... in the response:
return NextResponse.json({
  ...responseData,
  ...(warnings.length > 0 && { _warnings: warnings }),
});
```

**Rationale:**
- `_warnings` only appears when there are warnings -- no empty array noise in normal responses.
- String messages are human-readable; useful for dev tools / debugging.
- The underscore prefix convention is widely used (e.g., `_links` in HAL, `_meta` in pagination) to signal non-domain metadata.
- Recommendation: keep `_warnings` as dev-only (not shown to users). The planner can add UI indicators later if needed.

### Pattern 3: Required Constructor Parameters
**What:** Remove the optional `supabase?` parameter from DB class constructors; make the Supabase client required.
**When to use:** HabitLogsDB (the one specified in QUAL-05). But the same pattern applies to HabitsDB, TasksDB, ProfilesDB which all have the same issue.

```typescript
// BEFORE (unsafe -- silently creates browser client in server context):
constructor(supabase?: SupabaseClient) {
  this.supabase = supabase || createClient(); // imports from client.ts!
}

// AFTER (compile-time safety):
constructor(private supabase: SupabaseClient) {}
```

**Scope note:** QUAL-05 specifically names HabitLogsDB, but all four DB classes (HabitsDB, ProfilesDB, TasksDB, HabitLogsDB) have identical optional-parameter constructors. The client-side singleton exports (`export const habitsDB = new HabitsDB()`) depend on the optional parameter -- they will need the browser client passed explicitly. InsightsDB and HabitMilestonesDB already require the parameter.

### Anti-Patterns to Avoid
- **Partial migration:** Do not fix only HabitLogsDB constructor and leave HabitsDB/TasksDB/ProfilesDB with the same bug. The success criteria only checks HabitLogsDB, but the user decision says "constructor enforcement for DB classes" (plural). Fix all four.
- **Over-logging:** Do not convert every `console.error` to `log.error` with full context objects. API route boundary errors (the `catch (error)` at the route level) should use `log.error`. Component-level `console.error` in catch blocks can stay as-is since they run client-side where Sentry SDK would auto-capture.
- **Stripping HTTP cache headers from stats route:** When removing the in-memory `statsCache`, keep the `Cache-Control: private, max-age=300` HTTP headers. The HTTP cache is not the same as the in-memory cache -- it is handled by the browser and is still useful.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Theme class management on `<html>` | Manual DOM class add/remove | next-themes ThemeProvider (already configured) | next-themes injects a blocking script that applies the class before paint, handles system preference, persists to localStorage |
| In-memory server cache in serverless | TTLCache class (lib/cache.ts) | HTTP Cache-Control headers (already present) | In-memory cache is per-instance, useless in serverless (cold starts clear it); HTTP caching is what actually helps |
| Structured logging | Custom transport/rotation | Thin console wrapper + future Sentry | Console methods are the right primitive for Vercel serverless; Sentry adds structure later |

**Key insight:** The in-memory TTLCache provides nearly zero value in a serverless environment because each cold start creates a fresh instance. The HTTP `Cache-Control` headers that are already on the stats route are the real caching mechanism. Removing the TTLCache simplifies the code without degrading performance.

## Common Pitfalls

### Pitfall 1: Breaking Client-Side Singletons When Hardening Constructors
**What goes wrong:** Making the Supabase client required in DB constructors breaks the exported singletons like `export const habitsDB = new HabitsDB()` which are used client-side.
**Why it happens:** The current pattern uses `supabase || createClient()` to support both server (explicit client) and browser (implicit client) usage from the same class.
**How to avoid:** Update the singleton exports to explicitly pass the browser client: `export const habitsDB = new HabitsDB(createClient())`. This makes the dependency explicit without breaking anything.
**Warning signs:** TypeScript compilation errors in files that import `habitsDB`, `habitLogsDB`, `tasksDB`, `profilesDB`.

### Pitfall 2: Forgetting to Remove Cache Test File
**What goes wrong:** `tests/lib/cache.test.ts` still exists after removing `lib/cache.ts`, causing import errors in the test suite.
**Why it happens:** Focus on production code; test files forgotten.
**How to avoid:** Explicitly delete `tests/lib/cache.test.ts` and all test files that import from `@/lib/cache` (there are 4 test files with cache imports that need updating).
**Warning signs:** `vitest run` fails with "Cannot find module '@/lib/cache'".

### Pitfall 3: Removing Cache Without Updating All Consumers
**What goes wrong:** Removing `lib/cache.ts` breaks 4 route files and 4 test files that import from it.
**Why it happens:** Incomplete grep for cache references.
**How to avoid:** Full list of files importing `@/lib/cache`:
- **Production:** `app/api/habits/[id]/stats/route.ts`, `app/api/habits/[id]/route.ts`, `app/api/habits/[id]/toggle/route.ts`, `app/api/profile/preferences/route.ts`
- **Tests:** `tests/lib/cache.test.ts`, `tests/app/api/habits/[id]/stats/route.test.ts`, `tests/app/api/habits/[id]/toggle/route.test.ts`, `tests/app/api/habits/[id]/route.test.ts`, `tests/app/api/profile/preferences/route.test.ts`
**Warning signs:** Build failures, import resolution errors.

### Pitfall 4: Theme-Switcher Test Assertions on DOM Classes
**What goes wrong:** Existing tests assert that the theme-switcher manually adds `dark`/`light` classes to `document.documentElement`. After removing the manual DOM manipulation, these assertions fail.
**Why it happens:** Tests were written to validate the workaround behavior.
**How to avoid:** Update tests to verify that `setTheme()` is called correctly (behavior), not that DOM classes are manually manipulated (implementation detail). The two tests affected are "adds dark class to document when resolved theme is dark" and "adds light class to document when resolved theme is light" (lines 148-169 in the test file).
**Warning signs:** 2 test failures in `theme-switcher.test.tsx`.

### Pitfall 5: computeMissedDays Error Fallback Showing Zeros
**What goes wrong:** The user decision says "show last known good / stale data if available" but the current catch block returns `{ missed_scheduled_days: 0, previous_streak: 0 }` -- which IS zeros.
**Why it happens:** There is no cached/previous value available in the current catch block context.
**How to avoid:** Since there is no prior cached computation available at this point in the code flow, the practical fallback is: (1) keep the zeros as the mathematical identity (no missed days is safer than fake data), (2) add `_warnings` to indicate degraded data, (3) log with full context. The "stale data" aspect would only become meaningful once Sentry/caching is in place. Document this limitation clearly.
**Warning signs:** User expects to see previous data but there is no mechanism to store/retrieve it yet.

### Pitfall 6: auth/callback Already Cleaned Up
**What goes wrong:** Attempting to remove `console.log('callback')` from `app/auth/callback/route.ts` but it no longer exists.
**Why it happens:** The debug log was already removed in a prior change. The current file has no console.log statements.
**How to avoid:** Verify before modifying. The success criterion "No console.log statements exist in auth/callback/route.ts" is already satisfied. The task should verify this rather than attempt a removal.
**Warning signs:** Looking for code that is not there.

## Code Examples

### Theme Switcher After Cleanup
```typescript
// Source: Verified against next-themes 0.4.6 documentation + current codebase
"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const ThemeSwitcher = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  // useEffect only runs on the client, so now we can safely show the UI
  useEffect(() => { setMounted(true); }, []);

  // No manual DOM class manipulation needed:
  // next-themes ThemeProvider with attribute="class" handles
  // adding/removing the dark class on <html> via an injected blocking script.

  if (!mounted) return null;

  const ICON_SIZE = 16;

  return (
    <DropdownMenu>
      {/* ... same JSX as before, no changes needed ... */}
    </DropdownMenu>
  );
};

export { ThemeSwitcher };
```

### Add `disableTransitionOnChange` to ThemeProvider
```typescript
// Source: next-themes documentation
// app/layout.tsx - add disableTransitionOnChange for instant theme swap
<ThemeProvider
  attribute="class"
  defaultTheme="system"
  enableSystem
  storageKey="betterr-theme"
  disableTransitionOnChange  // ADD: ensures instant swap, no CSS transition flash
>
```

### Dashboard Route with `_warnings`
```typescript
// Source: Current dashboard route + user requirements
const warnings: string[] = [];

const enrichedHabits = habitsWithStatus.map(habit => {
  try {
    const completedDates = logsByHabit.get(habit.id) || new Set<string>();
    const { missed_scheduled_days, previous_streak } = computeMissedDays(
      habit.frequency, completedDates, date, habit.created_at, thirtyDaysAgoStr,
    );
    return { ...habit, missed_scheduled_days, previous_streak };
  } catch (err) {
    log.error('computeMissedDays failed', err, {
      userId: user.id,
      habitId: habit.id,
      date,
      dateRange: `${thirtyDaysAgoStr} to ${date}`,
    });
    warnings.push(`Absence data unavailable for habit ${habit.id}`);
    return { ...habit, missed_scheduled_days: 0, previous_streak: 0 };
  }
});

// In the response:
const dashboardData: DashboardData = {
  habits: enrichedHabits,
  // ... other fields ...
  ...(warnings.length > 0 && { _warnings: warnings }),
};
```

### DB Constructor Hardening
```typescript
// Source: Current codebase pattern (HabitMilestonesDB and InsightsDB already do this)
export class HabitLogsDB {
  private habitsDB: HabitsDB;

  constructor(private supabase: SupabaseClient) {
    this.habitsDB = new HabitsDB(supabase);
  }
  // ...
}

// Update singleton export:
import { createClient } from '@/lib/supabase/client';
export const habitLogsDB = new HabitLogsDB(createClient());
```

### Stats Route After Cache Removal
```typescript
// Source: Current stats route - remove server-side cache, keep HTTP cache headers
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HabitsDB, HabitLogsDB, ProfilesDB } from '@/lib/db';
// REMOVED: import { statsCache, getStatsCacheKey } from '@/lib/cache';

const CACHE_MAX_AGE = 300; // Keep HTTP cache

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // ... auth check ...

  const habit = await habitsDB.getHabit(habitId, user.id);
  if (!habit) {
    return NextResponse.json({ error: 'Habit not found' }, { status: 404 });
  }

  // REMOVED: server-side cache check
  // KEPT: compute stats fresh each time (HTTP cache handles repeat requests)

  const profile = await profilesDB.getProfile(user.id);
  const weekStartDay = profile?.preferences?.week_start_day ?? 0;
  const detailedStats = await habitLogsDB.getDetailedHabitStats(/*...*/);

  return NextResponse.json(responseData, {
    headers: {
      'Cache-Control': `private, max-age=${CACHE_MAX_AGE}`, // KEEP
      // REMOVED: X-Cache header (no longer meaningful without server cache)
    },
  });
}
```

## Codebase Console.log Audit

Full inventory of console.* calls in source files (excluding `e2e/`, `scripts/`, `tests/`, `node_modules/`):

### Pure Debug Noise (DELETE)
| File | Line(s) | Statement |
|------|---------|-----------|
| `components/theme-switcher.tsx` | 39-41 | `console.log("Theme:", theme)` etc. |

### Already Clean
| File | Notes |
|------|-------|
| `app/auth/callback/route.ts` | No console.log present (already removed) |

### Meaningful Error Logging (CONVERT to `log.error`)
| File | Line | Current | Assessment |
|------|------|---------|------------|
| `app/api/dashboard/route.ts` | 74 | `console.error('Failed to fetch habit logs...')` | Keep as `log.error` with context |
| `app/api/dashboard/route.ts` | 79 | `console.error('Failed to fetch milestones...')` | Keep as `log.error` with context |
| `app/api/dashboard/route.ts` | 108 | `console.error('computeMissedDays failed...')` | Keep as `log.error` with full context (QUAL-06) |
| `app/api/dashboard/route.ts` | 138 | `console.error('GET /api/dashboard error:')` | Keep as `log.error` |
| `app/api/habits/route.ts` | 63, 114 | Route-level error catches | Keep as `log.error` |
| `app/api/habits/[id]/route.ts` | 37, 105, 154 | Route-level error catches | Keep as `log.error` |
| `app/api/habits/[id]/stats/route.ts` | 88 | Route-level error catch | Keep as `log.error` |
| `app/api/habits/[id]/toggle/route.ts` | 60, 71 | Milestone + route errors | Keep as `log.error` |
| `app/api/habits/[id]/logs/route.ts` | 76 | Route-level error catch | Keep as `log.error` |
| `app/api/tasks/route.ts` | 81, 129 | Route-level error catches | Keep as `log.error` |
| `app/api/tasks/[id]/route.ts` | 36, 110, 147 | Route-level error catches | Keep as `log.error` |
| `app/api/tasks/[id]/toggle/route.ts` | 28 | Route-level error catch | Keep as `log.error` |
| `app/api/insights/weekly/route.ts` | 14, 41 | Auth error + route error | Keep as `log.error` |
| `app/api/export/route.ts` | 179 | Route-level error catch | Keep as `log.error` |
| `app/api/profile/route.ts` | 32, 80 | Route-level error catches | Keep as `log.error` |
| `app/api/profile/preferences/route.ts` | 40 | Route-level error catch | Keep as `log.error` |

### Meaningful Warning Logging (CONVERT to `log.warn`)
| File | Line | Current | Assessment |
|------|------|---------|------------|
| `lib/validations/api.ts` | 31 | `console.warn("Validation failed:", ...)` | Keep as `log.warn` -- useful for monitoring bad input patterns |
| `lib/auth/redirect.ts` | 49 | `console.warn("Blocked redirect to disallowed path:", ...)` | Keep as `log.warn` -- security-relevant |

### Client-Side Component Errors (LEAVE AS console.error)
| File | Lines | Assessment |
|------|-------|------------|
| `components/settings/profile-form.tsx` | 111 | Client-side; Sentry browser SDK will auto-capture |
| `components/settings/settings-content.tsx` | 70 | Client-side |
| `components/settings/data-export.tsx` | 100 | Client-side |
| `components/habits/create-habit-content.tsx` | 38 | Client-side |
| `components/habits/habit-row.tsx` | 27 | Client-side |
| `components/habits/habit-detail-content.tsx` | 161, 181, 197, 213 | Client-side |
| `components/habits/habits-page-content.tsx` | 48 | Client-side |
| `components/habits/edit-habit-content.tsx` | 88 | Client-side |
| `components/tasks/edit-task-content.tsx` | 92 | Client-side |
| `components/tasks/tasks-page-content.tsx` | 39 | Client-side |
| `components/tasks/create-task-content.tsx` | 45 | Client-side |
| `components/dashboard/absence-card.tsx` | 64 | Client-side |
| `components/dashboard/dashboard-content.tsx` | 103, 118 | Client-side |
| `components/dashboard/tasks-today.tsx` | 92, 207 | Client-side |
| `app/dashboard/page.tsx` | 38 | Client-side (RSC but catches client-side error) |

### E2E/Scripts (OUT OF SCOPE)
- `e2e/global-setup.ts`, `e2e/global-teardown.ts` -- test infrastructure, leave as-is
- `scripts/analyze-bundle.ts` -- CLI tool, leave as-is

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual DOM class toggle for themes | ThemeProvider `attribute="class"` with injected script | next-themes 0.2+ (2022) | Eliminates FOUC and manual DOM manipulation |
| In-memory TTL cache in serverless | HTTP Cache-Control headers / edge caching | Standard practice | In-memory cache useless across cold starts |
| Optional DB constructor params | Required constructor params (dependency injection) | General TypeScript best practice | Prevents silent wrong-client bugs |

**Deprecated/outdated:**
- **In-memory TTLCache in serverless:** Provides near-zero value since each cold start clears it. The HTTP `Cache-Control: private, max-age=300` headers already handle client-side repeat-request caching.
- **Manual DOM class manipulation in theme-switcher:** Was likely added during development/debugging when theme switching appeared broken. With correct ThemeProvider config (which this project has), it is unnecessary and actually fights the library.

## Open Questions

1. **Should all four DB classes have constructors hardened, or only HabitLogsDB?**
   - What we know: QUAL-05 specifically names HabitLogsDB. But HabitsDB, TasksDB, and ProfilesDB have the identical unsafe pattern. InsightsDB and HabitMilestonesDB already require the client.
   - What's unclear: Whether the user wants minimal scope (just HabitLogsDB) or consistency (all four).
   - Recommendation: Fix all four for consistency. The user decision text says "constructor enforcement for DB classes" (plural). The extra work is trivial (same pattern applied 3 more times) and prevents the same class of bugs in the other DB classes. If the planner wants to be conservative, at minimum do HabitLogsDB (required by SC#4) and note the others as optional.

2. **What should `_warnings` look like in DashboardData type?**
   - What we know: User wants reusable convention, not a one-off.
   - What's unclear: Should `_warnings` be part of DashboardData interface or added via a generic wrapper type?
   - Recommendation: Add an optional `_warnings?: string[]` to DashboardData for now. If the pattern spreads to other routes, extract a generic `type WithWarnings<T> = T & { _warnings?: string[] }` helper type later.

3. **Client-side console.error calls: convert to logger or leave?**
   - What we know: User says "scan all source files" but also "Sentry will be added later."
   - What's unclear: Whether client-side components should use the logger wrapper.
   - Recommendation: Leave client-side `console.error` calls as-is. The Sentry browser SDK auto-captures console.error. The logger wrapper is primarily for server-side API routes where Sentry needs explicit `captureException` calls. Converting client-side code adds churn with no benefit.

## Cache Removal Impact Analysis

Files that import from `@/lib/cache` and what changes each needs:

### Production Files
| File | Imports | Required Changes |
|------|---------|-----------------|
| `app/api/habits/[id]/stats/route.ts` | `statsCache`, `getStatsCacheKey` | Remove import, remove server-side cache check/set, remove `X-Cache` header, keep `Cache-Control` header |
| `app/api/habits/[id]/route.ts` | `invalidateStatsCache` | Remove import, remove 3x `invalidateStatsCache()` calls in PATCH and DELETE handlers |
| `app/api/habits/[id]/toggle/route.ts` | `invalidateStatsCache` | Remove import, remove `invalidateStatsCache()` call after toggle |
| `app/api/profile/preferences/route.ts` | `invalidateUserStatsCache` | Remove import, remove `invalidateUserStatsCache()` call when week_start_day changes |

### Test Files
| File | Imports | Required Changes |
|------|---------|-----------------|
| `tests/lib/cache.test.ts` | Full cache module | DELETE entire file |
| `tests/app/api/habits/[id]/stats/route.test.ts` | `statsCache` | Remove import, remove cache-related test setup (`statsCache.clear()`), update/remove cache HIT/MISS tests |
| `tests/app/api/habits/[id]/toggle/route.test.ts` | `statsCache`, `getStatsCacheKey` | Remove import, remove cache invalidation test, remove cache setup |
| `tests/app/api/habits/[id]/route.test.ts` | `statsCache`, `getStatsCacheKey` | Remove import, remove cache invalidation tests (3 tests), remove cache setup |
| `tests/app/api/profile/preferences/route.test.ts` | `statsCache`, `getStatsCacheKey` | Remove import, update/remove cache invalidation tests (2 tests) |

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** -- all files read directly from `/home/xingdi/code/betterr_me/`
- **next-themes 0.4.6** -- installed version verified via `node_modules/next-themes/package.json`
- **Tailwind config** -- `darkMode: ["class"]` confirmed in `tailwind.config.ts`
- **ThemeProvider config** -- `attribute="class"`, `enableSystem`, `defaultTheme="system"` confirmed in `app/layout.tsx`

### Secondary (MEDIUM confidence)
- [next-themes GitHub repository](https://github.com/pacocoursey/next-themes) -- `disableTransitionOnChange` prop documentation
- [shadcn/ui dark mode docs](https://ui.shadcn.com/docs/dark-mode/next) -- standard ThemeProvider configuration pattern
- [npm next-themes](https://www.npmjs.com/package/next-themes) -- attribute="class" auto-manages DOM class on html element

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all changes to existing code
- Architecture: HIGH -- patterns verified against current codebase + official docs
- Pitfalls: HIGH -- all pitfalls identified through direct codebase inspection of actual imports/exports/types
- Console.log audit: HIGH -- comprehensive grep of all source files, manually categorized

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- no fast-moving dependencies)
