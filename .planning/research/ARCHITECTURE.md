# Architecture Research: Codebase Hardening

**Domain:** Next.js App Router + Supabase habit tracking app (existing codebase)
**Researched:** 2026-02-15
**Confidence:** HIGH (based on direct codebase analysis + verified patterns)

## Current Architecture Overview

```
Client (Browser)
    |
    v
Middleware (proxy.ts) ---- Session refresh, auth redirects
    |
    v
App Router API Routes ---- Manual auth + manual validation per route
    |
    v
DB Classes (lib/db/) ---- HabitsDB, TasksDB, HabitLogsDB, ProfilesDB, etc.
    |                      Constructor: optional SupabaseClient, defaults to browser client
    v
Supabase Client ---- Browser (client.ts) or Server (server.ts)
    |
    v
Supabase (Postgres + Auth + RLS)
    |
    ^-- handle_new_user trigger (profile creation on signup)
```

### Component Responsibilities

| Component | Current Responsibility | Problem |
|-----------|----------------------|---------|
| `lib/supabase/client.ts` | Browser Supabase client | Fine as-is |
| `lib/supabase/server.ts` | Server Supabase client (cookie-based) | Fine as-is |
| `lib/supabase/proxy.ts` | Middleware session refresh + auth redirects | Fine as-is |
| `lib/db/*.ts` (6 classes) | Data access layer; each wraps Supabase queries | Optional client in constructor -- silent fallback to browser client on server |
| `lib/validations/*.ts` | Zod schemas for forms | Exist but are NOT used in API routes |
| `app/api/**` (12 route files) | Auth check + manual validation + DB calls + error handling | Massive duplication, no shared patterns |
| `lib/cache.ts` | In-memory TTL cache for stats | Unreliable on Vercel serverless (per-instance) |
| `lib/habits/absence.ts` | Pure function for missed-day computation | Silently caught in dashboard route |

## Critical Issues to Fix (Ordered by Dependency)

### Issue 1: DB Class Constructor -- Silent Browser Client Fallback

**What is broken:**

Every DB class (`HabitsDB`, `TasksDB`, `HabitLogsDB`, `ProfilesDB`) has this pattern:

```typescript
constructor(supabase?: SupabaseClient) {
  this.supabase = supabase || createClient(); // createClient() = BROWSER client
}
```

If an API route forgets to pass the server client, the class silently falls back to the browser client. On the server, `createBrowserClient()` from `@supabase/ssr` does NOT have access to the user's cookies, so auth context is lost. Queries will either fail silently (return empty due to RLS) or throw opaque errors.

Additionally, each DB file exports a singleton at module scope:
```typescript
export const habitsDB = new HabitsDB(); // Browser client, always
```

These singletons are correct for client-side use only, but their existence alongside the optional constructor creates confusion about when to use which.

**Two inconsistent patterns across DB classes:**

| Class | Constructor | Exported Singleton | Notes |
|-------|------------|-------------------|-------|
| `HabitsDB` | `supabase?: SupabaseClient` | `habitsDB` | Falls back to browser |
| `TasksDB` | `supabase?: SupabaseClient` | `tasksDB` | Falls back to browser |
| `HabitLogsDB` | `supabase?: SupabaseClient` | `habitLogsDB` | Falls back to browser; also instantiates internal `HabitsDB` |
| `ProfilesDB` | `supabase?: SupabaseClient` | `profilesDB` | Falls back to browser |
| `InsightsDB` | `supabase: SupabaseClient` (required!) | None | Correct pattern |
| `HabitMilestonesDB` | `supabase: SupabaseClient` (required!) | None | Correct pattern |

**Fix:** Make `supabase` parameter **required** in all DB class constructors. Remove browser-fallback. Keep client-side singletons but construct them explicitly. This is what `InsightsDB` and `HabitMilestonesDB` already do correctly.

**Recommended pattern:**
```typescript
export class HabitsDB {
  constructor(private supabase: SupabaseClient) {}
  // ...methods
}

// Client-side singleton (explicit, documented)
import { createClient } from '@/lib/supabase/client';
export const habitsDB = new HabitsDB(createClient());
```

**Data flow impact:** Every API route already passes the server client explicitly (`new HabitsDB(supabase)`). This change only breaks code that relies on the fallback, which is a bug you want to find at compile time, not runtime.

**Build order:** Fix FIRST. It is a foundational change that makes all DB usage explicit. Low risk because API routes already pass the client.

---

### Issue 2: Duplicated Auth + Validation Boilerplate in API Routes

**What is broken:**

Every API route repeats identical boilerplate:

```typescript
// This exact pattern appears in ALL 12 route files
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

Additionally, validation is done with hand-written imperative checks instead of using the Zod schemas that already exist in `lib/validations/`:

```typescript
// API route: manual validation (habits route.ts)
if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
  return NextResponse.json({ error: 'Name is required' }, { status: 400 });
}

// Existing but unused Zod schema (lib/validations/habit.ts)
export const habitFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  // ...full validation
});
```

The `isValidFrequency()` function is duplicated verbatim in both `app/api/habits/route.ts` and `app/api/habits/[id]/route.ts`.

**Fix:** Create a `withAuth()` wrapper function and use Zod schemas for API validation.

**Recommended `withAuth` pattern:**
```typescript
// lib/api/with-auth.ts
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';

interface AuthContext {
  user: User;
  supabase: SupabaseClient;
}

type AuthenticatedHandler = (
  request: NextRequest,
  context: AuthContext & { params?: Record<string, string> }
) => Promise<NextResponse>;

export function withAuth(handler: AuthenticatedHandler) {
  return async (request: NextRequest, routeContext?: { params: Promise<Record<string, string>> }) => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const params = routeContext?.params ? await routeContext.params : undefined;
      return await handler(request, { user, supabase, params });
    } catch (error) {
      console.error(`${request.method} ${request.nextUrl.pathname} error:`, error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
```

**Recommended Zod validation helper:**
```typescript
// lib/api/validate.ts
import { ZodSchema, ZodError } from 'zod';
import { NextResponse } from 'next/server';

export function parseBody<T>(schema: ZodSchema<T>, body: unknown):
  | { success: true; data: T }
  | { success: false; response: NextResponse } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      ),
    };
  }
  return { success: true, data: result.data };
}
```

**API route after refactor:**
```typescript
// app/api/habits/route.ts (after)
import { withAuth } from '@/lib/api/with-auth';
import { parseBody } from '@/lib/api/validate';
import { habitFormSchema } from '@/lib/validations/habit';

export const POST = withAuth(async (request, { user, supabase }) => {
  const body = await request.json();
  const parsed = parseBody(habitFormSchema, body);
  if (!parsed.success) return parsed.response;

  const habitsDB = new HabitsDB(supabase);
  const habit = await habitsDB.createHabit({
    user_id: user.id,
    ...parsed.data,
    status: 'active',
  });
  return NextResponse.json({ habit }, { status: 201 });
});
```

**Data flow impact:** No change to data flow. Request lifecycle stays the same. Error responses become more consistent (structured JSON with `details` field for validation errors).

**Build order:** Fix SECOND, after DB constructors. Depends on Issue 1 (DB classes with required client) to be clean. Can also create the Zod validation schemas for routes that don't have them yet (e.g., profile preferences PATCH has no schema).

---

### Issue 3: In-Memory Cache Unreliable on Vercel Serverless

**What is broken:**

`lib/cache.ts` implements a `TTLCache` using an in-memory `Map`. On Vercel serverless:
- Each cold start gets an empty cache
- Concurrent requests may hit different Lambda instances (no shared memory)
- The cache has a 1000-entry max size but no per-user isolation

The cache is currently used only for habit stats (`/api/habits/[id]/stats`). The comment in the code acknowledges this limitation:

```typescript
// Note: This cache is per-instance and will be cleared on server restart.
// For serverless environments, each cold start will have an empty cache.
// This is acceptable for short-lived caches as a performance optimization.
```

**Assessment:** The current approach is actually reasonable for this use case. Stats are expensive to compute (multiple Supabase queries) but not critical to be perfectly fresh. A hit rate of even 20-30% on warm instances is beneficial. The cache is correctly invalidated on writes (toggle, update, delete).

**Fix (minimal -- keep current approach, document and harden):**
1. Add `Cache-Control: private, max-age=300, stale-while-revalidate=60` headers to stats responses (already partially done with `max-age=300`)
2. Add `stale-while-revalidate` to allow CDN-level caching on Vercel
3. Do NOT migrate to Redis/external cache -- overkill for this app's scale

**Fix (if cache becomes unreliable at scale):**
- Use Vercel's Data Cache via `fetch()` with `next.revalidate` option
- Or use `unstable_cache` (now `"use cache"` in Next.js 15+) for server-side caching

**Data flow impact:** None for minimal fix. HTTP headers add CDN-layer caching.

**Build order:** Fix THIRD. Low priority since the current implementation is adequate. Can be done independently.

---

### Issue 4: Silent Error Swallowing in Dashboard

**What is broken:**

The dashboard route has two layers of silent error handling:

1. **Supplementary queries swallow errors silently:**
```typescript
habitLogsDB.getAllUserLogs(...).catch((err) => {
  console.error('Failed to fetch habit logs for absence:', err);
  return [] as Pick<HabitLog, 'habit_id' | 'logged_date' | 'completed'>[];
}),
```

2. **Per-habit computeMissedDays failures are silently caught:**
```typescript
try {
  const { missed_scheduled_periods, previous_streak } = computeMissedDays(...);
  return { ...habit, missed_scheduled_periods, previous_streak };
} catch (err) {
  console.error('computeMissedDays failed for habit', habit.id, err);
  return { ...habit, missed_scheduled_periods: 0, previous_streak: 0 };
}
```

**Assessment:** This is actually a deliberate and defensible pattern. The dashboard route separates "core queries" (habits, tasks -- which WILL throw on failure) from "supplementary queries" (logs for absence, milestones -- which degrade gracefully). The user sees their dashboard with slightly less enrichment rather than a 500 error.

**Improvement:** Surface degradation to the client so the UI can show a subtle indicator.

**Recommended pattern:**
```typescript
// Add a warnings array to the response
const warnings: string[] = [];

const [allLogs, milestonesToday] = await Promise.all([
  habitLogsDB.getAllUserLogs(...).catch((err) => {
    console.error('Failed to fetch habit logs for absence:', err);
    warnings.push('absence_data_unavailable');
    return [];
  }),
  // ...
]);

// In response:
return NextResponse.json({
  ...dashboardData,
  ...(warnings.length > 0 && { _warnings: warnings }),
});
```

**Data flow impact:** Adds optional `_warnings` field to dashboard response. Client can show a degraded-data indicator.

**Build order:** Fix FOURTH. Low risk. Independent of other changes.

---

### Issue 5: Profile Creation Trigger Fallback

**What is broken:**

The `handle_new_user` trigger (PostgreSQL) auto-creates profiles on signup. But the habits POST route has an application-level fallback:

```typescript
// In POST /api/habits
const { data: profile } = await supabase
  .from('profiles')
  .select('id')
  .eq('id', user.id)
  .single();

if (!profile) {
  // Auto-create profile if missing (trigger may have failed during signup)
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email: user.email!,
      // ...
    });
}
```

This is a known Supabase pattern -- triggers can fail due to permission issues, race conditions, or configuration drift. The fallback is correct but is only in the habits POST route. Other routes that need a profile (e.g., preferences update) will fail with a confusing "Profile not found" error.

**Fix:** Centralize the "ensure profile exists" logic.

**Recommended pattern:**
```typescript
// lib/db/profiles.ts -- add method
async ensureProfile(user: User): Promise<Profile> {
  const existing = await this.getProfile(user.id);
  if (existing) return existing;

  // Profile missing -- trigger may have failed
  const { data, error } = await this.supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email!,
      full_name: user.user_metadata?.full_name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
    }, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

Use `upsert` with `onConflict: 'id'` to handle race conditions (two requests hitting simultaneously).

**Data flow impact:** Profile creation moves from scattered API route logic to a centralized DB method. Called in `withAuth` or in specific routes that need a profile.

**Build order:** Fix with Issue 2 (withAuth wrapper). The `ensureProfile` method can be called inside `withAuth` for write operations, or in specific routes.

---

### Issue 6: Validation Schema Gaps

**What exists vs. what is needed:**

| Schema | Exists | Used in API Route | Notes |
|--------|--------|-------------------|-------|
| `habitFormSchema` | Yes | No (manual validation) | Missing `status` field for updates |
| `taskFormSchema` | Yes | No (manual validation) | Missing `is_completed` for updates |
| `profileFormSchema` | Yes | No (manual validation) | Only for form, not API |
| Preferences schema | No | Manual per-field validation | Needs creation |
| Date format validation | No | Inline regex per route | `YYYY-MM-DD` validated 4 different ways |

**Fix:** Create API-specific schemas (extend form schemas where appropriate) and a shared date validator.

**Recommended schemas:**
```typescript
// lib/validations/shared.ts
export const dateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Invalid date format. Use YYYY-MM-DD'
);

// lib/validations/habit.ts (add API schemas)
export const createHabitSchema = habitFormSchema.extend({
  // API may receive additional fields
});

export const updateHabitSchema = habitFormSchema.partial().extend({
  status: z.enum(['active', 'paused', 'archived']).optional(),
});

// lib/validations/profile.ts (add preferences schema)
export const preferencesSchema = z.object({
  date_format: z.string().optional(),
  week_start_day: z.number().min(0).max(6).optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
}).refine(obj => Object.keys(obj).length > 0, {
  message: 'At least one preference must be provided',
});
```

**Data flow impact:** Validation moves from inline imperative checks to declarative schemas. Error response format becomes consistent across all routes.

**Build order:** Fix with Issue 2. Schemas must exist before `withAuth` + `parseBody` can use them.

---

## Recommended Fix Order (Dependency-Based)

```
Phase 1: Foundation
  Issue 1: DB constructor (required client)  <-- No dependencies
  Issue 6: Validation schemas                <-- No dependencies
  (These can be done in parallel)

Phase 2: API Layer
  Issue 2: withAuth wrapper + parseBody      <-- Depends on Phase 1
  Issue 5: ensureProfile centralization      <-- Part of Phase 2

Phase 3: Polish
  Issue 3: Cache headers improvement        <-- Independent
  Issue 4: Dashboard warnings                <-- Independent
  (These can be done in parallel)
```

## Architectural Patterns

### Pattern 1: Required Dependency Injection (DB Classes)

**What:** Constructor requires `SupabaseClient` parameter. No optional fallback.
**When to use:** Always for server-side DB access classes.
**Trade-offs:** Slightly more verbose instantiation, but prevents silent auth failures.

```typescript
// GOOD: Fails at compile time if client forgotten
export class HabitsDB {
  constructor(private supabase: SupabaseClient) {}
}

// BAD: Silently uses wrong client at runtime
export class HabitsDB {
  constructor(supabase?: SupabaseClient) {
    this.supabase = supabase || createClient(); // which createClient??
  }
}
```

### Pattern 2: Wrapper Function for Cross-Cutting Concerns

**What:** Higher-order function that wraps API route handlers with auth, error handling, and optionally validation.
**When to use:** Every API route handler.
**Trade-offs:** One extra level of nesting, but eliminates 8-12 lines of boilerplate per handler. Error format becomes consistent.

The Next.js App Router team explicitly recommends this pattern over trying to use middleware-style `NextResponse.next()` inside route handlers.

### Pattern 3: Graceful Degradation with Warnings

**What:** Non-critical queries use `.catch()` to return defaults, with failure info surfaced to the client.
**When to use:** Dashboard-style aggregation routes where partial data is better than a 500 error.
**Trade-offs:** Client must handle optional `_warnings` field. Adds complexity to response type. Worth it for user experience.

### Pattern 4: Defensive Profile Upsert

**What:** Use `upsert` with `onConflict` instead of check-then-insert for profile creation.
**When to use:** Any "ensure exists" pattern, especially with Supabase triggers that may fail.
**Trade-offs:** One extra DB round-trip vs. a race condition. Use upsert to handle both cases atomically.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Optional Dependencies with Silent Fallbacks

**What people do:** `constructor(dep?: Type) { this.dep = dep || defaultImpl(); }`
**Why it's wrong:** On the server, the default (browser client) has no auth context. Queries silently return empty results or throw RLS errors. Debugging is extremely difficult because the error appears to come from Supabase, not from the missing dependency injection.
**Do this instead:** Make the dependency required. Use explicit singletons for client-side usage.

### Anti-Pattern 2: Duplicating Validation Logic Across Routes

**What people do:** Copy-paste `isValidFrequency()` into every route file; write imperative checks instead of using schemas.
**Why it's wrong:** Validation rules drift. One route accepts a value another rejects. Updates must be applied in multiple places. No shared error format.
**Do this instead:** Define Zod schemas in `lib/validations/`. Use `safeParse()` in a shared helper. Return consistent error format.

### Anti-Pattern 3: In-Memory Cache as Source of Truth

**What people do:** Rely on in-memory cache for data that must be consistent.
**Why it's wrong:** On Vercel serverless, each Lambda instance has its own memory. Cache hits are probabilistic, not guaranteed. Different users may see different data depending on which instance serves their request.
**Do this instead:** Treat in-memory cache as a performance optimization only. Always have a fallback to the database. Use HTTP `Cache-Control` headers for client-side caching. The current codebase handles this correctly for stats.

### Anti-Pattern 4: String Matching for Error Types

**What people do:** `if (message.includes('not found'))` to detect error types.
**Why it's wrong:** Fragile -- depends on exact error message wording. Breaks if Supabase changes error messages. Can match unintended substrings.
**Do this instead:** Use error codes (`error.code === 'PGRST116'` for Supabase "not found") or throw typed errors with explicit codes (like `EDIT_WINDOW_EXCEEDED` which is already done well in the toggle route).

## Data Flow

### Current Request Flow (API Route)

```
Browser Request
    |
    v
Next.js Middleware (proxy.ts)
    |-- Refresh session cookies
    |-- Redirect unauthed users to /login
    |-- Redirect authed / to /dashboard
    v
API Route Handler
    |-- await createClient() (server)
    |-- await supabase.auth.getUser()  [REPEATED IN EVERY ROUTE]
    |-- if (!user) return 401           [REPEATED IN EVERY ROUTE]
    |-- Manual validation               [DIFFERENT IN EVERY ROUTE]
    |-- new XxxDB(supabase)
    |-- await db.someMethod()
    |-- return NextResponse.json()
    v
Supabase (RLS enforces user_id check at DB level)
```

### Proposed Request Flow (After Hardening)

```
Browser Request
    |
    v
Next.js Middleware (proxy.ts) -- unchanged
    |
    v
withAuth(handler)
    |-- await createClient()
    |-- await supabase.auth.getUser()
    |-- if (!user) return 401
    |-- Pass { user, supabase } to handler
    v
Handler Function
    |-- parseBody(schema, body)  -- Zod validation
    |-- if (!parsed.success) return 400 with details
    |-- new XxxDB(supabase)     -- required client, no fallback
    |-- await db.someMethod()
    |-- return NextResponse.json()
    v
Supabase (unchanged)
```

### State Management (Client-Side, Unchanged)

```
SWR Cache (keyed by date)
    |
    v
React Components <--> SWR hooks --> fetch('/api/...') --> API Routes
    |                                                        |
    |-- keepPreviousData: true                               |
    |-- mutate() on user action                              v
    v                                                   Supabase
UI renders optimistically, SWR revalidates
```

## Component Boundaries: What Changes, What Doesn't

| Component | Change? | Why |
|-----------|---------|-----|
| `lib/supabase/client.ts` | No | Correct as-is |
| `lib/supabase/server.ts` | No | Correct as-is |
| `lib/supabase/proxy.ts` | No | Correct as-is |
| `lib/db/*.ts` constructors | Yes | Make `supabase` required |
| `lib/db/*.ts` methods | No | Query logic is correct |
| `lib/db/*.ts` singletons | Yes | Make construction explicit |
| `lib/validations/*.ts` | Yes | Add API schemas, shared date validator |
| `app/api/**` route handlers | Yes | Wrap with `withAuth`, use `parseBody` |
| `lib/cache.ts` | Minor | Add `stale-while-revalidate` header |
| `lib/habits/absence.ts` | No | Pure function, correct |
| `app/api/dashboard/route.ts` | Minor | Add `_warnings` to response |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users (current) | Current architecture is fine. In-memory cache provides modest benefit. |
| 1k-10k users | Move stats cache to Vercel Data Cache or `"use cache"`. Consider connection pooling (Supavisor). |
| 10k+ users | Supabase connection pooler (transaction mode) becomes essential. Consider read replicas for stats queries. Dashboard endpoint may need pagination or lazy-loading of absence data. |

### Scaling Priorities

1. **First bottleneck:** Dashboard endpoint (5 parallel Supabase queries per request). Already optimized with `Promise.all` and bulk log fetch. Next step would be `"use cache"` for stats aggregation.
2. **Second bottleneck:** Stats endpoint (3 parallel count queries). Already has in-memory cache + HTTP cache headers. Next step would be background recomputation on toggle.

## Sources

- Direct codebase analysis (all files in `lib/db/`, `app/api/`, `lib/validations/`, `lib/cache.ts`)
- [Next.js: Building APIs with App Router](https://nextjs.org/blog/building-apis-with-nextjs) -- withAuth pattern recommendation (HIGH confidence)
- [Dub.co: Zod API Validation in Next.js](https://dub.co/blog/zod-api-validation) -- schema.parse pattern (HIGH confidence)
- [Vercel: Caching Serverless Function Responses](https://vercel.com/docs/functions/serverless-functions/edge-caching) -- stale-while-revalidate (HIGH confidence)
- [Supabase: Troubleshooting User Creation Errors](https://supabase.com/docs/guides/troubleshooting/dashboard-errors-when-managing-users-N1ls4A) -- trigger failure patterns (HIGH confidence)
- [GitHub Discussion: Vercel Serverless Cache Behavior](https://github.com/vercel/next.js/discussions/87842) -- in-memory cache limitations (MEDIUM confidence)
- [Supabase GitHub Discussion #6518](https://github.com/orgs/supabase/discussions/6518) -- handle_new_user trigger failures (HIGH confidence)

---
*Architecture research for: BetterR.Me codebase hardening*
*Researched: 2026-02-15*
