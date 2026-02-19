# Architecture Patterns

**Domain:** Projects & Kanban integration into existing BetterR.Me habit tracking app
**Researched:** 2026-02-18

## Recommended Architecture

### High-Level Integration Overview

The Projects & Kanban feature integrates into the existing `DB class -> API route -> SWR hook -> React component` data flow. No new architectural patterns are introduced -- every new piece follows the exact conventions already established in the codebase.

```
                                    EXISTING                          NEW
                             +-----------------+            +-----------------+
                             |   Dashboard     |            |  Projects Page  |
                             |  Tasks Page     |            |  Kanban Board   |
                             +-----------------+            +-----------------+
                                     |                              |
                              SWR hooks                      SWR hooks (new)
                              (existing)                     useProjects()
                                     |                       useTasks() (extended)
                                     v                              v
                             +-----------------+            +-----------------+
                             | /api/tasks      |            | /api/projects   |
                             | /api/dashboard  |            | /api/tasks      |
                             +-----------------+            |   (extended)    |
                                     |                      +-----------------+
                                     v                              v
                             +-----------------+            +-----------------+
                             |   TasksDB       |            |  ProjectsDB     |
                             |   (existing)    |            |  TasksDB        |
                             +-----------------+            |   (extended)    |
                                     |                      +-----------------+
                                     v                              v
                             +-----------------+            +-----------------+
                             |  tasks table    |            | projects table  |
                             |  (existing)     |            | tasks table     |
                             +-----------------+            |  (+ new cols)   |
                                                            +-----------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|--------------|
| `ProjectsDB` | CRUD for projects table, sort_order management | Supabase client | **NEW** |
| `TasksDB` (extended) | Existing task CRUD + new filters for section/status/project_id | Supabase client | **MODIFIED** |
| `/api/projects/route.ts` | GET/POST for projects | ProjectsDB | **NEW** |
| `/api/projects/[id]/route.ts` | GET/PATCH/DELETE for single project | ProjectsDB | **NEW** |
| `/api/tasks/route.ts` (extended) | Extended GET with section/status/project_id filters, new PATCH for bulk status/order updates | TasksDB | **MODIFIED** |
| `/api/tasks/reorder/route.ts` | Bulk reorder endpoint for drag-and-drop | TasksDB | **NEW** |
| `useProjects()` | SWR hook for projects list | `/api/projects` | **NEW** |
| `useTasks()` | SWR hook with extended filters (section, status, project) | `/api/tasks` | **NEW** (replaces inline fetcher in TasksPageContent) |
| `useKanbanTasks()` | SWR hook for kanban board (tasks grouped by status) | `/api/tasks?view=kanban` | **NEW** |
| `ProjectsPageContent` | Projects listing page | useProjects() | **NEW** |
| `KanbanBoard` | Kanban board with drag-and-drop columns | useKanbanTasks(), DnD library | **NEW** |
| `KanbanColumn` | Single status column (Backlog/Todo/In Progress/Done) | KanbanBoard (parent) | **NEW** |
| `KanbanCard` | Draggable task card within kanban column | KanbanColumn (parent) | **NEW** |
| `TasksPageContent` (redesigned) | Section-based task layout (Work/Personal tabs or toggle) | useTasks() | **MODIFIED** |
| `TaskCard` (extended) | Show project badge, section indicator | Task data | **MODIFIED** |
| `TaskForm` (extended) | Section, status, and project_id fields | Validation schemas | **MODIFIED** |
| `AppSidebar` (extended) | Projects nav item in sidebar | Navigation config | **MODIFIED** |

## Data Model Changes

### New Table: `projects`

```sql
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'work' CHECK (section IN ('work', 'personal')),
  color TEXT NOT NULL DEFAULT '#6366f1',  -- hex color for project badge
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  sort_order FLOAT8 NOT NULL DEFAULT 0,  -- float for efficient drag reorder
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_user_section ON projects(user_id, section) WHERE status = 'active';

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own projects"
  ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE USING (auth.uid() = user_id);

-- Trigger
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Modified Table: `tasks` (new columns)

```sql
-- Add section column (work/personal, independent of category)
ALTER TABLE tasks ADD COLUMN section TEXT DEFAULT 'personal'
  CHECK (section IN ('work', 'personal'));

-- Add kanban status column
ALTER TABLE tasks ADD COLUMN status TEXT DEFAULT 'todo'
  CHECK (status IN ('backlog', 'todo', 'in_progress', 'done'));

-- Add project FK (optional -- tasks can exist without a project)
ALTER TABLE tasks ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Add sort_order for kanban column ordering
ALTER TABLE tasks ADD COLUMN sort_order FLOAT8 DEFAULT 0;

-- Indexes for common query patterns
CREATE INDEX idx_tasks_section ON tasks(user_id, section) WHERE is_completed = false;
CREATE INDEX idx_tasks_status ON tasks(user_id, status) WHERE is_completed = false;
CREATE INDEX idx_tasks_project ON tasks(user_id, project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_tasks_kanban ON tasks(user_id, status, sort_order);
```

**Confidence: HIGH** -- follows the exact same patterns as existing schema migrations in the codebase.

### sort_order Strategy: Float-Based Ordering

Use `FLOAT8` (double precision) for `sort_order` instead of integers because:

1. **Single-row updates on reorder**: When dragging a task between two others, compute midpoint (`(prev.sort_order + next.sort_order) / 2`) and update only the moved task. No need to renumber siblings.
2. **Cross-column moves**: When moving to a new kanban column, find the midpoint between the target neighbors, update the single task's `status` + `sort_order` in one write.
3. **Edge cases**: Insert at top = `first_item.sort_order - 1.0`. Insert at bottom = `last_item.sort_order + 1.0`.
4. **Periodic normalization**: After ~50 reorders in the same neighborhood, precision degrades. Add a background normalization that reassigns integer sort_orders (1.0, 2.0, 3.0...) when gap between adjacent items < 0.001. This is a future optimization, not a launch blocker.

**Confidence: MEDIUM** -- float ordering is a well-established pattern for drag-and-drop, but the normalization threshold (0.001) is a heuristic that should be validated in practice.

## New DB Classes

### `ProjectsDB` (new file: `lib/db/projects.ts`)

Follow the exact same pattern as `TasksDB` and `HabitsDB`:

```typescript
import { createClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, ProjectInsert, ProjectUpdate, ProjectFilters } from './types';

export class ProjectsDB {
  constructor(private supabase: SupabaseClient) {}

  async getUserProjects(userId: string, filters?: ProjectFilters): Promise<Project[]> {
    let query = this.supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.section) query = query.eq('section', filters.section);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getProject(projectId: string, userId: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  async createProject(project: ProjectInsert): Promise<Project> {
    const { data, error } = await this.supabase
      .from('projects')
      .insert(project)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateProject(projectId: string, userId: string, updates: ProjectUpdate): Promise<Project> {
    const { data, error } = await this.supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteProject(projectId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) throw error;
  }
}

export const projectsDB = new ProjectsDB(createClient());
```

### `TasksDB` Extensions

Add these methods to the existing `TasksDB` class:

```typescript
// In lib/db/tasks.ts -- add to existing class

/**
 * Get tasks grouped by status for kanban view
 */
async getKanbanTasks(userId: string, filters?: { section?: string; project_id?: string }): Promise<Task[]> {
  let query = this.supabase
    .from('tasks')
    .select('*, projects:project_id(id, name, color)')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (filters?.section) query = query.eq('section', filters.section);
  if (filters?.project_id) query = query.eq('project_id', filters.project_id);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Bulk update sort_order for drag-and-drop reorder
 * Accepts array of { id, sort_order, status? }
 */
async reorderTasks(
  userId: string,
  updates: Array<{ id: string; sort_order: number; status?: string }>
): Promise<void> {
  // Use a transaction-like approach: update each task
  // Supabase doesn't support multi-row update in one call,
  // so batch with Promise.all (RLS ensures user_id scoping)
  const promises = updates.map(({ id, sort_order, status }) => {
    const updateData: Record<string, unknown> = { sort_order };
    if (status) updateData.status = status;

    return this.supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId);
  });

  const results = await Promise.all(promises);
  const failed = results.find(r => r.error);
  if (failed?.error) throw failed.error;
}

/**
 * Get tasks for a specific project
 */
async getProjectTasks(userId: string, projectId: string): Promise<Task[]> {
  const { data, error } = await this.supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}
```

**Note on `reorderTasks`**: Supabase JS client does not support multi-row upsert with different values per row. The `Promise.all` approach works but is N+1 writes. For a typical drag operation, N=1 (move one task, update one row). Batch reorder (normalizing all tasks in a column) could be N=20-50. This is acceptable at the scale of a personal productivity app. If it becomes a bottleneck, use a Supabase Edge Function with raw SQL for batch updates.

**Confidence: HIGH** -- follows existing patterns exactly. The `select('*, projects:project_id(...)')` join syntax is standard Supabase.

## New Type Definitions

Add to `lib/db/types.ts`:

```typescript
// =============================================================================
// PROJECTS
// =============================================================================

export type ProjectSection = 'work' | 'personal';
export type ProjectStatus = 'active' | 'archived';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  section: ProjectSection;
  color: string;
  status: ProjectStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type ProjectInsert = Omit<Project, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type ProjectUpdate = Partial<Omit<Project, 'id' | 'user_id' | 'created_at' | 'updated_at'>>;

export interface ProjectFilters {
  status?: ProjectStatus;
  section?: ProjectSection;
}

// =============================================================================
// TASK EXTENSIONS
// =============================================================================

export type TaskSection = 'work' | 'personal';
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'done';

// Extend TaskFilters with new fields
export interface TaskFilters {
  is_completed?: boolean;
  priority?: Priority;
  due_date?: string;
  has_due_date?: boolean;
  section?: TaskSection;      // NEW
  status?: TaskStatus;        // NEW
  project_id?: string;        // NEW
}

// Task with joined project data (for kanban view)
export interface TaskWithProject extends Task {
  projects: Pick<Project, 'id' | 'name' | 'color'> | null;
}
```

## New Validation Schemas

Add to `lib/validations/task.ts` (extend existing schemas):

```typescript
// Extend taskFormSchema
export const taskFormSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().max(500).optional().nullable(),
  intention: z.string().max(200).optional().nullable(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  category: z.enum(["work", "personal", "shopping", "other"]).nullable().optional(),
  due_date: z.string().nullable().optional(),
  due_time: z.string().nullable().optional(),
  completion_difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().optional(),
  section: z.enum(["work", "personal"]).optional(),           // NEW
  status: z.enum(["backlog", "todo", "in_progress", "done"]).optional(),  // NEW
  project_id: z.string().uuid().nullable().optional(),        // NEW
});
```

New file `lib/validations/project.ts`:

```typescript
import { z } from "zod";

export const projectFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(50, "Name must be 50 characters or less"),
  section: z.enum(["work", "personal"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color"),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const projectUpdateSchema = projectFormSchema.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
  sort_order: z.number().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided",
});
```

New file `lib/validations/reorder.ts`:

```typescript
import { z } from "zod";

export const reorderSchema = z.object({
  updates: z.array(z.object({
    id: z.string().uuid(),
    sort_order: z.number(),
    status: z.enum(["backlog", "todo", "in_progress", "done"]).optional(),
  })).min(1).max(100),  // Cap at 100 to prevent abuse
});

export type ReorderValues = z.infer<typeof reorderSchema>;
```

## New API Routes

### `/api/projects/route.ts`

```
GET  /api/projects                    -> List user's projects (with filters)
POST /api/projects                    -> Create project
```

### `/api/projects/[id]/route.ts`

```
GET    /api/projects/[id]             -> Get single project
PATCH  /api/projects/[id]             -> Update project
DELETE /api/projects/[id]             -> Delete project (tasks get project_id = NULL)
```

### `/api/tasks/route.ts` (extended)

```
GET /api/tasks?view=kanban&section=work     -> Kanban view with project joins
GET /api/tasks?section=work                 -> Filter by section
GET /api/tasks?project_id=uuid             -> Filter by project
GET /api/tasks?status=in_progress          -> Filter by kanban status
```

### `/api/tasks/reorder/route.ts` (new)

```
POST /api/tasks/reorder               -> Bulk update sort_order (and optionally status)
```

This is a dedicated endpoint rather than overloading PATCH on individual tasks because:
1. Drag-and-drop moves may update 1-3 tasks atomically (moved task + neighbors for normalization)
2. Cross-column moves need to update both `status` and `sort_order`
3. Keeps the existing PATCH endpoint's validation clean

## New SWR Hooks

### `lib/hooks/use-projects.ts`

```typescript
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Project, ProjectSection } from "@/lib/db/types";

export function useProjects(filters?: { section?: ProjectSection }) {
  const params = new URLSearchParams();
  if (filters?.section) params.set("section", filters.section);

  const { data, error, isLoading, mutate } = useSWR<{ projects: Project[] }>(
    `/api/projects?${params}`,
    fetcher,
    { revalidateOnFocus: true }
  );

  return {
    projects: data?.projects ?? [],
    error,
    isLoading,
    mutate,
  };
}
```

### `lib/hooks/use-tasks.ts` (new, replaces inline fetcher)

```typescript
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Task, TaskWithProject, TaskSection, TaskStatus } from "@/lib/db/types";

interface UseTasksOptions {
  section?: TaskSection;
  status?: TaskStatus;
  project_id?: string;
  view?: "kanban";
}

export function useTasks(options?: UseTasksOptions) {
  const params = new URLSearchParams();
  if (options?.section) params.set("section", options.section);
  if (options?.status) params.set("status", options.status);
  if (options?.project_id) params.set("project_id", options.project_id);
  if (options?.view) params.set("view", options.view);

  const { data, error, isLoading, mutate } = useSWR<{ tasks: TaskWithProject[] }>(
    `/api/tasks?${params}`,
    fetcher,
    { revalidateOnFocus: true, keepPreviousData: true }
  );

  return {
    tasks: data?.tasks ?? [],
    error,
    isLoading,
    mutate,
  };
}
```

## Drag-and-Drop Architecture

### Library Choice: `@dnd-kit/react` (new rewrite)

**Recommendation: `@dnd-kit/react` v0.3.x** because:

1. **React 19 compatible**: Peer dependencies explicitly declare `react: '^18.0.0 || ^19.0.0'` (verified via npm registry).
2. **Ground-up rewrite**: The new `@dnd-kit/react` is a complete rewrite built on `@dnd-kit/dom`, designed for modern React. The legacy `@dnd-kit/core` v6.x has open issues with React 19 (GitHub issue #1511).
3. **Sortable built-in**: Ships with `@dnd-kit/react/sortable` for kanban column reordering.
4. **Lightweight**: ~10kB, zero external dependencies.
5. **Accessibility**: Built-in keyboard navigation and screen reader announcements.
6. **Tailwind + shadcn/ui compatible**: The library is headless -- it provides behavior, not styles. Works perfectly with the existing design system.

**Alternative considered: `@atlaskit/pragmatic-drag-and-drop`**
- Also React 19 compatible (wide peer deps: `^16.8 || ^17 || ^18 || ^19`).
- Framework-agnostic (vanilla JS core), which is overkill for a React-only app.
- Requires importing from `@atlaskit/*` packages (Atlassian's monorepo), adding more dependencies.
- Fewer community examples with shadcn/ui + Tailwind.

**Alternative considered: `@dnd-kit/core` (legacy)**
- Does not officially support React 19. Works with `--legacy-peer-deps` or overrides, but this is a workaround, not a solution.
- More community examples exist, but the library is being superseded by `@dnd-kit/react`.

**Risk: `@dnd-kit/react` is pre-1.0 (v0.3.x)**
- The API may change before 1.0.
- Mitigation: Isolate all dnd-kit usage behind an internal abstraction layer (`lib/kanban/dnd-provider.tsx`, `lib/kanban/use-kanban-dnd.ts`). If the API changes, only these files need updating.
- The existing `@dnd-kit/core` can be used as a fallback if `@dnd-kit/react` proves unstable.

**Confidence: MEDIUM** -- `@dnd-kit/react` is the correct choice for React 19, but its pre-1.0 status means API instability is possible. The abstraction layer mitigation is sound.

### Installation

```bash
pnpm add @dnd-kit/react @dnd-kit/helpers
```

### DnD Component Architecture

```
KanbanBoard (page-level component)
  |-- DragDropProvider (from @dnd-kit/react)
  |     |-- KanbanColumn (status="backlog", droppable)
  |     |     |-- SortableContext
  |     |     |     |-- KanbanCard (draggable + sortable)
  |     |     |     |-- KanbanCard
  |     |     |     |-- ...
  |     |-- KanbanColumn (status="todo", droppable)
  |     |     |-- SortableContext
  |     |     |     |-- KanbanCard
  |     |-- KanbanColumn (status="in_progress", droppable)
  |     |-- KanbanColumn (status="done", droppable)
  |     |-- DragOverlay (floating card during drag)
```

### DnD State Management Pattern

The kanban drag-and-drop follows this data flow:

```
1. DRAG START
   - User grabs a KanbanCard
   - Set activeTaskId in local state
   - DragOverlay renders a ghost card

2. DRAG OVER (cross-column)
   - User drags card over a different KanbanColumn
   - Optimistically move card to new column in local state
   - This gives immediate visual feedback

3. DRAG END
   - User drops card
   - Compute new sort_order (midpoint between neighbors)
   - SWR optimistic update:
     mutate(
       reorderOnServer([{ id, sort_order, status }]),
       {
         optimisticData: (current) => reorderedTasks,
         rollbackOnError: true,
         populateCache: false,
         revalidate: false,
       }
     )
   - API call: POST /api/tasks/reorder

4. ERROR ROLLBACK
   - If API fails, SWR automatically rolls back to previous state
   - Toast error notification
```

**Key design decision**: The kanban board derives its column data from SWR cache, NOT from separate local state. This means:
- Single source of truth (SWR cache)
- Optimistic updates use SWR's `mutate()` with `optimisticData`
- No state synchronization bugs between local state and server state
- `rollbackOnError: true` handles failures automatically

The one exception is during an active drag (`dragOver` events), where a local `useState` temporarily holds the "in-flight" column assignment. On `dragEnd`, this local state is flushed to SWR via `mutate()`.

**Confidence: HIGH** -- this is the exact same optimistic update pattern already used in `dashboard-content.tsx` for habit and task toggles.

### New Component Files

```
components/
  projects/
    projects-page-content.tsx     # Projects listing page
    project-card.tsx              # Project card in listing
    project-form.tsx              # Create/edit project form
    project-selector.tsx          # Dropdown to pick project in task form
  kanban/
    kanban-board.tsx              # Main kanban board with DragDropProvider
    kanban-column.tsx             # Single status column (droppable)
    kanban-card.tsx               # Draggable task card
    kanban-empty-column.tsx       # Empty state for a column
  tasks/
    task-card.tsx                 # MODIFIED: add project badge, section indicator
    task-form.tsx                 # MODIFIED: add section, status, project_id fields
    task-list.tsx                 # MODIFIED: section-based filtering
    tasks-page-content.tsx        # MODIFIED: section tabs, kanban view toggle
    task-section-toggle.tsx       # NEW: Work/Personal toggle control
    task-view-toggle.tsx          # NEW: List/Kanban view toggle
```

### New Route Pages

```
app/
  projects/
    page.tsx                      # Projects listing
    new/page.tsx                  # Create project
    [id]/
      page.tsx                    # Project detail (shows project's tasks in kanban)
      edit/page.tsx               # Edit project
  tasks/
    page.tsx                      # MODIFIED: section-based layout
    kanban/
      page.tsx                    # Dedicated kanban board page (alternative to /tasks?view=kanban)
```

**Decision**: The kanban view can be either a separate page (`/tasks/kanban`) or a view toggle within the existing `/tasks` page. Recommending **view toggle within `/tasks`** because:
- Fewer pages to maintain
- User preference can be persisted in a query param or localStorage
- Consistent with how the existing tasks page already uses tabs (pending/completed)

## Data Flow

### Kanban Board Data Flow (Detailed)

```
1. Page Load: /tasks?view=kanban&section=work
   |
   v
2. TasksPage (Server Component)
   - Read searchParams.view and searchParams.section
   - Pass to KanbanBoard client component
   |
   v
3. KanbanBoard (Client Component)
   - useTasks({ view: "kanban", section: "work" })
   - SWR fetches: GET /api/tasks?view=kanban&section=work
   |
   v
4. API Route: GET /api/tasks?view=kanban&section=work
   - createClient() -> fresh server Supabase client
   - const tasksDB = new TasksDB(supabase)
   - tasksDB.getKanbanTasks(userId, { section: "work" })
   - Returns tasks with joined project data
   |
   v
5. KanbanBoard receives tasks
   - Groups tasks by status: { backlog: [...], todo: [...], in_progress: [...], done: [...] }
   - Renders 4 KanbanColumn components
   - Each column wraps its cards in SortableContext
   |
   v
6. User drags card from "todo" to "in_progress"
   - onDragEnd fires
   - Compute new sort_order for moved card
   - Call SWR mutate() with optimistic data
   - POST /api/tasks/reorder with [{ id, sort_order, status: "in_progress" }]
   |
   v
7. API Route: POST /api/tasks/reorder
   - Validate with reorderSchema
   - tasksDB.reorderTasks(userId, updates)
   - Each update: supabase.from('tasks').update({ sort_order, status }).eq('id', id).eq('user_id', userId)
   - Return success
```

### Task Creation with Project Assignment

```
1. User clicks "New Task" (within a project context or standalone)
   |
   v
2. TaskForm renders with optional project_id pre-selected
   - If created from project page: project_id pre-filled
   - If created from tasks page: project_id is a dropdown (optional)
   - Section defaults to project's section (if project selected)
   - Status defaults to "todo"
   |
   v
3. Form submission: POST /api/tasks
   - Body includes: { title, ..., section, status, project_id }
   - Validation: extended taskFormSchema
   - TasksDB.createTask() with new fields
   |
   v
4. SWR cache invalidation
   - mutate() on tasks list
   - mutate() on kanban view (if open)
   - mutate() on project tasks (if viewing project)
```

### is_completed vs status Relationship

**Critical design decision**: The `is_completed` boolean and the `status` enum are related but distinct:

- `is_completed = true` implies `status = 'done'` (auto-set when toggling complete)
- `status = 'done'` implies `is_completed = true` (auto-set when dragging to Done column)
- Moving OUT of "Done" column sets `is_completed = false`
- The toggle API (`POST /api/tasks/:id/toggle`) must also update `status` to/from 'done'

This bidirectional sync happens in the API layer, not the database (no triggers), to keep logic explicit and testable:

```typescript
// In PATCH /api/tasks/[id] handler
if (updates.is_completed !== undefined) {
  updates.status = updates.is_completed ? 'done' : 'todo';
}
if (updates.status !== undefined) {
  updates.is_completed = updates.status === 'done';
  updates.completed_at = updates.status === 'done' ? new Date().toISOString() : null;
}
```

**Confidence: HIGH** -- this is the simplest correct approach. Database triggers would hide logic and make testing harder.

## Patterns to Follow

### Pattern 1: DB Class Per Entity

**What:** Each database entity (projects, tasks, habits) has its own DB class with constructor-injected Supabase client.
**When:** Always, for any new database entity.
**Example:** `ProjectsDB` follows the exact same pattern as `HabitsDB` and `TasksDB`.

### Pattern 2: SWR Hook Per View

**What:** Each distinct data view gets its own SWR hook with typed response.
**When:** Any component that fetches data from an API route.
**Example:**
```typescript
// lib/hooks/use-projects.ts
export function useProjects(filters?: { section?: ProjectSection }) {
  const params = new URLSearchParams();
  if (filters?.section) params.set("section", filters.section);
  const { data, error, isLoading, mutate } = useSWR<{ projects: Project[] }>(
    `/api/projects?${params}`, fetcher, { revalidateOnFocus: true }
  );
  return { projects: data?.projects ?? [], error, isLoading, mutate };
}
```

### Pattern 3: Optimistic Updates for Mutations

**What:** Use SWR's `mutate()` with `optimisticData` for user-facing mutations.
**When:** Any action that modifies data and should feel instant (drag-drop, toggles, creates).
**Example:** See the existing `handleToggleHabit` in `dashboard-content.tsx` -- the kanban reorder follows this exact pattern.

### Pattern 4: Zod Validation at API Boundaries

**What:** Every API route validates input with a Zod schema before processing.
**When:** Every POST/PATCH/PUT handler.
**Example:** `validateRequestBody(body, reorderSchema)` in the reorder endpoint.

### Pattern 5: Float-Based Sort Order

**What:** Use float values for sort_order to enable single-row updates on reorder.
**When:** Any orderable list that supports drag-and-drop.
**Example:**
```typescript
function computeSortOrder(prevOrder: number | null, nextOrder: number | null): number {
  if (prevOrder === null && nextOrder === null) return 1.0;
  if (prevOrder === null) return nextOrder! - 1.0;
  if (nextOrder === null) return prevOrder + 1.0;
  return (prevOrder + nextOrder) / 2;
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Dual Source of Truth for Kanban State

**What:** Maintaining both local React state AND SWR cache for the same task list in the kanban board.
**Why bad:** State synchronization bugs. Stale data after mutations. Race conditions between local state updates and SWR revalidation.
**Instead:** Use SWR cache as the single source of truth. Derive kanban columns from SWR data. Use `optimisticData` in `mutate()` for instant UI updates.

### Anti-Pattern 2: Integer Sort Order with Full Renumbering

**What:** Using integer `sort_order` (1, 2, 3, ...) and renumbering all items in a column after every drag.
**Why bad:** N writes per drag operation. Conflicts if two users (or tabs) reorder simultaneously. Slow for columns with many items.
**Instead:** Use float `sort_order` with midpoint calculation. Only 1 write per drag.

### Anti-Pattern 3: Separate API Call Per Drag Event (dragOver)

**What:** Calling the API on every `onDragOver` event as the user drags a card.
**Why bad:** Generates dozens of API calls per second during a drag. Server overload. Flickering on rollback.
**Instead:** Only call the API on `onDragEnd`. Use local state for the in-flight visual position during drag.

### Anti-Pattern 4: Database Triggers for is_completed/status Sync

**What:** Using PostgreSQL triggers to auto-sync `is_completed` and `status` fields.
**Why bad:** Hidden logic that's hard to test. Makes unit testing DB classes require a live database. Can cause unexpected behavior when updating one field.
**Instead:** Handle the sync explicitly in API route handlers. Easy to test, easy to reason about.

### Anti-Pattern 5: Overloading the Existing Task PATCH Endpoint for Reorder

**What:** Using `PATCH /api/tasks/:id` for drag-and-drop reorder operations.
**Why bad:** Reorder may need to update multiple tasks atomically. The existing PATCH is designed for single-task updates with full validation. Mixing concerns makes the endpoint harder to maintain.
**Instead:** Create a dedicated `POST /api/tasks/reorder` endpoint with its own validation schema.

## Scalability Considerations

| Concern | At 50 tasks | At 500 tasks | At 5000 tasks |
|---------|-------------|--------------|---------------|
| Kanban load | Single query, instant | Single query, fast | Paginate per column (limit 50 per status) |
| Drag reorder | 1 write, instant | 1 write, instant | 1 write, instant (float sort_order) |
| Sort normalization | Never needed | Rarely needed | May need periodic normalization |
| Project list | Single query | Single query | Single query (personal app, unlikely to have 100+ projects) |

BetterR.Me is a personal productivity app. A single user is unlikely to have more than a few hundred tasks total. The architecture is designed for this scale and does not over-engineer for multi-tenant or collaborative scenarios.

## Migration Strategy

### Backward Compatibility

The new columns on `tasks` have defaults:
- `section DEFAULT 'personal'` -- existing tasks get assigned to "personal"
- `status DEFAULT 'todo'` -- existing incomplete tasks get "todo" status
- `project_id DEFAULT NULL` -- existing tasks have no project (which is valid)
- `sort_order DEFAULT 0` -- existing tasks all start at 0 (will be normalized on first kanban load)

A data migration should set `status = 'done'` for all tasks where `is_completed = true`:

```sql
UPDATE tasks SET status = 'done' WHERE is_completed = true;
```

And normalize sort_order for existing tasks:

```sql
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, status ORDER BY created_at) AS rn
  FROM tasks
)
UPDATE tasks SET sort_order = ranked.rn
FROM ranked WHERE tasks.id = ranked.id;
```

### sidebar counts update

The existing `useSidebarCounts()` hook and `/api/sidebar/counts` endpoint do not need changes. The "tasks due" badge already counts incomplete tasks by due date, which is independent of section/status/project.

**When Projects nav item is added to sidebar**, a project count badge can optionally be added using the same pattern.

## Files Summary: New vs Modified

### New Files (create)

| File | Purpose |
|------|---------|
| `lib/db/projects.ts` | ProjectsDB class |
| `lib/validations/project.ts` | Project Zod schemas |
| `lib/validations/reorder.ts` | Reorder Zod schema |
| `lib/hooks/use-projects.ts` | SWR hook for projects |
| `lib/hooks/use-tasks.ts` | SWR hook for tasks (replaces inline fetcher) |
| `app/api/projects/route.ts` | Projects list/create API |
| `app/api/projects/[id]/route.ts` | Project CRUD API |
| `app/api/tasks/reorder/route.ts` | Bulk reorder API |
| `app/projects/page.tsx` | Projects listing page |
| `app/projects/new/page.tsx` | Create project page |
| `app/projects/[id]/page.tsx` | Project detail/kanban page |
| `app/projects/[id]/edit/page.tsx` | Edit project page |
| `components/projects/projects-page-content.tsx` | Projects page client component |
| `components/projects/project-card.tsx` | Project card |
| `components/projects/project-form.tsx` | Project create/edit form |
| `components/projects/project-selector.tsx` | Project dropdown for task form |
| `components/kanban/kanban-board.tsx` | Kanban board with DnD |
| `components/kanban/kanban-column.tsx` | Kanban column (droppable) |
| `components/kanban/kanban-card.tsx` | Kanban card (draggable) |
| `components/kanban/kanban-empty-column.tsx` | Empty column state |
| `components/tasks/task-section-toggle.tsx` | Work/Personal toggle |
| `components/tasks/task-view-toggle.tsx` | List/Kanban view toggle |
| `supabase/migrations/YYYYMMDD_create_projects_table.sql` | Projects table + RLS |
| `supabase/migrations/YYYYMMDD_add_task_kanban_fields.sql` | New task columns + indexes |
| `i18n/messages/en.json` (sections) | New i18n strings for projects/kanban |
| `i18n/messages/zh.json` (sections) | Chinese translations |
| `i18n/messages/zh-TW.json` (sections) | Traditional Chinese translations |

### Modified Files (edit)

| File | What Changes |
|------|-------------|
| `lib/db/types.ts` | Add Project types, TaskSection, TaskStatus, extend TaskFilters |
| `lib/db/tasks.ts` | Add getKanbanTasks(), reorderTasks(), getProjectTasks(), extend getUserTasks() filters |
| `lib/db/index.ts` | Export ProjectsDB |
| `lib/validations/task.ts` | Add section, status, project_id to taskFormSchema |
| `app/api/tasks/route.ts` | Handle section/status/project_id filters, kanban view |
| `app/api/tasks/[id]/route.ts` | Sync is_completed/status in PATCH handler |
| `components/tasks/tasks-page-content.tsx` | Section tabs, view toggle, redesigned layout |
| `components/tasks/task-card.tsx` | Show project badge and section indicator |
| `components/tasks/task-form.tsx` | Add section, status, project_id fields |
| `components/tasks/task-list.tsx` | Support section-based filtering |
| `components/layouts/app-sidebar.tsx` | Add Projects nav item |
| `app/tasks/page.tsx` | Pass view/section from searchParams |

## Suggested Build Order

Based on dependencies:

1. **Database migration** (projects table + task column additions) -- everything depends on this
2. **Type definitions** (`lib/db/types.ts`) -- everything depends on types
3. **ProjectsDB class** + **TasksDB extensions** -- API routes depend on these
4. **Validation schemas** (project, reorder, extended task) -- API routes depend on these
5. **API routes** (projects CRUD, extended tasks, reorder) -- hooks depend on these
6. **SWR hooks** (useProjects, useTasks) -- components depend on these
7. **Project CRUD components** (form, card, page) -- standalone, no DnD dependency
8. **Task form/card extensions** (section, status, project_id fields) -- standalone
9. **Tasks page redesign** (section toggle, view toggle) -- depends on extended task form
10. **Kanban board** (DnD components) -- depends on everything above
11. **Sidebar update** -- cosmetic, can be done anytime after step 7
12. **i18n strings** -- should be added alongside each component (not as a separate step)

## Sources

- Existing codebase analysis (all files referenced above) -- **HIGH confidence**
- [@dnd-kit/react npm registry](https://www.npmjs.com/package/@dnd-kit/react) -- version 0.3.2, peer deps verified -- **HIGH confidence**
- [@dnd-kit/core npm registry](https://www.npmjs.com/package/@dnd-kit/core) -- version 6.3.1 -- **HIGH confidence**
- [dnd-kit React 19 support issue #1511](https://github.com/clauderic/dnd-kit/issues/1511) -- **HIGH confidence**
- [SWR mutation docs](https://swr.vercel.app/docs/mutation) -- optimistic update pattern -- **HIGH confidence**
- [Basedash: Implementing Re-Ordering at the Database Level](https://www.basedash.com/blog/implementing-re-ordering-at-the-database-level-our-experience) -- float sort_order pattern -- **MEDIUM confidence**
- [Georgegriff/react-dnd-kit-tailwind-shadcn-ui](https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui) -- reference kanban implementation -- **MEDIUM confidence**
- [Top 5 Drag-and-Drop Libraries for React in 2026](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react) -- ecosystem overview -- **MEDIUM confidence**

---

*Architecture analysis: 2026-02-18*
