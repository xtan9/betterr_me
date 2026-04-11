# AI Tool Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand AI chat assistant from 25 to 65 tools, exposing full CRUD operations across all user-facing domains.

**Architecture:** Each domain's tool file gets new `ToolDefinition` entries following the existing pattern: Zod parameters → execute function → DB class call. No new adapters or infrastructure needed — the chat and MCP adapters automatically pick up any tool returned by `getAllTools()`.

**Tech Stack:** TypeScript, Zod, Supabase DB classes, Vitest

---

### Task 1: Habits — 7 new tools + tests

**Files:**
- Modify: `lib/ai/tools/habits.ts`
- Create: `tests/lib/ai/tools/habits.test.ts` (already exists, will be replaced with expanded version)

- [ ] **Step 1: Add 7 new habit tools to `lib/ai/tools/habits.ts`**

Replace the entire file content:

```typescript
import { z } from "zod";
import { HabitsDB, HabitLogsDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function habitTools(): ToolDefinition[] {
  return [
    {
      name: "getHabitsToday",
      description:
        "Get all habits with today's completion status and monthly completion rate",
      parameters: z.object({
        date: z.string().describe("Date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.getHabitsWithTodayStatus(ctx.userId, params.date);
      },
    },
    {
      name: "getHabitStats",
      description: "Get completion statistics for a specific habit",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
        days: z
          .number()
          .optional()
          .describe("Number of days to calculate stats for (default 30)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitLogsDB(ctx.supabase);
        return db.getHabitStats(params.habitId, ctx.userId, params.days);
      },
    },
    {
      name: "logHabit",
      description: "Toggle a habit's completion status for a given date",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
        date: z.string().describe("Date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitLogsDB(ctx.supabase);
        return db.toggleLog(params.habitId, ctx.userId, params.date);
      },
    },
    {
      name: "createHabit",
      description: "Create a new habit with a tracking frequency",
      parameters: z.object({
        name: z.string().describe("Habit name"),
        description: z.string().optional().describe("Habit description"),
        frequency: z.object({
          type: z.enum(["daily", "weekdays", "weekly", "times_per_week", "custom"]).describe("Frequency type"),
          count: z.number().optional().describe("Times per week (only for times_per_week)"),
          days: z.array(z.number()).optional().describe("Custom days (0=Sun, 6=Sat, only for custom)"),
        }).describe("How often to track this habit"),
        categoryId: z.string().optional().describe("Category ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.createHabit({
          user_id: ctx.userId,
          name: params.name,
          description: params.description ?? null,
          frequency: params.frequency as any,
          category_id: params.categoryId ?? null,
        });
      },
    },
    {
      name: "updateHabit",
      description: "Update an existing habit's name, description, frequency, or category",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
        name: z.string().optional().describe("New name"),
        description: z.string().optional().describe("New description"),
        frequency: z.object({
          type: z.enum(["daily", "weekdays", "weekly", "times_per_week", "custom"]),
          count: z.number().optional(),
          days: z.array(z.number()).optional(),
        }).optional().describe("New frequency"),
        categoryId: z.string().optional().describe("New category ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        const { habitId, categoryId, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        if (categoryId !== undefined) updates.category_id = categoryId;
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.updateHabit(habitId, ctx.userId, updates);
      },
    },
    {
      name: "pauseHabit",
      description: "Pause a habit to temporarily stop tracking it",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.pauseHabit(params.habitId, ctx.userId);
      },
    },
    {
      name: "resumeHabit",
      description: "Resume a paused habit",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.resumeHabit(params.habitId, ctx.userId);
      },
    },
    {
      name: "archiveHabit",
      description: "Archive a habit (soft delete, can be restored later)",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        return db.archiveHabit(params.habitId, ctx.userId);
      },
    },
    {
      name: "deleteHabit",
      description: "Permanently delete a habit and all its logs. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new HabitsDB(ctx.supabase);
        await db.deleteHabit(params.habitId, ctx.userId);
        return { success: true };
      },
    },
    {
      name: "getDetailedHabitStats",
      description: "Get detailed habit completion stats broken down by this week, this month, and all time",
      parameters: z.object({
        habitId: z.string().describe("The habit ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const habitsDB = new HabitsDB(ctx.supabase);
        const habit = await habitsDB.getHabit(params.habitId, ctx.userId);
        if (!habit) return { error: "Habit not found" };
        const logsDB = new HabitLogsDB(ctx.supabase);
        return logsDB.getDetailedHabitStats(
          params.habitId,
          ctx.userId,
          habit.frequency,
          habit.created_at,
        );
      },
    },
  ];
}
```

- [ ] **Step 2: Write tests for all habit tools in `tests/lib/ai/tools/habits.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { habitTools } from "@/lib/ai/tools/habits";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetHabitsWithTodayStatus = vi.fn();
const mockGetHabitStats = vi.fn();
const mockToggleLog = vi.fn();
const mockCreateHabit = vi.fn();
const mockUpdateHabit = vi.fn();
const mockPauseHabit = vi.fn();
const mockResumeHabit = vi.fn();
const mockArchiveHabit = vi.fn();
const mockDeleteHabit = vi.fn();
const mockGetHabit = vi.fn();
const mockGetDetailedHabitStats = vi.fn();

vi.mock("@/lib/db", () => ({
  HabitsDB: class {
    getHabitsWithTodayStatus = mockGetHabitsWithTodayStatus;
    getHabit = mockGetHabit;
    createHabit = mockCreateHabit;
    updateHabit = mockUpdateHabit;
    pauseHabit = mockPauseHabit;
    resumeHabit = mockResumeHabit;
    archiveHabit = mockArchiveHabit;
    deleteHabit = mockDeleteHabit;
  },
  HabitLogsDB: class {
    getHabitStats = mockGetHabitStats;
    toggleLog = mockToggleLog;
    getDetailedHabitStats = mockGetDetailedHabitStats;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return habitTools().find((t) => t.name === name)!;
}

describe("habitTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 10 tool definitions", () => {
    const tools = habitTools();
    expect(tools).toHaveLength(10);
    expect(tools.map((t) => t.name)).toEqual([
      "getHabitsToday", "getHabitStats", "logHabit",
      "createHabit", "updateHabit", "pauseHabit", "resumeHabit",
      "archiveHabit", "deleteHabit", "getDetailedHabitStats",
    ]);
  });

  it("getHabitsToday calls HabitsDB.getHabitsWithTodayStatus", async () => {
    const ctx = makeCtx();
    mockGetHabitsWithTodayStatus.mockResolvedValue([{ id: "h1", name: "Meditate", completed_today: true }]);
    const result = await findTool("getHabitsToday").execute({ date: "2026-04-10" }, ctx);
    expect(mockGetHabitsWithTodayStatus).toHaveBeenCalledWith("user-123", "2026-04-10");
    expect(result).toEqual([{ id: "h1", name: "Meditate", completed_today: true }]);
  });

  it("logHabit calls HabitLogsDB.toggleLog", async () => {
    const ctx = makeCtx();
    mockToggleLog.mockResolvedValue({ log: { completed: true }, currentStreak: 5, bestStreak: 10 });
    const result = await findTool("logHabit").execute({ habitId: "h1", date: "2026-04-10" }, ctx);
    expect(mockToggleLog).toHaveBeenCalledWith("h1", "user-123", "2026-04-10");
    expect(result).toEqual({ log: { completed: true }, currentStreak: 5, bestStreak: 10 });
  });

  it("createHabit calls HabitsDB.createHabit with correct params", async () => {
    const ctx = makeCtx();
    mockCreateHabit.mockResolvedValue({ id: "h2", name: "Read" });
    const result = await findTool("createHabit").execute(
      { name: "Read", frequency: { type: "daily" } },
      ctx,
    );
    expect(mockCreateHabit).toHaveBeenCalledWith({
      user_id: "user-123",
      name: "Read",
      description: null,
      frequency: { type: "daily" },
      category_id: null,
    });
    expect(result).toEqual({ id: "h2", name: "Read" });
  });

  it("updateHabit transforms camelCase to snake_case and removes undefined", async () => {
    const ctx = makeCtx();
    mockUpdateHabit.mockResolvedValue({ id: "h1", name: "Meditate more" });
    await findTool("updateHabit").execute(
      { habitId: "h1", name: "Meditate more", categoryId: "cat-1" },
      ctx,
    );
    expect(mockUpdateHabit).toHaveBeenCalledWith("h1", "user-123", {
      name: "Meditate more",
      category_id: "cat-1",
    });
  });

  it("pauseHabit calls HabitsDB.pauseHabit", async () => {
    const ctx = makeCtx();
    mockPauseHabit.mockResolvedValue({ id: "h1", status: "paused" });
    await findTool("pauseHabit").execute({ habitId: "h1" }, ctx);
    expect(mockPauseHabit).toHaveBeenCalledWith("h1", "user-123");
  });

  it("resumeHabit calls HabitsDB.resumeHabit", async () => {
    const ctx = makeCtx();
    mockResumeHabit.mockResolvedValue({ id: "h1", status: "active" });
    await findTool("resumeHabit").execute({ habitId: "h1" }, ctx);
    expect(mockResumeHabit).toHaveBeenCalledWith("h1", "user-123");
  });

  it("archiveHabit calls HabitsDB.archiveHabit", async () => {
    const ctx = makeCtx();
    mockArchiveHabit.mockResolvedValue({ id: "h1", status: "archived" });
    await findTool("archiveHabit").execute({ habitId: "h1" }, ctx);
    expect(mockArchiveHabit).toHaveBeenCalledWith("h1", "user-123");
  });

  it("deleteHabit calls HabitsDB.deleteHabit and returns success", async () => {
    const ctx = makeCtx();
    mockDeleteHabit.mockResolvedValue(undefined);
    const result = await findTool("deleteHabit").execute({ habitId: "h1" }, ctx);
    expect(mockDeleteHabit).toHaveBeenCalledWith("h1", "user-123");
    expect(result).toEqual({ success: true });
  });

  it("getDetailedHabitStats fetches habit then gets detailed stats", async () => {
    const ctx = makeCtx();
    mockGetHabit.mockResolvedValue({ id: "h1", frequency: { type: "daily" }, created_at: "2026-01-01" });
    const stats = { thisWeek: { completed: 5, total: 7, percent: 71 }, thisMonth: { completed: 20, total: 30, percent: 67 }, allTime: { completed: 100, total: 150, percent: 67 } };
    mockGetDetailedHabitStats.mockResolvedValue(stats);
    const result = await findTool("getDetailedHabitStats").execute({ habitId: "h1" }, ctx);
    expect(mockGetHabit).toHaveBeenCalledWith("h1", "user-123");
    expect(mockGetDetailedHabitStats).toHaveBeenCalledWith("h1", "user-123", { type: "daily" }, "2026-01-01");
    expect(result).toEqual(stats);
  });

  it("getDetailedHabitStats returns error when habit not found", async () => {
    const ctx = makeCtx();
    mockGetHabit.mockResolvedValue(null);
    const result = await findTool("getDetailedHabitStats").execute({ habitId: "h999" }, ctx);
    expect(result).toEqual({ error: "Habit not found" });
  });
});
```

- [ ] **Step 3: Run tests to verify**

Run: `pnpm vitest run tests/lib/ai/tools/habits.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/habits.ts tests/lib/ai/tools/habits.test.ts
git commit -m "feat(chat): expand habit tools — create, update, pause, resume, archive, delete, detailed stats"
```

---

### Task 2: Recurring Tasks — 5 new tools + tests

**Files:**
- Modify: `lib/ai/tools/tasks.ts`
- Create: `tests/lib/ai/tools/recurring-tasks.test.ts`

- [ ] **Step 1: Add recurring task tools to `lib/ai/tools/tasks.ts`**

Add `RecurringTasksDB` to the import and add 5 new tools after the existing `deleteTask` tool. Add the new import at line 2:

```typescript
import { TasksDB, RecurringTasksDB } from "@/lib/db";
```

Add these tools to the returned array after the `deleteTask` entry (before the closing `];`):

```typescript
    {
      name: "getRecurringTasks",
      description: "List all recurring tasks with optional status filter",
      parameters: z.object({
        status: z
          .enum(["active", "paused", "archived"])
          .optional()
          .describe("Filter by status (default: all)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RecurringTasksDB(ctx.supabase);
        return db.getUserRecurringTasks(ctx.userId, {
          status: params.status,
        });
      },
    },
    {
      name: "createRecurringTask",
      description:
        "Create a new recurring task that generates instances automatically. Always confirm with the user before calling this tool.",
      parameters: z.object({
        title: z.string().describe("Task title"),
        description: z.string().optional().describe("Task description"),
        priority: z
          .number()
          .optional()
          .describe("Priority level (0=none, 1=low, 2=medium, 3=high)"),
        categoryId: z.string().optional().describe("Category ID"),
        dueTime: z
          .string()
          .optional()
          .describe("Due time in HH:MM format"),
        startDate: z
          .string()
          .describe("Start date in YYYY-MM-DD format"),
        recurrenceRule: z.object({
          frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).describe("Recurrence frequency"),
          interval: z.number().optional().describe("Interval (e.g., every 2 weeks). Default 1"),
          days_of_week: z.array(z.number()).optional().describe("Days of week for weekly (0=Sun, 6=Sat)"),
          day_of_month: z.number().optional().describe("Day of month for monthly (1-31)"),
        }).describe("Recurrence rule"),
        endType: z
          .enum(["never", "after_count", "on_date"])
          .optional()
          .describe("When to stop recurring (default: never)"),
        endDate: z
          .string()
          .optional()
          .describe("End date if endType is on_date"),
        endCount: z
          .number()
          .optional()
          .describe("Number of occurrences if endType is after_count"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RecurringTasksDB(ctx.supabase);
        // Calculate a rolling window end date (30 days from start)
        const throughDate = new Date(params.startDate);
        throughDate.setDate(throughDate.getDate() + 30);
        const throughDateStr = throughDate.toISOString().split("T")[0];

        return db.createRecurringTask(
          {
            user_id: ctx.userId,
            title: params.title,
            description: params.description ?? null,
            priority: (params.priority ?? 0) as 0 | 1 | 2 | 3,
            category_id: params.categoryId ?? null,
            due_time: params.dueTime ?? null,
            start_date: params.startDate,
            recurrence_rule: {
              ...params.recurrenceRule,
              interval: params.recurrenceRule.interval ?? 1,
            } as any,
            end_type: params.endType ?? "never",
            end_date: params.endDate ?? null,
            end_count: params.endCount ?? null,
          },
          throughDateStr,
        );
      },
    },
    {
      name: "updateRecurringTask",
      description: "Update a recurring task's title, description, or priority",
      parameters: z.object({
        recurringTaskId: z.string().describe("The recurring task ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        priority: z
          .number()
          .optional()
          .describe("New priority level (0=none, 1=low, 2=medium, 3=high)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RecurringTasksDB(ctx.supabase);
        const { recurringTaskId, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.updateRecurringTask(recurringTaskId, ctx.userId, updates);
      },
    },
    {
      name: "pauseRecurringTask",
      description: "Pause a recurring task to stop generating new instances",
      parameters: z.object({
        recurringTaskId: z.string().describe("The recurring task ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RecurringTasksDB(ctx.supabase);
        return db.pauseRecurringTask(params.recurringTaskId, ctx.userId);
      },
    },
    {
      name: "deleteRecurringTask",
      description:
        "Delete a recurring task and all its future incomplete instances. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        recurringTaskId: z.string().describe("The recurring task ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RecurringTasksDB(ctx.supabase);
        await db.deleteRecurringTask(params.recurringTaskId, ctx.userId);
        return { success: true };
      },
    },
```

- [ ] **Step 2: Write tests in `tests/lib/ai/tools/recurring-tasks.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { taskTools } from "@/lib/ai/tools/tasks";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetUserRecurringTasks = vi.fn();
const mockCreateRecurringTask = vi.fn();
const mockUpdateRecurringTask = vi.fn();
const mockPauseRecurringTask = vi.fn();
const mockDeleteRecurringTask = vi.fn();

vi.mock("@/lib/db", () => ({
  TasksDB: class {
    getTodayTasks = vi.fn();
    getUpcomingTasks = vi.fn();
    getOverdueTasks = vi.fn();
    getTask = vi.fn();
    getUserTasks = vi.fn();
    createTask = vi.fn();
    toggleTaskCompletion = vi.fn();
    updateTask = vi.fn();
    deleteTask = vi.fn();
  },
  RecurringTasksDB: class {
    getUserRecurringTasks = mockGetUserRecurringTasks;
    createRecurringTask = mockCreateRecurringTask;
    updateRecurringTask = mockUpdateRecurringTask;
    pauseRecurringTask = mockPauseRecurringTask;
    deleteRecurringTask = mockDeleteRecurringTask;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return taskTools().find((t) => t.name === name)!;
}

describe("recurring task tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("taskTools includes recurring task tools", () => {
    const tools = taskTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("getRecurringTasks");
    expect(names).toContain("createRecurringTask");
    expect(names).toContain("updateRecurringTask");
    expect(names).toContain("pauseRecurringTask");
    expect(names).toContain("deleteRecurringTask");
  });

  it("getRecurringTasks calls getUserRecurringTasks", async () => {
    const ctx = makeCtx();
    mockGetUserRecurringTasks.mockResolvedValue([{ id: "rt1", title: "Weekly review" }]);
    const result = await findTool("getRecurringTasks").execute({ status: "active" }, ctx);
    expect(mockGetUserRecurringTasks).toHaveBeenCalledWith("user-123", { status: "active" });
    expect(result).toEqual([{ id: "rt1", title: "Weekly review" }]);
  });

  it("createRecurringTask passes correct params with throughDate", async () => {
    const ctx = makeCtx();
    mockCreateRecurringTask.mockResolvedValue({ id: "rt2", title: "Daily standup" });
    const result = await findTool("createRecurringTask").execute(
      {
        title: "Daily standup",
        startDate: "2026-04-10",
        recurrenceRule: { frequency: "daily", interval: 1 },
      },
      ctx,
    );
    expect(mockCreateRecurringTask).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-123",
        title: "Daily standup",
        start_date: "2026-04-10",
        recurrence_rule: { frequency: "daily", interval: 1 },
        end_type: "never",
      }),
      "2026-05-10",
    );
    expect(result).toEqual({ id: "rt2", title: "Daily standup" });
  });

  it("pauseRecurringTask calls pauseRecurringTask", async () => {
    const ctx = makeCtx();
    mockPauseRecurringTask.mockResolvedValue({ id: "rt1", status: "paused" });
    await findTool("pauseRecurringTask").execute({ recurringTaskId: "rt1" }, ctx);
    expect(mockPauseRecurringTask).toHaveBeenCalledWith("rt1", "user-123");
  });

  it("deleteRecurringTask returns success", async () => {
    const ctx = makeCtx();
    mockDeleteRecurringTask.mockResolvedValue(undefined);
    const result = await findTool("deleteRecurringTask").execute({ recurringTaskId: "rt1" }, ctx);
    expect(mockDeleteRecurringTask).toHaveBeenCalledWith("rt1", "user-123");
    expect(result).toEqual({ success: true });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/lib/ai/tools/recurring-tasks.test.ts tests/lib/ai/tools/tasks.test.ts`
Expected: Recurring tasks tests pass. Existing tasks test will need count updated (9 → 14).

- [ ] **Step 4: Update existing tasks test count**

In `tests/lib/ai/tools/tasks.test.ts`, update line 43-44:
- Change `toHaveLength(9)` to `toHaveLength(14)`
- Add `"getRecurringTasks", "createRecurringTask", "updateRecurringTask", "pauseRecurringTask", "deleteRecurringTask"` to the expected names array

- [ ] **Step 5: Run all tasks tests**

Run: `pnpm vitest run tests/lib/ai/tools/tasks.test.ts tests/lib/ai/tools/recurring-tasks.test.ts`
Expected: All pass.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/tools/tasks.ts tests/lib/ai/tools/tasks.test.ts tests/lib/ai/tools/recurring-tasks.test.ts
git commit -m "feat(chat): add recurring task tools — list, create, update, pause, delete"
```

---

### Task 3: Projects — 4 new tools + tests

**Files:**
- Modify: `lib/ai/tools/projects.ts`
- Create: `tests/lib/ai/tools/projects.test.ts`

- [ ] **Step 1: Expand `lib/ai/tools/projects.ts`**

Replace the entire file:

```typescript
import { z } from "zod";
import { ProjectsDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function projectTools(): ToolDefinition[] {
  return [
    {
      name: "getProjects",
      description:
        "List the user's projects, optionally filtered by section and status",
      parameters: z.object({
        section: z
          .enum(["personal", "work"])
          .optional()
          .describe("Filter by section"),
        status: z
          .enum(["active", "archived"])
          .optional()
          .describe("Filter by status (default: active)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new ProjectsDB(ctx.supabase);
        return db.getUserProjects(ctx.userId, {
          section: params.section,
          status: params.status ?? "active",
        });
      },
    },
    {
      name: "getProject",
      description: "Get a single project by ID",
      parameters: z.object({
        projectId: z.string().describe("The project ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new ProjectsDB(ctx.supabase);
        return db.getProject(params.projectId, ctx.userId);
      },
    },
    {
      name: "createProject",
      description: "Create a new project",
      parameters: z.object({
        name: z.string().describe("Project name"),
        section: z.enum(["personal", "work"]).optional().describe("Section (default: personal)"),
        color: z.string().optional().describe("Color hex code (e.g., #3B82F6)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new ProjectsDB(ctx.supabase);
        return db.createProject({
          user_id: ctx.userId,
          name: params.name,
          section: params.section ?? "personal",
          color: params.color ?? "#3B82F6",
        });
      },
    },
    {
      name: "updateProject",
      description: "Update a project's name, section, color, or status",
      parameters: z.object({
        projectId: z.string().describe("The project ID"),
        name: z.string().optional().describe("New name"),
        section: z.enum(["personal", "work"]).optional().describe("New section"),
        color: z.string().optional().describe("New color"),
        status: z.enum(["active", "archived"]).optional().describe("New status"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new ProjectsDB(ctx.supabase);
        const { projectId, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.updateProject(projectId, ctx.userId, updates);
      },
    },
    {
      name: "deleteProject",
      description: "Delete a project. Tasks in this project will be unassigned. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        projectId: z.string().describe("The project ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new ProjectsDB(ctx.supabase);
        await db.deleteProject(params.projectId, ctx.userId);
        return { success: true };
      },
    },
  ];
}
```

- [ ] **Step 2: Write tests in `tests/lib/ai/tools/projects.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { projectTools } from "@/lib/ai/tools/projects";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetUserProjects = vi.fn();
const mockGetProject = vi.fn();
const mockCreateProject = vi.fn();
const mockUpdateProject = vi.fn();
const mockDeleteProject = vi.fn();

vi.mock("@/lib/db", () => ({
  ProjectsDB: class {
    getUserProjects = mockGetUserProjects;
    getProject = mockGetProject;
    createProject = mockCreateProject;
    updateProject = mockUpdateProject;
    deleteProject = mockDeleteProject;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return projectTools().find((t) => t.name === name)!;
}

describe("projectTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 5 tool definitions", () => {
    const tools = projectTools();
    expect(tools).toHaveLength(5);
    expect(tools.map((t) => t.name)).toEqual([
      "getProjects", "getProject", "createProject", "updateProject", "deleteProject",
    ]);
  });

  it("getProject calls ProjectsDB.getProject", async () => {
    const ctx = makeCtx();
    mockGetProject.mockResolvedValue({ id: "p1", name: "Side hustle" });
    const result = await findTool("getProject").execute({ projectId: "p1" }, ctx);
    expect(mockGetProject).toHaveBeenCalledWith("p1", "user-123");
    expect(result).toEqual({ id: "p1", name: "Side hustle" });
  });

  it("createProject calls ProjectsDB.createProject with defaults", async () => {
    const ctx = makeCtx();
    mockCreateProject.mockResolvedValue({ id: "p2", name: "New proj" });
    await findTool("createProject").execute({ name: "New proj" }, ctx);
    expect(mockCreateProject).toHaveBeenCalledWith({
      user_id: "user-123",
      name: "New proj",
      section: "personal",
      color: "#3B82F6",
    });
  });

  it("updateProject removes undefined values", async () => {
    const ctx = makeCtx();
    mockUpdateProject.mockResolvedValue({ id: "p1", name: "Renamed" });
    await findTool("updateProject").execute({ projectId: "p1", name: "Renamed" }, ctx);
    expect(mockUpdateProject).toHaveBeenCalledWith("p1", "user-123", { name: "Renamed" });
  });

  it("deleteProject returns success", async () => {
    const ctx = makeCtx();
    mockDeleteProject.mockResolvedValue(undefined);
    const result = await findTool("deleteProject").execute({ projectId: "p1" }, ctx);
    expect(mockDeleteProject).toHaveBeenCalledWith("p1", "user-123");
    expect(result).toEqual({ success: true });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/lib/ai/tools/projects.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/projects.ts tests/lib/ai/tools/projects.test.ts
git commit -m "feat(chat): expand project tools — get, create, update, delete"
```

---

### Task 4: Calendar — 2 new tools + tests

**Files:**
- Modify: `lib/ai/tools/calendar.ts`
- Create: `tests/lib/ai/tools/calendar.test.ts`

- [ ] **Step 1: Add updateEvent and deleteEvent to `lib/ai/tools/calendar.ts`**

Add these tools after the `createEvent` entry:

```typescript
    {
      name: "updateEvent",
      description: "Update a calendar event's details",
      parameters: z.object({
        eventId: z.string().describe("The event ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        startDate: z.string().optional().describe("New start date in YYYY-MM-DD format"),
        endDate: z.string().optional().describe("New end date in YYYY-MM-DD format"),
        startTime: z.string().optional().describe("New start time in HH:MM format"),
        endTime: z.string().optional().describe("New end time in HH:MM format"),
        location: z.string().optional().describe("New location"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new CalendarEventsDB(ctx.supabase);
        const { eventId, startDate, endDate, startTime, endTime, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        if (startDate !== undefined) updates.start_date = startDate;
        if (endDate !== undefined) updates.end_date = endDate;
        if (startTime !== undefined) updates.start_time = startTime;
        if (endTime !== undefined) updates.end_time = endTime;
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.updateEvent(eventId, ctx.userId, updates);
      },
    },
    {
      name: "deleteEvent",
      description: "Delete a calendar event. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        eventId: z.string().describe("The event ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new CalendarEventsDB(ctx.supabase);
        await db.deleteEvent(params.eventId, ctx.userId);
        return { success: true };
      },
    },
```

- [ ] **Step 2: Write tests in `tests/lib/ai/tools/calendar.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { calendarTools } from "@/lib/ai/tools/calendar";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetUserEvents = vi.fn();
const mockCreateEvent = vi.fn();
const mockUpdateEvent = vi.fn();
const mockDeleteEvent = vi.fn();

vi.mock("@/lib/db", () => ({
  CalendarEventsDB: class {
    getUserEvents = mockGetUserEvents;
    createEvent = mockCreateEvent;
    updateEvent = mockUpdateEvent;
    deleteEvent = mockDeleteEvent;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return calendarTools().find((t) => t.name === name)!;
}

describe("calendarTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 4 tool definitions", () => {
    const tools = calendarTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      "getUpcomingEvents", "createEvent", "updateEvent", "deleteEvent",
    ]);
  });

  it("updateEvent transforms camelCase params to snake_case", async () => {
    const ctx = makeCtx();
    mockUpdateEvent.mockResolvedValue({ id: "e1", title: "Updated" });
    await findTool("updateEvent").execute(
      { eventId: "e1", title: "Updated", startDate: "2026-04-15" },
      ctx,
    );
    expect(mockUpdateEvent).toHaveBeenCalledWith("e1", "user-123", {
      title: "Updated",
      start_date: "2026-04-15",
    });
  });

  it("deleteEvent returns success", async () => {
    const ctx = makeCtx();
    mockDeleteEvent.mockResolvedValue(undefined);
    const result = await findTool("deleteEvent").execute({ eventId: "e1" }, ctx);
    expect(mockDeleteEvent).toHaveBeenCalledWith("e1", "user-123");
    expect(result).toEqual({ success: true });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/lib/ai/tools/calendar.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/calendar.ts tests/lib/ai/tools/calendar.test.ts
git commit -m "feat(chat): add calendar update and delete event tools"
```

---

### Task 5: Reminders — 3 new tools + tests

**Files:**
- Modify: `lib/ai/tools/reminders.ts`
- Create: `tests/lib/ai/tools/reminders.test.ts`

- [ ] **Step 1: Expand `lib/ai/tools/reminders.ts`**

Replace the entire file:

```typescript
import { z } from "zod";
import { RemindersDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function reminderTools(): ToolDefinition[] {
  return [
    {
      name: "getUpcomingReminders",
      description: "Get pending reminders that haven't been sent yet",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        const tomorrow = new Date(ctx.date + "T23:59:59");
        tomorrow.setDate(tomorrow.getDate() + 1);
        const all = await db.getPendingReminders(tomorrow.toISOString());
        return all.filter((r) => r.user_id === ctx.userId);
      },
    },
    {
      name: "createReminder",
      description: "Create a standalone reminder at a specific date and time",
      parameters: z.object({
        title: z.string().describe("Reminder title/message"),
        fireAt: z.string().describe("When to fire the reminder (ISO datetime, e.g., 2026-04-10T09:00:00)"),
        sourceType: z
          .enum(["calendar_event", "task", "habit", "bill"])
          .optional()
          .describe("What this reminder is for"),
        sourceId: z.string().optional().describe("ID of the related item"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        return db.createReminder(ctx.userId, {
          source_type: params.sourceType ?? "task",
          source_id: params.sourceId ?? "",
          reminder_type: "absolute",
          relative_minutes: null,
          absolute_time: params.fireAt,
          channels: ["push"],
          fire_at: params.fireAt,
        });
      },
    },
    {
      name: "dismissReminder",
      description: "Dismiss a reminder or snooze it to a later time",
      parameters: z.object({
        reminderId: z.string().describe("The reminder ID"),
        snoozeUntil: z
          .string()
          .optional()
          .describe("If provided, snooze until this ISO datetime instead of dismissing"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        if (params.snoozeUntil) {
          return db.updateReminder(ctx.userId, params.reminderId, {
            status: "pending",
            fire_at: params.snoozeUntil,
          });
        }
        return db.updateReminderStatus(ctx.userId, params.reminderId, "sent");
      },
    },
    {
      name: "deleteReminder",
      description: "Delete a reminder permanently",
      parameters: z.object({
        reminderId: z.string().describe("The reminder ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new RemindersDB(ctx.supabase);
        await db.deleteReminder(ctx.userId, params.reminderId);
        return { success: true };
      },
    },
  ];
}
```

- [ ] **Step 2: Write tests in `tests/lib/ai/tools/reminders.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { reminderTools } from "@/lib/ai/tools/reminders";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetPendingReminders = vi.fn();
const mockCreateReminder = vi.fn();
const mockUpdateReminderStatus = vi.fn();
const mockUpdateReminder = vi.fn();
const mockDeleteReminder = vi.fn();

vi.mock("@/lib/db", () => ({
  RemindersDB: class {
    getPendingReminders = mockGetPendingReminders;
    createReminder = mockCreateReminder;
    updateReminderStatus = mockUpdateReminderStatus;
    updateReminder = mockUpdateReminder;
    deleteReminder = mockDeleteReminder;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return reminderTools().find((t) => t.name === name)!;
}

describe("reminderTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 4 tool definitions", () => {
    const tools = reminderTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      "getUpcomingReminders", "createReminder", "dismissReminder", "deleteReminder",
    ]);
  });

  it("createReminder calls RemindersDB.createReminder with correct params", async () => {
    const ctx = makeCtx();
    mockCreateReminder.mockResolvedValue({ id: "r1" });
    await findTool("createReminder").execute(
      { title: "Call dentist", fireAt: "2026-04-10T09:00:00" },
      ctx,
    );
    expect(mockCreateReminder).toHaveBeenCalledWith("user-123", {
      source_type: "task",
      source_id: "",
      reminder_type: "absolute",
      relative_minutes: null,
      absolute_time: "2026-04-10T09:00:00",
      channels: ["push"],
      fire_at: "2026-04-10T09:00:00",
    });
  });

  it("dismissReminder dismisses by setting status to sent", async () => {
    const ctx = makeCtx();
    mockUpdateReminderStatus.mockResolvedValue({ id: "r1", status: "sent" });
    await findTool("dismissReminder").execute({ reminderId: "r1" }, ctx);
    expect(mockUpdateReminderStatus).toHaveBeenCalledWith("user-123", "r1", "sent");
  });

  it("dismissReminder snoozes when snoozeUntil is provided", async () => {
    const ctx = makeCtx();
    mockUpdateReminder.mockResolvedValue({ id: "r1", status: "pending" });
    await findTool("dismissReminder").execute(
      { reminderId: "r1", snoozeUntil: "2026-04-10T14:00:00" },
      ctx,
    );
    expect(mockUpdateReminder).toHaveBeenCalledWith("user-123", "r1", {
      status: "pending",
      fire_at: "2026-04-10T14:00:00",
    });
  });

  it("deleteReminder returns success", async () => {
    const ctx = makeCtx();
    mockDeleteReminder.mockResolvedValue(undefined);
    const result = await findTool("deleteReminder").execute({ reminderId: "r1" }, ctx);
    expect(mockDeleteReminder).toHaveBeenCalledWith("user-123", "r1");
    expect(result).toEqual({ success: true });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/lib/ai/tools/reminders.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/reminders.ts tests/lib/ai/tools/reminders.test.ts
git commit -m "feat(chat): expand reminder tools — create, dismiss/snooze, delete"
```

---

### Task 6: Journal — 1 new tool + tests

**Files:**
- Modify: `lib/ai/tools/journal.ts`
- Create: `tests/lib/ai/tools/journal.test.ts`

- [ ] **Step 1: Add deleteJournalEntry to `lib/ai/tools/journal.ts`**

Add this tool after the `createJournalEntry` entry:

```typescript
    {
      name: "deleteJournalEntry",
      description: "Delete a journal entry. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        entryId: z.string().describe("The journal entry ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new JournalEntriesDB(ctx.supabase);
        await db.deleteEntry(params.entryId, ctx.userId);
        return { success: true };
      },
    },
```

- [ ] **Step 2: Write tests in `tests/lib/ai/tools/journal.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { journalTools } from "@/lib/ai/tools/journal";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetEntryByDate = vi.fn();
const mockGetTimeline = vi.fn();
const mockUpsertEntry = vi.fn();
const mockDeleteEntry = vi.fn();

vi.mock("@/lib/db", () => ({
  JournalEntriesDB: class {
    getEntryByDate = mockGetEntryByDate;
    getTimeline = mockGetTimeline;
    upsertEntry = mockUpsertEntry;
    deleteEntry = mockDeleteEntry;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return journalTools().find((t) => t.name === name)!;
}

describe("journalTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 4 tool definitions", () => {
    const tools = journalTools();
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      "getTodayJournal", "getRecentJournal", "createJournalEntry", "deleteJournalEntry",
    ]);
  });

  it("deleteJournalEntry calls deleteEntry and returns success", async () => {
    const ctx = makeCtx();
    mockDeleteEntry.mockResolvedValue(undefined);
    const result = await findTool("deleteJournalEntry").execute({ entryId: "j1" }, ctx);
    expect(mockDeleteEntry).toHaveBeenCalledWith("j1", "user-123");
    expect(result).toEqual({ success: true });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/lib/ai/tools/journal.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/journal.ts tests/lib/ai/tools/journal.test.ts
git commit -m "feat(chat): add journal delete tool"
```

---

### Task 7: Money — 10 new tools + tests

**Files:**
- Modify: `lib/ai/tools/money.ts`
- Create: `tests/lib/ai/tools/money.test.ts`

- [ ] **Step 1: Add 10 new money tools to `lib/ai/tools/money.ts`**

Update the import to include the new DB classes:

```typescript
import { TransactionsDB, BudgetsDB, MoneyAccountsDB, SavingsGoalsDB, RecurringBillsDB } from "@/lib/db";
```

Add these tools after the `addTransaction` entry:

```typescript
    {
      name: "updateTransaction",
      description: "Update a transaction's category or notes",
      parameters: z.object({
        transactionId: z.string().describe("The transaction ID"),
        categoryId: z.string().optional().describe("New category ID"),
        notes: z.string().optional().describe("New notes"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new TransactionsDB(ctx.supabase);
        const { transactionId, categoryId, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        if (categoryId !== undefined) updates.category_id = categoryId;
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.update(transactionId, updates as any);
      },
    },
    {
      name: "getAccounts",
      description: "List all financial accounts (bank accounts, credit cards, cash)",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new MoneyAccountsDB(ctx.supabase);
        return db.getByHousehold(ctx.householdId);
      },
    },
    {
      name: "getSavingsGoals",
      description: "List all savings goals with progress",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new SavingsGoalsDB(ctx.supabase);
        return db.getByHousehold(ctx.householdId);
      },
    },
    {
      name: "createSavingsGoal",
      description: "Create a new savings goal. Always confirm with the user first.",
      parameters: z.object({
        name: z.string().describe("Goal name (e.g., 'Emergency Fund')"),
        targetCents: z.number().describe("Target amount in cents (e.g., 100000 for $1000)"),
        targetDate: z.string().optional().describe("Target date in YYYY-MM-DD format"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new SavingsGoalsDB(ctx.supabase);
        return db.create({
          household_id: ctx.householdId,
          owner_id: ctx.userId,
          name: params.name,
          target_cents: params.targetCents,
          current_cents: 0,
          target_date: params.targetDate ?? null,
          is_shared: false,
          linked_account_id: null,
        });
      },
    },
    {
      name: "updateSavingsGoal",
      description: "Update a savings goal's name, target, or date",
      parameters: z.object({
        goalId: z.string().describe("The savings goal ID"),
        name: z.string().optional().describe("New name"),
        targetCents: z.number().optional().describe("New target in cents"),
        targetDate: z.string().optional().describe("New target date"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new SavingsGoalsDB(ctx.supabase);
        const { goalId, targetCents, targetDate, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        if (targetCents !== undefined) updates.target_cents = targetCents;
        if (targetDate !== undefined) updates.target_date = targetDate;
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.update(goalId, updates as any);
      },
    },
    {
      name: "deleteSavingsGoal",
      description: "Delete a savings goal and all its contributions. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        goalId: z.string().describe("The savings goal ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new SavingsGoalsDB(ctx.supabase);
        await db.delete(params.goalId);
        return { success: true };
      },
    },
    {
      name: "addSavingsContribution",
      description: "Add money toward a savings goal. Always confirm with the user first.",
      parameters: z.object({
        goalId: z.string().describe("The savings goal ID"),
        amountCents: z.number().describe("Amount in cents to add"),
        note: z.string().optional().describe("Note for this contribution"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new SavingsGoalsDB(ctx.supabase);
        return db.addContribution(params.goalId, params.amountCents, params.note);
      },
    },
    {
      name: "getRecurringBills",
      description: "List all recurring bills and subscriptions",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new RecurringBillsDB(ctx.supabase);
        return db.getByHousehold(ctx.householdId);
      },
    },
    {
      name: "getSpendingTrends",
      description: "Get spending trends by category across the last N months",
      parameters: z.object({
        months: z.number().optional().describe("Number of months to analyze (default 3)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        if (!ctx.householdId) return { error: "No household found" };
        const db = new BudgetsDB(ctx.supabase);
        return db.getSpendingTrends(ctx.householdId, params.months ?? 3);
      },
    },
```

- [ ] **Step 2: Write tests in `tests/lib/ai/tools/money.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { moneyTools } from "@/lib/ai/tools/money";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetByHousehold = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockGetByMonth = vi.fn();
const mockGetSpendingByCategory = vi.fn();
const mockGetSpendingTrends = vi.fn();
const mockGetAccountsByHousehold = vi.fn();
const mockGetGoalsByHousehold = vi.fn();
const mockCreateGoal = vi.fn();
const mockUpdateGoal = vi.fn();
const mockDeleteGoal = vi.fn();
const mockAddContribution = vi.fn();
const mockGetBillsByHousehold = vi.fn();

vi.mock("@/lib/db", () => ({
  TransactionsDB: class {
    getByHousehold = mockGetByHousehold;
    create = mockCreate;
    update = mockUpdate;
  },
  BudgetsDB: class {
    getByMonth = mockGetByMonth;
    getSpendingByCategory = mockGetSpendingByCategory;
    getSpendingTrends = mockGetSpendingTrends;
  },
  MoneyAccountsDB: class {
    getByHousehold = mockGetAccountsByHousehold;
  },
  SavingsGoalsDB: class {
    getByHousehold = mockGetGoalsByHousehold;
    create = mockCreateGoal;
    update = mockUpdateGoal;
    delete = mockDeleteGoal;
    addContribution = mockAddContribution;
  },
  RecurringBillsDB: class {
    getByHousehold = mockGetBillsByHousehold;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    householdId: "hh-1",
    ...overrides,
  };
}

function findTool(name: string) {
  return moneyTools().find((t) => t.name === name)!;
}

describe("moneyTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 13 tool definitions", () => {
    const tools = moneyTools();
    expect(tools).toHaveLength(13);
  });

  it("updateTransaction returns error when no household", async () => {
    const ctx = makeCtx({ householdId: undefined });
    const result = await findTool("updateTransaction").execute({ transactionId: "t1", notes: "test" }, ctx);
    expect(result).toEqual({ error: "No household found" });
  });

  it("updateTransaction calls TransactionsDB.update", async () => {
    const ctx = makeCtx();
    mockUpdate.mockResolvedValue({ id: "t1" });
    await findTool("updateTransaction").execute({ transactionId: "t1", notes: "Updated" }, ctx);
    expect(mockUpdate).toHaveBeenCalledWith("t1", { notes: "Updated" });
  });

  it("getAccounts calls MoneyAccountsDB.getByHousehold", async () => {
    const ctx = makeCtx();
    mockGetAccountsByHousehold.mockResolvedValue([{ id: "a1", name: "Chequing" }]);
    const result = await findTool("getAccounts").execute({}, ctx);
    expect(mockGetAccountsByHousehold).toHaveBeenCalledWith("hh-1");
    expect(result).toEqual([{ id: "a1", name: "Chequing" }]);
  });

  it("getSavingsGoals calls SavingsGoalsDB.getByHousehold", async () => {
    const ctx = makeCtx();
    mockGetGoalsByHousehold.mockResolvedValue([{ id: "g1", name: "Emergency Fund" }]);
    const result = await findTool("getSavingsGoals").execute({}, ctx);
    expect(mockGetGoalsByHousehold).toHaveBeenCalledWith("hh-1");
    expect(result).toEqual([{ id: "g1", name: "Emergency Fund" }]);
  });

  it("createSavingsGoal passes correct params", async () => {
    const ctx = makeCtx();
    mockCreateGoal.mockResolvedValue({ id: "g2" });
    await findTool("createSavingsGoal").execute(
      { name: "Vacation", targetCents: 500000 },
      ctx,
    );
    expect(mockCreateGoal).toHaveBeenCalledWith({
      household_id: "hh-1",
      owner_id: "user-123",
      name: "Vacation",
      target_cents: 500000,
      current_cents: 0,
      target_date: null,
      is_shared: false,
      linked_account_id: null,
    });
  });

  it("deleteSavingsGoal returns success", async () => {
    const ctx = makeCtx();
    mockDeleteGoal.mockResolvedValue(undefined);
    const result = await findTool("deleteSavingsGoal").execute({ goalId: "g1" }, ctx);
    expect(mockDeleteGoal).toHaveBeenCalledWith("g1");
    expect(result).toEqual({ success: true });
  });

  it("addSavingsContribution calls addContribution", async () => {
    const ctx = makeCtx();
    mockAddContribution.mockResolvedValue({ id: "c1" });
    await findTool("addSavingsContribution").execute(
      { goalId: "g1", amountCents: 10000, note: "Monthly" },
      ctx,
    );
    expect(mockAddContribution).toHaveBeenCalledWith("g1", 10000, "Monthly");
  });

  it("getRecurringBills calls RecurringBillsDB.getByHousehold", async () => {
    const ctx = makeCtx();
    mockGetBillsByHousehold.mockResolvedValue([{ id: "b1", name: "Netflix" }]);
    const result = await findTool("getRecurringBills").execute({}, ctx);
    expect(mockGetBillsByHousehold).toHaveBeenCalledWith("hh-1");
    expect(result).toEqual([{ id: "b1", name: "Netflix" }]);
  });

  it("getSpendingTrends defaults to 3 months", async () => {
    const ctx = makeCtx();
    mockGetSpendingTrends.mockResolvedValue([]);
    await findTool("getSpendingTrends").execute({}, ctx);
    expect(mockGetSpendingTrends).toHaveBeenCalledWith("hh-1", 3);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/lib/ai/tools/money.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/money.ts tests/lib/ai/tools/money.test.ts
git commit -m "feat(chat): expand money tools — update transaction, accounts, savings goals, bills, trends"
```

---

### Task 8: Workouts — 6 new tools + tests

**Files:**
- Modify: `lib/ai/tools/workouts.ts`
- Create: `tests/lib/ai/tools/workouts.test.ts`

- [ ] **Step 1: Expand `lib/ai/tools/workouts.ts`**

Replace the entire file:

```typescript
import { z } from "zod";
import { WorkoutsDB, ExercisesDB, RoutinesDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function workoutTools(): ToolDefinition[] {
  return [
    {
      name: "getRecentWorkouts",
      description: "Get recent completed workouts with exercise summaries",
      parameters: z.object({
        limit: z
          .number()
          .optional()
          .describe("Number of workouts to return (default 5)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.getWorkoutsWithSummary(ctx.userId, {
          limit: params.limit ?? 5,
        });
      },
    },
    {
      name: "getActiveWorkout",
      description: "Get the user's currently active (in-progress) workout",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.getActiveWorkout(ctx.userId);
      },
    },
    {
      name: "startWorkout",
      description: "Start a new workout session. Only one active workout is allowed at a time. Always confirm with the user first.",
      parameters: z.object({
        name: z.string().optional().describe("Workout name (default: 'Workout')"),
        routineId: z.string().optional().describe("Start from a routine template"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.startWorkout(ctx.userId, {
          title: params.name,
          routine_id: params.routineId,
        });
      },
    },
    {
      name: "completeWorkout",
      description: "Complete an active workout",
      parameters: z.object({
        workoutId: z.string().describe("The workout ID"),
        notes: z.string().optional().describe("Notes about the workout"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.updateWorkout(params.workoutId, {
          status: "completed",
          notes: params.notes ?? null,
        });
      },
    },
    {
      name: "getWorkoutDetails",
      description: "Get full workout details with all exercises and sets",
      parameters: z.object({
        workoutId: z.string().describe("The workout ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.getWorkoutWithExercises(params.workoutId);
      },
    },
    {
      name: "getExercises",
      description: "List all available exercises (presets and custom)",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new ExercisesDB(ctx.supabase);
        return db.getAllExercises();
      },
    },
    {
      name: "getRoutines",
      description: "List the user's workout routines with exercises",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new RoutinesDB(ctx.supabase);
        return db.getUserRoutines(ctx.userId);
      },
    },
    {
      name: "getExerciseHistory",
      description: "Get performance history for a specific exercise across past workouts",
      parameters: z.object({
        exerciseId: z.string().describe("The exercise ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new WorkoutsDB(ctx.supabase);
        return db.getExerciseHistory(params.exerciseId, ctx.userId);
      },
    },
  ];
}
```

- [ ] **Step 2: Write tests in `tests/lib/ai/tools/workouts.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { workoutTools } from "@/lib/ai/tools/workouts";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetWorkoutsWithSummary = vi.fn();
const mockGetActiveWorkout = vi.fn();
const mockStartWorkout = vi.fn();
const mockUpdateWorkout = vi.fn();
const mockGetWorkoutWithExercises = vi.fn();
const mockGetAllExercises = vi.fn();
const mockGetUserRoutines = vi.fn();
const mockGetExerciseHistory = vi.fn();

vi.mock("@/lib/db", () => ({
  WorkoutsDB: class {
    getWorkoutsWithSummary = mockGetWorkoutsWithSummary;
    getActiveWorkout = mockGetActiveWorkout;
    startWorkout = mockStartWorkout;
    updateWorkout = mockUpdateWorkout;
    getWorkoutWithExercises = mockGetWorkoutWithExercises;
    getExerciseHistory = mockGetExerciseHistory;
  },
  ExercisesDB: class {
    getAllExercises = mockGetAllExercises;
  },
  RoutinesDB: class {
    getUserRoutines = mockGetUserRoutines;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return workoutTools().find((t) => t.name === name)!;
}

describe("workoutTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 8 tool definitions", () => {
    const tools = workoutTools();
    expect(tools).toHaveLength(8);
    expect(tools.map((t) => t.name)).toEqual([
      "getRecentWorkouts", "getActiveWorkout", "startWorkout", "completeWorkout",
      "getWorkoutDetails", "getExercises", "getRoutines", "getExerciseHistory",
    ]);
  });

  it("startWorkout calls WorkoutsDB.startWorkout", async () => {
    const ctx = makeCtx();
    mockStartWorkout.mockResolvedValue({ id: "w1", status: "in_progress" });
    const result = await findTool("startWorkout").execute({ name: "Push day" }, ctx);
    expect(mockStartWorkout).toHaveBeenCalledWith("user-123", { title: "Push day", routine_id: undefined });
    expect(result).toEqual({ id: "w1", status: "in_progress" });
  });

  it("completeWorkout sets status to completed", async () => {
    const ctx = makeCtx();
    mockUpdateWorkout.mockResolvedValue({ id: "w1", status: "completed" });
    await findTool("completeWorkout").execute({ workoutId: "w1", notes: "Great session" }, ctx);
    expect(mockUpdateWorkout).toHaveBeenCalledWith("w1", { status: "completed", notes: "Great session" });
  });

  it("getWorkoutDetails calls getWorkoutWithExercises", async () => {
    const ctx = makeCtx();
    mockGetWorkoutWithExercises.mockResolvedValue({ id: "w1", exercises: [] });
    const result = await findTool("getWorkoutDetails").execute({ workoutId: "w1" }, ctx);
    expect(mockGetWorkoutWithExercises).toHaveBeenCalledWith("w1");
    expect(result).toEqual({ id: "w1", exercises: [] });
  });

  it("getExercises calls ExercisesDB.getAllExercises", async () => {
    const ctx = makeCtx();
    mockGetAllExercises.mockResolvedValue([{ id: "ex1", name: "Bench Press" }]);
    const result = await findTool("getExercises").execute({}, ctx);
    expect(mockGetAllExercises).toHaveBeenCalled();
    expect(result).toEqual([{ id: "ex1", name: "Bench Press" }]);
  });

  it("getRoutines calls RoutinesDB.getUserRoutines", async () => {
    const ctx = makeCtx();
    mockGetUserRoutines.mockResolvedValue([{ id: "r1", name: "PPL - Push" }]);
    const result = await findTool("getRoutines").execute({}, ctx);
    expect(mockGetUserRoutines).toHaveBeenCalledWith("user-123");
    expect(result).toEqual([{ id: "r1", name: "PPL - Push" }]);
  });

  it("getExerciseHistory calls WorkoutsDB.getExerciseHistory", async () => {
    const ctx = makeCtx();
    mockGetExerciseHistory.mockResolvedValue([{ workout_id: "w1", sets: [] }]);
    const result = await findTool("getExerciseHistory").execute({ exerciseId: "ex1" }, ctx);
    expect(mockGetExerciseHistory).toHaveBeenCalledWith("ex1", "user-123");
    expect(result).toEqual([{ workout_id: "w1", sets: [] }]);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/lib/ai/tools/workouts.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/workouts.ts tests/lib/ai/tools/workouts.test.ts
git commit -m "feat(chat): expand workout tools — start, complete, exercises, routines, history"
```

---

### Task 9: Categories — new file with 2 tools + tests

**Files:**
- Create: `lib/ai/tools/categories.ts`
- Create: `tests/lib/ai/tools/categories.test.ts`

- [ ] **Step 1: Create `lib/ai/tools/categories.ts`**

```typescript
import { z } from "zod";
import { CategoriesDB } from "@/lib/db";
import type { ToolDefinition, ToolContext } from "./types";

export function categoryTools(): ToolDefinition[] {
  return [
    {
      name: "getCategories",
      description: "List all user categories (used for tasks, habits, etc.)",
      parameters: z.object({}),
      execute: async (_params, ctx: ToolContext) => {
        const db = new CategoriesDB(ctx.supabase);
        return db.getUserCategories(ctx.userId);
      },
    },
    {
      name: "createCategory",
      description: "Create a new category for organizing tasks and habits",
      parameters: z.object({
        name: z.string().describe("Category name"),
        color: z.string().describe("Color hex code (e.g., #3B82F6)"),
        icon: z.string().optional().describe("Icon name"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new CategoriesDB(ctx.supabase);
        return db.createCategory({
          user_id: ctx.userId,
          name: params.name,
          color: params.color,
          icon: params.icon ?? null,
          sort_order: 0,
        });
      },
    },
  ];
}
```

- [ ] **Step 2: Write tests in `tests/lib/ai/tools/categories.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { categoryTools } from "@/lib/ai/tools/categories";
import type { ToolContext } from "@/lib/ai/tools/types";

const mockGetUserCategories = vi.fn();
const mockCreateCategory = vi.fn();

vi.mock("@/lib/db", () => ({
  CategoriesDB: class {
    getUserCategories = mockGetUserCategories;
    createCategory = mockCreateCategory;
  },
}));

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    userId: "user-123",
    supabase: {} as ToolContext["supabase"],
    date: "2026-04-10",
    timezone: "America/Toronto",
    ...overrides,
  };
}

function findTool(name: string) {
  return categoryTools().find((t) => t.name === name)!;
}

describe("categoryTools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 2 tool definitions", () => {
    const tools = categoryTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name)).toEqual(["getCategories", "createCategory"]);
  });

  it("getCategories calls CategoriesDB.getUserCategories", async () => {
    const ctx = makeCtx();
    mockGetUserCategories.mockResolvedValue([{ id: "c1", name: "Health" }]);
    const result = await findTool("getCategories").execute({}, ctx);
    expect(mockGetUserCategories).toHaveBeenCalledWith("user-123");
    expect(result).toEqual([{ id: "c1", name: "Health" }]);
  });

  it("createCategory calls CategoriesDB.createCategory", async () => {
    const ctx = makeCtx();
    mockCreateCategory.mockResolvedValue({ id: "c2", name: "Fitness" });
    const result = await findTool("createCategory").execute(
      { name: "Fitness", color: "#EF4444" },
      ctx,
    );
    expect(mockCreateCategory).toHaveBeenCalledWith({
      user_id: "user-123",
      name: "Fitness",
      color: "#EF4444",
      icon: null,
      sort_order: 0,
    });
    expect(result).toEqual({ id: "c2", name: "Fitness" });
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm vitest run tests/lib/ai/tools/categories.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/tools/categories.ts tests/lib/ai/tools/categories.test.ts
git commit -m "feat(chat): add category tools — list and create"
```

---

### Task 10: Register categories + update system prompt + tool labels

**Files:**
- Modify: `lib/ai/tools/index.ts`
- Modify: `lib/ai/system-prompt.ts`
- Modify: `components/chat/tool-call-indicator.tsx`

- [ ] **Step 1: Register categoryTools in `lib/ai/tools/index.ts`**

Add the import after line 13:

```typescript
import { categoryTools } from "./categories";
```

Add `...categoryTools(),` to the `getAllTools()` array after `...reminderTools(),`.

- [ ] **Step 2: Update system prompt in `lib/ai/system-prompt.ts`**

Replace the entire function body:

```typescript
export function buildSystemPrompt({
  date,
  timezone,
}: {
  date: string;
  timezone: string;
}): string {
  return `You are a helpful AI assistant in BetterR.Me, a personal productivity and finance app.
You are powered by Claude from Anthropic. Be concise, friendly, and helpful.

Current date: ${date} (${timezone})

You have access to tools that can read and modify the user's data across:
- **Habits**: view, create, update, pause, resume, archive, delete, track completion, view stats
- **Tasks**: view, create, update, toggle, delete; manage recurring tasks (create, pause, delete)
- **Projects**: view, create, update, delete
- **Calendar**: view events, create, update, delete events
- **Reminders**: view, create, dismiss/snooze, delete
- **Journal**: read, write, delete entries
- **Finances**: view transactions, accounts, budgets, savings goals, recurring bills, spending trends; add/update transactions; manage savings goals and contributions
- **Workouts**: view recent/active workouts, start/complete workouts, browse exercises and routines, view exercise history
- **Categories**: view and create categories for organizing tasks and habits

Use these tools proactively when the user asks about their data — don't say "I don't have access to your data."

For destructive or high-risk actions (any delete, addTransaction, addSavingsContribution, createRecurringTask, startWorkout), always describe what you'll do and ask for confirmation before calling the tool.

When displaying data, format it clearly with markdown. Use bullet points for lists.`;
}
```

- [ ] **Step 3: Add all new tool labels to `components/chat/tool-call-indicator.tsx`**

Add these entries to the `TOOL_LABELS` object after the existing entries:

```typescript
  // Habit CRUD
  createHabit: "Creating habit",
  updateHabit: "Updating habit",
  pauseHabit: "Pausing habit",
  resumeHabit: "Resuming habit",
  archiveHabit: "Archiving habit",
  deleteHabit: "Deleting habit",
  getDetailedHabitStats: "Analyzing habit stats",
  // Recurring tasks
  getRecurringTasks: "Looking up recurring tasks",
  createRecurringTask: "Creating recurring task",
  updateRecurringTask: "Updating recurring task",
  pauseRecurringTask: "Pausing recurring task",
  deleteRecurringTask: "Deleting recurring task",
  // Projects
  getProject: "Looking up project",
  createProject: "Creating project",
  updateProject: "Updating project",
  deleteProject: "Deleting project",
  // Calendar
  updateEvent: "Updating event",
  deleteEvent: "Deleting event",
  // Reminders
  createReminder: "Creating reminder",
  dismissReminder: "Dismissing reminder",
  deleteReminder: "Deleting reminder",
  // Journal
  deleteJournalEntry: "Deleting journal entry",
  // Money
  updateTransaction: "Updating transaction",
  getAccounts: "Looking up accounts",
  getSavingsGoals: "Looking up savings goals",
  createSavingsGoal: "Creating savings goal",
  updateSavingsGoal: "Updating savings goal",
  deleteSavingsGoal: "Deleting savings goal",
  addSavingsContribution: "Adding to savings",
  getRecurringBills: "Looking up recurring bills",
  getSpendingTrends: "Analyzing spending trends",
  // Workouts
  startWorkout: "Starting workout",
  completeWorkout: "Completing workout",
  getWorkoutDetails: "Loading workout details",
  getExercises: "Looking up exercises",
  getRoutines: "Looking up routines",
  getExerciseHistory: "Checking exercise history",
  // Categories
  getCategories: "Looking up categories",
  createCategory: "Creating category",
```

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: No lint errors.

- [ ] **Step 5: Run all tool tests**

Run: `pnpm vitest run tests/lib/ai/tools/`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/tools/index.ts lib/ai/system-prompt.ts components/chat/tool-call-indicator.tsx
git commit -m "feat(chat): register category tools, update system prompt and tool labels for all 40 new tools"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test:run`
Expected: All tests pass (including existing tests).

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No lint errors.

- [ ] **Step 3: Build check**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Verify tool count**

Run a quick Node check to verify 65 tools total:
```bash
node -e "
  // Dynamic import to verify tool count
  import('@/lib/ai/tools/index.js').then(m => {
    console.log('Total tools:', m.getAllTools().length);
  });
"
```
Or just count by reading the source files.

- [ ] **Step 5: Commit any fixes and create PR**
