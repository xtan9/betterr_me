# Split Oversized Component Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split 10 component files (>400 lines) into smaller, focused files without changing any behavior.

**Architecture:** Extract co-located components (skeletons, sub-components) to their own files, extract heavy state logic into custom hooks, and decompose the CSV import wizard into a subdirectory with per-step components. All existing tests must pass unchanged — only import paths may need updating.

**Tech Stack:** Next.js 16, React, TypeScript, SWR, react-hook-form, Vitest

---

## File Map

### New files to create:

| File | Responsibility |
|------|---------------|
| `components/dashboard/dashboard-skeleton.tsx` | Loading skeleton for dashboard |
| `components/dashboard/use-dashboard-dismissals.ts` | localStorage dismiss state (absence, motivation, milestones, insights) |
| `components/calendar/use-calendar-navigation.ts` | URL-based navigation (prev/next/today/setView) |
| `components/calendar/use-calendar-events.ts` | Event creation/editing state + handlers |
| `components/tasks/section-block.tsx` | Section block component (Personal/Work) |
| `components/tasks/tasks-page-skeleton.tsx` | Loading skeleton for tasks page |
| `components/tasks/task-detail-skeleton.tsx` | Loading skeleton for task detail |
| `components/tasks/task-details-grid.tsx` | Category/priority/due date/time detail grid |
| `components/habits/habit-detail-skeleton.tsx` | Loading skeleton + formatFrequency helper |
| `components/money/csv-import/csv-import-dialog.tsx` | Wizard orchestrator (state + step routing) |
| `components/money/csv-import/csv-upload-step.tsx` | Step 1: file upload + account selection |
| `components/money/csv-import/csv-mapping-step.tsx` | Step 2: column mapping |
| `components/money/csv-import/csv-preview-step.tsx` | Step 3: preview mapped rows |
| `components/money/csv-import/csv-result-step.tsx` | Step 4: importing/result |
| `components/money/csv-import/types.ts` | Shared types for CSV import wizard |
| `components/kanban/kanban-info-card.tsx` | Status/priority/due-date/project info grid |
| `components/kanban/kanban-footer-bar.tsx` | Save status indicator + delete action |
| `components/chat/use-chat-persistence.ts` | Message persistence effect + conversation creation |
| `components/money/budget-summary-card.tsx` | Budget ring + totals summary card |
| `components/money/budget-category-grid.tsx` | Budget category cards grid |
| `components/money/goal-create-edit-dialog.tsx` | Create/edit goal form dialog |
| `components/money/contribute-dialog.tsx` | Savings contribution dialog |

### Files to modify (trim down):

| File | What gets removed |
|------|------------------|
| `components/dashboard/dashboard-content.tsx` | Skeleton + dismiss logic |
| `components/calendar/calendar-page-content.tsx` | Navigation + event-creation handlers |
| `components/tasks/tasks-page-content.tsx` | SectionBlock + skeleton |
| `components/tasks/task-detail-content.tsx` | Skeleton + details grid |
| `components/habits/habit-detail-content.tsx` | Skeleton + formatFrequency |
| `components/money/csv-import-dialog.tsx` | Replaced by csv-import/ directory (delete original) |
| `components/kanban/kanban-detail-modal.tsx` | Info card + footer bar |
| `components/chat/chat-content.tsx` | Persistence effect |
| `components/money/budget-overview.tsx` | Summary card + category grid |
| `components/money/goal-form.tsx` | Create/edit dialog + contribute dialog |

### Files to update imports:

| File | Import change |
|------|--------------|
| `app/money/transactions/page.tsx` | `@/components/money/csv-import-dialog` → `@/components/money/csv-import/csv-import-dialog` |
| `tests/components/money/csv-import-dialog.test.tsx` | Same import path update |

---

### Task 1: Extract DashboardSkeleton + useDashboardDismissals

**Files:**
- Create: `components/dashboard/dashboard-skeleton.tsx`
- Create: `components/dashboard/use-dashboard-dismissals.ts`
- Modify: `components/dashboard/dashboard-content.tsx`

- [ ] **Step 1: Create `dashboard-skeleton.tsx`**

Cut the `DashboardSkeleton` function (lines 540-598) from `dashboard-content.tsx` and place it in its own file:

```tsx
// components/dashboard/dashboard-skeleton.tsx
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-section-gap" data-testid="dashboard-skeleton">
      {/* Greeting skeleton */}
      <Card>
        <CardContent className="flex items-center gap-3 py-0">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div>
            <Skeleton className="h-9 w-full max-w-64" />
            <Skeleton className="mt-2 h-5 w-full max-w-96" />
          </div>
        </CardContent>
      </Card>

      {/* Motivation skeleton */}
      <Card>
        <CardContent className="py-4">
          <Skeleton className="h-16 w-full rounded-lg" />
        </CardContent>
      </Card>

      {/* Stats skeleton */}
      <div className="flex flex-col gap-card-gap">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-card-gap">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Content grid skeleton */}
      <div className="grid gap-card-gap xl:grid-cols-2">
        <Card>
          <div className="p-card-padding space-y-4">
            <div className="flex justify-between">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-9 w-24" />
            </div>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </Card>
        <Card>
          <div className="p-card-padding space-y-4">
            <div className="flex justify-between">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-9 w-24" />
            </div>
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `use-dashboard-dismissals.ts`**

Extract the dismiss state logic (absence, motivation, milestones, weekly insight) into a custom hook:

```ts
// components/dashboard/use-dashboard-dismissals.ts
import { useState, useCallback } from "react";

interface DashboardDismissals {
  dismissedAbsenceIds: Set<string>;
  handleDismissAbsence: (habitId: string) => void;
  dismissedMotivation: boolean;
  handleDismissMotivation: () => void;
  dismissedMilestoneIds: Set<string>;
  handleDismissMilestone: (milestoneId: string) => void;
  insightDismissed: boolean;
  handleDismissInsight: () => void;
}

function readLocalStorageSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(key);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
}

function readLocalStorageBool(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

export function useDashboardDismissals(
  today: string,
  dismissKey: string,
): DashboardDismissals {
  const [dismissedAbsenceIds, setDismissedAbsenceIds] = useState<Set<string>>(
    () => readLocalStorageSet(`absence-dismissed-${today}`),
  );

  const handleDismissAbsence = useCallback(
    (habitId: string) => {
      setDismissedAbsenceIds((prev) => {
        const next = new Set(prev);
        next.add(habitId);
        localStorage.setItem(
          `absence-dismissed-${today}`,
          JSON.stringify([...next]),
        );
        return next;
      });
    },
    [today],
  );

  const [dismissedMotivation, setDismissedMotivation] = useState<boolean>(() =>
    readLocalStorageBool(`motivation-dismissed-${today}`),
  );

  const handleDismissMotivation = useCallback(() => {
    setDismissedMotivation(true);
    try {
      localStorage.setItem(`motivation-dismissed-${today}`, "true");
    } catch {
      // Storage unavailable (private browsing, quota exceeded)
    }
  }, [today]);

  const [dismissedMilestoneIds, setDismissedMilestoneIds] = useState<
    Set<string>
  >(() => readLocalStorageSet(`milestones-dismissed-${today}`));

  const handleDismissMilestone = useCallback(
    (milestoneId: string) => {
      setDismissedMilestoneIds((prev) => {
        const next = new Set(prev);
        next.add(milestoneId);
        try {
          localStorage.setItem(
            `milestones-dismissed-${today}`,
            JSON.stringify([...next]),
          );
        } catch {
          // Storage unavailable (private browsing, quota exceeded)
        }
        return next;
      });
    },
    [today],
  );

  const [insightDismissed, setInsightDismissed] = useState(() =>
    readLocalStorageBool(dismissKey),
  );

  const handleDismissInsight = useCallback(() => {
    setInsightDismissed(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(dismissKey, "true");
    }
  }, [dismissKey]);

  return {
    dismissedAbsenceIds,
    handleDismissAbsence,
    dismissedMotivation,
    handleDismissMotivation,
    dismissedMilestoneIds,
    handleDismissMilestone,
    insightDismissed,
    handleDismissInsight,
  };
}
```

- [ ] **Step 3: Update `dashboard-content.tsx` to use the extracted pieces**

Replace the inline skeleton and dismiss state with imports:

1. Add imports at top:
```tsx
import { DashboardSkeleton } from "./dashboard-skeleton";
import { useDashboardDismissals } from "./use-dashboard-dismissals";
```

2. Remove the `DashboardSkeleton` function definition (lines 540-598).

3. Replace the 4 dismiss `useState`/`useCallback` blocks (lines 87-189) with a single hook call:
```tsx
const {
  dismissedAbsenceIds,
  handleDismissAbsence,
  dismissedMotivation,
  handleDismissMotivation,
  dismissedMilestoneIds,
  handleDismissMilestone,
  insightDismissed,
  handleDismissInsight,
} = useDashboardDismissals(today, dismissKey);
```

Keep `getWeekKey`, `EMPTY_DASHBOARD`, `dismissKey` computation, and `insightsData` SWR fetch in the main file — they depend on component-level state.

- [ ] **Step 4: Run tests**

Run: `pnpm test:run -- tests/app/dashboard/dashboard-content.test.tsx`
Expected: All tests pass (no behavioral change).

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/dashboard-skeleton.tsx components/dashboard/use-dashboard-dismissals.ts components/dashboard/dashboard-content.tsx
git commit -m "refactor(dashboard): extract skeleton and dismiss logic from dashboard-content"
```

---

### Task 2: Extract useCalendarNavigation + useCalendarEvents

**Files:**
- Create: `components/calendar/use-calendar-navigation.ts`
- Create: `components/calendar/use-calendar-events.ts`
- Modify: `components/calendar/calendar-page-content.tsx`

- [ ] **Step 1: Create `use-calendar-navigation.ts`**

Extract URL param reading, date parsing, and navigation functions:

```ts
// components/calendar/use-calendar-navigation.ts
import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { getLocalDateString } from "@/lib/utils";

export interface CalendarNavigation {
  view: string;
  dateParam: string;
  year: number;
  month: number;
  currentDate: Date;
  goToToday: () => void;
  goToPrev: () => void;
  goToNext: () => void;
  setView: (newView: string) => void;
  navigateToDate: (date: Date | undefined) => void;
  handleDayClick: (date: Date) => void;
  updateParams: (updates: Record<string, string>, options?: { replace?: boolean }) => void;
}

export function useCalendarNavigation(weekStartDay: number): CalendarNavigation {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read URL state
  const validViews = ["month", "week", "day"];
  const viewParam = searchParams.get("view");
  const rawView = viewParam || "month";
  const view = validViews.includes(rawView) ? rawView : "month";

  const rawDate = searchParams.get("date") || "";
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const dateParam = dateRegex.test(rawDate) ? rawDate : getLocalDateString();

  const [year, month] = useMemo(() => {
    const parts = dateParam.split("-").map(Number);
    return [parts[0], parts[1] - 1] as const;
  }, [dateParam]);

  const currentDate = useMemo(() => {
    const parts = dateParam.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }, [dateParam]);

  const updateParams = useCallback(
    (updates: Record<string, string>, options?: { replace?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        params.set(key, value);
      }
      const url = `${pathname}?${params.toString()}`;
      if (options?.replace) {
        router.replace(url);
      } else {
        router.push(url);
      }
    },
    [searchParams, router, pathname],
  );

  const goToToday = useCallback(() => {
    updateParams({ date: getLocalDateString() });
  }, [updateParams]);

  const goToPrev = useCallback(() => {
    if (view === "day") {
      const prev = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 1);
      updateParams({ date: getLocalDateString(prev) });
    } else if (view === "week") {
      const prev = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7);
      updateParams({ date: getLocalDateString(prev) });
    } else {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      updateParams({ date: getLocalDateString(new Date(prevYear, prevMonth, 1)) });
    }
  }, [view, currentDate, month, year, updateParams]);

  const goToNext = useCallback(() => {
    if (view === "day") {
      const next = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1);
      updateParams({ date: getLocalDateString(next) });
    } else if (view === "week") {
      const next = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7);
      updateParams({ date: getLocalDateString(next) });
    } else {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      updateParams({ date: getLocalDateString(new Date(nextYear, nextMonth, 1)) });
    }
  }, [view, currentDate, month, year, updateParams]);

  const setView = useCallback(
    (newView: string) => {
      if (newView) updateParams({ view: newView });
    },
    [updateParams],
  );

  const navigateToDate = useCallback(
    (date: Date | undefined) => {
      if (date) updateParams({ date: getLocalDateString(date) });
    },
    [updateParams],
  );

  const handleDayClick = useCallback(
    (date: Date) => {
      updateParams({ view: "day", date: getLocalDateString(date) });
    },
    [updateParams],
  );

  return {
    view,
    dateParam,
    year,
    month,
    currentDate,
    goToToday,
    goToPrev,
    goToNext,
    setView,
    navigateToDate,
    handleDayClick,
    updateParams,
  };
}
```

- [ ] **Step 2: Create `use-calendar-events.ts`**

Extract event creation/editing state and handlers:

```ts
// components/calendar/use-calendar-events.ts
import { useState, useCallback } from "react";
import { getLocalDateString } from "@/lib/utils";
import type { ExpandedCalendarEvent } from "@/lib/calendar/recurrence";
import type { DomainCalendarEvent } from "@/lib/calendar/feed-types";

export interface QuickCreateState {
  isOpen: boolean;
  date: string;
  startTime: string;
  endTime: string;
  anchorPosition: { x: number; y: number };
}

export interface EventDialogState {
  isOpen: boolean;
  event?: ExpandedCalendarEvent | null;
  prefill?: {
    title?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
  };
}

interface CalendarEventActions {
  quickCreate: QuickCreateState | null;
  setQuickCreate: (state: QuickCreateState | null) => void;
  eventDialog: EventDialogState | null;
  setEventDialog: (state: EventDialogState | null) => void;
  isOverlayOpen: boolean;
  handleTimeSlotClick: (date: Date, time: string, position: { x: number; y: number }) => void;
  handleDragSelect: (date: Date, startTime: string, endTime: string, position: { x: number; y: number }) => void;
  handleEventClick: (event: ExpandedCalendarEvent) => void;
  handleNewEvent: () => void;
  handleQuickCreateMoreOptions: (title: string) => void;
  handleEventSaved: () => void;
}

export function useCalendarEvents(
  dateParam: string,
  handleItemAction: (event: ExpandedCalendarEvent | DomainCalendarEvent) => void,
  onEventSaved: () => void,
): CalendarEventActions {
  const [quickCreate, setQuickCreate] = useState<QuickCreateState | null>(null);
  const [eventDialog, setEventDialog] = useState<EventDialogState | null>(null);

  const isOverlayOpen = !!(quickCreate?.isOpen || eventDialog?.isOpen);

  const handleTimeSlotClick = useCallback(
    (date: Date, time: string, position: { x: number; y: number }) => {
      const [h, m] = time.split(":").map(Number);
      const endMinutes = h * 60 + m + 30;
      const endH = Math.floor(endMinutes / 60) % 24;
      const endM = endMinutes % 60;
      const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;

      setQuickCreate({
        isOpen: true,
        date: getLocalDateString(date),
        startTime: time,
        endTime,
        anchorPosition: position,
      });
    },
    [],
  );

  const handleDragSelect = useCallback(
    (date: Date, startTime: string, endTime: string, position: { x: number; y: number }) => {
      setQuickCreate({
        isOpen: true,
        date: getLocalDateString(date),
        startTime,
        endTime,
        anchorPosition: position,
      });
    },
    [],
  );

  const handleEventClick = useCallback(
    (event: ExpandedCalendarEvent) => {
      const domainEvent = event as DomainCalendarEvent;
      if (domainEvent._domain && domainEvent._domain !== "events") {
        handleItemAction(event);
        return;
      }
      setEventDialog({ isOpen: true, event });
    },
    [handleItemAction],
  );

  const handleNewEvent = useCallback(() => {
    setEventDialog({
      isOpen: true,
      event: null,
      prefill: { date: dateParam },
    });
  }, [dateParam]);

  const handleQuickCreateMoreOptions = useCallback(
    (title: string) => {
      if (quickCreate) {
        setQuickCreate(null);
        setEventDialog({
          isOpen: true,
          event: null,
          prefill: {
            title,
            date: quickCreate.date,
            startTime: quickCreate.startTime,
            endTime: quickCreate.endTime,
          },
        });
      }
    },
    [quickCreate],
  );

  const handleEventSaved = useCallback(() => {
    onEventSaved();
  }, [onEventSaved]);

  return {
    quickCreate,
    setQuickCreate,
    eventDialog,
    setEventDialog,
    isOverlayOpen,
    handleTimeSlotClick,
    handleDragSelect,
    handleEventClick,
    handleNewEvent,
    handleQuickCreateMoreOptions,
    handleEventSaved,
  };
}
```

- [ ] **Step 3: Update `calendar-page-content.tsx`**

1. Add imports:
```tsx
import { useCalendarNavigation } from "./use-calendar-navigation";
import { useCalendarEvents } from "./use-calendar-events";
```

2. Replace inline navigation logic (lines 47-317) with:
```tsx
const {
  view, dateParam, year, month, currentDate,
  goToToday, goToPrev, goToNext, setView,
  navigateToDate, handleDayClick, updateParams,
} = useCalendarNavigation(weekStartDay);
```

3. Keep the `useEffect` for default view routing (it uses `updateParams` from the hook — pass `viewParam` check inline).

4. Replace event creation state/handlers (lines 319-425) with:
```tsx
const {
  quickCreate, setQuickCreate,
  eventDialog, setEventDialog,
  isOverlayOpen,
  handleTimeSlotClick, handleDragSelect,
  handleEventClick, handleNewEvent,
  handleQuickCreateMoreOptions, handleEventSaved,
} = useCalendarEvents(dateParam, handleItemAction, () => {
  globalMutate(`/api/calendar-events?start_date=${startDate}&end_date=${endDate}`);
});
```

5. Remove the inline function definitions that were moved to hooks.

- [ ] **Step 4: Run tests**

Run: `pnpm test:run -- tests/components/calendar/calendar-page-content-default-view.test.tsx`
Expected: All tests pass.

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add components/calendar/use-calendar-navigation.ts components/calendar/use-calendar-events.ts components/calendar/calendar-page-content.tsx
git commit -m "refactor(calendar): extract navigation and event hooks from calendar-page-content"
```

---

### Task 3: Extract SectionBlock + TasksPageSkeleton

**Files:**
- Create: `components/tasks/section-block.tsx`
- Create: `components/tasks/tasks-page-skeleton.tsx`
- Modify: `components/tasks/tasks-page-content.tsx`

- [ ] **Step 1: Create `tasks-page-skeleton.tsx`**

Cut the `TasksPageSkeleton` function (lines 543-562) from `tasks-page-content.tsx`:

```tsx
// components/tasks/tasks-page-skeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeaderSkeleton } from "@/components/layouts/page-header";

export function TasksPageSkeleton() {
  return (
    <div className="flex flex-col gap-section-gap" data-testid="tasks-skeleton">
      <PageHeaderSkeleton hasActions />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-64" />
      </div>
      <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `section-block.tsx`**

Cut the `SectionBlock` component + its props interface (lines 425-537) from `tasks-page-content.tsx`:

```tsx
// components/tasks/section-block.tsx
"use client";

import { useTranslations } from "next-intl";
import { TaskCard } from "./task-card";
import { TaskEmptyState } from "./task-empty-state";
import { ProjectCard } from "@/components/projects/project-card";
import type { Task, Project, TaskSection, Category } from "@/lib/db/types";

type StatusTab = "pending" | "completed";

interface SectionBlockProps {
  section: TaskSection;
  tasks: Task[];
  allTasks: Task[];
  projects: Project[];
  categories: Category[];
  activeTab: StatusTab;
  onToggle: (taskId: string) => Promise<void>;
  onTaskClick: (taskId: string) => void;
  onCreateTask: (section?: TaskSection) => void;
  onEditProject: (project: Project) => void;
  onArchiveProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
}

export function SectionBlock({
  section,
  tasks,
  allTasks,
  projects,
  categories,
  activeTab,
  onToggle,
  onTaskClick,
  onCreateTask,
  onEditProject,
  onArchiveProject,
  onDeleteProject,
}: SectionBlockProps) {
  const t = useTranslations("tasks");

  const sectionTasks = tasks.filter((t) => t.section === section);
  const standaloneTasks = sectionTasks.filter((t) => !t.project_id);
  const sectionProjects = projects.filter((p) => p.section === section);
  const allSectionTasks = allTasks.filter((t) => t.section === section);

  const isEmpty = standaloneTasks.length === 0 && sectionProjects.length === 0;
  const showProjects = activeTab === "pending" && sectionProjects.length > 0;
  const showLabels = standaloneTasks.length > 0 && showProjects;

  return (
    <div className="flex flex-col gap-card-gap">
      <h2 className="text-lg font-semibold tracking-tight">
        {t(`sections.${section}`)}
      </h2>

      {isEmpty ? (
        <TaskEmptyState variant="no_tasks" onCreateTask={() => onCreateTask(section)} />
      ) : (
        <div className="flex flex-col gap-card-gap">
          {standaloneTasks.length > 0 && (
            <div className="space-y-2">
              {showLabels && (
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("sections.tasksLabel")}
                </h3>
              )}
              <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
                {standaloneTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    categories={categories}
                    onToggle={() => onToggle(task.id)}
                    onClick={() => onTaskClick(task.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {showProjects && (
            <div className="space-y-2">
              {showLabels && (
                <h3 className="text-sm font-medium text-muted-foreground">
                  {t("sections.projectsLabel")}
                </h3>
              )}
              <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
                {sectionProjects.map((project) => {
                  const projectTasks = allSectionTasks.filter(
                    (t) => t.project_id === project.id,
                  );
                  return (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      tasks={projectTasks}
                      onEdit={onEditProject}
                      onArchive={onArchiveProject}
                      onDelete={onDeleteProject}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update `tasks-page-content.tsx`**

1. Add imports:
```tsx
import { SectionBlock } from "./section-block";
import { TasksPageSkeleton } from "./tasks-page-skeleton";
```

2. Remove the `StatusTab` type alias (it's now defined in `section-block.tsx` — but it's also used in `tasks-page-content.tsx` state). **Keep** `StatusTab` in `tasks-page-content.tsx` as well, or export it from `section-block.tsx` and import it. Simplest: keep it duplicated in both files since it's a trivial type alias.

3. Remove the `SectionBlock` component and its `SectionBlockProps` interface (lines 425-537).

4. Remove the `TasksPageSkeleton` function (lines 543-562).

- [ ] **Step 4: Run tests**

Run: `pnpm test:run -- tests/components/tasks/tasks-page-content.test.tsx`
Expected: All tests pass.

- [ ] **Step 5: Run lint**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 6: Commit**

```bash
git add components/tasks/section-block.tsx components/tasks/tasks-page-skeleton.tsx components/tasks/tasks-page-content.tsx
git commit -m "refactor(tasks): extract SectionBlock and skeleton from tasks-page-content"
```

---

### Task 4: Extract HabitDetailSkeleton + formatFrequency

**Files:**
- Create: `components/habits/habit-detail-skeleton.tsx`
- Modify: `components/habits/habit-detail-content.tsx`

- [ ] **Step 1: Create `habit-detail-skeleton.tsx`**

Cut `HabitDetailSkeleton` (lines 62-106) and `formatFrequency` (lines 108-126):

```tsx
// components/habits/habit-detail-skeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeaderSkeleton } from "@/components/layouts/page-header";
import type { Habit } from "@/lib/db/types";

export function HabitDetailSkeleton() {
  return (
    <div className="flex flex-col gap-section-gap" data-testid="habit-detail-skeleton">
      <div>
        <Skeleton className="h-4 w-40 mb-2" />
        <PageHeaderSkeleton hasActions />
      </div>
      <Card className="max-w-3xl">
        <CardContent className="space-y-6 pt-card-padding">
          <div>
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-32 rounded-xl" />
            <Skeleton className="h-32 rounded-xl" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="size-8 rounded-md" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function formatFrequency(
  frequency: Habit["frequency"],
  t: (key: string, values?: Record<string, unknown>) => string,
): string {
  switch (frequency.type) {
    case "daily":
      return t("frequency.daily");
    case "weekdays":
      return t("frequency.weekdays");
    case "weekly":
      return t("frequency.weekly");
    case "times_per_week":
      return t("frequency.timesPerWeek", { count: frequency.count });
    case "custom":
      return t("frequency.custom");
    default:
      return "";
  }
}
```

- [ ] **Step 2: Update `habit-detail-content.tsx`**

1. Add imports:
```tsx
import { HabitDetailSkeleton } from "./habit-detail-skeleton";
import { formatFrequency } from "./habit-detail-skeleton";
```

2. Remove the inline `HabitDetailSkeleton` function (lines 62-106) and `formatFrequency` function (lines 108-126).

- [ ] **Step 3: Run tests**

Run: `pnpm test:run -- tests/app/habits/habit-detail-page.test.tsx`
Expected: All tests pass.

- [ ] **Step 4: Run lint and commit**

```bash
pnpm lint
git add components/habits/habit-detail-skeleton.tsx components/habits/habit-detail-content.tsx
git commit -m "refactor(habits): extract skeleton and formatFrequency from habit-detail-content"
```

---

### Task 5: Decompose CSV Import Dialog into subdirectory

**Files:**
- Create: `components/money/csv-import/types.ts`
- Create: `components/money/csv-import/csv-upload-step.tsx`
- Create: `components/money/csv-import/csv-mapping-step.tsx`
- Create: `components/money/csv-import/csv-preview-step.tsx`
- Create: `components/money/csv-import/csv-result-step.tsx`
- Create: `components/money/csv-import/csv-import-dialog.tsx`
- Delete: `components/money/csv-import-dialog.tsx`
- Modify: `app/money/transactions/page.tsx`

- [ ] **Step 1: Create `types.ts`**

```ts
// components/money/csv-import/types.ts
export type ColumnMapping = Record<string, string | null>;

export interface ImportResult {
  imported: number;
  duplicates_skipped: number;
}

export interface CsvImportState {
  step: number;
  setStep: (step: number) => void;
  file: File | null;
  parsedHeaders: string[];
  parsedRows: Record<string, string>[];
  columnMapping: ColumnMapping;
  updateMapping: (targetField: string, csvHeader: string | null) => void;
  flipSign: boolean;
  setFlipSign: (value: boolean) => void;
  selectedAccountId: string;
  setSelectedAccountId: (id: string) => void;
  importResult: ImportResult | null;
  isImporting: boolean;
  parseError: string | null;
  canProceedToPreview: boolean;
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  getMappedRows: () => Array<{
    transaction_date: string;
    amount: number;
    description: string;
    merchant_name: string | null;
    category: string | null;
  }>;
  handleImport: () => Promise<void>;
  allAccounts: Array<{ id: string; name: string; mask: string | null }>;
}
```

- [ ] **Step 2: Create `csv-upload-step.tsx`**

```tsx
// components/money/csv-import/csv-upload-step.tsx
"use client";

import { useTranslations } from "next-intl";
import { Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CsvImportState } from "./types";

type UploadStepProps = Pick<
  CsvImportState,
  | "file"
  | "parseError"
  | "handleFileInputChange"
  | "handleDrop"
  | "handleDragOver"
  | "flipSign"
  | "setFlipSign"
  | "selectedAccountId"
  | "setSelectedAccountId"
  | "allAccounts"
>;

export function CsvUploadStep({
  file,
  parseError,
  handleFileInputChange,
  handleDrop,
  handleDragOver,
  flipSign,
  setFlipSign,
  selectedAccountId,
  setSelectedAccountId,
  allAccounts,
}: UploadStepProps) {
  const t = useTranslations("money.csvImport");

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-money-border p-8 transition-colors hover:border-money-accent"
      >
        <Upload className="text-muted-foreground mb-2 size-8" />
        <Label htmlFor="csv-file-input" className="cursor-pointer font-medium">
          {t("selectFile")}
        </Label>
        <p className="text-muted-foreground text-sm">{t("dragDrop")}</p>
        <input
          id="csv-file-input"
          type="file"
          accept=".csv,.tsv,.txt"
          className="hidden"
          onChange={handleFileInputChange}
        />
        {file && <p className="mt-2 text-sm font-medium">{file.name}</p>}
      </div>

      {parseError && <p className="text-sm text-red-500">{parseError}</p>}

      <div className="space-y-2">
        <Label>{t("selectAccount")}</Label>
        <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("selectAccount")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cash">Cash</SelectItem>
            {allAccounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name}
                {account.mask ? ` (${account.mask})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="flip-sign"
          checked={flipSign}
          onCheckedChange={(checked) => setFlipSign(checked === true)}
        />
        <div className="grid gap-1">
          <Label htmlFor="flip-sign">{t("flipSign")}</Label>
          <p className="text-muted-foreground text-xs">{t("flipSignHelp")}</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `csv-mapping-step.tsx`**

```tsx
// components/money/csv-import/csv-mapping-step.tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TARGET_FIELDS } from "@/lib/money/csv-import";
import type { ColumnMapping } from "./types";

interface CsvMappingStepProps {
  parsedHeaders: string[];
  parsedRows: Record<string, string>[];
  columnMapping: ColumnMapping;
  updateMapping: (targetField: string, csvHeader: string | null) => void;
  canProceedToPreview: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function CsvMappingStep({
  parsedHeaders,
  parsedRows,
  columnMapping,
  updateMapping,
  canProceedToPreview,
  onBack,
  onNext,
}: CsvMappingStepProps) {
  const t = useTranslations("money.csvImport");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-field-gap">
        {TARGET_FIELDS.map((field) => {
          const isRequired =
            field === "transaction_date" ||
            field === "amount" ||
            field === "description";
          return (
            <div key={field} className="flex items-center gap-3">
              <Label className="min-w-32 text-sm">
                {field}
                {isRequired && <span className="ml-1 text-red-500">*</span>}
              </Label>
              <Select
                value={columnMapping[field] ?? "__skip__"}
                onValueChange={(val) =>
                  updateMapping(field, val === "__skip__" ? null : val)
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("mapColumn")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__skip__">{t("skip")}</SelectItem>
                  {parsedHeaders.map((header) => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      {parsedRows.length > 0 && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                {TARGET_FIELDS.filter((f) => columnMapping[f]).map((f) => (
                  <th key={f} className="px-2 py-1 text-left">
                    {f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsedRows.slice(0, 3).map((row, i) => (
                <tr key={i} className="border-t">
                  {TARGET_FIELDS.filter((f) => columnMapping[f]).map((f) => (
                    <td key={f} className="px-2 py-1">
                      {columnMapping[f] ? row[columnMapping[f]!] : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!canProceedToPreview && (
        <p className="text-sm text-red-500">{t("requiredFields")}</p>
      )}

      <DialogFooter className="flex justify-between sm:justify-between">
        <Button variant="outline" onClick={onBack}>
          {t("back")}
        </Button>
        <Button onClick={onNext} disabled={!canProceedToPreview}>
          {t("next")}
        </Button>
      </DialogFooter>
    </div>
  );
}
```

- [ ] **Step 4: Create `csv-preview-step.tsx`**

```tsx
// components/money/csv-import/csv-preview-step.tsx
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

interface MappedRow {
  transaction_date: string;
  amount: number;
  description: string;
  merchant_name: string | null;
  category: string | null;
}

interface CsvPreviewStepProps {
  mappedRows: MappedRow[];
  accountName: string;
  onBack: () => void;
  onImport: () => void;
}

export function CsvPreviewStep({
  mappedRows,
  accountName,
  onBack,
  onImport,
}: CsvPreviewStepProps) {
  const t = useTranslations("money.csvImport");
  const previewRows = mappedRows.slice(0, 20);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {t("importingTo", { count: mappedRows.length, account: accountName })}
      </p>

      {previewRows.length < mappedRows.length && (
        <p className="text-muted-foreground text-xs">
          {t("previewNote", {
            count: previewRows.length,
            total: mappedRows.length,
          })}
        </p>
      )}

      <div className="max-h-64 overflow-auto rounded border">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-right">Amount</th>
              <th className="px-2 py-1 text-left">Description</th>
              <th className="px-2 py-1 text-left">Merchant</th>
              <th className="px-2 py-1 text-left">Category</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, i) => (
              <tr key={i} className="border-t">
                <td className="px-2 py-1">{row.transaction_date}</td>
                <td className="px-2 py-1 text-right">
                  {isNaN(row.amount) ? "" : row.amount.toFixed(2)}
                </td>
                <td className="max-w-48 truncate px-2 py-1">
                  {row.description}
                </td>
                <td className="px-2 py-1">{row.merchant_name ?? ""}</td>
                <td className="px-2 py-1">{row.category ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DialogFooter className="flex justify-between sm:justify-between">
        <Button variant="outline" onClick={onBack}>
          {t("back")}
        </Button>
        <Button onClick={onImport}>{t("import")}</Button>
      </DialogFooter>
    </div>
  );
}
```

- [ ] **Step 5: Create `csv-result-step.tsx`**

```tsx
// components/money/csv-import/csv-result-step.tsx
"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportResult } from "./types";

interface CsvResultStepProps {
  isImporting: boolean;
  importResult: ImportResult | null;
  onClose: () => void;
  onBack: () => void;
}

export function CsvResultStep({
  isImporting,
  importResult,
  onClose,
  onBack,
}: CsvResultStepProps) {
  const t = useTranslations("money.csvImport");

  return (
    <div className="flex flex-col items-center space-y-4 py-8">
      {isImporting ? (
        <>
          <Loader2 className="text-money-accent size-8 animate-spin" />
          <p className="text-muted-foreground text-sm">{t("importing")}</p>
        </>
      ) : importResult ? (
        <>
          <p className="text-lg font-medium">
            {t("importSuccess", { count: importResult.imported })}
          </p>
          {importResult.duplicates_skipped > 0 && (
            <p className="text-muted-foreground text-sm">
              {t("duplicatesSkipped", {
                count: importResult.duplicates_skipped,
              })}
            </p>
          )}
          <Button onClick={onClose}>{t("back")}</Button>
        </>
      ) : (
        <>
          <p className="text-sm text-red-500">{t("importError")}</p>
          <Button variant="outline" onClick={onBack}>
            {t("back")}
          </Button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create the orchestrator `csv-import-dialog.tsx`**

This is the new `components/money/csv-import/csv-import-dialog.tsx` that contains all the state management and renders the appropriate step:

```tsx
// components/money/csv-import/csv-import-dialog.tsx
"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import Papa from "papaparse";
import { useSWRConfig } from "swr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAccounts } from "@/lib/hooks/use-accounts";
import { autoMapColumns, MAX_IMPORT_ROWS } from "@/lib/money/csv-import";
import type { ColumnMapping, ImportResult } from "./types";
import { CsvUploadStep } from "./csv-upload-step";
import { CsvMappingStep } from "./csv-mapping-step";
import { CsvPreviewStep } from "./csv-preview-step";
import { CsvResultStep } from "./csv-result-step";

export function CsvImportDialog() {
  const t = useTranslations("money.csvImport");
  const { mutate } = useSWRConfig();
  const { connections } = useAccounts();
  const allAccounts = connections.flatMap((c) => c.accounts);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [flipSign, setFlipSign] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("cash");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const resetState = useCallback(() => {
    setStep(1);
    setFile(null);
    setParsedHeaders([]);
    setParsedRows([]);
    setColumnMapping({});
    setFlipSign(false);
    setSelectedAccountId("cash");
    setImportResult(null);
    setIsImporting(false);
    setParseError(null);
  }, []);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) resetState();
  };

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);

    Papa.parse(selectedFile, {
      header: true,
      skipEmptyLines: "greedy",
      beforeFirstChunk: (chunk: string) => chunk.replace(/^\uFEFF/, ""),
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const rows = results.data as Record<string, string>[];

        if (rows.length === 0) {
          setParseError(t("noRows"));
          return;
        }
        if (rows.length > MAX_IMPORT_ROWS) {
          setParseError(t("tooManyRows", { count: rows.length, max: MAX_IMPORT_ROWS }));
          return;
        }

        setParsedHeaders(headers);
        setParsedRows(rows.slice(0, MAX_IMPORT_ROWS));
        setColumnMapping(autoMapColumns(headers));
        setStep(2);
      },
      error: () => {
        setParseError(t("parseError"));
      },
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) handleFileSelect(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const updateMapping = (targetField: string, csvHeader: string | null) => {
    setColumnMapping((prev) => ({ ...prev, [targetField]: csvHeader }));
  };

  const canProceedToPreview =
    !!columnMapping.transaction_date &&
    !!columnMapping.amount &&
    !!columnMapping.description;

  const getMappedRows = () => {
    return parsedRows
      .map((row) => {
        const dateValue = columnMapping.transaction_date ? row[columnMapping.transaction_date] : "";
        const rawAmount = columnMapping.amount ? parseFloat(row[columnMapping.amount]) : NaN;
        const amount = flipSign ? -rawAmount : rawAmount;
        const description = columnMapping.description ? row[columnMapping.description] : "";
        const merchantName = columnMapping.merchant_name ? row[columnMapping.merchant_name] : null;
        const category = columnMapping.category ? row[columnMapping.category] : null;

        return {
          transaction_date: dateValue,
          amount,
          description,
          merchant_name: merchantName || null,
          category: category || null,
        };
      })
      .filter((row) => row.transaction_date && !isNaN(row.amount) && row.description);
  };

  const handleImport = async () => {
    setIsImporting(true);
    setStep(4);

    try {
      const mappedRows = getMappedRows();
      if (mappedRows.length === 0) {
        toast.error(t("noRows"));
        setIsImporting(false);
        return;
      }

      const res = await fetch("/api/money/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          rows: mappedRows,
          skip_duplicates: true,
        }),
      });

      if (!res.ok) throw new Error("Import failed");

      const result: ImportResult = await res.json();
      setImportResult(result);
      toast.success(t("importSuccess", { count: result.imported }));

      mutate(
        (key: unknown) => typeof key === "string" && key.startsWith("/api/money/transactions"),
        undefined,
        { revalidate: true },
      );
    } catch (error) {
      console.error("CSV import error:", error);
      toast.error(t("importError"));
    } finally {
      setIsImporting(false);
    }
  };

  const accountName =
    selectedAccountId === "cash"
      ? "Cash"
      : allAccounts.find((a) => a.id === selectedAccountId)?.name ?? "";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="mr-1.5 size-4" />
          {t("title")}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-money-surface border-money-border sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === 1
              ? t("step1Title")
              : step === 2
                ? t("step2Title")
                : step === 3
                  ? t("step3Title")
                  : t("step4Title")}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <CsvUploadStep
            file={file}
            parseError={parseError}
            handleFileInputChange={handleFileInputChange}
            handleDrop={handleDrop}
            handleDragOver={handleDragOver}
            flipSign={flipSign}
            setFlipSign={setFlipSign}
            selectedAccountId={selectedAccountId}
            setSelectedAccountId={setSelectedAccountId}
            allAccounts={allAccounts}
          />
        )}

        {step === 2 && (
          <CsvMappingStep
            parsedHeaders={parsedHeaders}
            parsedRows={parsedRows}
            columnMapping={columnMapping}
            updateMapping={updateMapping}
            canProceedToPreview={canProceedToPreview}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <CsvPreviewStep
            mappedRows={getMappedRows()}
            accountName={accountName}
            onBack={() => setStep(2)}
            onImport={handleImport}
          />
        )}

        {step === 4 && (
          <CsvResultStep
            isImporting={isImporting}
            importResult={importResult}
            onClose={() => handleOpenChange(false)}
            onBack={() => setStep(3)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Delete old file and update imports**

1. Delete `components/money/csv-import-dialog.tsx`.
2. Update `app/money/transactions/page.tsx`:
   - Change: `import { CsvImportDialog } from "@/components/money/csv-import-dialog";`
   - To: `import { CsvImportDialog } from "@/components/money/csv-import/csv-import-dialog";`

- [ ] **Step 8: Run tests**

Run: `pnpm test:run -- tests/components/money/csv-import-dialog.test.tsx`

The test imports `@/components/money/csv-import-dialog` — update the import in the test file to `@/components/money/csv-import/csv-import-dialog`, then re-run.

Expected: All tests pass.

- [ ] **Step 9: Run lint and commit**

```bash
pnpm lint
git add components/money/csv-import/ app/money/transactions/page.tsx tests/components/money/csv-import-dialog.test.tsx
git rm components/money/csv-import-dialog.tsx
git commit -m "refactor(money): decompose csv-import-dialog into subdirectory with step components"
```

---

### Task 6: Extract KanbanInfoCard + KanbanFooterBar

**Files:**
- Create: `components/kanban/kanban-info-card.tsx`
- Create: `components/kanban/kanban-footer-bar.tsx`
- Modify: `components/kanban/kanban-detail-modal.tsx`

- [ ] **Step 1: Create `kanban-info-card.tsx`**

Extract the info card section (status, priority, due date, project grid):

```tsx
// components/kanban/kanban-info-card.tsx
"use client";

import { useTranslations } from "next-intl";
import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Task, TaskStatus } from "@/lib/db/types";

const STATUS_STYLES: Record<TaskStatus, string> = {
  backlog: "bg-muted text-muted-foreground hover:bg-muted/80",
  todo: "bg-slate-500 text-white hover:bg-slate-500/90",
  in_progress: "bg-blue-500 text-white hover:bg-blue-500/90",
  done: "bg-green-500 text-white hover:bg-green-500/90",
};

const PRIORITY_STYLES: Record<number, string> = {
  3: "bg-red-500 text-white hover:bg-red-500/90",
  2: "bg-yellow-500 text-white hover:bg-yellow-500/90",
  1: "bg-blue-500 text-white hover:bg-blue-500/90",
  0: "bg-muted text-muted-foreground hover:bg-muted/80",
};

const PRIORITY_LABELS: Record<number, string> = {
  3: "high",
  2: "medium",
  1: "low",
  0: "none",
};

const STATUS_OPTIONS: TaskStatus[] = ["backlog", "todo", "in_progress", "done"];
const PRIORITY_OPTIONS = [0, 1, 2, 3] as const;

interface KanbanInfoCardProps {
  task: Task;
  projectName?: string;
  onUpdateField: <K extends string>(field: K, value: unknown) => Promise<boolean>;
}

export function KanbanInfoCard({
  task,
  projectName,
  onUpdateField,
}: KanbanInfoCardProps) {
  const t = useTranslations("kanban");

  return (
    <div className="bg-background rounded-lg border shadow-sm">
      <div className="flex items-center justify-between px-card-header-padding-x py-card-header-padding-y border-b">
        <h3 className="text-base font-semibold">{t("detail.infoHeading")}</h3>
      </div>
      <div className="p-card-padding">
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t("detail.status")}
            </label>
            <Select
              value={task.status}
              onValueChange={(value) => onUpdateField("status", value)}
            >
              <SelectTrigger className="w-full border-none shadow-none p-0 h-auto">
                <SelectValue>
                  <Badge className={`border-transparent ${STATUS_STYLES[task.status]}`}>
                    {t(`columns.${task.status}`)}
                  </Badge>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    <Badge className={`border-transparent ${STATUS_STYLES[status]}`}>
                      {t(`columns.${status}`)}
                    </Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t("detail.priority")}
            </label>
            <Select
              value={String(task.priority)}
              onValueChange={(value) => onUpdateField("priority", Number(value))}
            >
              <SelectTrigger className="w-full border-none shadow-none p-0 h-auto">
                <SelectValue>
                  <Badge className={`border-transparent ${PRIORITY_STYLES[task.priority]}`}>
                    {t(`priority.${PRIORITY_LABELS[task.priority]}`)}
                  </Badge>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    <Badge className={`border-transparent ${PRIORITY_STYLES[p]}`}>
                      {t(`priority.${PRIORITY_LABELS[p]}`)}
                    </Badge>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Due Date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t("detail.dueDate")}
            </label>
            <Popover key={task.id}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-2 text-base hover:opacity-80 transition-opacity">
                  <Calendar className="size-4 text-muted-foreground" />
                  {task.due_date ? (
                    <span>{task.due_date}</span>
                  ) : (
                    <span className="text-muted-foreground">{t("detail.noDueDate")}</span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <input
                  type="date"
                  defaultValue={task.due_date || ""}
                  onChange={(e) => onUpdateField("due_date", e.target.value || null)}
                  className="w-full p-2 rounded-md border bg-transparent text-base focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Project (read-only) */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              {t("detail.project")}
            </label>
            <p className="text-base">{projectName || "---"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `kanban-footer-bar.tsx`**

```tsx
// components/kanban/kanban-footer-bar.tsx
"use client";

import { useTranslations } from "next-intl";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle as AlertTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface KanbanFooterBarProps {
  isSaving: boolean;
  lastSaveError: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  onClose: () => void;
}

export function KanbanFooterBar({
  isSaving,
  lastSaveError,
  isDeleting,
  onDelete,
  onClose,
}: KanbanFooterBarProps) {
  const t = useTranslations("kanban");

  return (
    <div className="flex items-center justify-between border-t bg-muted/30 px-modal-padding py-3 flex-shrink-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isSaving ? (
          <>
            <Loader2 className="size-3 animate-spin" />
            {t("detail.footer.saving")}
          </>
        ) : lastSaveError ? (
          <>
            <span className="size-2 rounded-full bg-destructive inline-block" />
            {t("detail.footer.saveFailed")}
          </>
        ) : (
          <>
            <span className="size-2 rounded-full bg-green-500 inline-block" />
            {t("detail.footer.allSaved")}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/50 hover:bg-destructive/10"
              aria-label={t("detail.delete")}
            >
              <Trash2 className="size-3.5 mr-1.5" />
              {t("detail.delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertTitle>{t("detail.deleteConfirmTitle")}</AlertTitle>
              <AlertDialogDescription>
                {t("detail.deleteConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("detail.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? t("detail.deleting") : t("detail.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button variant="outline" size="sm" onClick={onClose}>
          {t("detail.footer.close")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `kanban-detail-modal.tsx`**

1. Add imports:
```tsx
import { KanbanInfoCard } from "./kanban-info-card";
import { KanbanFooterBar } from "./kanban-footer-bar";
```

2. Remove the constant definitions (`STATUS_STYLES`, `PRIORITY_STYLES`, `PRIORITY_LABELS`, `STATUS_OPTIONS`, `PRIORITY_OPTIONS`) — they're now in `kanban-info-card.tsx`.

3. Replace the info card JSX block (inside `TabsContent value="details"`) with:
```tsx
<KanbanInfoCard
  task={task}
  projectName={projectName}
  onUpdateField={updateField}
/>
```

4. Replace the footer bar JSX with:
```tsx
<KanbanFooterBar
  isSaving={isSaving}
  lastSaveError={lastSaveError}
  isDeleting={isDeleting}
  onDelete={handleDelete}
  onClose={onClose}
/>
```

5. Remove the now-unused imports: `Calendar`, `Loader2`, `Trash2` (if only used by extracted components), `Badge`, `Select*`, `Popover*`, `AlertDialog*`.

- [ ] **Step 4: Run tests**

Run: `pnpm test:run -- tests/components/kanban/kanban-detail-modal.test.tsx`
Expected: All tests pass.

- [ ] **Step 5: Run lint and commit**

```bash
pnpm lint
git add components/kanban/kanban-info-card.tsx components/kanban/kanban-footer-bar.tsx components/kanban/kanban-detail-modal.tsx
git commit -m "refactor(kanban): extract info card and footer bar from kanban-detail-modal"
```

---

### Task 7: Extract useChatPersistence

**Files:**
- Create: `components/chat/use-chat-persistence.ts`
- Modify: `components/chat/chat-content.tsx`

- [ ] **Step 1: Create `use-chat-persistence.ts`**

Extract the stream-complete persistence effect into a custom hook:

```ts
// components/chat/use-chat-persistence.ts
import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { log } from "@/lib/logger";

async function fetchJSON(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function useChatPersistence(
  status: string,
  messages: UIMessage[],
  activeConversationId: string | null,
  setActiveConversationId: (id: string | null) => void,
  selectedModel: string,
  mutateConversations: () => void,
) {
  const prevStatusRef = useRef(status);

  useEffect(() => {
    const wasStreaming =
      prevStatusRef.current === "streaming" ||
      prevStatusRef.current === "submitted";
    prevStatusRef.current = status;

    if (wasStreaming && status === "ready" && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role !== "assistant") return;

      const assistantContent = lastMsg.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("");

      if (!assistantContent.trim()) return;

      const userMsg =
        messages.length >= 2 ? messages[messages.length - 2] : null;
      const userContent =
        userMsg?.role === "user"
          ? userMsg.parts
              .filter(
                (p): p is { type: "text"; text: string } => p.type === "text",
              )
              .map((p) => p.text)
              .join("")
          : null;

      const saveMessages = async () => {
        let convId = activeConversationId;

        if (!convId) {
          try {
            const data = await fetchJSON("/api/conversations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: selectedModel }),
            });
            convId = data.conversation.id;
            setActiveConversationId(convId);
            window.history.replaceState(null, "", `/chat?id=${convId}`);
          } catch (err) {
            log.error("[chat] Failed to create conversation", err);
            return;
          }
        }

        if (userContent) {
          try {
            await fetchJSON(`/api/conversations/${convId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: "user", content: userContent }),
            });
          } catch (err) {
            log.error("[chat] Failed to save user message", err);
            return;
          }
        }

        try {
          await fetchJSON(`/api/conversations/${convId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role: "assistant",
              content: assistantContent,
            }),
          });
        } catch (err) {
          log.error("[chat] Failed to save assistant message", err);
        }

        if (messages.length === 2 && userContent) {
          fetchJSON(`/api/conversations/${convId}/title`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userMessage: userContent,
              assistantMessage: assistantContent,
            }),
          })
            .then(() => mutateConversations())
            .catch((err) =>
              log.error("[chat] Failed to generate title", err),
            );
        }

        mutateConversations();
      };

      saveMessages().catch((err) =>
        log.error("[chat] Unexpected error in saveMessages", err),
      );
    }
  }, [
    status,
    messages,
    activeConversationId,
    setActiveConversationId,
    mutateConversations,
    selectedModel,
  ]);
}
```

- [ ] **Step 2: Update `chat-content.tsx`**

1. Add import:
```tsx
import { useChatPersistence } from "./use-chat-persistence";
```

2. Replace the persistence effect (lines 116-212) and the `prevStatusRef` with:
```tsx
useChatPersistence(
  status,
  messages,
  activeConversationId,
  setActiveConversationId,
  selectedModel,
  mutateConversations,
);
```

3. The `fetchJSON` function is still needed locally for other operations (conversation switching, model change, rename, delete). Keep it in `chat-content.tsx`. The hook has its own copy — this duplication is acceptable since extracting a shared util would add coupling for a simple helper.

- [ ] **Step 3: Run tests**

Run: `pnpm test:run -- tests/components/chat/chat-content.test.tsx`
Expected: All tests pass.

- [ ] **Step 4: Run lint and commit**

```bash
pnpm lint
git add components/chat/use-chat-persistence.ts components/chat/chat-content.tsx
git commit -m "refactor(chat): extract message persistence logic into useChatPersistence hook"
```

---

### Task 8: Extract BudgetSummaryCard + BudgetCategoryGrid

**Files:**
- Create: `components/money/budget-summary-card.tsx`
- Create: `components/money/budget-category-grid.tsx`
- Modify: `components/money/budget-overview.tsx`

- [ ] **Step 1: Create `budget-summary-card.tsx`**

```tsx
// components/money/budget-summary-card.tsx
"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetRing } from "@/components/money/budget-ring";
import { formatMoney } from "@/lib/money/arithmetic";

interface BudgetSummaryCardProps {
  totalCents: number;
  totalSpentCents: number;
}

export function BudgetSummaryCard({
  totalCents,
  totalSpentCents,
}: BudgetSummaryCardProps) {
  const t = useTranslations("money.budgets");
  const overallPercent =
    totalCents > 0 ? Math.round((totalSpentCents / totalCents) * 100) : 0;
  const remaining = totalCents - totalSpentCents;

  return (
    <Card className="border-money-border bg-money-surface">
      <CardContent className="flex items-center gap-6 p-card-padding">
        <BudgetRing percent={overallPercent} size={64} strokeWidth={5} />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t("totalBudget")}</p>
              <p className="text-2xl font-bold tabular-nums">
                {formatMoney(totalCents)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">
                {remaining >= 0 ? t("remaining") : t("overBudget")}
              </p>
              <p
                className={`text-lg font-semibold tabular-nums ${
                  remaining < 0
                    ? "text-[hsl(var(--money-caution))]"
                    : "text-[hsl(var(--money-sage))]"
                }`}
              >
                {formatMoney(Math.abs(remaining))}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {formatMoney(totalSpentCents)} {t("spent")}
            </span>
            <span>({overallPercent}%)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create `budget-category-grid.tsx`**

```tsx
// components/money/budget-category-grid.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { BudgetRing } from "@/components/money/budget-ring";
import { formatMoney } from "@/lib/money/arithmetic";

interface BudgetCategory {
  category_id: string;
  category_name: string;
  category_icon: string | null;
  category_color: string | null;
  allocated_cents: number;
  spent_cents: number;
  rollover_cents: number;
}

interface BudgetCategoryGridProps {
  categories: BudgetCategory[];
  onCategoryClick: (categoryId: string) => void;
}

export function BudgetCategoryGrid({
  categories,
  onCategoryClick,
}: BudgetCategoryGridProps) {
  return (
    <div className="grid gap-card-gap sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((cat) => {
        const percent =
          cat.allocated_cents > 0
            ? Math.round((cat.spent_cents / cat.allocated_cents) * 100)
            : 0;

        return (
          <Card
            key={cat.category_id}
            className="cursor-pointer border-money-border transition-colors hover:bg-accent"
            onClick={() => onCategoryClick(cat.category_id)}
          >
            <CardContent className="flex items-center gap-3 p-card-padding">
              <BudgetRing percent={percent} size={40} strokeWidth={3} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {cat.category_icon && (
                    <span className="text-sm">{cat.category_icon}</span>
                  )}
                  <p className="text-sm font-medium truncate">
                    {cat.category_name}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {formatMoney(cat.spent_cents)}
                  </span>
                  <span>/</span>
                  <span className="tabular-nums">
                    {formatMoney(cat.allocated_cents)}
                  </span>
                  {cat.rollover_cents !== 0 && (
                    <span className="tabular-nums">
                      {cat.rollover_cents > 0
                        ? ` + ${formatMoney(cat.rollover_cents)} rollover`
                        : ` - ${formatMoney(Math.abs(cat.rollover_cents))} debt`}
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {percent}%
              </span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Update `budget-overview.tsx`**

1. Add imports:
```tsx
import { BudgetSummaryCard } from "@/components/money/budget-summary-card";
import { BudgetCategoryGrid } from "@/components/money/budget-category-grid";
```

2. Replace the budget summary card JSX (the `<Card>` with `BudgetRing` + totals, roughly lines 223-259) with:
```tsx
<BudgetSummaryCard
  totalCents={budget.total_cents}
  totalSpentCents={budget.total_spent_cents}
/>
```

3. Replace the category cards grid (lines 309-359) with:
```tsx
<BudgetCategoryGrid
  categories={budget.categories}
  onCategoryClick={setSelectedCategoryId}
/>
```

4. Remove now-unused imports: `BudgetRing`, `formatMoney` (if only used by extracted components). Check carefully — `formatMoney` is NOT used elsewhere in the file after extraction, and `BudgetRing` is NOT used elsewhere. Remove both. Keep `Card`, `CardContent`, `CardHeader`, `CardTitle` since they're used by the chart section.

- [ ] **Step 4: Run tests**

Run: `pnpm test:run -- tests/components/money/budget-overview.test.tsx`
Expected: All tests pass.

- [ ] **Step 5: Run lint and commit**

```bash
pnpm lint
git add components/money/budget-summary-card.tsx components/money/budget-category-grid.tsx components/money/budget-overview.tsx
git commit -m "refactor(money): extract budget summary card and category grid from budget-overview"
```

---

### Task 9: Extract TaskDetailSkeleton + TaskDetailsGrid

**Files:**
- Create: `components/tasks/task-detail-skeleton.tsx`
- Create: `components/tasks/task-details-grid.tsx`
- Modify: `components/tasks/task-detail-content.tsx`

- [ ] **Step 1: Create `task-detail-skeleton.tsx`**

```tsx
// components/tasks/task-detail-skeleton.tsx
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeaderSkeleton } from "@/components/layouts/page-header";

export function TaskDetailSkeleton() {
  return (
    <div className="flex flex-col gap-section-gap" data-testid="task-detail-skeleton">
      <div>
        <Skeleton className="h-4 w-32 mb-2" />
        <PageHeaderSkeleton hasActions />
      </div>
      <Card className="max-w-3xl">
        <CardContent className="space-y-6 pt-card-padding">
          <div>
            <Skeleton className="h-5 w-48 mb-2" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
            <Skeleton className="h-20 rounded-xl" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create `task-details-grid.tsx`**

```tsx
// components/tasks/task-details-grid.tsx
"use client";

import { useTranslations } from "next-intl";
import { Calendar, Clock, Flag, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryDisplayName } from "@/lib/categories/get-category-display-name";
import { getPriorityColor } from "@/lib/tasks/format";
import type { Task, Category } from "@/lib/db/types";

interface TaskDetailsGridProps {
  task: Task;
  category: Category | null;
  catBgColor: string | undefined;
  isDark: boolean;
}

export function TaskDetailsGrid({
  task,
  category,
  catBgColor,
}: TaskDetailsGridProps) {
  const t = useTranslations("tasks");
  const priorityT = useTranslations("tasks.priorities");
  const tCat = useTranslations("categories");
  const priorityColor = getPriorityColor(task.priority);

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Category */}
      <div className="flex items-center gap-3 p-4 rounded-lg border">
        <Tag className="size-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">{t("detail.category")}</p>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={cn(
                "inline-flex items-center justify-center rounded p-0.5",
                !catBgColor && "bg-muted",
              )}
              style={catBgColor ? { backgroundColor: catBgColor } : undefined}
            >
              <Tag className="size-4 text-white" aria-hidden="true" />
            </span>
            <span className="font-medium">
              {category ? getCategoryDisplayName(category.name, tCat) : "---"}
            </span>
          </div>
        </div>
      </div>

      {/* Priority */}
      <div className="flex items-center gap-3 p-4 rounded-lg border">
        <Flag className={cn("size-5", priorityColor)} />
        <div>
          <p className="text-sm text-muted-foreground">{t("detail.priority")}</p>
          <span className={cn("font-medium", priorityColor)}>
            {priorityT(String(task.priority))}
          </span>
        </div>
      </div>

      {/* Due date */}
      <div className="flex items-center gap-3 p-4 rounded-lg border">
        <Calendar className="size-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">{t("detail.dueDate")}</p>
          <span className="font-medium">
            {task.due_date || t("detail.noDueDate")}
          </span>
        </div>
      </div>

      {/* Due time */}
      <div className="flex items-center gap-3 p-4 rounded-lg border">
        <Clock className="size-5 text-muted-foreground" />
        <div>
          <p className="text-sm text-muted-foreground">{t("detail.dueTime")}</p>
          <span className="font-medium">
            {task.due_time ? task.due_time.slice(0, 5) : "---"}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update `task-detail-content.tsx`**

1. Add imports:
```tsx
import { TaskDetailSkeleton } from "./task-detail-skeleton";
import { TaskDetailsGrid } from "./task-details-grid";
```

2. Remove inline `TaskDetailSkeleton` (lines 62-85).

3. Replace the details grid JSX (lines 291-354) with:
```tsx
<TaskDetailsGrid
  task={task}
  category={category}
  catBgColor={catBgColor}
  isDark={isDark}
/>
```

4. Remove now-unused imports: `Calendar`, `Clock`, `Flag`, `Tag`, `Skeleton` (if only used by extracted parts). Keep `cn` if still used elsewhere. Remove `getPriorityColor` and `getCategoryDisplayName` if only used by the grid. Check: `getCategoryDisplayName` and `Tag` are NOT used outside the grid. `getPriorityColor` is NOT used outside the grid. Remove them. Keep `Skeleton` only if used elsewhere — it was only in the skeleton, so remove it.

- [ ] **Step 4: Run tests**

Run: `pnpm test:run -- tests/components/tasks/task-detail-content.test.tsx`
Expected: All tests pass.

- [ ] **Step 5: Run lint and commit**

```bash
pnpm lint
git add components/tasks/task-detail-skeleton.tsx components/tasks/task-details-grid.tsx components/tasks/task-detail-content.tsx
git commit -m "refactor(tasks): extract skeleton and details grid from task-detail-content"
```

---

### Task 10: Extract GoalCreateEditDialog + ContributeDialog

**Files:**
- Create: `components/money/goal-create-edit-dialog.tsx`
- Create: `components/money/contribute-dialog.tsx`
- Modify: `components/money/goal-form.tsx`

- [ ] **Step 1: Create `contribute-dialog.tsx`**

Cut the `ContributeDialog` function (lines 378-488) from `goal-form.tsx`:

```tsx
// components/money/contribute-dialog.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const contributeFormSchema = z.object({
  amount: z
    .string()
    .min(1, "Required")
    .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Must be positive"),
  note: z.string().max(200).optional(),
});

type ContributeFormValues = z.infer<typeof contributeFormSchema>;

interface ContributeDialogProps {
  goalId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ContributeDialog({
  goalId,
  open,
  onOpenChange,
  onSuccess,
}: ContributeDialogProps) {
  const t = useTranslations("money.goals");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContributeFormValues>({
    resolver: zodResolver(contributeFormSchema),
    defaultValues: { amount: "", note: "" },
  });

  const onSubmit = async (data: ContributeFormValues) => {
    if (!goalId) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/money/goals/${goalId}/contributions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(data.amount),
          note: data.note || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to add contribution");
      }

      toast.success(t("contributionAdded"));
      onSuccess();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add contribution",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addFunds")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contribution-amount">{t("amount")}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="contribution-amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-7 tabular-nums"
                {...register("amount")}
              />
            </div>
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contribution-note">{t("note")}</Label>
            <Textarea
              id="contribution-note"
              placeholder={t("notePlaceholder")}
              rows={2}
              {...register("note")}
            />
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t("saving") : t("addFunds")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `goal-create-edit-dialog.tsx`**

Cut `GoalCreateEditDialog` (lines 138-372) plus the `goalFormSchema` and `GoalFormValues` type:

```tsx
// components/money/goal-create-edit-dialog.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { centsToDecimal } from "@/lib/money/arithmetic";
import type { GoalWithProjection } from "@/lib/db/types";

const goalFormSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(100),
    target_amount: z
      .string()
      .min(1, "Required")
      .refine(
        (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
        "Must be positive",
      ),
    deadline: z.string().optional(),
    funding_type: z.enum(["manual", "linked"]),
    linked_account_id: z.string().optional(),
    icon: z.string().max(10).optional(),
  })
  .refine(
    (data) => {
      if (data.funding_type === "linked" && !data.linked_account_id) {
        return false;
      }
      return true;
    },
    {
      message: "Please select an account",
      path: ["linked_account_id"],
    },
  );

type GoalFormValues = z.infer<typeof goalFormSchema>;

interface GoalCreateEditDialogProps {
  mode: "create" | "edit";
  goal?: GoalWithProjection | null;
  accounts: Array<{ id: string; name: string; mask: string | null }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function GoalCreateEditDialog({
  mode,
  goal,
  accounts,
  open,
  onOpenChange,
  onSuccess,
}: GoalCreateEditDialogProps) {
  const t = useTranslations("money.goals");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultValues: GoalFormValues =
    mode === "edit" && goal
      ? {
          name: goal.name,
          target_amount: centsToDecimal(goal.target_cents),
          deadline: goal.deadline || "",
          funding_type: goal.funding_type,
          linked_account_id: goal.linked_account_id || "",
          icon: goal.icon || "",
        }
      : {
          name: "",
          target_amount: "",
          deadline: "",
          funding_type: "manual",
          linked_account_id: "",
          icon: "",
        };

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues,
  });

  const fundingType = watch("funding_type");

  const onSubmit = async (data: GoalFormValues) => {
    setIsSubmitting(true);
    try {
      const body = {
        name: data.name,
        target_amount: parseFloat(data.target_amount),
        deadline: data.deadline || undefined,
        funding_type: data.funding_type,
        linked_account_id:
          data.funding_type === "linked" ? data.linked_account_id : undefined,
        icon: data.icon || undefined,
      };

      const url =
        mode === "edit" && goal
          ? `/api/money/goals/${goal.id}`
          : "/api/money/goals";
      const method = mode === "edit" ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Failed to save goal");
      }

      toast.success(mode === "edit" ? t("goalUpdated") : t("goalCreated"));
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save goal");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? t("editGoal") : t("createGoal")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal-name">{t("name")}</Label>
            <Input
              id="goal-name"
              placeholder={t("namePlaceholder")}
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-icon">{t("icon")}</Label>
            <Input
              id="goal-icon"
              placeholder={t("iconPlaceholder")}
              maxLength={10}
              className="w-20"
              {...register("icon")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-target">{t("targetAmount")}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                $
              </span>
              <Input
                id="goal-target"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                className="pl-7 tabular-nums"
                {...register("target_amount")}
              />
            </div>
            {errors.target_amount && (
              <p className="text-sm text-destructive">
                {errors.target_amount.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-deadline">{t("deadline")}</Label>
            <Input id="goal-deadline" type="date" {...register("deadline")} />
          </div>

          <div className="space-y-2">
            <Label>{t("fundingType")}</Label>
            <RadioGroup
              value={fundingType}
              onValueChange={(val) =>
                setValue("funding_type", val as "manual" | "linked")
              }
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="manual" id="funding-manual" />
                <Label
                  htmlFor="funding-manual"
                  className="cursor-pointer font-normal"
                >
                  {t("manualContributions")}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="linked" id="funding-linked" />
                <Label
                  htmlFor="funding-linked"
                  className="cursor-pointer font-normal"
                >
                  {t("linkToAccount")}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {fundingType === "linked" && (
            <div className="space-y-2">
              <Label>{t("linkedAccount")}</Label>
              <Select
                value={watch("linked_account_id") || ""}
                onValueChange={(val) => setValue("linked_account_id", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectAccount")} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.name}
                      {acc.mask && ` (${acc.mask})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.linked_account_id && (
                <p className="text-sm text-destructive">
                  {errors.linked_account_id.message}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? t("saving")
                : mode === "edit"
                  ? t("saveChanges")
                  : t("createGoal")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Update `goal-form.tsx`**

Replace the entire file with a slim router component:

```tsx
// components/money/goal-form.tsx
"use client";

import { useAccounts } from "@/lib/hooks/use-accounts";
import { useTranslations } from "next-intl";
import { GoalCreateEditDialog } from "./goal-create-edit-dialog";
import { ContributeDialog } from "./contribute-dialog";
import type { GoalWithProjection } from "@/lib/db/types";

interface GoalFormProps {
  mode: "create" | "edit" | "contribute";
  goal?: GoalWithProjection | null;
  contributeGoalId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function GoalForm({
  mode,
  goal,
  contributeGoalId,
  open,
  onOpenChange,
  onSuccess,
}: GoalFormProps) {
  const t = useTranslations("money.goals");
  const { connections } = useAccounts();

  const allAccounts = connections.flatMap((conn) =>
    conn.accounts.map((acc) => ({
      id: acc.id,
      name: `${conn.institution_name || t("unknownInstitution")} - ${acc.name}`,
      mask: acc.mask,
    })),
  );

  if (mode === "contribute") {
    return (
      <ContributeDialog
        goalId={contributeGoalId || ""}
        open={open}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
      />
    );
  }

  return (
    <GoalCreateEditDialog
      mode={mode}
      goal={goal}
      accounts={allAccounts}
      open={open}
      onOpenChange={onOpenChange}
      onSuccess={onSuccess}
    />
  );
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test:run -- tests/components/money/goal-grid.test.tsx`
Expected: All tests pass (GoalForm public API unchanged).

- [ ] **Step 5: Run lint and commit**

```bash
pnpm lint
git add components/money/goal-create-edit-dialog.tsx components/money/contribute-dialog.tsx components/money/goal-form.tsx
git commit -m "refactor(money): extract goal dialogs from goal-form into separate files"
```

---

### Task 11: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `pnpm test:run`
Expected: All tests pass. Same number of passing tests as before the refactor.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`
Expected: No errors.

- [ ] **Step 3: Run production build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Verify line counts**

Run: `wc -l components/dashboard/dashboard-content.tsx components/calendar/calendar-page-content.tsx components/tasks/tasks-page-content.tsx components/habits/habit-detail-content.tsx components/kanban/kanban-detail-modal.tsx components/chat/chat-content.tsx components/money/budget-overview.tsx components/tasks/task-detail-content.tsx components/money/goal-form.tsx`

Expected: All files under ~400 lines.

- [ ] **Step 5: Commit any remaining fixes**

If any test/lint/build issues surfaced, fix and commit them.
