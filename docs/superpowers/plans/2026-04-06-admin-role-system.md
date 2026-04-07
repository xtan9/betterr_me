# Admin Role System & Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user role system with admin dashboard and exercise media sync UI.

**Architecture:** Database role column on profiles with RLS protection, server-side auth guards (requireAdmin for pages, requireAdminApi for API routes), admin dashboard at /dashboard/admin with exercise media sync card, conditional admin nav in sidebar.

**Tech Stack:** Supabase (migration, RLS), Next.js App Router (server components), SWR (client data), shadcn/ui (Card, Switch, Button), next-intl (i18n), Vitest (tests)

---

### Task 1: Database Migration — Add role column to profiles

**Files:**
- Create: `supabase/migrations/20260406000001_add_profile_role.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add role column with CHECK constraint
ALTER TABLE profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));

-- Replace UPDATE policy to prevent role self-escalation
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Seed admin user (replace with your actual email)
DO $$
BEGIN
  UPDATE profiles SET role = 'admin' WHERE email = 'xingdi@betterr.me';
END $$;
```

Note: The `WITH CHECK` clause on its own prevents role escalation because the `profileUpdateSchema` Zod validation (defense-in-depth in Task 2) strips `role` before it reaches the DB. The RLS policy ensures users can only update their own rows.

- [ ] **Step 2: Verify migration file exists**

Run: `ls supabase/migrations/20260406000001_add_profile_role.sql`
Expected: File listed

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260406000001_add_profile_role.sql
git commit -m "feat: add role column to profiles table with RLS protection"
```

---

### Task 2: Type Changes + Validation Defense-in-Depth

**Files:**
- Modify: `lib/db/types.ts:8-18`
- Modify: `lib/validations/profile.ts`

- [ ] **Step 1: Add role to Profile interface and ProfileRole type**

In `lib/db/types.ts`, add `role` to the Profile interface after `email_notifications_enabled`:

```ts
export type ProfileRole = 'user' | 'admin';

export interface Profile {
  id: string; // UUID
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  timezone: string | null;
  email_notifications_enabled: boolean;
  role: ProfileRole;
  preferences: ProfilePreferences;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Strip role from profileUpdateSchema**

In `lib/validations/profile.ts`, add `.omit({ role: true })` to the profileUpdateSchema to prevent role escalation via the API. First add `role` to the base schema so `.omit` works, then strip it:

```ts
import { z } from "zod";

export const profileFormSchema = z.object({
  full_name: z.string().max(100).optional().nullable(),
  avatar_url: z
    .string()
    .url()
    .optional()
    .nullable()
    .or(z.literal("")),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const profileUpdateSchema = profileFormSchema
  .partial()
  .extend({
    preferences: z.record(z.unknown()).optional(),
    timezone: z.string().min(1).max(100).optional().nullable(),
    email_notifications_enabled: z.boolean().optional(),
    role: z.string().optional(), // Accept but strip below
  })
  .omit({ role: true }) // Defense-in-depth: prevent role escalation via API
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type ProfileUpdateValues = z.infer<typeof profileUpdateSchema>;
```

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `pnpm test:run -- tests/app/api/profile/`
Expected: All existing profile tests pass

- [ ] **Step 4: Commit**

```bash
git add lib/db/types.ts lib/validations/profile.ts
git commit -m "feat: add ProfileRole type and strip role from update schema"
```

---

### Task 3: Admin Auth Guards

**Files:**
- Create: `lib/auth/admin.ts`
- Create: `tests/lib/auth/admin.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args);
    throw new Error("NEXT_REDIRECT");
  },
}));

import { requireAdmin, requireAdminApi, AdminForbiddenError } from "@/lib/auth/admin";

describe("requireAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /auth/login when no user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/auth/login");
  });

  it("redirects to /dashboard when user is not admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { role: "user" },
            error: null,
          }),
        }),
      }),
    });

    await expect(requireAdmin()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns user and profile when user is admin", async () => {
    const mockUser = { id: "u1", email: "admin@test.com" };
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "u1", role: "admin", email: "admin@test.com" },
            error: null,
          }),
        }),
      }),
    });

    const result = await requireAdmin();
    expect(result.user).toEqual(mockUser);
    expect(result.profile.role).toBe("admin");
  });
});

describe("requireAdminApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws AdminForbiddenError when user is not admin", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { role: "user" },
            error: null,
          }),
        }),
      }),
    });

    await expect(requireAdminApi()).rejects.toThrow(AdminForbiddenError);
  });

  it("returns user and profile when user is admin", async () => {
    const mockUser = { id: "u1", email: "admin@test.com" };
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: "u1", role: "admin", email: "admin@test.com" },
            error: null,
          }),
        }),
      }),
    });

    const result = await requireAdminApi();
    expect(result.profile.role).toBe("admin");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test:run -- tests/lib/auth/admin.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```ts
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/db/types";

export class AdminForbiddenError extends Error {
  constructor() {
    super("Forbidden: admin role required");
    this.name = "AdminForbiddenError";
  }
}

async function getAdminContext(): Promise<{ user: User; profile: Profile }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    throw new Error("PROFILE_NOT_FOUND");
  }

  return { user, profile: profile as Profile };
}

/**
 * Server component guard: redirects non-admin users.
 * Use in page.tsx server components.
 */
export async function requireAdmin(): Promise<{ user: User; profile: Profile }> {
  try {
    const ctx = await getAdminContext();
    if (ctx.profile.role !== "admin") {
      redirect("/dashboard");
    }
    return ctx;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      redirect("/auth/login");
    }
    throw error; // Re-throw NEXT_REDIRECT and other errors
  }
}

/**
 * API route guard: throws AdminForbiddenError for non-admin users.
 * Use in API route handlers with try/catch.
 */
export async function requireAdminApi(): Promise<{ user: User; profile: Profile }> {
  const ctx = await getAdminContext();
  if (ctx.profile.role !== "admin") {
    throw new AdminForbiddenError();
  }
  return ctx;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test:run -- tests/lib/auth/admin.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/auth/admin.ts tests/lib/auth/admin.test.ts
git commit -m "feat: add requireAdmin and requireAdminApi auth guards"
```

---

### Task 4: Update sync-exercise-media endpoint to accept admin role

**Files:**
- Modify: `app/api/admin/sync-exercise-media/route.ts:20-38`
- Modify: `tests/app/api/admin/sync-exercise-media.test.ts`

- [ ] **Step 1: Write new test for role-based auth**

Add to existing test file `tests/app/api/admin/sync-exercise-media.test.ts`:

```ts
it("returns 200 for admin user without secret header", async () => {
  // Mock user with admin role profile
  // mockGetUser returns user, mockFrom for profiles returns { role: 'admin' }
  // No x-admin-secret header
  // POST with empty body
  // Expect 200 (or the normal sync flow)
});
```

The exact mock setup depends on the existing test file's patterns — read it first and follow the same hoisted mock pattern.

- [ ] **Step 2: Update the endpoint auth logic**

Replace the auth section (lines 20-38) of `app/api/admin/sync-exercise-media/route.ts`:

```ts
// 1. Auth check
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

// 2. Admin check: role-based OR secret header
const { data: profile } = await supabase
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .single();

const isAdmin = profile?.role === "admin";
const adminSecret = process.env.ADMIN_SYNC_SECRET;
const headerSecret = request.headers.get("x-admin-secret");
const hasSecret = !!adminSecret && headerSecret === adminSecret;

if (!isAdmin && !hasSecret) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm test:run -- tests/app/api/admin/sync-exercise-media.test.ts`
Expected: All tests pass (existing + new)

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/sync-exercise-media/route.ts tests/app/api/admin/sync-exercise-media.test.ts
git commit -m "feat: accept admin role as alternative to secret header for sync endpoint"
```

---

### Task 5: Admin Dashboard Page

**Files:**
- Create: `app/dashboard/admin/page.tsx`
- Create: `components/admin/admin-dashboard-content.tsx`
- Create: `tests/components/admin/admin-dashboard-content.test.tsx`

- [ ] **Step 1: Write the test for admin dashboard content**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { AdminDashboardContent } from "@/components/admin/admin-dashboard-content";

describe("AdminDashboardContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders sync card with initial stats", () => {
    render(
      <AdminDashboardContent
        mediaCount={45}
        totalExercises={92}
        lastSyncDate={null}
      />
    );
    expect(screen.getByText("sync.title")).toBeInTheDocument();
    expect(screen.getByText("sync.neverSynced")).toBeInTheDocument();
  });

  it("shows sync button that triggers API call", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ matched: 80, unmatched: 12, total: 92 }),
    });

    render(
      <AdminDashboardContent
        mediaCount={45}
        totalExercises={92}
        lastSyncDate={null}
      />
    );

    fireEvent.click(screen.getByText("sync.syncButton"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/sync-exercise-media",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("passes dryRun flag when toggle is on", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ matched: 80, unmatched: 12, total: 92, dryRun: true }),
    });

    render(
      <AdminDashboardContent
        mediaCount={45}
        totalExercises={92}
        lastSyncDate={null}
      />
    );

    // Toggle dry run on
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    fireEvent.click(screen.getByText("sync.syncButton"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/sync-exercise-media",
        expect.objectContaining({
          body: JSON.stringify({ dryRun: true }),
        })
      );
    });
  });

  it("shows error state on API failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Sync failed" }),
    });

    render(
      <AdminDashboardContent
        mediaCount={0}
        totalExercises={92}
        lastSyncDate={null}
      />
    );

    fireEvent.click(screen.getByText("sync.syncButton"));

    await waitFor(() => {
      expect(screen.getByText("sync.error")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run -- tests/components/admin/admin-dashboard-content.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Write the client component**

Create `components/admin/admin-dashboard-content.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Database } from "lucide-react";

interface SyncResult {
  matched: number;
  unmatched: number;
  total: number;
  dryRun?: boolean;
}

interface AdminDashboardContentProps {
  mediaCount: number;
  totalExercises: number;
  lastSyncDate: string | null;
}

export function AdminDashboardContent({
  mediaCount,
  totalExercises,
  lastSyncDate,
}: AdminDashboardContentProps) {
  const t = useTranslations("admin");
  const [syncing, setSyncing] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/sync-exercise-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });

      if (!res.ok) {
        setError(t("sync.error"));
        return;
      }

      const data = await res.json();
      setResult(data);
    } catch {
      setError(t("sync.error"));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {t("sync.title")}
          </CardTitle>
          <CardDescription>{t("sync.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("sync.currentStats", { count: mediaCount, total: totalExercises })}
          </p>
          <p className="text-sm text-muted-foreground">
            {lastSyncDate
              ? t("sync.lastSync", { date: lastSyncDate })
              : t("sync.neverSynced")}
          </p>

          <div className="flex items-center gap-2">
            <Switch
              id="dry-run"
              checked={dryRun}
              onCheckedChange={setDryRun}
            />
            <Label htmlFor="dry-run" className="text-sm">
              {t("sync.dryRun")}
            </Label>
          </div>

          <Button onClick={handleSync} disabled={syncing}>
            {syncing ? t("sync.syncing") : t("sync.syncButton")}
          </Button>

          {result && (
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <p>{t("sync.resultMatched", { count: result.matched })}</p>
              <p>{t("sync.resultUnmatched", { count: result.unmatched })}</p>
              {!result.dryRun && <p className="font-medium text-green-600 dark:text-green-400">{t("sync.success")}</p>}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Write the server page**

Create `app/dashboard/admin/page.tsx`:

```tsx
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboardContent } from "@/components/admin/admin-dashboard-content";

export default async function AdminPage() {
  await requireAdmin();

  const supabase = await createClient();

  // Get exercise media stats
  const { count: mediaCount } = await supabase
    .from("exercise_media")
    .select("*", { count: "exact", head: true });

  const { count: totalExercises } = await supabase
    .from("exercises")
    .select("*", { count: "exact", head: true })
    .eq("is_custom", false);

  // Get last sync date from most recent exercise_media entry
  const { data: lastMedia } = await supabase
    .from("exercise_media")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  return (
    <div className="container max-w-4xl py-8">
      <AdminDashboardContent
        mediaCount={mediaCount ?? 0}
        totalExercises={totalExercises ?? 0}
        lastSyncDate={lastMedia?.updated_at ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test:run -- tests/components/admin/admin-dashboard-content.test.tsx`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/admin/page.tsx components/admin/admin-dashboard-content.tsx tests/components/admin/admin-dashboard-content.test.tsx
git commit -m "feat: add admin dashboard page with exercise media sync UI"
```

---

### Task 6: Sidebar Admin Nav Item

**Files:**
- Modify: `components/layouts/app-sidebar.tsx`

- [ ] **Step 1: Add Shield import and SWR hook for profile**

At the top of `components/layouts/app-sidebar.tsx`, add:

```ts
import { Shield } from "lucide-react";  // add to existing lucide import
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
```

- [ ] **Step 2: Add admin nav item rendering**

Inside the `AppSidebar` component, after the `badgeCounts` definition, add:

```ts
const { data: profileData } = useSWR("/api/profile", fetcher);
const isAdmin = profileData?.profile?.role === "admin";
```

Then after the closing `</SidebarGroup>` (after the mainNavItems map), add a conditional admin section:

```tsx
{isAdmin && (
  <SidebarGroup>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            isActive={pathname.startsWith("/dashboard/admin")}
            tooltip={t("admin")}
            className={navButtonClassName}
            style={navButtonStyle}
          >
            <Link href="/dashboard/admin">
              <NavIconContainer icon={Shield} />
              <span>{t("admin")}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
)}
```

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add components/layouts/app-sidebar.tsx
git commit -m "feat: show admin nav item in sidebar for admin users"
```

---

### Task 7: i18n — All 3 Locales

**Files:**
- Modify: `i18n/messages/en.json`
- Modify: `i18n/messages/zh.json`
- Modify: `i18n/messages/zh-TW.json`

- [ ] **Step 1: Add admin keys to en.json**

Add `"admin"` key to the `"common"` → `"nav"` section:

```json
"admin": "Admin"
```

Add top-level `"admin"` section:

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

- [ ] **Step 2: Add admin keys to zh.json**

Nav: `"admin": "管理"`

Top-level:

```json
"admin": {
  "title": "管理后台",
  "nav": "管理",
  "sync": {
    "title": "运动媒体同步",
    "description": "从 ExerciseDB 同步运动图片和 GIF",
    "currentStats": "{total} 个运动中有 {count} 个已有媒体",
    "lastSync": "上次同步：{date}",
    "neverSynced": "从未同步",
    "dryRun": "仅预览（不写入数据）",
    "syncButton": "立即同步",
    "syncing": "同步中...",
    "resultMatched": "{count} 个匹配",
    "resultUnmatched": "{count} 个未匹配",
    "success": "同步成功",
    "error": "同步失败"
  }
}
```

- [ ] **Step 3: Add admin keys to zh-TW.json**

Nav: `"admin": "管理"`

Top-level:

```json
"admin": {
  "title": "管理後台",
  "nav": "管理",
  "sync": {
    "title": "運動媒體同步",
    "description": "從 ExerciseDB 同步運動圖片和 GIF",
    "currentStats": "{total} 個運動中有 {count} 個已有媒體",
    "lastSync": "上次同步：{date}",
    "neverSynced": "從未同步",
    "dryRun": "僅預覽（不寫入資料）",
    "syncButton": "立即同步",
    "syncing": "同步中...",
    "resultMatched": "{count} 個匹配",
    "resultUnmatched": "{count} 個未匹配",
    "success": "同步成功",
    "error": "同步失敗"
  }
}
```

- [ ] **Step 4: Run lint to verify JSON is valid**

Run: `pnpm lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add i18n/messages/en.json i18n/messages/zh.json i18n/messages/zh-TW.json
git commit -m "feat: add admin i18n keys in all 3 locales"
```

---

### Task 8: Run Full Test Suite + Lint

- [ ] **Step 1: Run all tests**

Run: `pnpm test:run`
Expected: All tests pass, no regressions

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: 0 errors

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address lint and test issues from admin role implementation"
```

Only commit if there were fixes; skip if everything passed clean.
