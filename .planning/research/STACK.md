# Stack Research: BetterR.Me Hardening

**Domain:** Habit tracking web app -- codebase hardening (validation, theming, caching, reliability)
**Researched:** 2026-02-15
**Confidence:** HIGH (most recommendations verified against official docs and existing codebase)

---

## Current Stack (Already In Place)

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.6 | App Router framework |
| React | 19.x | UI library |
| Supabase SSR | 0.8.x | Auth + DB |
| Zod | 3.25.46 | Schema validation (currently forms only) |
| next-themes | 0.4.6 | Dark mode |
| Tailwind CSS | 3.4.x | Styling (class-based dark mode) |
| SWR | 2.4.x | Client data fetching |
| TypeScript | 5.x | Type safety |

**No new dependencies needed.** This hardening milestone is about wiring existing tools correctly, not adding new ones.

---

## Hardening Area 1: Zod API Route Validation

**Confidence: HIGH** -- Verified via Zod docs, Dub.co engineering blog, and codebase analysis

### The Problem

The project has Zod schemas in `lib/validations/` (habit, task, profile) used only by react-hook-form on the client. API routes in `app/api/` perform manual validation with hand-rolled functions like `isValidFrequency()`. This creates two parallel validation paths that can diverge.

Specific gaps in the current manual validation:
- No max-length enforcement on habit `description` or `name` server-side (Zod schema has `.max(100)` and `.max(500)`)
- No max-length enforcement on task `description`, `intention`, or `title` server-side
- `isValidFrequency()` in `app/api/habits/route.ts` duplicates logic from `habitFormSchema.frequency`
- Profile PATCH accepts arbitrary `preferences` object with zero validation

### Recommended Pattern: `safeParse` at API Boundaries

Use `.safeParse()` (not `.parse()`) because it returns a result object instead of throwing, which gives clean control flow in route handlers.

**Create API-specific schemas that extend form schemas:**

```typescript
// lib/validations/habit.ts — ADD alongside existing habitFormSchema

/** API schema: what the POST /api/habits endpoint accepts */
export const createHabitApiSchema = habitFormSchema;

/** API schema: what the PATCH /api/habits/[id] endpoint accepts */
export const updateHabitApiSchema = habitFormSchema.partial();
```

**Wire into route handlers:**

```typescript
// app/api/habits/route.ts — REPLACE manual validation
import { createHabitApiSchema } from '@/lib/validations/habit';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = createHabitApiSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: result.error.issues.map(i => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }

    // result.data is now fully typed and validated
    const habitsDB = new HabitsDB(supabase);
    const habit = await habitsDB.createHabit({
      user_id: user.id,
      name: result.data.name.trim(),
      description: result.data.description?.trim() || null,
      category: result.data.category || null,
      frequency: result.data.frequency,
      status: 'active',
    });

    return NextResponse.json({ habit }, { status: 201 });
  } catch (error) {
    console.error('POST /api/habits error:', error);
    return NextResponse.json({ error: 'Failed to create habit' }, { status: 500 });
  }
}
```

**Error response helper (optional but recommended for consistency):**

```typescript
// lib/validations/api-error.ts
import { ZodError } from 'zod';
import { NextResponse } from 'next/server';

export function validationError(error: ZodError) {
  return NextResponse.json(
    {
      error: 'Validation failed',
      details: error.issues.map(i => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    },
    { status: 400 }
  );
}
```

### What to Remove After Wiring Zod

- `isValidFrequency()` function in `app/api/habits/route.ts` (lines 12-34)
- `VALID_CATEGORIES` and `VALID_FREQUENCY_TYPES` constants in `app/api/habits/route.ts` (lines 6-7)
- Manual `body.name` / `body.title` type checks in all POST/PATCH handlers
- Manual `body.priority` parseInt logic in `app/api/tasks/route.ts`

### Routes to Wire (Complete List)

| Route | Method | Schema to Use |
|-------|--------|---------------|
| `/api/habits` | POST | `createHabitApiSchema` |
| `/api/habits/[id]` | PATCH | `updateHabitApiSchema` |
| `/api/tasks` | POST | `taskFormSchema` |
| `/api/tasks/[id]` | PATCH | `taskFormSchema.partial()` |
| `/api/profile` | PATCH | `profileFormSchema` (+ add preferences sub-schema) |
| `/api/profile/preferences` | PATCH | New `preferencesSchema` |

### Discriminated Union Pattern (Already Correct in Codebase)

The existing `habitFormSchema` already uses `z.discriminatedUnion("type", [...])` for frequency -- this is the correct pattern. Zod's `discriminatedUnion` is more performant than `z.union` for objects with a shared discriminator key because it jumps directly to the matching branch instead of testing all branches sequentially.

```typescript
// lib/validations/habit.ts — ALREADY EXISTS (correct pattern)
frequency: z.discriminatedUnion("type", [
  z.object({ type: z.literal("daily") }),
  z.object({ type: z.literal("weekdays") }),
  z.object({ type: z.literal("weekly") }),
  z.object({ type: z.literal("times_per_week"), count: z.union([z.literal(2), z.literal(3)]) }),
  z.object({ type: z.literal("custom"), days: z.array(z.number().min(0).max(6)).min(1) }),
]),
```

**For the `WeeklyInsight` type** (currently a non-discriminated union in `lib/db/insights.ts` lines 7-18), apply the same discriminated union pattern to enable type-safe narrowing:

```typescript
// lib/db/insights.ts — RECOMMENDED replacement
type WeeklyInsight =
  | { type: 'streak_achievement'; params: { habit: string; days: number } }
  | { type: 'consistency_star'; params: { habit: string; rate: number } }
  | { type: 'improving_habit'; params: { habit: string; improvement: number } }
  | { type: 'best_day'; params: { day: string; rate: number } }
  | { type: 'weekly_summary'; params: { completed: number; total: number } };
```

This enables safe narrowing: `if (insight.type === 'streak_achievement') { insight.params.days /* typed as number */ }`.

---

## Hardening Area 2: next-themes Integration

**Confidence: HIGH** -- Verified via next-themes GitHub README, codebase analysis

### The Problem

`components/theme-switcher.tsx` (lines 23-43) manually manipulates `document.documentElement.classList` to add/remove `dark`/`light` classes. This is unnecessary and fragile because next-themes already manages class toggling when `attribute="class"` is set.

The root layout (`app/layout.tsx`) is configured correctly:

```tsx
<ThemeProvider
  attribute="class"          // Tells next-themes to toggle .dark class
  defaultTheme="system"      // System preference as default
  enableSystem                // Listen to OS preference changes
  storageKey="betterr-theme" // Custom localStorage key
>
```

And Tailwind is configured correctly:

```typescript
// tailwind.config.ts
darkMode: ["class"],  // Tailwind watches for .dark class
```

### Why the Manual DOM Manipulation Exists

The theme-switcher component was likely added as a workaround when dark mode appeared not to work. The actual root cause is almost certainly one of:

1. **Hydration timing** -- On first load, `resolvedTheme` is `undefined` until the client-side script runs. The `mounted` guard handles this, but the developer may have seen a flash and added manual class toggling as a "fix."

2. **A stale `className` check** -- The code checks `document.documentElement.className` which can include many classes. The `.includes('dark')` check could match substrings like `dark-mode` or `darken`, though this is unlikely with the current class list.

### Correct Implementation

Remove the manual DOM class manipulation entirely. next-themes handles this via an injected inline script that runs before React hydrates, preventing flash of wrong theme (FOUC).

```typescript
// components/theme-switcher.tsx — CORRECTED
"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const ThemeSwitcher = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const ICON_SIZE = 16;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          {resolvedTheme === "light" ? (
            <Sun key="light" size={ICON_SIZE} className="text-muted-foreground" />
          ) : resolvedTheme === "dark" ? (
            <Moon key="dark" size={ICON_SIZE} className="text-muted-foreground" />
          ) : (
            <Laptop key="system" size={ICON_SIZE} className="text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-content" align="start">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          <DropdownMenuRadioItem className="flex gap-2" value="light">
            <Sun size={ICON_SIZE} className="text-muted-foreground" /> <span>Light</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem className="flex gap-2" value="dark">
            <Moon size={ICON_SIZE} className="text-muted-foreground" /> <span>Dark</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem className="flex gap-2" value="system">
            <Laptop size={ICON_SIZE} className="text-muted-foreground" /> <span>System</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { ThemeSwitcher };
```

**What changed:**
- Removed the second `useEffect` (lines 23-43 in current code) that manually adds/removes CSS classes
- Removed `console.log` debug statements (lines 39-41)
- Simplified `onValueChange={(e) => setTheme(e)}` to `onValueChange={setTheme}`

### Tailwind v3 vs v4 Note

This project uses Tailwind CSS 3.4.x with `darkMode: ["class"]` in `tailwind.config.ts`. This is correct and requires NO changes. The `@custom-variant dark (...)` CSS directive is only needed for Tailwind v4 projects. Do not add it.

---

## Hardening Area 3: Caching Strategy on Vercel Serverless

**Confidence: HIGH** -- Verified via Vercel official Cache-Control docs

### The Problem

`lib/cache.ts` implements a module-level `TTLCache` singleton (`statsCache`) with 5-minute TTL. On Vercel serverless:

1. Each cold start creates an empty cache (useless)
2. Concurrent workers maintain separate caches (inconsistent)
3. `invalidateStatsCache()` only clears the calling worker's cache (other workers serve stale data)
4. With Fluid Compute (paid plans), warm instances DO preserve in-memory state -- but invalidation across instances is still broken

### Recommended Approach: Remove In-Memory Cache, Rely on HTTP Cache-Control

The stats route (`/api/habits/[id]/stats`) already sets correct HTTP Cache-Control headers:

```typescript
// ALREADY EXISTS in app/api/habits/[id]/stats/route.ts
headers: {
  'Cache-Control': `private, max-age=${CACHE_MAX_AGE}`, // private, max-age=300
  'X-Cache': 'HIT',  // or 'MISS'
}
```

This is the right pattern for user-specific data on Vercel:

| Header | Value | Why |
|--------|-------|-----|
| `private` | Required | Data is user-specific (habit stats). Prevents Vercel CDN from caching and serving one user's data to another |
| `max-age=300` | 5 minutes | Browser caches the response for 5 minutes. Same effective TTL as the current in-memory cache |

**Why `private` and NOT `s-maxage`:** Vercel's CDN cache (`s-maxage`) does NOT work with responses that have `Authorization` headers or `set-cookie`. Since all API routes go through Supabase auth (which sets cookies), CDN caching would not apply anyway. `private, max-age=300` tells the browser to cache it locally.

**Why NOT `stale-while-revalidate`:** For user-specific data behind auth, `stale-while-revalidate` is a Vercel CDN directive and would be stripped before reaching the browser. Since we use `private` (no CDN caching), adding `stale-while-revalidate` would have no effect.

### What to Remove

1. Delete `lib/cache.ts` entirely (the `TTLCache` class, `statsCache` singleton, `getStatsCacheKey`, `invalidateStatsCache`, `invalidateUserStatsCache`)
2. Remove `statsCache` imports and usage from `app/api/habits/[id]/stats/route.ts`
3. Remove `invalidateStatsCache` calls from `app/api/habits/[id]/toggle/route.ts`
4. Delete `tests/lib/cache.test.ts`

### What to Keep

- The `Cache-Control: private, max-age=300` header on the stats route -- this IS the caching layer
- The `X-Cache` header can be removed (it was tracking the in-memory cache hit/miss, which is no longer relevant)
- SWR's client-side `revalidateOnFocus: true` in dashboard/habits/tasks components -- this handles re-fetching stale data on tab focus

### When You WOULD Need Server-Side Caching

If the project later needs shared server-side caching (e.g., rate limiting, cross-request deduplication), use:

| Solution | When to Use | Cost |
|----------|-------------|------|
| Vercel KV (Redis) | Rate limiting, session data, shared cache | Paid add-on |
| Upstash Redis | Same, with better free tier | Free tier available |
| Vercel CDN (`s-maxage`) | Public data only (no auth) | Free with Vercel |

For this milestone: no new caching infrastructure needed. HTTP headers are sufficient.

---

## Hardening Area 4: Supabase Profile Creation Trigger

**Confidence: HIGH** -- Verified via Supabase issue #37497, Supabase docs, and codebase migration files

### The Problem

The current trigger in `supabase/migrations/20260129_initial_schema.sql` has NO exception handling:

```sql
-- CURRENT (fragile)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

If this trigger fails (enum mismatch, constraint violation, permissions issue), the ENTIRE `auth.users` insert is rolled back. The user sees "Database error saving new user" and cannot sign up. This is a known Supabase failure mode documented in issue #37497.

The API route `app/api/habits/route.ts` (lines 133-157) has a fallback that auto-creates the profile if missing, but this fallback only exists in the habits route -- not in tasks, profile, export, or dashboard routes.

### Recommended Fix: Add Exception Handling to Trigger

```sql
-- HARDENED version
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but do NOT block signup
  RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Key changes:**
1. `EXCEPTION WHEN OTHERS THEN` catches any error and allows the `auth.users` insert to succeed
2. `COALESCE(NEW.email, '')` guards against null email (from anonymous auth or OAuth without email)
3. `RAISE WARNING` logs the failure for debugging without blocking signup

### Consistent Fallback Pattern Across All Routes

After hardening the trigger, also add a consistent `ensureProfile` helper for defense-in-depth:

```typescript
// lib/supabase/ensure-profile.ts
import { SupabaseClient, User } from '@supabase/supabase-js';

/**
 * Ensure a profile row exists for the given user.
 * The DB trigger should handle this on signup, but if it fails
 * (e.g., due to an exception), this creates the profile on first API call.
 */
export async function ensureProfile(supabase: SupabaseClient, user: User): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();

  if (profile) return; // Profile exists

  const { error } = await supabase.from('profiles').insert({
    id: user.id,
    email: user.email ?? '',
    full_name: user.user_metadata?.full_name || null,
    avatar_url: user.user_metadata?.avatar_url || null,
  });

  if (error) {
    // Log but do not throw -- caller should handle missing profile gracefully
    console.error(`ensureProfile failed for user ${user.id}:`, error.message);
  }
}
```

Use this in any route that writes user data (habits POST, tasks POST) instead of inlining the fallback.

---

## Hardening Area 5: TypeScript Discriminated Unions for WeeklyInsight

**Confidence: HIGH** -- Standard TypeScript pattern, verified via TypeScript handbook

### The Problem

`WeeklyInsight` in `lib/db/insights.ts` uses a flat interface with `type` as a union string and `params` as `Record<string, string | number>`. Consumer code cannot narrow `params` shape by `type`.

### Recommended Pattern

```typescript
// lib/db/insights.ts — REPLACE the current WeeklyInsight type
export type WeeklyInsight =
  | { type: 'streak_achievement'; params: { habit: string; days: number } }
  | { type: 'consistency_star'; params: { habit: string; rate: number } }
  | { type: 'improving_habit'; params: { habit: string; improvement: number } }
  | { type: 'best_day'; params: { day: string; rate: number } }
  | { type: 'weekly_summary'; params: { completed: number; total: number } };
```

Consumer code becomes type-safe:

```typescript
function renderInsight(insight: WeeklyInsight): string {
  switch (insight.type) {
    case 'streak_achievement':
      return `${insight.params.habit}: ${insight.params.days} day streak!`;
    case 'consistency_star':
      return `${insight.params.habit}: ${insight.params.rate}% consistency`;
    // ... exhaustive handling
    default:
      // Exhaustive check — TypeScript error if a case is missed
      const _exhaustive: never = insight;
      return _exhaustive;
  }
}
```

---

## What NOT to Change

| Avoid | Why | Current State Is Fine |
|-------|-----|----------------------|
| Adding Redis/Upstash for caching | Overkill for current scale; HTTP Cache-Control is sufficient | `private, max-age=300` on stats route |
| Migrating to Tailwind v4 | Major migration unrelated to hardening; class-based dark mode works on v3 | `darkMode: ["class"]` is correct |
| Adding `next-zod-route` or `next-zod-api` | Adds dependency for a pattern achievable with 5 lines of `.safeParse()` | Direct Zod usage is simpler |
| Switching from `z.discriminatedUnion` to `z.switch` | `z.switch` is proposed for future Zod versions but not yet shipped | `z.discriminatedUnion` works correctly |
| Adding `stale-while-revalidate` to API routes | No effect with `private` cache directive; Vercel strips it before browser | `private, max-age=300` is correct |
| Replacing Supabase trigger with Auth Hooks | Auth Hooks ("after auth" hook) is still in development | Trigger with exception handling is the proven pattern |

---

## Version Compatibility

| Package | Version | Compatible With | Notes |
|---------|---------|-----------------|-------|
| zod@3.25.46 | Current | @hookform/resolvers@5.x, react-hook-form@7.x | Schemas shared between forms and API routes |
| next-themes@0.4.6 | Current | Next.js 16.x, React 19.x | App Router support since 0.3.0 |
| tailwindcss@3.4.x | Current | next-themes `attribute="class"` | `darkMode: ["class"]` config matches ThemeProvider `attribute="class"` |
| @supabase/ssr@0.8.x | Current | @supabase/supabase-js@2.95.x | Server client pattern used correctly |

No version upgrades required for this hardening milestone.

---

## Sources

- [Vercel Cache-Control Headers docs](https://vercel.com/docs/headers/cache-control-headers) -- Authoritative source on `private` vs `s-maxage`, CDN behavior (HIGH confidence)
- [Vercel Fluid Compute blog](https://vercel.com/blog/scale-to-one-how-fluid-solves-cold-starts) -- In-memory state preservation on warm instances (HIGH confidence)
- [Dub.co: Using Zod to validate Next.js API Route Handlers](https://dub.co/blog/zod-api-validation) -- `.safeParse()` pattern with error formatting (MEDIUM confidence -- verified against Zod docs)
- [Supabase issue #37497](https://github.com/supabase/supabase/issues/37497) -- Trigger failure blocks signup, misleading error (HIGH confidence -- primary source)
- [Supabase discussion #6518](https://github.com/orgs/supabase/discussions/6518) -- `on_auth_user_created` trigger can block signups (HIGH confidence)
- [next-themes GitHub README](https://github.com/pacocoursey/next-themes) -- `attribute="class"` handles DOM class toggling automatically (HIGH confidence)
- [shadcn/ui Dark Mode guide](https://ui.shadcn.com/docs/dark-mode/next) -- Canonical next-themes + Tailwind setup (HIGH confidence)
- [Zod API docs: discriminatedUnion](https://zod.dev/api) -- Performance benefit over `z.union` (HIGH confidence)
- [Zod issue #2106](https://github.com/colinhacks/zod/issues/2106) -- `z.switch` proposed but not yet shipped (MEDIUM confidence)

---

*Stack research for: BetterR.Me codebase hardening milestone*
*Researched: 2026-02-15*
