# Admin Role System & Admin Dashboard

**Date:** 2026-04-06
**Status:** Draft
**Scope:** Database role column, admin auth guard, admin dashboard page, exercise media sync UI

## Problem

BetterR.Me has no user role system. The single admin endpoint (`POST /api/admin/sync-exercise-media`) uses an environment variable secret for auth, which requires calling it from the browser console. There's no admin UI, no way to mark a user as admin in the database, and no reusable pattern for protecting admin-only routes.

## Goals

1. Add a `role` column to the `profiles` table (`user` | `admin`)
2. Create a reusable server-side admin auth guard
3. Build an admin dashboard at `/dashboard/admin` with exercise media sync
4. Show an admin nav link in the sidebar (only for admin users)

## Non-Goals

- Enterprise RBAC with granular permissions
- Admin user management UI (admin role is set via SQL)
- Audit logging for admin actions (can add later)
- Changing the existing middleware — admin check happens at page/route level

## Architecture

### Database Migration

Add `role` column to `profiles` table with a CHECK constraint:

```sql
ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));
```

Seed the admin user in the same migration using a DO block that updates by email. The implementor should use the app owner's actual email address (the one used to sign up for the app).

**RLS security for role column:** The existing UPDATE policy lets users update their own profile — which would allow privilege escalation by setting `role = 'admin'`. The migration must replace the UPDATE policy with one that excludes the role column:

```sql
DROP POLICY "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = OLD.role);
```

The `role = OLD.role` clause prevents users from changing their own role. Only direct SQL with the service-role key can modify roles (i.e., the admin seed). Additionally, the `profileUpdateSchema` in `lib/validations/profile.ts` must NOT include `role` — strip it at the Zod level as defense-in-depth.

### Type Changes

**`lib/db/types.ts`** — Add to Profile interface:

```ts
role: 'user' | 'admin';
```

**`lib/db/types.ts`** — Add `ProfileRole` type:

```ts
export type ProfileRole = 'user' | 'admin';
```

### Admin Auth Guard

**New file: `lib/auth/admin.ts`**

```ts
export async function requireAdmin(): Promise<{ user: User; profile: Profile }>
```

Logic:
1. Create Supabase SSR client
2. Call `getUser()` — if no user, redirect to `/auth/login`
3. Query `profiles` table for `role` column using user.id
4. If role !== `admin`, redirect to `/dashboard`
5. Return `{ user, profile }` for use in the page

This follows the same pattern as existing pages (`if (!user) redirect()`), just with an additional role check. No middleware changes required.

### API Route Guard

**Same file: `lib/auth/admin.ts`** (co-located with requireAdmin)

```ts
export async function requireAdminApi(): Promise<{ user: User; profile: Profile }>
// Throws AdminForbiddenError if not admin — caller catches and returns 403
```

For API routes, throws a typed error instead of redirecting. Usage pattern:

```ts
try {
  const { user, profile } = await requireAdminApi();
  // ... admin logic
} catch (error) {
  if (error instanceof AdminForbiddenError) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  throw error;
}
```

Used in `POST /api/admin/sync-exercise-media` alongside the existing `x-admin-secret` header check — either auth path works (role-based OR secret header).

### Admin Dashboard Page

**Route:** `/dashboard/admin`

**File:** `app/dashboard/admin/page.tsx` (server component)

Flow:
1. Call `requireAdmin()` — non-admins redirected to `/dashboard`
2. Query `exercise_media` count for current stats
3. Render `AdminDashboardContent` client component

**Client component:** `components/admin/admin-dashboard-content.tsx`

Layout:
- Page title: "Admin Dashboard"
- **Exercise Media Sync** card containing:
  - Current stats: "X exercises with media" / "Y total preset exercises"
  - Last sync info (derived from most recent `exercise_media.updated_at`)
  - "Dry Run" toggle (preview matches without writing)
  - "Sync Now" button — calls `POST /api/admin/sync-exercise-media`
  - Progress/result display: matched count, unmatched count, errors
- Empty space for future admin tools (no placeholder UI — just the sync card)

The sync card uses `useState` for loading/result state and `fetch()` to call the API. The `x-admin-secret` header is not needed when calling from an admin session (role check handles auth), but we keep it as a fallback for CLI/cron usage.

### Sidebar Navigation

**File:** `components/layouts/app-sidebar.tsx`

Add a conditional admin nav item after the main items:

```ts
{ href: "/dashboard/admin", icon: Shield, labelKey: "admin", match: (p) => p.startsWith("/dashboard/admin") }
```

Visibility: Only render when the user has `role === 'admin'`. The user's role is available from the `/api/profile` SWR response that's already fetched by other components (SWR deduplication prevents extra requests). While SWR is loading (role unknown), the admin item is hidden — it appears once the profile loads. This prevents a flash of the admin link for non-admin users.

The admin item renders below the main nav items, separated by a `SidebarSeparator`.

### Update Existing Admin Endpoint

**File:** `app/api/admin/sync-exercise-media/route.ts`

Change auth logic from "user + secret header required" to "user + (admin role OR secret header)":

```ts
const isAdmin = profile?.role === 'admin';
const hasSecret = headerSecret && headerSecret === adminSecret;
if (!isAdmin && !hasSecret) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

This preserves backward compatibility for CLI/cron callers that use the secret header, while also allowing admin users to call it from the UI without knowing the secret.

### i18n

Add keys to all 3 locale files under `admin.*` namespace:

**English:**
```json
"admin": {
  "title": "Admin Dashboard",
  "nav": "Admin",
  "sync": {
    "title": "Exercise Media Sync",
    "description": "Sync exercise images and GIFs from ExerciseDB",
    "currentStats": "{count} exercises with media out of {total} total",
    "lastSync": "Last synced: {date}",
    "neverSynced": "Never synced",
    "dryRun": "Dry run (preview only)",
    "syncButton": "Sync Now",
    "syncing": "Syncing...",
    "resultMatched": "{count} matched",
    "resultUnmatched": "{count} unmatched",
    "success": "Sync completed successfully",
    "error": "Sync failed"
  }
}
```

Chinese Simplified and Traditional translations follow the same structure.

### Non-Admin User Experience

When a non-admin user navigates to `/dashboard/admin` (e.g., by typing the URL), `requireAdmin()` silently redirects them to `/dashboard`. No error page, no 403 — they just land on the dashboard.

The admin nav item is not rendered for non-admin users, so they have no visual indication the admin page exists.

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/YYYYMMDD_add_profile_role.sql` | NEW — add role column + seed admin |
| `lib/db/types.ts` | EDIT — add `role` to Profile, add ProfileRole type |
| `lib/auth/admin.ts` | NEW — requireAdmin() + requireAdminApi() + AdminForbiddenError |
| `lib/validations/profile.ts` | EDIT — ensure `role` is NOT in profileUpdateSchema |
| `app/dashboard/admin/page.tsx` | NEW — admin dashboard server page |
| `components/admin/admin-dashboard-content.tsx` | NEW — admin dashboard client component |
| `components/layouts/app-sidebar.tsx` | EDIT — conditional admin nav item |
| `app/api/admin/sync-exercise-media/route.ts` | EDIT — add role-based auth alongside secret |
| `i18n/messages/en.json` | EDIT — add admin.* keys |
| `i18n/messages/zh.json` | EDIT — add admin.* keys |
| `i18n/messages/zh-TW.json` | EDIT — add admin.* keys |

## Testing

| Test | What it verifies |
|------|-----------------|
| `tests/lib/auth/admin.test.ts` | requireAdmin redirects non-admin, returns admin user |
| `tests/app/dashboard/admin/page.test.tsx` | Page renders for admin, redirects for non-admin |
| `tests/components/admin/admin-dashboard-content.test.tsx` | Sync button triggers API call, shows results |
| `tests/app/api/admin/sync-exercise-media.test.ts` | Updated: accepts admin role OR secret header |
| `tests/components/layouts/app-sidebar.test.tsx` | Admin nav item shown/hidden based on role |

## Implementation Order

1. **Migration + types** — role column, Profile type update
2. **Auth guards** — requireAdmin(), requireAdminApi()
3. **Update sync endpoint** — add role-based auth path
4. **Admin page + sidebar** — UI components
5. **i18n** — all 3 locales
6. **Tests** — all test files

Steps 1-2 must be sequential. Steps 3-5 can parallelize after step 2.

## Open Questions

None — all decisions captured above.
