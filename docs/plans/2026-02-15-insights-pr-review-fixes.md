# Insights PR #256 Review Fixes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical and important issues found in the PR #256 review for the weekly insights feature.

**Architecture:** The fixes are scoped to 4 files: the API route (`app/api/insights/weekly/route.ts`), the DB class (`lib/db/insights.ts`), and their test files. Changes include: accepting a `date` query param (timezone fix), importing shared utilities instead of duplicating, fixing auth error handling, and adding missing test coverage for `worst_day`, `best_week`, and error propagation.

**Tech Stack:** Next.js 16 (App Router), Supabase, TypeScript strict, Vitest

---

### Task 1: Fix timezone — accept `date` query param in API route

The server-side `new Date()` produces UTC dates, violating the project convention that dates are always browser-local. Every other API route accepts a `date` query param from the client.

**Files:**

- Modify: `app/api/insights/weekly/route.ts:1-27`
- Modify: `lib/db/insights.ts:46-62`

**Step 1: Update the API route to accept `date` query param**

Change `GET()` to `GET(request: NextRequest)` and extract the `date` param, following the pattern in `app/api/dashboard/route.ts:21-37`.

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ProfilesDB, InsightsDB } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error("GET /api/insights/weekly auth error:", authError);
      return NextResponse.json(
        { error: "Authentication service error" },
        { status: 500 },
      );
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date") || undefined;

    const profilesDB = new ProfilesDB(supabase);
    const profile = await profilesDB.getProfile(user.id);
    const weekStartDay = profile?.preferences?.week_start_day ?? 1;

    const insightsDB = new InsightsDB(supabase);
    const insights = await insightsDB.getWeeklyInsights(
      user.id,
      weekStartDay,
      date,
    );

    return NextResponse.json({ insights });
  } catch (error) {
    console.error("GET /api/insights/weekly error:", error);
    return NextResponse.json(
      { error: "Failed to fetch weekly insights" },
      { status: 500 },
    );
  }
}
```

This also fixes:

- **Critical #3:** Auth error now checked and returns 500 instead of silent 401
- **Important #4:** `InsightsDB` imported via barrel `@/lib/db` instead of direct path

**Step 2: Update `getWeeklyInsights` to accept optional `date` param**

In `lib/db/insights.ts`, change the method signature at line 46 and the date initialization at lines 60-62:

```ts
async getWeeklyInsights(
  userId: string,
  weekStartDay: number,
  dateStr?: string
): Promise<WeeklyInsight[]> {
```

Replace lines 60-62:

```ts
// was: const today = new Date(); today.setHours(0, 0, 0, 0);
const today = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
today.setHours(0, 0, 0, 0);
```

**Step 3: Run tests to verify nothing breaks**

Run: `pnpm test:run -- tests/lib/db/insights.test.ts tests/app/api/insights/weekly.test.ts`
Expected: All 14 tests still pass (existing tests don't pass a date, so they use the fallback).

**Step 4: Update the API route test to verify `date` param forwarding**

In `tests/app/api/insights/weekly.test.ts`, update the import and mock to use `NextRequest`:

The mock for `@/lib/db/insights` must change to `@/lib/db` since the import path changed. Update the test for the authenticated user to pass a request with a `date` param and verify it flows through. Add a test for auth error returning 500.

**Step 5: Run tests again**

Run: `pnpm test:run -- tests/app/api/insights/weekly.test.ts`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add app/api/insights/weekly/route.ts lib/db/insights.ts tests/app/api/insights/weekly.test.ts
git commit -m "fix: accept date query param + fix auth error handling in insights route"
```

---

### Task 2: Import shared utilities instead of duplicating

Two utilities are duplicated: `shouldTrackOnDate` (exists at `lib/habits/format.ts:79`) and `MILESTONE_THRESHOLDS` (exists at `lib/habits/milestones.ts:1`).

**Files:**

- Modify: `lib/db/insights.ts:1-41` (imports and function removal)

**Step 1: Replace local `shouldTrackOnDate` with import**

Remove the local function at lines 25-41 of `lib/db/insights.ts`. Add import:

```ts
import { shouldTrackOnDate } from "@/lib/habits/format";
```

Note: The existing function at `lib/habits/format.ts:79-93` is identical except it has no `default` case (TypeScript exhaustive check via discriminated union). This is actually better — it catches new frequency types at compile time.

**Step 2: Replace local `MILESTONE_THRESHOLDS` with import**

Remove line 12 of `lib/db/insights.ts`. Add import:

```ts
import { MILESTONE_THRESHOLDS } from "@/lib/habits/milestones";
```

**Step 3: Clean up — remove the `HabitFrequency` type import**

Since `shouldTrackOnDate` is no longer defined locally, `HabitFrequency` is no longer needed as a direct import. The `Habit` import is still needed. Update line 2:

```ts
import type { Habit } from "./types";
```

**Step 4: Run tests**

Run: `pnpm test:run -- tests/lib/db/insights.test.ts`
Expected: All 10 tests pass.

**Step 5: Run lint**

Run: `pnpm lint`
Expected: Clean.

**Step 6: Commit**

```bash
git add lib/db/insights.ts
git commit -m "refactor: import shouldTrackOnDate and MILESTONE_THRESHOLDS from shared modules"
```

---

### Task 3: Add missing test — `worst_day` insight

The `worst_day` insight type and the entire `computePerDayRates` method (33 lines) have zero test coverage.

**Files:**

- Modify: `tests/lib/db/insights.test.ts`

**Step 1: Write the failing test**

Add inside the `describe('getWeeklyInsights')` block, using `vi.useFakeTimers` for deterministic dates:

```ts
it("returns worst_day insight when a day has <=50% completion", async () => {
  // Use a fixed date: Wednesday 2026-02-11
  vi.useFakeTimers({ now: new Date("2026-02-11T12:00:00") });

  // Previous week: Mon Feb 2 - Sun Feb 8 (weekStartDay=1)
  const habits = [
    {
      id: "h1",
      name: "Exercise",
      frequency: { type: "daily" },
      status: "active",
      current_streak: 3,
    },
  ];

  // Complete all days EXCEPT Wednesday Feb 5 (day 3) — 6/7 = 86% overall, Wednesday = 0%
  const logs = [
    { habit_id: "h1", logged_date: "2026-02-02", completed: true }, // Mon
    { habit_id: "h1", logged_date: "2026-02-03", completed: true }, // Tue
    // Wed Feb 4 missing
    { habit_id: "h1", logged_date: "2026-02-05", completed: true }, // Thu
    { habit_id: "h1", logged_date: "2026-02-06", completed: true }, // Fri
    { habit_id: "h1", logged_date: "2026-02-07", completed: true }, // Sat
    { habit_id: "h1", logged_date: "2026-02-08", completed: true }, // Sun
  ];

  const supabase = createSupabaseClient(habits, logs);
  const db = new InsightsDB(supabase);
  const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

  const worstDay = insights.find((i) => i.type === "worst_day");
  expect(worstDay).toBeDefined();
  expect(worstDay!.priority).toBe(60);
  expect(worstDay!.params.day).toBe("wednesday");

  vi.useRealTimers();
});
```

**Step 2: Run the test**

Run: `pnpm test:run -- tests/lib/db/insights.test.ts`
Expected: PASS (implementation already exists, just untested).

**Step 3: Commit**

```bash
git add tests/lib/db/insights.test.ts
git commit -m "test: add worst_day insight test coverage"
```

---

### Task 4: Add missing test — `best_week` insight

The `best_week` insight (3 conditions: `prevWeekOverall > twoWeeksAgoOverall`, `twoWeeksAgoOverall > 0`, `prevWeekOverall >= 80`) has zero test coverage.

**Files:**

- Modify: `tests/lib/db/insights.test.ts`

**Step 1: Write the test**

```ts
it("returns best_week insight when overall rate is >=80% and improved", async () => {
  // Use a fixed date: Wednesday 2026-02-11
  vi.useFakeTimers({ now: new Date("2026-02-11T12:00:00") });

  // Previous week: Mon Feb 2 - Sun Feb 8
  // Two weeks ago: Mon Jan 26 - Sun Feb 1
  const habits = [
    {
      id: "h1",
      name: "Meditate",
      frequency: { type: "daily" },
      status: "active",
      current_streak: 3, // Not near any milestone
    },
  ];

  // Previous week: 6/7 days = 86% (above 80%)
  const prevWeekLogs = [
    { habit_id: "h1", logged_date: "2026-02-02", completed: true },
    { habit_id: "h1", logged_date: "2026-02-03", completed: true },
    { habit_id: "h1", logged_date: "2026-02-04", completed: true },
    { habit_id: "h1", logged_date: "2026-02-05", completed: true },
    { habit_id: "h1", logged_date: "2026-02-06", completed: true },
    { habit_id: "h1", logged_date: "2026-02-07", completed: true },
  ];

  // Two weeks ago: 3/7 days = 43% (below prev week, and > 0)
  const twoWeeksAgoLogs = [
    { habit_id: "h1", logged_date: "2026-01-26", completed: true },
    { habit_id: "h1", logged_date: "2026-01-27", completed: true },
    { habit_id: "h1", logged_date: "2026-01-28", completed: true },
  ];

  const allLogs = [...prevWeekLogs, ...twoWeeksAgoLogs];
  const supabase = createSupabaseClient(habits, allLogs);
  const db = new InsightsDB(supabase);
  const insights = await db.getWeeklyInsights("user-1", WEEK_START_MONDAY);

  const bestWeek = insights.find((i) => i.type === "best_week");
  expect(bestWeek).toBeDefined();
  expect(bestWeek!.priority).toBe(80);
  expect(bestWeek!.params.percent).toBeGreaterThanOrEqual(80);

  vi.useRealTimers();
});
```

**Step 2: Run the test**

Run: `pnpm test:run -- tests/lib/db/insights.test.ts`
Expected: PASS.

**Step 3: Commit**

```bash
git add tests/lib/db/insights.test.ts
git commit -m "test: add best_week insight test coverage"
```

---

### Task 5: Add missing test — Supabase error propagation

The `throw habitsError` and `throw logsError` paths (lines 57 and 81 of `insights.ts`) are never tested.

**Files:**

- Modify: `tests/lib/db/insights.test.ts`

**Step 1: Add error chain mock helper**

Add a helper function near the existing `createChainMock`:

```ts
function createErrorChainMock(errorValue: { message: string }) {
  const chainProxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (val: unknown) => void) =>
          resolve({ data: null, error: errorValue });
      }
      return () => chainProxy;
    },
  });
  return chainProxy;
}
```

**Step 2: Write the habits error test**

```ts
it("throws when habits query returns an error", async () => {
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "habits") {
        return createErrorChainMock({ message: "permission denied" });
      }
      return createChainMock({ data: [], error: null });
    }),
  } as any;

  const db = new InsightsDB(supabase);
  await expect(
    db.getWeeklyInsights("user-1", WEEK_START_MONDAY),
  ).rejects.toEqual({ message: "permission denied" });
});
```

**Step 3: Write the logs error test**

```ts
it("throws when habit_logs query returns an error", async () => {
  const habits = [
    {
      id: "h1",
      name: "Test",
      frequency: { type: "daily" },
      status: "active",
      current_streak: 0,
    },
  ];

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "habits") {
        return createChainMock({ data: habits, error: null });
      }
      if (table === "habit_logs") {
        return createErrorChainMock({ message: "timeout" });
      }
      return createChainMock({ data: null, error: null });
    }),
  } as any;

  const db = new InsightsDB(supabase);
  await expect(
    db.getWeeklyInsights("user-1", WEEK_START_MONDAY),
  ).rejects.toEqual({ message: "timeout" });
});
```

**Step 4: Run tests**

Run: `pnpm test:run -- tests/lib/db/insights.test.ts`
Expected: All tests pass (12 original + 2 new error tests + worst_day + best_week = 16 total).

**Step 5: Commit**

```bash
git add tests/lib/db/insights.test.ts
git commit -m "test: add Supabase error propagation tests for InsightsDB"
```

---

### Task 6: Update API route tests for new signature

The API route now accepts `NextRequest` and has auth error handling. Tests need updating.

**Files:**

- Modify: `tests/app/api/insights/weekly.test.ts`

**Step 1: Rewrite the test file**

The key changes:

- `GET()` now takes a `NextRequest` argument
- Auth error returns 500 instead of falling through to 401
- `InsightsDB` is now imported from `@/lib/db` not `@/lib/db/insights`
- Need a helper to create `NextRequest` with optional `date` param

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/insights/weekly/route";

const mockGetWeeklyInsights = vi.fn();
const mockGetProfile = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => ({
        data: { user: { id: "user-123" } },
        error: null,
      })),
    },
  })),
}));

vi.mock("@/lib/db", () => ({
  ProfilesDB: class {
    constructor() {
      return { getProfile: mockGetProfile };
    }
  },
  InsightsDB: class {
    constructor() {
      return { getWeeklyInsights: mockGetWeeklyInsights };
    }
  },
}));

import { createClient } from "@/lib/supabase/server";

function createRequest(date?: string): NextRequest {
  const url = date
    ? `http://localhost/api/insights/weekly?date=${date}`
    : "http://localhost/api/insights/weekly";
  return new NextRequest(url);
}

describe("GET /api/insights/weekly", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: { id: "user-123" } },
          error: null,
        })),
      },
    } as any);
  });

  it("returns insights for authenticated user", async () => {
    const mockInsights = [
      {
        type: "best_habit",
        message: "bestHabit",
        params: { habit: "Meditate", percent: 100 },
        priority: 80,
      },
    ];
    mockGetProfile.mockResolvedValue({
      id: "user-123",
      preferences: { week_start_day: 1 },
    });
    mockGetWeeklyInsights.mockResolvedValue(mockInsights);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.insights).toEqual(mockInsights);
    expect(mockGetWeeklyInsights).toHaveBeenCalledWith(
      "user-123",
      1,
      undefined,
    );
  });

  it("forwards date query param to InsightsDB", async () => {
    mockGetProfile.mockResolvedValue({ preferences: { week_start_day: 0 } });
    mockGetWeeklyInsights.mockResolvedValue([]);

    const response = await GET(createRequest("2026-02-10"));
    expect(response.status).toBe(200);
    expect(mockGetWeeklyInsights).toHaveBeenCalledWith(
      "user-123",
      0,
      "2026-02-10",
    );
  });

  it("returns 401 for unauthenticated user", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: { getUser: vi.fn(() => ({ data: { user: null }, error: null })) },
    } as any);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 500 when auth service fails", async () => {
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn(() => ({
          data: { user: null },
          error: { message: "token expired" },
        })),
      },
    } as any);

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Authentication service error");
  });

  it("defaults to Monday when profile has no week_start_day", async () => {
    mockGetProfile.mockResolvedValue(null);
    mockGetWeeklyInsights.mockResolvedValue([]);

    const response = await GET(createRequest());
    expect(response.status).toBe(200);
    expect(mockGetWeeklyInsights).toHaveBeenCalledWith(
      "user-123",
      1,
      undefined,
    );
  });

  it("returns 500 on internal error", async () => {
    mockGetProfile.mockRejectedValue(new Error("DB error"));

    const response = await GET(createRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Failed to fetch weekly insights");
  });
});
```

**Step 2: Run all tests**

Run: `pnpm test:run -- tests/app/api/insights/weekly.test.ts tests/lib/db/insights.test.ts`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add tests/app/api/insights/weekly.test.ts
git commit -m "test: update API route tests for date param + auth error handling"
```

---

### Task 7: Run full test suite and lint

**Step 1: Run full test suite**

Run: `pnpm test:run`
Expected: All tests pass (except the 2 known pre-existing failures in `habit-logs.test.ts` per issue #98).

**Step 2: Run lint**

Run: `pnpm lint`
Expected: Clean.

**Step 3: Final commit if any lint fixes needed**

```bash
git add -A
git commit -m "fix: address lint issues"
```

---

### Task 8: Push and verify PR

**Step 1: Push to remote**

```bash
git push -u origin claude/resolve-pr-conflict-WoXnr
```

**Step 2: Verify PR #256 status**

Check that the PR CI checks pass and the merge conflict is still resolved.

---

## Summary of what each fix addresses

| Review Issue                                                | Fix Task                                        |
| ----------------------------------------------------------- | ----------------------------------------------- |
| Critical #1: Server-side `new Date()` timezone bug          | Task 1                                          |
| Critical #2: Duplicated `shouldTrackOnDate`                 | Task 2                                          |
| Critical #3: Auth error silently discarded                  | Task 1                                          |
| Important #4: Direct import instead of barrel               | Task 1                                          |
| Important #7: `default: return false` (no exhaustive check) | Task 2 (removed; shared version has no default) |
| Important #9: Duplicated `MILESTONE_THRESHOLDS`             | Task 2                                          |
| Test Gap: `worst_day` untested                              | Task 3                                          |
| Test Gap: `best_week` untested                              | Task 4                                          |
| Test Gap: Error propagation untested                        | Task 5                                          |
| Test: Updated for new route signature                       | Task 6                                          |

### Out of scope for this plan (follow-up)

- **Important #5:** `times_per_week` rate inflation — this is a pre-existing behavior shared across the codebase, not specific to this PR. Should be tracked as a separate issue.
- **Important #8:** `WeeklyInsight` discriminated union type redesign — valuable but scope creep for a review fix. Should be a follow-up PR.
- **Important #6:** Profile fallback logging — minor, and adding `console.warn` for a legitimate default is subjective.
