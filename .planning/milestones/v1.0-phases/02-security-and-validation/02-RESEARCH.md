# Phase 2: Security and Validation - Research

**Researched:** 2026-02-15
**Domain:** API input validation (Zod), profile auto-creation reliability, auth redirect hardening, habit count limits
**Confidence:** HIGH

## Summary

Phase 2 hardens 8 existing API write endpoints (4 POST, 4 PATCH) by replacing hand-rolled validation with Zod `.safeParse()`, fixing a dangerous `user.email!` non-null assertion in profile auto-creation, adding an auth redirect allowlist, and enforcing a 20-habit-per-user limit. The codebase already has well-structured Zod schemas in `lib/validations/` for habits, tasks, and profiles -- they are used for client-side react-hook-form validation but are NOT wired into any API route handler. Zero API routes currently call `safeParse`. This phase's primary work is mechanical: parse request bodies through existing schemas (with minor extensions for server-side concerns like `.partial()` and status fields), extract a shared `ensureProfile` helper, and add the habit count check.

The Supabase `handle_new_user()` trigger in the initial migration has two vulnerabilities: (1) it uses `NEW.email` directly, which is `NULL` for OAuth providers that don't return email, causing the insert to fail against the `NOT NULL` constraint on `profiles.email`; and (2) it has no exception handling, so a failure blocks signup entirely. The auth callback route (`app/auth/callback/route.ts`) has a basic relative-URL guard (`!next.startsWith('/')`) but no path allowlist, so any relative path (e.g., `/api/export?type=zip`) can be used as a redirect target. The confirm route (`app/auth/confirm/route.ts`) has NO redirect guard at all.

**Primary recommendation:** Wire existing Zod schemas into all 8 POST/PATCH handlers using a shared `validateRequestBody` helper, extract `ensureProfile` into `lib/db/ensure-profile.ts`, add redirect allowlist to both callback and confirm routes, and add habit count check to POST /api/habits with a `getActiveHabitCount` method on HabitsDB.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Fallback route when redirect path is invalid: `/` (root) -- let proxy middleware handle routing
- Error message should include current count: "You have 20/20 habits. Remove one before adding another."
- Limit stored as a named constant (e.g., `MAX_HABITS = 20`) -- not hardcoded inline
- Only active (non-deleted) habits count toward the 20 limit

### Claude's Discretion
- Validation error response format and structure
- Whether to include submitted values in error responses
- Server-side logging of validation failures
- Shared validation helper vs inline safeParse pattern
- When ensureProfile is called (every write vs login/signup only)
- What to store when OAuth user has no email
- handle_new_user() trigger error handling approach
- User-visible indication of delayed profile creation
- Auth redirect allowlist strictness (exact paths vs pattern-based)
- Logging blocked redirect attempts
- Explicit external URL rejection vs relying on allowlist
- Whether frontend pre-checks habit limit

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | 3.25.46 | Schema validation at API boundaries | Already in codebase, used by react-hook-form; `.safeParse()` is the standard pattern for API validation |
| @supabase/ssr | (installed) | Server-side Supabase client | Already in codebase, used for auth and DB queries |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next (NextResponse) | 16.1.6 | HTTP response construction | All API routes |

No new dependencies required. All tools needed are already installed.

## Architecture Patterns

### Complete Inventory of POST/PATCH Routes

Every route that accepts a request body and needs Zod validation:

| Route | Method | Current Validation | Schema Exists? | Needs Work |
|-------|--------|-------------------|----------------|------------|
| `app/api/habits/route.ts` | POST | Hand-rolled `isValidFrequency()` + inline checks | Yes: `habitFormSchema` | Wire Zod, add habit count limit, add `ensureProfile` |
| `app/api/habits/[id]/route.ts` | PATCH | Hand-rolled `isValidFrequency()` + inline field-by-field | Yes: `habitFormSchema.partial()` | Wire Zod `.partial()`, remove duplicate `isValidFrequency` |
| `app/api/habits/[id]/toggle/route.ts` | POST | Inline date regex only | No (simple `{ date }` body) | Minimal -- date validation is sufficient |
| `app/api/tasks/route.ts` | POST | Inline type checks | Yes: `taskFormSchema` | Wire Zod |
| `app/api/tasks/[id]/route.ts` | PATCH | Inline field-by-field checks | Yes: `taskFormSchema.partial()` | Wire Zod `.partial()` |
| `app/api/tasks/[id]/toggle/route.ts` | POST | None needed (no body) | No | No change needed |
| `app/api/profile/route.ts` | PATCH | Inline field checks | Yes: `profileFormSchema` | Wire Zod `.partial()` |
| `app/api/profile/preferences/route.ts` | PATCH | Inline type/range checks | No (custom preferences shape) | Create `preferencesSchema`, wire Zod |

### Pattern 1: Shared Validation Helper

**What:** A single `validateRequestBody` function that all POST/PATCH routes call, eliminating boilerplate.
**When to use:** Every write route that accepts JSON body.
**Why (discretion recommendation):** A shared helper is strongly preferred over inline `safeParse` because: (a) it standardizes error response format, (b) reduces copy-paste in 8 routes, (c) centralizes logging decisions.

```typescript
// lib/validations/api.ts
import { z, ZodSchema } from 'zod';
import { NextResponse } from 'next/server';

interface ValidationSuccess<T> {
  success: true;
  data: T;
}

interface ValidationFailure {
  success: false;
  response: NextResponse;
}

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export function validateRequestBody<T>(
  body: unknown,
  schema: ZodSchema<T>
): ValidationResult<T> {
  const result = schema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors = result.error.flatten().fieldErrors;
  console.warn('Validation failed:', JSON.stringify(fieldErrors));

  return {
    success: false,
    response: NextResponse.json(
      { error: 'Validation failed', details: fieldErrors },
      { status: 400 }
    ),
  };
}
```

**Usage in a POST route:**
```typescript
const body = await request.json();
const validation = validateRequestBody(body, habitFormSchema);
if (!validation.success) return validation.response;
const { name, description, category, frequency } = validation.data;
```

### Pattern 2: Partial Schemas for PATCH Routes

**What:** Use Zod's `.partial()` to derive PATCH schemas from POST schemas.
**When to use:** Every PATCH route that does field-by-field updates.

```typescript
// lib/validations/habit.ts
export const habitFormSchema = z.object({ /* ... existing ... */ });
export const habitUpdateSchema = habitFormSchema
  .partial()
  .extend({
    status: z.enum(['active', 'paused', 'archived']).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
```

**Key insight:** The existing `habitFormSchema` requires `name` and `frequency` (via `.min(1)`), but PATCH only sends changed fields. `.partial()` makes all fields optional. We extend with `status` since it's a valid PATCH field but not part of the creation form.

### Pattern 3: ensureProfile Helper

**What:** Shared function that checks for profile existence and creates one if missing.
**When to use:** Routes that write user-scoped data (habits POST, tasks POST).

```typescript
// lib/db/ensure-profile.ts
import type { SupabaseClient, User } from '@supabase/supabase-js';

export async function ensureProfile(
  supabase: SupabaseClient,
  user: User
): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();

  if (profile) return;

  // OAuth users may not have an email -- use empty string as fallback
  const email = user.email ?? '';

  const { error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      email,
      full_name: user.user_metadata?.full_name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
    });

  if (error) {
    // Profile may have been created by another concurrent request (race condition)
    // or by the handle_new_user trigger -- check if it exists now
    if (error.code === '23505') return; // unique_violation = already exists
    throw new Error(`Profile creation failed: ${error.message}`);
  }
}
```

### Pattern 4: Auth Redirect Allowlist

**What:** Explicit list of valid redirect paths for auth callback and confirm routes.
**When to use:** Auth routes that accept a `next` parameter.

```typescript
// lib/auth/redirect.ts
const ALLOWED_REDIRECT_PATHS = [
  '/',
  '/dashboard',
  '/habits',
  '/tasks',
  '/dashboard/settings',
];

const ALLOWED_REDIRECT_PREFIXES = [
  '/habits/',
  '/tasks/',
];

export function getSafeRedirectPath(next: string | null): string {
  if (!next) return '/';

  // Must be a relative path (no protocol, no double slash)
  if (!next.startsWith('/') || next.startsWith('//')) return '/';

  // Strip query params and hash for matching
  const pathname = next.split('?')[0].split('#')[0];

  // Check exact matches
  if (ALLOWED_REDIRECT_PATHS.includes(pathname)) return next;

  // Check prefix matches (for /habits/[id], /tasks/[id])
  if (ALLOWED_REDIRECT_PREFIXES.some(prefix => pathname.startsWith(prefix))) return next;

  console.warn(`Blocked redirect to disallowed path: ${next}`);
  return '/';
}
```

### Pattern 5: Habit Count Limit

**What:** Check active habit count before allowing creation.
**When to use:** POST /api/habits only.

```typescript
// lib/constants.ts (or at top of habits route)
export const MAX_HABITS_PER_USER = 20;

// In HabitsDB class -- new method
async getActiveHabitCount(userId: string): Promise<number> {
  const { count, error } = await this.supabase
    .from('habits')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', ['active', 'paused']);

  if (error) throw error;
  return count ?? 0;
}

// In POST /api/habits handler
const activeCount = await habitsDB.getActiveHabitCount(user.id);
if (activeCount >= MAX_HABITS_PER_USER) {
  return NextResponse.json(
    { error: `You have ${activeCount}/${MAX_HABITS_PER_USER} habits. Remove one before adding another.` },
    { status: 400 }
  );
}
```

### Recommended Project Structure (changes only)

```
lib/
  validations/
    habit.ts          # Add habitUpdateSchema (partial)
    task.ts           # Add taskUpdateSchema (partial)
    profile.ts        # Add profileUpdateSchema (partial)
    preferences.ts    # NEW: preferencesSchema
    api.ts            # NEW: validateRequestBody helper
  db/
    ensure-profile.ts # NEW: ensureProfile helper
  auth/
    redirect.ts       # NEW: getSafeRedirectPath helper
  constants.ts        # NEW: MAX_HABITS_PER_USER
supabase/
  migrations/
    YYYYMMDD_fix_handle_new_user.sql  # Fix trigger
```

### Anti-Patterns to Avoid
- **Duplicating validation logic:** The current codebase has `isValidFrequency()` duplicated in both `app/api/habits/route.ts` AND `app/api/habits/[id]/route.ts`. Remove both once Zod is wired.
- **Using `.parse()` instead of `.safeParse()`:** `.parse()` throws on failure, requiring try/catch. `.safeParse()` returns a discriminated union -- cleaner for API error responses.
- **Including submitted values in error responses:** Never reflect user input back in validation errors -- it can enable XSS if error messages are rendered in HTML. Only return field names and error descriptions.
- **Blocking on validation helper creation:** The helper is a small utility -- don't over-architect it. Keep it as a plain function, not a class.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request body validation | Inline `typeof` checks, `isValidFrequency()` | Zod `.safeParse()` with existing schemas | Zod handles type coercion, nested objects, union discrimination, and produces structured errors |
| Partial update validation | Field-by-field `if (body.x !== undefined)` checks | Zod `.partial()` on base schema | `.partial()` makes all fields optional while keeping type validation on provided fields |
| Error message formatting | Manual string construction | Zod `.flatten().fieldErrors` | Structured `{ field: [messages] }` format, consistent across routes |
| Profile existence check | Copy-pasting profile check + insert in each route | `ensureProfile()` shared helper | Current code duplicates 15 lines of profile check logic; would need duplication in tasks POST too |
| Redirect path validation | Regex-based URL parsing | Simple allowlist of known paths | Regex URL parsing is error-prone; allowlist is simpler and more secure |

**Key insight:** The codebase ALREADY has Zod schemas that match the validation logic currently hand-rolled in routes. This phase is primarily about connecting existing infrastructure, not building new validation rules.

## Common Pitfalls

### Pitfall 1: Breaking Existing Tests
**What goes wrong:** Switching from hand-rolled validation to Zod changes the error response format (e.g., from `{ error: 'Name is required' }` to `{ error: 'Validation failed', details: { name: ['Required'] } }`). Existing tests assert specific error messages.
**Why it happens:** 16 existing test assertions check `response.status === 400` and some check exact error text.
**How to avoid:** Update tests alongside route changes. Tests in `tests/app/api/habits/route.test.ts` (19 tests), `tests/app/api/tasks/route.test.ts`, `tests/app/api/tasks/[id]/route.test.ts`, `tests/app/api/habits/[id]/route.test.ts`, `tests/app/api/profile/route.test.ts`, and `tests/app/api/profile/preferences/route.test.ts` all need review.
**Warning signs:** Tests that assert `data.error` containing specific strings like 'Name is required' or 'Invalid frequency'.

### Pitfall 2: PATCH Schema Not Allowing Status Changes
**What goes wrong:** Using `habitFormSchema.partial()` alone doesn't include `status` field, but PATCH /api/habits/[id] accepts status changes (active/paused/archived) including `paused_at` timestamp logic.
**Why it happens:** `habitFormSchema` is designed for the creation form which doesn't expose status changes. The PATCH route handles status separately with business logic (setting `paused_at`).
**How to avoid:** Create `habitUpdateSchema` that extends `.partial()` with status field. Keep the `paused_at` business logic AFTER validation, not in the schema.
**Warning signs:** Status change requests returning 400 validation errors.

### Pitfall 3: Profile Email NOT NULL Constraint
**What goes wrong:** The `profiles` table has `email TEXT UNIQUE NOT NULL`. If we change `ensureProfile` to use `user.email ?? ''`, two users without email would collide on the unique constraint (both empty string).
**Why it happens:** OAuth providers like GitHub may not return email. Apple Sign-In can hide email.
**How to avoid:** Use `user.email ?? user.id` (UUID as fallback) or `user.email ?? `no-email-${user.id}`` as the email value. This satisfies NOT NULL and avoids unique constraint violations.
**Warning signs:** `23505` unique violation errors during profile creation for multiple emailless users.

### Pitfall 4: Trigger Migration Requires Supabase Access
**What goes wrong:** Fixing `handle_new_user()` requires a SQL migration that runs against the production database. This can't be tested locally without a Supabase project.
**Why it happens:** Database triggers are managed via Supabase migrations.
**How to avoid:** Write the migration SQL file and test it locally with `supabase db reset` if local Supabase is available. If not, keep the migration simple and defensive.
**Warning signs:** Migration syntax errors that only surface during deployment.

### Pitfall 5: Auth Confirm Route Also Has No Redirect Guard
**What goes wrong:** `app/auth/confirm/route.ts` uses `redirect(next)` with the raw `next` parameter -- no allowlist check at all, not even the basic relative-URL guard that callback has.
**Why it happens:** It was likely overlooked when the callback route was hardened.
**How to avoid:** Apply the same `getSafeRedirectPath()` function to both callback and confirm routes.
**Warning signs:** Open redirect vulnerability on the confirm endpoint.

### Pitfall 6: Race Condition in ensureProfile
**What goes wrong:** Two concurrent requests for the same user both see "no profile" and both try to insert, causing a unique constraint violation.
**Why it happens:** The check-then-insert pattern is not atomic.
**How to avoid:** Use `ON CONFLICT (id) DO NOTHING` in the insert, or catch the `23505` unique violation error and treat it as success.
**Warning signs:** Intermittent 500 errors during first-time user setup.

### Pitfall 7: Habit Count Race Condition
**What goes wrong:** Two concurrent POST /api/habits requests both see count=19, both proceed to create, resulting in 21 habits.
**Why it happens:** Count check and insert are not in a transaction.
**How to avoid:** Acceptable for this use case -- the race window is tiny and the limit is a UX guard, not a security boundary. The 20-habit limit is a soft limit. If perfectionism is needed, use a Postgres function with `SELECT FOR UPDATE`.
**Warning signs:** Users very rarely exceeding 20 habits by 1.

## Code Examples

### Example 1: Habit POST Route (After Refactoring)

```typescript
// app/api/habits/route.ts - POST handler
import { habitFormSchema } from '@/lib/validations/habit';
import { validateRequestBody } from '@/lib/validations/api';
import { ensureProfile } from '@/lib/db/ensure-profile';
import { MAX_HABITS_PER_USER } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, habitFormSchema);
    if (!validation.success) return validation.response;

    await ensureProfile(supabase, user);

    const habitsDB = new HabitsDB(supabase);
    const activeCount = await habitsDB.getActiveHabitCount(user.id);
    if (activeCount >= MAX_HABITS_PER_USER) {
      return NextResponse.json(
        { error: `You have ${activeCount}/${MAX_HABITS_PER_USER} habits. Remove one before adding another.` },
        { status: 400 }
      );
    }

    const habit = await habitsDB.createHabit({
      user_id: user.id,
      name: validation.data.name.trim(),
      description: validation.data.description?.trim() || null,
      category: validation.data.category || null,
      frequency: validation.data.frequency,
      status: 'active',
    });

    return NextResponse.json({ habit }, { status: 201 });
  } catch (error) {
    console.error('POST /api/habits error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create habit';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

### Example 2: Habit PATCH Route (Partial Validation)

```typescript
// lib/validations/habit.ts - Extended for PATCH
export const habitUpdateSchema = habitFormSchema
  .partial()
  .extend({
    status: z.enum(['active', 'paused', 'archived']).optional(),
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type HabitUpdateValues = z.infer<typeof habitUpdateSchema>;
```

### Example 3: Handle New User Trigger Fix

```sql
-- supabase/migrations/YYYYMMDD_fix_handle_new_user.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, 'no-email-' || NEW.id::text),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but do not block signup
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Example 4: Preferences Schema (New)

```typescript
// lib/validations/preferences.ts
import { z } from 'zod';

export const preferencesSchema = z.object({
  date_format: z.string().optional(),
  week_start_day: z.number().int().min(0).max(6).optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'At least one preference must be provided',
});

export type PreferencesValues = z.infer<typeof preferencesSchema>;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zod `.parse()` in try/catch | Zod `.safeParse()` with discriminated union return | Zod v3+ (stable) | Cleaner error handling without exceptions |
| Manual field-by-field PATCH validation | Zod `.partial()` + `.refine()` | Zod v3+ (stable) | Single-line derivation of update schema from create schema |
| `error.flatten()` | `error.flatten().fieldErrors` | Zod v3+ (stable) | Returns `{ fieldErrors: Record<string, string[]> }` structure |

**Deprecated/outdated:**
- The `isValidFrequency()` function duplicated across two route files should be completely removed once Zod discriminated union validation replaces it.
- The `VALID_CATEGORIES` and `VALID_FREQUENCY_TYPES` constants in route files are redundant with the Zod schemas.

## Discretion Recommendations

Based on codebase patterns and security best practices, here are recommendations for areas marked as Claude's Discretion:

### Validation Error Format
**Recommendation:** Use structured field errors.
```json
{ "error": "Validation failed", "details": { "name": ["Required"], "frequency": ["Invalid discriminator value"] } }
```
**Rationale:** Matches react-hook-form's error structure, making it easy for frontend to map server errors to form fields in the future. Don't include submitted values (XSS risk).

### Validation Logging
**Recommendation:** `console.warn` for validation failures (not `console.error`).
**Rationale:** Validation failures are expected user behavior (typos, missing fields), not application errors. `warn` distinguishes from real errors in log monitoring.

### Shared Helper vs Inline
**Recommendation:** Shared `validateRequestBody` helper in `lib/validations/api.ts`.
**Rationale:** 8 routes need validation. A shared helper ensures consistent error format, reduces code by ~10 lines per route, and makes format changes a single-point edit.

### ensureProfile Placement
**Recommendation:** Call in POST /api/habits and POST /api/tasks only (routes that create user-scoped records with FK to profiles).
**Rationale:** PATCH routes can't succeed if the resource doesn't exist (which means the profile already exists since it was needed at creation). Profile and preferences routes already operate on existing profiles. Calling on every write is wasteful.

### OAuth Missing Email
**Recommendation:** Store `user.email ?? 'no-email-' + user.id` as fallback.
**Rationale:** Empty string `''` would violate the UNIQUE constraint for multiple emailless users. UUID suffix guarantees uniqueness. The `no-email-` prefix makes it obvious in the database that this is a placeholder.

### Trigger Error Handling
**Recommendation:** `EXCEPTION WHEN OTHERS THEN RAISE WARNING` -- log but don't block signup.
**Rationale:** A failed profile creation should never prevent a user from signing up. The `ensureProfile` helper provides a safety net for subsequent API calls.

### Auth Redirect Allowlist
**Recommendation:** Prefix-based matching with exact paths for known routes.
**Rationale:** Pattern-based (`/habits/[uuid]`) is fragile with regex. Prefix-based (`/habits/`) is simple and covers dynamic segments. Combine with exact paths for fixed routes (`/dashboard`, `/dashboard/settings`).

### Frontend Habit Limit Pre-check
**Recommendation:** Server-side only for this phase.
**Rationale:** The frontend already has habit count available via SWR. A frontend check could be added later as a UX enhancement, but the authoritative check must be server-side. Adding frontend logic is scope creep for a security hardening phase.

## Open Questions

1. **Task POST and ensureProfile**
   - What we know: Tasks also have FK to profiles (`user_id UUID REFERENCES profiles(id)`). Currently only habits POST has the inline profile creation.
   - What's unclear: Can tasks POST fail with FK violation if profile doesn't exist?
   - Recommendation: Apply `ensureProfile` to tasks POST too for consistency. It's a single function call and prevents a class of bugs.

2. **"Active (non-deleted)" definition for habit limit**
   - What we know: User said "only active (non-deleted) habits count toward the 20 limit."
   - What's unclear: Does "non-deleted" mean `status != 'archived'` (so both `active` AND `paused` count)? Or only `status == 'active'`?
   - Recommendation: Count both `active` and `paused` habits toward the limit. Archived habits are effectively soft-deleted and shouldn't count. This is more intuitive: pausing a habit shouldn't free up a slot.

3. **Confirm route redirect hardening**
   - What we know: `app/auth/confirm/route.ts` uses `redirect(next)` with zero guards -- more vulnerable than callback.
   - What's unclear: Is this in scope for Phase 2? SECV-06 says "Auth callback redirect has allowlist" but doesn't mention confirm.
   - Recommendation: Fix both routes. Same `getSafeRedirectPath` function, minimal extra effort. Security vulnerabilities should be fixed when found.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis:** Direct reading of all 13 API route files, 3 validation schema files, 1 SQL migration, 3 DB class files, 2 auth route files
- **Zod v3.25.46:** `.safeParse()`, `.partial()`, `.flatten()`, `.refine()` -- verified from installed package and existing usage in `tests/lib/validations/` test files
- **Supabase PostgreSQL:** `EXCEPTION WHEN OTHERS`, `ON CONFLICT DO NOTHING` -- standard PostgreSQL PL/pgSQL patterns

### Secondary (MEDIUM confidence)
- **PostgreSQL error codes:** `23505` for unique_violation, `PGRST116` for PostgREST not found -- verified from codebase usage in `lib/db/profiles.ts` and `lib/db/habits.ts`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Zod is already installed and used, no new dependencies
- Architecture: HIGH -- Direct codebase analysis of all affected files, clear mechanical changes
- Pitfalls: HIGH -- All pitfalls identified from actual code patterns (email NOT NULL, duplicate isValidFrequency, missing confirm route guard)
- Discretion recommendations: HIGH -- Based on codebase conventions and security best practices

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (30 days -- stable domain, no fast-moving dependencies)
