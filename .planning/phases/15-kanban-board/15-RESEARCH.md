# Phase 15: Kanban Board - Research

**Researched:** 2026-02-20
**Domain:** Drag-and-drop kanban board with @dnd-kit, Next.js App Router, SWR optimistic updates
**Confidence:** HIGH

## Summary

Phase 15 builds a 4-column kanban board (Backlog, To Do, In Progress, Done) accessible by clicking a project card on the tasks page. The board uses `@dnd-kit/core` v6 (stable) for drag-and-drop with cross-column moves that update task status. Cards auto-sort by priority within columns (no manual reordering). A Monday.com-style detail popup opens on card click with left panel (task fields) and right panel (placeholder for future comments). Quick-add appears on column hover.

The existing codebase already provides all necessary infrastructure: `TasksDB` with `syncTaskUpdate`, `ProjectsDB`, `useProjects` hook, `sort-order.ts` utilities, `Task`/`Project` types with `TaskStatus` enum, and Zod validation schemas that accept `status` and `sort_order`. The primary new work is: installing @dnd-kit, creating the kanban page route, building the board/column/card/overlay/detail-modal components, adding project_id filtering to the tasks API, and i18n strings.

**Primary recommendation:** Use `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` with `closestCorners` collision detection. Wrap the entire kanban board in `next/dynamic({ ssr: false })` to avoid hydration issues. Use SWR as single source of truth with optimistic updates on drag-end. Only call API on `onDragEnd`, never on `onDragOver`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Card content & density
- Cards show: title, priority badge, due date (if set) -- all existing fields
- Monday.com-style card layout: task title prominent, metadata below
- No story points (deferred), no assignee (deferred), no intention/"Your Why" display
- Priority badge visual treatment: Claude's discretion (colored badge, dot, etc.)

#### Card click -- detail popup
- Clicking a kanban card opens a Monday.com-style full overlay modal
- Left panel: task detail fields (status, priority, section, project, due date, description)
- Right panel: placeholder with empty state for future comments/updates system
- Tabs at top like Monday.com (Details, Activity -- structure ready for future)

#### Board layout & navigation
- Full page navigation: clicking project card goes to `/projects/[id]/kanban`
- Back button returns to tasks page
- Minimal header: project name with colored accent, back arrow, task count
- No search/filter on the board itself
- Column headers: neutral/subtle with colored count badge (not full-color headers)
- Quick-add task: appears on column hover, positioned after the last card (or first position if column is empty)

#### Drag interaction
- Cross-column drag to change task status (Backlog <-> To Do <-> In Progress <-> Done)
- Touch drag supported (long-press to pick up on mobile)
- Optimistic instant save on drop -- if API fails, card snaps back with error toast
- No within-column reordering -- cards auto-sort by priority (high -> low) within each column
- Drag visual feedback: Claude's discretion (@dnd-kit best practices)

#### Completion reflection
- Dropped entirely -- tasks move to Done silently with no emoji prompt

### Claude's Discretion
- Priority badge visual design (colored badge style, dot indicator, etc.)
- Drag-and-drop visual feedback (lift + shadow, ghost card, etc.)
- Detail popup field layout and styling
- Column empty state design
- Loading skeleton design
- Error state handling

### Deferred Ideas (OUT OF SCOPE)
- **Story points system** -- new data field (DB column, API, form UI). User wants this but it's a new capability
- **Assignee system** -- multi-user support with task assignment. Future phase
- **Comments/updates system** -- Monday.com-style item updates with @mentions, replies, likes. Right panel placeholder is ready for this
- **Within-column manual reordering** -- currently using fixed priority sort; could add custom ordering later
- **Board search/filter** -- keep board minimal for now; could add filtering later
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PAGE-03 | Clicking a project card opens the kanban board view for that project | ProjectCard already links to `/projects/[id]/board`. Need to create the route at `app/projects/[id]/board/page.tsx` (or `/kanban` per CONTEXT -- see Open Questions). Route fetches project + project tasks via existing APIs. |
| KANB-01 | User can view a project's tasks in a 4-column kanban board (Backlog, To Do, In Progress, Done) | @dnd-kit DndContext + 4 useDroppable columns. Tasks fetched via `/api/tasks?project_id={id}` (requires adding project_id filter to GET /api/tasks). Cards grouped by `task.status` and sorted by priority desc within each column. |
| KANB-02 | User can drag and drop tasks between kanban columns to change status | @dnd-kit useDraggable on cards + useDroppable on columns. onDragEnd handler calls PATCH /api/tasks/[id] with `{ status: newStatus }`. Sync layer (`syncTaskUpdate`) handles is_completed/completed_at derivation. |
| KANB-03 | ~~User can drag and drop tasks within a column to reorder them~~ | **OVERRIDDEN BY CONTEXT**: No within-column reordering. Cards auto-sort by priority (high -> low). No sort_order updates needed for within-column positioning. |
| KANB-04 | ~~Dragging a task to Done triggers completion reflection~~ | **OVERRIDDEN BY CONTEXT**: Dropped entirely. Tasks move to Done silently. |
| KANB-05 | ~~Kanban cards display the task's intention ("Your Why") when present~~ | **OVERRIDDEN BY CONTEXT**: No intention/"Your Why" display on cards. |
| I18N-01 | All new UI strings are translated in en, zh, and zh-TW | New `kanban` namespace in all 3 locale files. Column headers, empty states, detail popup labels, quick-add placeholder, error messages, back button label, task count. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dnd-kit/core` | ^6.3.1 | DnD primitives (DndContext, sensors, collision detection, DragOverlay) | Battle-tested stable v6, ~10kB, zero external deps, excellent accessibility (keyboard + screen reader), massive community adoption for kanban boards. Published Dec 2024. Peer deps: React >=16.8.0. |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable preset (SortableContext, useSortable, verticalListSortingStrategy) | Purpose-built for sortable lists within DnD contexts. Required peer: @dnd-kit/core ^6.3.0. Even though we don't do within-column reorder, SortableContext simplifies the droppable container setup and item identification. |
| `@dnd-kit/utilities` | ^3.2.2 | CSS transform utilities (CSS.Transform.toString) | Applies drag transforms to DOM elements cleanly. |

### Supporting (Already in project)

| Library | Version | Purpose | How Used in Kanban |
|---------|---------|---------|-------------------|
| `shadcn/ui Dialog` | (already installed) | Full overlay modal for task detail popup | Monday.com-style detail popup with DialogContent max-width override |
| `shadcn/ui Card` | (already installed) | Kanban card containers | Task cards within columns |
| `shadcn/ui Badge` | (already installed) | Priority badges on cards | Colored priority indicator |
| `shadcn/ui ScrollArea` | (already installed) | Scrollable column content | Each column independently scrollable |
| `sonner` | (already installed) | Toast notifications | Error toast on failed drag, success on quick-add |
| `lucide-react` | (already installed) | Icons | Back arrow, plus icon for quick-add, column icons |
| `next/dynamic` | (built-in) | SSR-disabled import | Wrap kanban board to prevent hydration mismatch |
| `next-intl` | (already installed) | i18n | All kanban UI strings |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@dnd-kit/core` v6 (stable) | `@dnd-kit/react` v0.3.x (new rewrite) | New rewrite targets React 19 explicitly but is pre-1.0, no community kanban examples, missing `"use client"` directives. Too risky for production. |
| `@dnd-kit/core` | `@hello-pangea/dnd` | Fork of deprecated react-beautiful-dnd. Works with React 19 via peer dep override but not officially supported. Less flexible API. |
| `@dnd-kit/core` | `@atlaskit/pragmatic-drag-and-drop` | Framework-agnostic (vanilla JS core), overkill for React-only app. Fewer community examples with shadcn/ui. |
| `shadcn/ui Dialog` for detail popup | `shadcn/ui Sheet` (side panel) | Sheet is a side drawer. Monday.com uses a full overlay dialog. Dialog matches the design intent better. |

**Installation:**
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**React 19 peer dep fix (add to package.json):**
```json
{
  "pnpm": {
    "peerDependencyRules": {
      "allowedVersions": {
        "@dnd-kit/core>react": "19",
        "@dnd-kit/core>react-dom": "19",
        "@dnd-kit/sortable>react": "19",
        "@dnd-kit/sortable>react-dom": "19",
        "@dnd-kit/utilities>react": "19"
      }
    }
  }
}
```
Source: [pnpm peerDependencyRules docs](https://pnpm.io/settings)
**Confidence: HIGH** -- verified via npm registry, peer deps checked, pattern used by shadcn/ui for React 19.

## Architecture Patterns

### Recommended Project Structure

```
components/
  kanban/
    kanban-board.tsx              # Main board: DndContext + 4 columns + DragOverlay
    kanban-column.tsx             # Single status column (useDroppable)
    kanban-card.tsx               # Draggable task card (useDraggable)
    kanban-card-overlay.tsx       # Ghost card rendered in DragOverlay
    kanban-quick-add.tsx          # Quick-add input (appears on column hover)
    kanban-detail-modal.tsx       # Monday.com-style full overlay task detail
    kanban-skeleton.tsx           # Loading skeleton for SSR-disabled board
    kanban-empty-column.tsx       # Empty state per column
app/
  projects/
    [id]/
      board/
        page.tsx                  # Server component: auth check + dynamic import
        layout.tsx                # SidebarShell layout
```

### Pattern 1: SSR-Disabled Kanban Board

**What:** Wrap the entire kanban board with `next/dynamic({ ssr: false })` to prevent DnD hydration issues.
**When to use:** Always for any component using @dnd-kit.
**Why:** DnD libraries rely on browser APIs (pointer events, DOM measurements) that don't exist on the server. `"use client"` alone does NOT prevent server rendering in Next.js App Router.

```typescript
// app/projects/[id]/board/page.tsx
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { KanbanSkeleton } from "@/components/kanban/kanban-skeleton";

const KanbanBoard = dynamic(
  () => import("@/components/kanban/kanban-board").then(m => m.KanbanBoard),
  { ssr: false, loading: () => <KanbanSkeleton /> }
);

export default async function KanbanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  return <KanbanBoard projectId={id} />;
}
```
Source: [Next.js dynamic import docs](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading), Prior research PITFALLS.md
**Confidence: HIGH**

### Pattern 2: DndContext with Multiple Droppable Columns (No SortableContext)

**What:** Since there is no within-column reordering (cards auto-sort by priority), we use `useDroppable` for columns and `useDraggable` for cards -- NOT `useSortable`. SortableContext is unnecessary when card order is fixed.
**When to use:** When drag only changes container membership, not position within container.

```typescript
// kanban-board.tsx (simplified)
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";

function KanbanBoardInner({ tasks, projectId }: Props) {
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor)
  );

  const columns = useMemo(() => groupByStatus(tasks), [tasks]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto h-full">
        {STATUSES.map(status => (
          <KanbanColumn key={status} status={status} tasks={columns[status]} />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? <KanbanCardOverlay task={activeTask} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
```
Source: [dnd-kit docs - multiple droppable containers](https://docs.dndkit.com/introduction/getting-started), [dnd-kit docs - collision detection](https://docs.dndkit.com/api-documentation/context-provider/collision-detection-algorithms)
**Confidence: HIGH**

### Pattern 3: Sensor Configuration for Touch + Mouse + Keyboard

**What:** Configure three sensors with activation constraints to prevent accidental drags and support all input methods.
**When to use:** Always for kanban boards.

```typescript
const sensors = useSensors(
  useSensor(MouseSensor, {
    // Require 8px movement before activating (prevents click-vs-drag confusion)
    activationConstraint: { distance: 8 },
  }),
  useSensor(TouchSensor, {
    // Long-press 200ms with 5px tolerance (prevents scroll-vs-drag confusion)
    activationConstraint: { delay: 200, tolerance: 5 },
  }),
  useSensor(KeyboardSensor)
);
```
Source: [dnd-kit docs - sensors](https://docs.dndkit.com/presets)
**Confidence: HIGH** -- verified in Context7 docs with exact code examples.

### Pattern 4: Optimistic Status Update via SWR on DragEnd

**What:** On `onDragEnd`, optimistically update SWR cache, then call API. If API fails, SWR auto-rollbacks.
**When to use:** Every kanban drag-end operation.

```typescript
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  setActiveTask(null);

  if (!over) return;

  const taskId = active.id as string;
  const newStatus = over.id as TaskStatus;
  const task = tasks.find(t => t.id === taskId);
  if (!task || task.status === newStatus) return;

  // Optimistic update
  mutate(
    async () => {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update task status");
      return res.json();
    },
    {
      optimisticData: (current) => ({
        ...current,
        tasks: current.tasks.map((t: Task) =>
          t.id === taskId
            ? { ...t, status: newStatus, is_completed: newStatus === "done" }
            : t
        ),
      }),
      rollbackOnError: true,
      revalidate: false,
    }
  ).catch(() => {
    toast.error(t("kanban.dragError"));
  });
}
```
Source: [SWR mutation docs](https://swr.vercel.app/docs/mutation), existing pattern in `dashboard-content.tsx`
**Confidence: HIGH** -- follows the exact same pattern already used in the codebase for habit toggles.

### Pattern 5: Priority-Based Auto-Sort Within Columns

**What:** Cards within each column are sorted by priority descending (3=high first, 0=none last). No manual reordering.
**When to use:** When rendering cards within a column.

```typescript
function sortByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => b.priority - a.priority);
}

// In KanbanColumn:
const sortedTasks = useMemo(() => sortByPriority(tasks), [tasks]);
```

This eliminates the need for `sort_order` updates on drag -- only `status` changes. Simplifies both the UI logic and the API call.
**Confidence: HIGH** -- locked decision from CONTEXT.

### Pattern 6: Monday.com-Style Detail Popup

**What:** Full overlay modal using shadcn/ui Dialog with two-panel layout.
**When to use:** When a kanban card is clicked.

```typescript
// kanban-detail-modal.tsx
<Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
  <DialogContent className="max-w-4xl max-h-[90vh] p-0">
    {/* Tabs: Details | Activity */}
    <Tabs defaultValue="details">
      <div className="border-b px-6 pt-6 pb-0">
        <h2 className="text-xl font-semibold mb-4">{task.title}</h2>
        <TabsList>
          <TabsTrigger value="details">{t("kanban.detail.detailsTab")}</TabsTrigger>
          <TabsTrigger value="activity">{t("kanban.detail.activityTab")}</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="details" className="flex gap-0 m-0">
        {/* Left panel: task fields */}
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          {/* Status, priority, section, project, due date, description fields */}
        </div>

        {/* Right panel: placeholder for future comments */}
        <div className="w-80 border-l p-6 bg-muted/30">
          <p className="text-sm text-muted-foreground">
            {t("kanban.detail.commentsPlaceholder")}
          </p>
        </div>
      </TabsContent>

      <TabsContent value="activity">
        {/* Empty state for future activity log */}
      </TabsContent>
    </Tabs>
  </DialogContent>
</Dialog>
```
Source: Monday.com reference screenshots, shadcn/ui Dialog docs
**Confidence: MEDIUM** -- design matches the reference but specific styling will need iteration.

### Anti-Patterns to Avoid

- **Dual state for kanban columns:** Do NOT maintain both `useState` columns AND SWR cache. Use SWR as single source of truth, derive columns with `useMemo`. Use `optimisticData` for instant updates.
- **API calls on onDragOver:** Do NOT call API during drag. Only call on `onDragEnd`. Use local state only for the DragOverlay visual.
- **Using SortableContext for columns:** Since there is no within-column reordering (auto-sort by priority), `useSortable` adds unnecessary complexity. Use plain `useDroppable` for columns and `useDraggable` for cards.
- **Full SSR for kanban page:** Do NOT rely on `"use client"` alone. Must use `next/dynamic({ ssr: false })` for the board component.
- **Separate API endpoint for kanban drag:** Do NOT create a `/api/tasks/reorder` endpoint. Since we only change `status` (no sort_order), the existing `PATCH /api/tasks/[id]` with `{ status }` is sufficient. The `syncTaskUpdate` layer handles `is_completed`/`completed_at` derivation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Drag and drop | Custom pointer event handlers | `@dnd-kit/core` DndContext + useDraggable + useDroppable | Touch support, keyboard accessibility, collision detection, DragOverlay -- all solved. 1000+ edge cases in gesture handling. |
| Drag overlay (ghost card) | Manual portal + position tracking | `@dnd-kit/core` DragOverlay component | Handles z-index, portal rendering, position tracking, animation. |
| Touch long-press detection | Custom touch event timer | `@dnd-kit/core` TouchSensor with `activationConstraint: { delay }` | Handles cancel-on-scroll, tolerance, multi-touch edge cases. |
| Keyboard DnD navigation | Custom keydown handlers | `@dnd-kit/core` KeyboardSensor | Handles arrow keys, tab order, screen reader announcements, focus management. |
| Status/is_completed sync | Manual `if` checks at each call site | `syncTaskUpdate()` from `lib/tasks/sync.ts` | Already exists and handles all 3 cases (status-only, is_completed-only, both). Tested. |
| Sort order computation | Custom position arithmetic | `getBottomSortOrder()` / `getSortOrderBetween()` from `lib/tasks/sort-order.ts` | Already exists. Float-based with 2^16 gaps. |
| Full overlay modal | Custom modal with portal | shadcn/ui `Dialog` with `DialogContent` | Handles focus trap, escape to close, overlay click, animation, accessibility. |

**Key insight:** The combination of @dnd-kit for DnD behavior and the existing sync/sort-order utilities means very little custom logic is needed. The main work is component composition and SWR integration.

## Common Pitfalls

### Pitfall 1: Hydration Mismatch with DnD Components

**What goes wrong:** DnD components render differently on server vs client because they rely on browser APIs. React throws "Hydration failed" errors.
**Why it happens:** `"use client"` does NOT mean client-only rendering in Next.js App Router. The server still pre-renders the component.
**How to avoid:** Wrap the kanban board with `next/dynamic({ ssr: false, loading: () => <KanbanSkeleton /> })`. Only the board component needs this -- the page shell (header, breadcrumbs) can be server-rendered.
**Warning signs:** Console errors mentioning "hydration" during development. Content flashing on page load.

### Pitfall 2: Click vs Drag Confusion

**What goes wrong:** Clicking a card to open the detail popup also triggers a drag. The card moves slightly and the popup opens simultaneously.
**Why it happens:** Without an activation constraint, any mousedown starts a drag.
**How to avoid:** Set `activationConstraint: { distance: 8 }` on MouseSensor and `{ delay: 200, tolerance: 5 }` on TouchSensor. This means the user must move 8px before drag activates. A simple click (no movement) fires the onClick handler instead.
**Warning signs:** Cards jumping on click. Detail popup opening and closing rapidly.

### Pitfall 3: SWR Revalidation During Drag Cancels the Operation

**What goes wrong:** SWR's `revalidateOnFocus` fires when the browser window regains focus (e.g., after an alt-tab). If this happens during a drag, the task list re-renders and the drag context is lost.
**Why it happens:** `revalidateOnFocus: true` is the default SWR behavior, and the existing `tasks-page-content.tsx` uses it.
**How to avoid:** Use `revalidateOnFocus: false` for the kanban board's SWR hook. The board is a focused work surface; background revalidation is disruptive. Alternatively, conditionally disable during drag with `isDragging` state.
**Warning signs:** Drag operations getting "stuck" or cancelled when switching windows.

### Pitfall 4: Missing project_id Filter in Tasks API

**What goes wrong:** The kanban board needs to fetch only tasks for a specific project, but the existing `GET /api/tasks` does not support `project_id` filtering.
**Why it happens:** `TaskFilters` in types.ts includes `project_id` but the API route handler never reads or applies it. The `getUserTasks` DB method also doesn't filter by it.
**How to avoid:** Add `project_id` query parameter handling to `GET /api/tasks` route and corresponding filter logic in `TasksDB.getUserTasks()`.
**Warning signs:** Kanban board showing ALL user tasks instead of just the project's tasks.

### Pitfall 5: Dropping Card on Same Column Triggers Unnecessary API Call

**What goes wrong:** User drags a card and drops it back in the same column. The `onDragEnd` handler fires an API call to update status to the same value.
**Why it happens:** `onDragEnd` fires regardless of whether the drop target changed.
**How to avoid:** In `onDragEnd`, check `task.status === newStatus` before making API call. Return early if status hasn't changed.
**Warning signs:** Unnecessary PATCH requests visible in network tab.

### Pitfall 6: Route Mismatch Between ProjectCard and Kanban Page

**What goes wrong:** ProjectCard already navigates to `/projects/${project.id}/board` but the CONTEXT says the route should be `/projects/[id]/kanban`.
**Why it happens:** The route was wired in Phase 14 before the final route was decided in Phase 15's CONTEXT.
**How to avoid:** Either create the route at `/projects/[id]/board/page.tsx` (matching existing code) or update ProjectCard to use `/projects/[id]/kanban` (matching CONTEXT). See Open Questions.
**Warning signs:** 404 page when clicking a project card.

### Pitfall 7: DragOverlay Not Rendering in Portal

**What goes wrong:** The ghost card during drag renders inline and gets clipped by overflow:hidden on column containers.
**Why it happens:** Without DragOverlay, the dragged element is the actual DOM node which respects parent overflow.
**How to avoid:** Always use DragOverlay component from @dnd-kit/core. It renders in a portal by default, floating above all other content.
**Warning signs:** Ghost card disappearing when dragged outside its column boundary.

## Code Examples

### Example 1: Droppable Kanban Column

```typescript
// components/kanban/kanban-column.tsx
"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { KanbanCard } from "./kanban-card";
import type { Task, TaskStatus } from "@/lib/db/types";

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  onCardClick: (task: Task) => void;
}

export function KanbanColumn({ status, title, tasks, onCardClick }: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col w-72 min-w-72 shrink-0 rounded-lg bg-muted/30",
        isOver && "ring-2 ring-primary/50 bg-primary/5"
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <Badge variant="secondary" className="text-xs">
          {tasks.length}
        </Badge>
      </div>

      {/* Scrollable card area */}
      <ScrollArea className="flex-1 px-2 pb-2">
        <div className="space-y-2">
          {tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              onClick={() => onCardClick(task)}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
```
Source: [dnd-kit useDroppable docs](https://docs.dndkit.com/api-documentation/droppable)

### Example 2: Draggable Kanban Card

```typescript
// components/kanban/kanban-card.tsx
"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "lucide-react";
import type { Task } from "@/lib/db/types";

interface KanbanCardProps {
  task: Task;
  onClick: () => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  3: "bg-priority-high text-white",
  2: "bg-priority-medium text-white",
  1: "bg-priority-low text-white",
  0: "bg-muted text-muted-foreground",
};

const PRIORITY_LABELS: Record<number, string> = {
  3: "High", 2: "Medium", 1: "Low", 0: "None",
};

export function KanbanCard({ task, onClick }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : undefined;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        // Only fire onClick if not dragging
        if (!isDragging) onClick();
      }}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-shadow",
        "hover:shadow-md",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <CardContent className="p-3 space-y-2">
        <h4 className="text-sm font-medium leading-tight">{task.title}</h4>
        <div className="flex items-center justify-between">
          {task.priority > 0 && (
            <Badge className={cn("text-xs", PRIORITY_COLORS[task.priority])}>
              {PRIORITY_LABELS[task.priority]}
            </Badge>
          )}
          {task.due_date && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              {task.due_date}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```
Source: [dnd-kit useDraggable docs](https://docs.dndkit.com/introduction/getting-started), [dnd-kit utilities CSS transform](https://docs.dndkit.com/presets)

### Example 3: Quick-Add on Column Hover

```typescript
// Appears on column hover, after the last card
const [hoveredColumn, setHoveredColumn] = useState<TaskStatus | null>(null);
const [quickAddValue, setQuickAddValue] = useState("");

// In column component:
<div
  onMouseEnter={() => setHoveredColumn(status)}
  onMouseLeave={() => setHoveredColumn(null)}
>
  {/* ... cards ... */}
  {hoveredColumn === status && (
    <form onSubmit={handleQuickAdd}>
      <Input
        placeholder={t("kanban.quickAdd.placeholder")}
        value={quickAddValue}
        onChange={(e) => setQuickAddValue(e.target.value)}
        autoFocus
        className="text-sm"
      />
    </form>
  )}
</div>
```

### Example 4: Fetching Project Tasks with SWR

```typescript
// In kanban-board.tsx
const { data, error, isLoading, mutate } = useSWR<{ tasks: Task[] }>(
  `/api/tasks?project_id=${projectId}`,
  fetcher,
  {
    revalidateOnFocus: false,  // Prevent revalidation during drag
    keepPreviousData: true,
  }
);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `react-beautiful-dnd` | `@dnd-kit/core` v6 | 2023 (rbd deprecated April 2025) | rbd archived, @dnd-kit is the community standard |
| `@dnd-kit/core` v5 | `@dnd-kit/core` v6.3.1 | Dec 2024 | Minor improvements, same API surface |
| `@dnd-kit/core` | `@dnd-kit/react` v0.x (rewrite) | In progress, NOT stable | New ground-up rewrite for React 19. NOT recommended for production yet. |
| Integer sort_order | Float sort_order | Industry practice | Single-row updates instead of full renumbering |
| Separate DnD state + server state | SWR optimistic updates | SWR v2 (2023) | Single source of truth, automatic rollback |

**Deprecated/outdated:**
- `react-beautiful-dnd`: Archived April 2025. Do NOT use.
- `react-dnd`: Stale, last meaningful update 2022. React 19 not supported.
- `@dnd-kit/react` v0.x: NOT deprecated but NOT stable. Pre-1.0, no production guidance from maintainer.

## Codebase Integration Points

### Existing Code That Will Be Modified

| File | What Changes | Why |
|------|-------------|-----|
| `app/api/tasks/route.ts` GET handler | Add `project_id` query param filtering | Kanban board needs to fetch only the project's tasks |
| `lib/db/tasks.ts` `getUserTasks()` | Add `project_id` filter to query builder | Support the API filter |
| `components/projects/project-card.tsx` | Potentially update route from `/board` to `/kanban` | Match CONTEXT decision (see Open Questions) |
| `package.json` | Add @dnd-kit deps + peerDependencyRules | Install DnD library |
| `i18n/messages/en.json` | Add `kanban` namespace | All board UI strings |
| `i18n/messages/zh.json` | Add `kanban` namespace | Chinese translations |
| `i18n/messages/zh-TW.json` | Add `kanban` namespace | Traditional Chinese translations |

### Existing Code That Will Be Reused (Unchanged)

| File | What It Provides |
|------|-----------------|
| `lib/tasks/sync.ts` `syncTaskUpdate()` | Handles status <-> is_completed/completed_at bidirectional sync |
| `lib/tasks/sort-order.ts` | `getBottomSortOrder()` for quick-add task creation |
| `lib/tasks/format.ts` `getPriorityColor()` | Priority color classes for card badges |
| `lib/db/types.ts` | `Task`, `TaskStatus`, `TaskSection`, `Project` types |
| `lib/validations/task.ts` | `taskUpdateSchema` accepts `status`, `taskFormSchema` for quick-add |
| `lib/projects/colors.ts` `getProjectColor()` | Project color for kanban header accent |
| `lib/hooks/use-projects.ts` | Fetching project data (not directly used in board, but by page) |
| `lib/fetcher.ts` | SWR fetcher function |
| `components/ui/dialog.tsx` | Full overlay modal for detail popup |
| `components/ui/badge.tsx` | Priority badges, count badges |
| `components/ui/card.tsx` | Card component for kanban cards |
| `components/ui/scroll-area.tsx` | Scrollable column containers |
| `components/ui/tabs.tsx` | Tabs in detail modal (Details/Activity) |
| `components/ui/skeleton.tsx` | Loading skeleton components |
| `components/ui/input.tsx` | Quick-add text input |
| `components/layouts/sidebar-shell.tsx` | Layout wrapper for the board page |
| `components/layouts/page-header.tsx` | Reusable for board header (or custom minimal header) |

### New API Requirements

The existing `PATCH /api/tasks/[id]` already supports `{ status }` updates and routes through `syncTaskUpdate()`. No new API endpoint is needed for drag-and-drop. The only API modification needed is adding `project_id` filtering to `GET /api/tasks`.

For quick-add, the existing `POST /api/tasks` works perfectly -- just needs `{ title, project_id, status, section }` in the body.

## Open Questions

1. **Route path: `/projects/[id]/board` vs `/projects/[id]/kanban`**
   - What we know: The CONTEXT says `/projects/[id]/kanban`. The existing `ProjectCard` component (from Phase 14) already links to `/projects/[id]/board`.
   - What's unclear: Whether to match the existing code or update it to match CONTEXT.
   - Recommendation: Use `/projects/[id]/board` since the code already uses it. Less churn. The semantic difference is negligible. If the user strongly prefers `/kanban`, update the ProjectCard link at the same time.

2. **Quick-add: which fields are pre-filled?**
   - What we know: Quick-add creates a task in the column's status with the project's section and project_id.
   - What's unclear: Default priority? Default section (inherit from project)?
   - Recommendation: Pre-fill `{ project_id, status: columnStatus, section: project.section, priority: 0 }`. Title is the only user input. User can edit other fields by clicking the card to open the detail popup.

3. **Detail popup: inline field editing or read-only with edit button?**
   - What we know: Monday.com allows inline editing of fields directly in the popup. The existing task detail page is read-only with an Edit button that goes to a separate edit page.
   - What's unclear: Should the popup fields be editable in-place or read-only?
   - Recommendation: Start with read-only fields + an "Edit" button that navigates to the existing edit page (`/tasks/[id]/edit`). Inline editing is a significant UX enhancement but adds complexity (each field needs edit mode, validation, API calls). Can be added later.

4. **Board page layout: with or without sidebar?**
   - What we know: The tasks page uses `SidebarShell` for layout. The CONTEXT describes a "minimal header" with "project name, back arrow, task count".
   - What's unclear: Should the kanban board page include the full sidebar or be a more immersive full-width experience?
   - Recommendation: Include `SidebarShell` for consistency with other pages. The board area itself gets the full available width (columns scroll horizontally). The minimal header is within the main content area.

## Sources

### Primary (HIGH confidence)
- [dnd-kit official docs](https://docs.dndkit.com) via Context7 `/websites/dndkit` - DndContext, sensors, collision detection, useDroppable, useDraggable, DragOverlay, SortableContext patterns
- [npm: @dnd-kit/core](https://www.npmjs.com/package/@dnd-kit/core) - v6.3.1, published Dec 2024, peer deps React >=16.8.0
- [npm: @dnd-kit/sortable](https://www.npmjs.com/package/@dnd-kit/sortable) - v10.0.0, peer deps @dnd-kit/core ^6.3.0
- [npm: @dnd-kit/utilities](https://www.npmjs.com/package/@dnd-kit/utilities) - v3.2.2
- BetterR.Me codebase: `lib/db/tasks.ts`, `lib/db/types.ts`, `lib/db/projects.ts`, `lib/tasks/sync.ts`, `lib/tasks/sort-order.ts`, `lib/tasks/format.ts`, `lib/validations/task.ts`, `lib/hooks/use-projects.ts`, `components/projects/project-card.tsx`, `components/tasks/tasks-page-content.tsx`, `components/tasks/task-card.tsx`, `components/tasks/task-detail-content.tsx`, `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `app/api/projects/[id]/route.ts`
- BetterR.Me prior research: `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`, `.planning/research/ARCHITECTURE.md`
- Monday.com reference screenshots: `monday-kanban-board.png`, `monday-task-detail-popup.png`

### Secondary (MEDIUM confidence)
- [dnd-kit + shadcn/ui + Tailwind kanban example](https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui) - reference implementation with accessibility focus
- [LogRocket: Build a Kanban Board with dnd-kit](https://blog.logrocket.com/build-kanban-board-dnd-kit-react/) - cross-column drag patterns, rectIntersection collision detection
- [Chetan Verma: Kanban board with dnd-kit](https://www.chetanverma.com/blog/how-to-create-an-awesome-kanban-board-using-dnd-kit) - closestCorners, findContainer pattern, DragOverlay usage, handleDragEnd/handleDragMove patterns
- [GitHub Discussion #1842: @dnd-kit/react vs @dnd-kit/core roadmap](https://github.com/clauderic/dnd-kit/discussions/1842) - no official response, @dnd-kit/core remains safer choice
- [SWR mutation & revalidation docs](https://swr.vercel.app/docs/mutation) - optimistic updates with rollbackOnError
- [pnpm peerDependencyRules docs](https://pnpm.io/settings) - React 19 peer dep fix

### Tertiary (LOW confidence)
- [GitHub Issue #1654: @dnd-kit/react missing "use client"](https://github.com/clauderic/dnd-kit/issues/1654) - confirms @dnd-kit/react not ready for Next.js App Router

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @dnd-kit/core v6 is well-documented, verified via npm + Context7, extensive community adoption
- Architecture: HIGH - follows existing codebase patterns exactly, all integration points verified against actual source code
- Pitfalls: HIGH - verified against codebase (hydration, API gaps, sensor config) + prior research + community sources

**Research date:** 2026-02-20
**Valid until:** 2026-03-20 (stable -- @dnd-kit/core v6 is mature, unlikely to change)
