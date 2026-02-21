# Phase 14: Projects & Sections - Research

**Researched:** 2026-02-19
**Domain:** Supabase project CRUD, section-based task organization, project card UI, form extensions
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Stacked vertically -- Personal section on top, Work section below, single scrollable page
- Sections are always expanded, not collapsible
- Within each section: standalone tasks appear first, then project cards below
- Each section has a clear header label ("Personal" / "Work")
- Rich content cards showing: project name, preset color accent, progress bar + text count (X/Y done), up to 5 task previews, and a button to open the kanban
- Task previews ordered: in-progress tasks first, then todo tasks
- Each task preview has a status dot (colored indicator for in_progress vs todo)
- "+N more" shown when tasks exceed the 5-task preview limit
- Three-dot menu in top-right corner for Edit, Archive, Delete actions
- 10-12 preset colors available when creating/editing a project
- Create project via modal dialog (name, section selector, color picker)
- Single "Create Project" button at the top of the tasks page (section chosen inside the modal)
- Delete project shows a confirmation dialog explaining tasks will become standalone
- Archived projects accessed via a separate /projects/archived page
- Section selector placed near the top of the form, right after task name
- Section selector is toggle buttons (two side-by-side: "Personal" and "Work"), defaults to Personal
- Project dropdown filtered by selected section, shows color dots next to project names
- Project assignment is optional (task can be standalone)

### Claude's Discretion
- Project color application style (research similar apps for best visual approach)
- Card body click behavior (click-to-open-kanban vs button-only)
- Section switching behavior when task already assigned to a project in the old section (clear silently vs warn-then-clear)
- Exact spacing, typography, and responsive behavior

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROJ-01 | User can create a project with a name, section (Work/Personal), and preset color | DB schema (Section: Architecture Patterns - Projects Table), API route pattern (Section: Code Examples - Project CRUD API), validation schema (Section: Code Examples - Validation), color preset constants (Section: Architecture Patterns - Preset Colors) |
| PROJ-02 | User can edit a project's name, color, and section | PATCH API pattern (Section: Code Examples - Project CRUD API), edit modal reuse (Section: Architecture Patterns - Project Modal) |
| PROJ-03 | User can archive a project (hidden by default, available via filter) | Soft-archive pattern with status column (Section: Architecture Patterns - Projects Table), archived page route (Section: Architecture Patterns - Archived Projects Page) |
| PROJ-04 | User can delete a project (tasks become standalone within the same section) | Delete with orphan pattern (Section: Architecture Patterns - Project Deletion), confirmation dialog (Section: Code Examples - Delete Confirmation) |
| PROJ-05 | User can see project progress (X of Y tasks done) on the tasks page project card | Progress calculation from task data (Section: Architecture Patterns - Progress Calculation), Progress UI component (Section: Code Examples - Project Card) |
| FORM-01 | User can select a section (Work/Personal) when creating or editing a task | ToggleGroup component for section selector (Section: Code Examples - Section Selector), form schema extension (Section: Code Examples - Validation) |
| FORM-02 | User can optionally assign a task to a project (dropdown filtered by selected section) | Filtered project dropdown (Section: Architecture Patterns - Task Form Extensions), SWR project fetching (Section: Code Examples - Project Dropdown) |
| PAGE-01 | Tasks page shows Work and Personal as top-level sections | Section-based layout (Section: Architecture Patterns - Tasks Page Redesign), SWR data grouping (Section: Code Examples - Section Layout) |
| PAGE-02 | Each section displays project cards and a standalone tasks area | Project card component (Section: Code Examples - Project Card), standalone task list (Section: Architecture Patterns - Tasks Page Redesign) |
</phase_requirements>

## Summary

Phase 14 introduces a `projects` table in Supabase, adds a `project_id` foreign key to the existing `tasks` table, and redesigns the tasks page to show Work/Personal sections with rich project cards. The task create/edit form gets two new fields: a section toggle (Personal/Work) and an optional project dropdown filtered by section.

The implementation follows the existing codebase patterns exactly: a new `ProjectsDB` class in `lib/db/`, new API routes under `app/api/projects/`, Zod validation schemas in `lib/validations/`, and SWR-based data fetching on the client. The tasks page (`components/tasks/tasks-page-content.tsx`) gets a major redesign from a flat list to a section-based layout. No new libraries are needed -- all UI primitives (Dialog, AlertDialog, DropdownMenu, Progress, ToggleGroup, Card) already exist in `components/ui/`.

**Primary recommendation:** Follow existing DB/API/component patterns precisely. The main complexity is in the tasks page redesign (grouping tasks by section and project) and the project card component (rich content with progress, previews, and color accents). Keep the project data model simple -- a single `projects` table with status-based archiving and preset color keys stored as strings.

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase JS | @supabase/ssr | DB operations, RLS | Already used for all data access |
| Zod | Installed | API validation | Already used for task/habit schemas |
| SWR | Installed | Client data fetching | Already used for tasks page |
| react-hook-form | Installed | Form state management | Already used in TaskForm |
| Radix UI | Unified package | Dialog, AlertDialog, DropdownMenu, Progress, ToggleGroup | All components already available in `components/ui/` |
| next-intl | Installed | i18n for 3 locales | Already used throughout app |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | Installed | Icons (MoreHorizontal, FolderPlus, Archive, etc.) | Icon needs in project cards and buttons |
| sonner | Installed | Toast notifications | Success/error feedback for CRUD operations |
| tailwindcss-animate | Installed | Transitions | Card hover effects, dialog animations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Preset color strings | Full color picker | Preset colors are simpler, consistent, dark-mode friendly; user chose 10-12 presets |
| Status-based archive | Separate archive table | Status column is simpler and follows existing habit archive pattern |

**Installation:**
```bash
# No new packages needed -- all dependencies already exist
```

## Architecture Patterns

### Recommended File Structure
```
lib/db/
  projects.ts              # ProjectsDB class (CRUD operations)
  types.ts                 # Add Project, ProjectInsert, ProjectUpdate, ProjectSection types
  index.ts                 # Re-export ProjectsDB

lib/validations/
  project.ts               # Zod schemas: projectFormSchema, projectUpdateSchema
  task.ts                  # Extend: add section, project_id to taskFormSchema

lib/projects/
  colors.ts                # PROJECT_COLORS constant: { key, hsl, label } array

app/api/projects/
  route.ts                 # GET (list by section/status), POST (create)
  [id]/route.ts            # GET, PATCH (edit), DELETE

app/api/projects/archived/
  route.ts                 # GET (list archived projects)

app/tasks/page.tsx         # Unchanged (server component, auth check)
app/projects/archived/
  page.tsx                 # Archived projects page
  layout.tsx               # SidebarShell wrapper

components/tasks/
  tasks-page-content.tsx   # MAJOR REWRITE: section-based layout
  task-list.tsx            # Refactor: receives filtered tasks, renders grid
  task-form.tsx            # Add section toggle + project dropdown

components/projects/
  project-card.tsx         # Rich card: color accent, progress, task previews
  project-modal.tsx        # Create/edit dialog (name, section, color picker)
  project-delete-dialog.tsx # Confirmation dialog for deletion
  project-color-picker.tsx # Grid of preset color swatches
  archived-projects-content.tsx # Archived projects page content

supabase/migrations/
  YYYYMMDD000001_create_projects_table.sql
  YYYYMMDD000002_add_project_id_to_tasks.sql
```

### Pattern 1: Projects Table Schema

**What:** New `projects` table with FK to profiles, and `project_id` nullable FK on tasks.

**When to use:** This is the core data model for Phase 14.

```sql
-- Migration 1: Create projects table
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'personal' CHECK (section IN ('personal', 'work')),
  color TEXT NOT NULL DEFAULT 'blue',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  sort_order DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_projects_user_section ON projects(user_id, section) WHERE status = 'active';
CREATE INDEX idx_projects_user_status ON projects(user_id, status);

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

-- Updated_at trigger
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

```sql
-- Migration 2: Add project_id to tasks
ALTER TABLE tasks ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

-- Index for querying tasks by project
CREATE INDEX idx_tasks_project_id ON tasks(project_id) WHERE project_id IS NOT NULL;

-- Update section CHECK: enforce personal/work values
-- (Current section is TEXT with no CHECK -- add one now)
ALTER TABLE tasks ADD CONSTRAINT tasks_section_check
  CHECK (section IN ('personal', 'work'));
```

**Key design decisions:**
- `ON DELETE SET NULL` on tasks.project_id -- when a project is deleted, tasks become standalone (per user decision PROJ-04)
- `status` column for archive (not a boolean) -- extensible and consistent with existing patterns
- `color` stores a preset key string (e.g., 'blue', 'red', 'green') -- not an HSL value. Color mapping happens in TypeScript constants.
- `sort_order` for future project reordering within sections (not required now but cheap to add)
- Section CHECK constraint on both `projects` and `tasks` enforces only 'personal' and 'work' values

### Pattern 2: Preset Project Colors

**What:** 10-12 preset colors defined as TypeScript constants with light/dark mode HSL values.

**When to use:** Color picker in project create/edit modal, color accent on project cards, color dots in project dropdown.

```typescript
// lib/projects/colors.ts
export interface ProjectColor {
  key: string;       // Stored in DB: 'blue', 'red', etc.
  label: string;     // i18n key: 'projects.colors.blue'
  hsl: string;       // Light mode HSL: '215 75% 55%'
  hslDark: string;   // Dark mode HSL: '215 60% 60%'
}

export const PROJECT_COLORS: ProjectColor[] = [
  { key: 'blue',       label: 'colors.blue',       hsl: '215 75% 55%',  hslDark: '215 60% 60%' },
  { key: 'red',        label: 'colors.red',        hsl: '0 72% 55%',    hslDark: '0 60% 55%' },
  { key: 'green',      label: 'colors.green',      hsl: '142 70% 45%',  hslDark: '142 55% 50%' },
  { key: 'orange',     label: 'colors.orange',     hsl: '25 95% 55%',   hslDark: '25 80% 58%' },
  { key: 'purple',     label: 'colors.purple',     hsl: '270 60% 55%',  hslDark: '270 50% 60%' },
  { key: 'pink',       label: 'colors.pink',       hsl: '340 75% 55%',  hslDark: '340 60% 55%' },
  { key: 'teal',       label: 'colors.teal',       hsl: '175 65% 40%',  hslDark: '175 50% 50%' },
  { key: 'yellow',     label: 'colors.yellow',     hsl: '48 90% 50%',   hslDark: '48 75% 55%' },
  { key: 'indigo',     label: 'colors.indigo',     hsl: '245 60% 55%',  hslDark: '245 50% 60%' },
  { key: 'cyan',       label: 'colors.cyan',       hsl: '195 80% 45%',  hslDark: '195 60% 55%' },
  { key: 'slate',      label: 'colors.slate',      hsl: '215 15% 50%',  hslDark: '215 10% 55%' },
  { key: 'emerald',    label: 'colors.emerald',    hsl: '160 80% 40%',  hslDark: '160 60% 48%' },
];

export function getProjectColor(key: string): ProjectColor {
  return PROJECT_COLORS.find(c => c.key === key) ?? PROJECT_COLORS[0];
}
```

### Pattern 3: Project Card Color Application (Claude's Discretion)

**What:** How to visually apply the preset color to the project card.

**Recommendation: Left border accent (4px) + subtle background tint.**

This is the dominant pattern across project management tools (Linear, Asana, Jira). Researched patterns:

| Approach | Pros | Cons | Used By |
|----------|------|------|---------|
| Left border (4px solid) | Clear, accessible, works in dark mode, minimal visual weight | Less dramatic | Linear, Jira, Appian |
| Background tint (3-5% opacity) | Rich feel, fills the card | Can clash with dark mode, accessibility concerns | Notion database views |
| Header bar (top colored stripe) | Strong visual hierarchy | Takes vertical space | Asana |
| Full left border + tint combo | Best of both -- clear accent + rich feel | Slightly more CSS | Recommended |

**Recommended implementation:**
```tsx
// Left border accent with very subtle background tint
<Card
  className="border-l-4 transition-all duration-200 hover:shadow-md"
  style={{
    borderLeftColor: `hsl(${color.hsl})`,
    backgroundColor: `hsl(${color.hsl} / 0.04)`, // 4% tint in light mode
  }}
>
```

For dark mode, use the `hslDark` value and adjust tint opacity to ~6% for visibility against dark card backgrounds.

This approach:
- Is accessible (color + label, not color alone)
- Works in both light and dark themes with distinct HSL values
- Creates visual hierarchy without overwhelming
- Follows the established `category` color pattern already in the codebase (see `--category-*` CSS vars)

### Pattern 4: Card Body Click Behavior (Claude's Discretion)

**Recommendation: Card body click opens kanban, with explicit "Open Board" button as well.**

Rationale:
- Linear and Asana both use click-to-open on project cards
- The card already has a three-dot menu (Edit/Archive/Delete), so click conflicts are minimal
- Users expect clicking a card to navigate somewhere
- The explicit button provides a clear affordance for discoverability
- Note: Kanban is Phase 15, but wire the click handler now with a TODO or navigate to `/projects/{id}/board`

### Pattern 5: Section Switch + Project Clear Behavior (Claude's Discretion)

**Recommendation: Clear silently when section changes.**

When a user switches section (Personal -> Work) and the task is assigned to a project in the old section:
- Clear `project_id` immediately without a warning dialog
- This is the least friction approach
- The section toggle is prominent and intentional -- users won't accidentally switch
- The project dropdown re-filters automatically, making the change visually obvious
- A warning dialog would be annoying for a simple toggle action

### Pattern 6: ProjectsDB Class

**What:** Database access class following existing codebase pattern.

```typescript
// lib/db/projects.ts
export class ProjectsDB {
  constructor(private supabase: SupabaseClient) {}

  async getUserProjects(userId: string, filters?: { section?: string; status?: string }): Promise<Project[]> {
    let query = this.supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });

    if (filters?.section) query = query.eq('section', filters.section);
    if (filters?.status) query = query.eq('status', filters.status ?? 'active');
    else query = query.eq('status', 'active'); // Default: only active

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getProject(projectId: string, userId: string): Promise<Project | null> { /* ... */ }
  async createProject(project: ProjectInsert): Promise<Project> { /* ... */ }
  async updateProject(projectId: string, userId: string, updates: ProjectUpdate): Promise<Project> { /* ... */ }
  async archiveProject(projectId: string, userId: string): Promise<Project> { /* ... */ }
  async deleteProject(projectId: string, userId: string): Promise<void> { /* ... */ }
}
```

### Pattern 7: Tasks Page Redesign

**What:** Transform flat task list into section-based layout with project cards.

**Data flow:**
1. Fetch all tasks via SWR (`/api/tasks`)
2. Fetch all active projects via SWR (`/api/projects?status=active`)
3. Group tasks by `section` (personal vs work)
4. Within each section, separate: tasks with `project_id` (grouped by project) vs standalone tasks (`project_id = null`)
5. Render: Section Header -> Standalone Tasks -> Project Cards (each with embedded task previews)

**Key consideration:** All grouping/filtering happens client-side from the full task and project data fetched via SWR. This keeps the API simple (no complex join queries) and leverages SWR caching.

### Pattern 8: Progress Calculation

**What:** Calculate X/Y done for project cards.

```typescript
// Computed client-side from tasks array
function getProjectProgress(tasks: Task[]): { done: number; total: number } {
  const total = tasks.length;
  const done = tasks.filter(t => t.is_completed).length;
  return { done, total };
}
```

This is purely client-side computation. No need for a DB view or stored procedure -- projects will have at most ~50 tasks, and we already fetch all tasks.

### Anti-Patterns to Avoid
- **Complex SQL joins for project+task data:** Keep API simple, join client-side. SWR handles caching.
- **Storing HSL values in the database:** Store preset keys ('blue', 'red'), map to HSL in TypeScript constants. Easier to update colors, dark mode support, and validation.
- **Separate section tables:** Sections (Personal/Work) are hardcoded string values, not database entities. No `sections` table needed.
- **Project-specific task API endpoints:** Avoid `/api/projects/:id/tasks`. Instead, add `?project_id=X` filter to existing `/api/tasks` endpoint, or filter client-side.
- **DB triggers for project deletion orphaning:** Use `ON DELETE SET NULL` FK constraint -- PostgreSQL handles it automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Color picker UI | Custom color grid from scratch | Map over `PROJECT_COLORS` constant + CSS grid | Keeps it dead simple, consistent |
| Section toggle | Custom radio group | Radix ToggleGroup (already in `components/ui/toggle-group.tsx`) | Accessible, keyboard-navigable, styled |
| Project create/edit modal | Custom modal | Radix Dialog (already in `components/ui/dialog.tsx`) | Animated, accessible, focus-trapped |
| Delete confirmation | window.confirm or custom | Radix AlertDialog (already in `components/ui/alert-dialog.tsx`) | Proper focus management, i18n friendly |
| Three-dot menu | Custom popover | Radix DropdownMenu (already in `components/ui/dropdown-menu.tsx`) | Keyboard nav, proper ARIA roles |
| Progress bar | Custom div bar | Radix Progress (already in `components/ui/progress.tsx`) | Accessible, ARIA progressbar role |
| Toast notifications | Custom notification | sonner (already installed) | Already used throughout app |

**Key insight:** Every UI primitive needed for this phase already exists in the project's `components/ui/` directory. Zero new packages required.

## Common Pitfalls

### Pitfall 1: Task Section vs Project Section Mismatch
**What goes wrong:** Task gets assigned to a project in "Personal" but task's section is set to "Work".
**Why it happens:** The section and project fields are independently editable.
**How to avoid:** When a task is assigned to a project, automatically set the task's section to match the project's section. When section changes, clear project_id if the project belongs to the old section. Enforce this in the API layer (not just the form).
**Warning signs:** Tasks appearing in wrong section on the tasks page.

### Pitfall 2: Orphaned Tasks After Project Deletion Not Preserving Section
**What goes wrong:** Deleting a project with `ON DELETE SET NULL` nullifies project_id but doesn't update the task's section.
**Why it happens:** FK SET NULL only affects the FK column, not other columns.
**How to avoid:** This is actually fine by design -- tasks already have their own `section` field that matches the project's section (enforced by Pitfall 1). When project is deleted, tasks retain their section and become standalone within that section. No extra work needed.
**Warning signs:** None expected if section consistency is enforced on assignment.

### Pitfall 3: SWR Cache Invalidation After Project CRUD
**What goes wrong:** Creating/editing/deleting a project doesn't update the tasks page.
**Why it happens:** Projects and tasks are fetched with separate SWR keys.
**How to avoid:** After any project mutation, call `mutate()` on both the projects SWR key AND the tasks SWR key (task data includes project_id). Use `useSWRConfig().mutate` with key matchers.
**Warning signs:** Stale project cards or incorrect progress counts after mutations.

### Pitfall 4: Dark Mode Color Contrast
**What goes wrong:** Preset colors look washed out or invisible in dark mode.
**Why it happens:** Same HSL values used for both light and dark themes.
**How to avoid:** Use separate HSL values per theme (see `ProjectColor` type with `hsl` and `hslDark` fields). Apply dark mode HSL via `useTheme()` from next-themes or CSS `.dark` selector.
**Warning signs:** Low contrast ratios in dark mode, especially for progress bars and color accents.

### Pitfall 5: Form State Sync Between Section Toggle and Project Dropdown
**What goes wrong:** User selects a project, then switches section -- dropdown still shows old project.
**Why it happens:** react-hook-form doesn't automatically clear dependent fields.
**How to avoid:** Use `form.watch('section')` to detect section changes, then `form.setValue('project_id', null)` when section changes. Filter project dropdown options by the watched section value.
**Warning signs:** Selected project from wrong section persists visually in the form.

### Pitfall 6: Migration Order Dependency
**What goes wrong:** Adding `project_id` FK to tasks before creating the projects table.
**Why it happens:** FK references must point to an existing table.
**How to avoid:** Two separate migration files with correct ordering by timestamp: first create projects table, then add project_id to tasks.
**Warning signs:** Migration failure on `ALTER TABLE tasks ADD COLUMN project_id UUID REFERENCES projects(id)`.

### Pitfall 7: i18n Coverage Across 3 Locales
**What goes wrong:** New strings added to `en.json` but missing from `zh.json` and `zh-TW.json`.
**Why it happens:** Easy to forget when focused on implementation.
**How to avoid:** Add all new i18n keys to all three locale files in a single dedicated plan step. New keys needed: project CRUD (name, section labels, color names), section headers, progress text, delete confirmation, archived page, form field labels.
**Warning signs:** Missing translation warnings in console, fallback to key names in UI.

## Code Examples

### Project CRUD API Route
```typescript
// app/api/projects/route.ts -- follows existing pattern from app/api/tasks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ProjectsDB } from '@/lib/db';
import { validateRequestBody } from '@/lib/validations/api';
import { projectFormSchema } from '@/lib/validations/project';
import { ensureProfile } from '@/lib/db/ensure-profile';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projectsDB = new ProjectsDB(supabase);
  const searchParams = request.nextUrl.searchParams;
  const filters: Record<string, string> = {};
  if (searchParams.has('section')) filters.section = searchParams.get('section')!;
  if (searchParams.has('status')) filters.status = searchParams.get('status')!;

  const projects = await projectsDB.getUserProjects(user.id, filters);
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const validation = validateRequestBody(body, projectFormSchema);
  if (!validation.success) return validation.response;

  await ensureProfile(supabase, user);
  const projectsDB = new ProjectsDB(supabase);

  const project = await projectsDB.createProject({
    user_id: user.id,
    name: validation.data.name.trim(),
    section: validation.data.section,
    color: validation.data.color,
  });
  return NextResponse.json({ project }, { status: 201 });
}
```

### Validation Schema
```typescript
// lib/validations/project.ts
import { z } from 'zod';

export const projectSectionSchema = z.enum(['personal', 'work']);

export const projectFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50, 'Name must be 50 characters or less'),
  section: projectSectionSchema,
  color: z.string().min(1),  // Validated against PROJECT_COLORS keys at form level
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;

export const projectUpdateSchema = projectFormSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);
```

### Task Form Schema Extension
```typescript
// lib/validations/task.ts -- extend existing schema
export const taskFormSchema = z.object({
  title: z.string().trim().min(1).max(100),
  // ... existing fields ...
  section: z.enum(['personal', 'work']).optional(),  // NEW: defaults to 'personal'
  project_id: z.string().uuid().nullable().optional(), // NEW: optional project assignment
});
```

### Section Selector (ToggleGroup)
```tsx
// Inside TaskForm component -- placed right after title field
<FormField
  control={form.control}
  name="section"
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t("sectionLabel")}</FormLabel>
      <FormControl>
        <ToggleGroup
          type="single"
          value={field.value ?? 'personal'}
          onValueChange={(value) => {
            if (value) {
              field.onChange(value);
              // Clear project when section changes (Claude's discretion: silent clear)
              form.setValue('project_id', null);
            }
          }}
          variant="outline"
          className="w-full"
        >
          <ToggleGroupItem value="personal" className="flex-1">
            <User className="size-4 mr-1.5" />
            {sectionT("personal")}
          </ToggleGroupItem>
          <ToggleGroupItem value="work" className="flex-1">
            <Briefcase className="size-4 mr-1.5" />
            {sectionT("work")}
          </ToggleGroupItem>
        </ToggleGroup>
      </FormControl>
    </FormItem>
  )}
/>
```

### Project Dropdown with Color Dots
```tsx
// Inside TaskForm -- after section selector
const watchedSection = form.watch('section') ?? 'personal';
const filteredProjects = projects?.filter(p => p.section === watchedSection) ?? [];

<FormField
  control={form.control}
  name="project_id"
  render={({ field }) => (
    <FormItem>
      <FormLabel>{t("projectLabel")}</FormLabel>
      <Select
        value={field.value ?? "none"}
        onValueChange={(val) => field.onChange(val === "none" ? null : val)}
      >
        <SelectTrigger>
          <SelectValue placeholder={t("projectPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{t("noProject")}</SelectItem>
          {filteredProjects.map((project) => {
            const color = getProjectColor(project.color);
            return (
              <SelectItem key={project.id} value={project.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="size-3 rounded-full shrink-0"
                    style={{ backgroundColor: `hsl(${color.hsl})` }}
                  />
                  {project.name}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </FormItem>
  )}
/>
```

### Project Card Component
```tsx
// components/projects/project-card.tsx
interface ProjectCardProps {
  project: Project;
  tasks: Task[];
  onOpenKanban: (projectId: string) => void;
  onEdit: (project: Project) => void;
  onArchive: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

export function ProjectCard({ project, tasks, onOpenKanban, onEdit, onArchive, onDelete }: ProjectCardProps) {
  const color = getProjectColor(project.color);
  const progress = getProjectProgress(tasks);
  const previewTasks = getTaskPreviews(tasks, 5); // in_progress first, then todo
  const extraCount = Math.max(0, tasks.filter(t => !t.is_completed).length - 5);

  return (
    <Card
      className="border-l-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
      style={{ borderLeftColor: `hsl(${color.hsl})` }}
      onClick={() => onOpenKanban(project.id)}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header: name + three-dot menu */}
        <div className="flex items-start justify-between">
          <h4 className="font-medium text-sm truncate">{project.name}</h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="size-7 -mr-1 -mt-1">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(project); }}>
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchive(project.id); }}>
                {t("archive")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(project.id); }}
              >
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Progress bar + text */}
        <div className="space-y-1">
          <Progress value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0} className="h-1.5" />
          <p className="text-xs text-muted-foreground">
            {progress.done}/{progress.total} {t("done")}
          </p>
        </div>

        {/* Task previews */}
        <div className="space-y-1">
          {previewTasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 text-xs truncate">
              <span className={cn(
                "size-2 rounded-full shrink-0",
                task.status === 'in_progress' ? 'bg-status-info' : 'bg-muted-foreground/40'
              )} />
              <span className="truncate">{task.title}</span>
            </div>
          ))}
          {extraCount > 0 && (
            <p className="text-xs text-muted-foreground pl-4">
              +{extraCount} {t("more")}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

### Section Layout on Tasks Page
```tsx
// components/tasks/tasks-page-content.tsx -- core rendering structure
function SectionBlock({ section, tasks, projects, ... }: SectionBlockProps) {
  const sectionTasks = tasks.filter(t => t.section === section);
  const standaloneTasks = sectionTasks.filter(t => !t.project_id);
  const sectionProjects = projects.filter(p => p.section === section);

  return (
    <section>
      <h2 className="text-section-heading font-display mb-4">
        {section === 'personal' ? t("sections.personal") : t("sections.work")}
      </h2>

      {/* Standalone tasks first */}
      {standaloneTasks.length > 0 && (
        <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3 mb-6">
          {standaloneTasks.map(task => (
            <TaskCard key={task.id} task={task} ... />
          ))}
        </div>
      )}

      {/* Project cards */}
      {sectionProjects.length > 0 && (
        <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
          {sectionProjects.map(project => {
            const projectTasks = sectionTasks.filter(t => t.project_id === project.id);
            return (
              <ProjectCard key={project.id} project={project} tasks={projectTasks} ... />
            );
          })}
        </div>
      )}
    </section>
  );
}

// Main layout: Personal on top, Work below
<div className="space-y-8">
  <SectionBlock section="personal" tasks={data} projects={projects} ... />
  <SectionBlock section="work" tasks={data} projects={projects} ... />
</div>
```

### Delete Confirmation Dialog
```tsx
// components/projects/project-delete-dialog.tsx
<AlertDialog open={open} onOpenChange={onOpenChange}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
      <AlertDialogDescription>
        {t("deleteDescription", { name: projectName })}
        {/* "Tasks in this project will become standalone tasks in the same section." */}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
      <AlertDialogAction
        className="bg-destructive text-destructive-foreground"
        onClick={onConfirm}
      >
        {t("confirmDelete")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat task list with tabs (pending/completed) | Section-based layout with project cards | Phase 14 | Major tasks page redesign |
| Tasks have no section/project concept | Tasks have section (personal/work) + optional project_id | Phase 13 (section) + Phase 14 (project_id) | DB migration, form changes |
| Category field (work/personal/shopping/other) | Section (personal/work) is the primary organizer; category remains for tagging | Phase 14 | Section replaces category's organizational role |

**Note on category vs section:** The existing `category` field (work/personal/shopping/other) on tasks is a tagging mechanism. The new `section` field (personal/work) is the organizational grouping. These are different concepts -- category is optional metadata, section is structural. The task form already has category toggles; section is a new required field. They coexist.

## Open Questions

1. **Should the existing pending/completed tabs be preserved within sections?**
   - What we know: Current tasks page has pending/completed tabs with search. The new design shows sections with project cards.
   - What's unclear: Whether completed tasks should still be visible in sections or hidden behind a tab/filter.
   - Recommendation: Keep a simple "Show completed" toggle at the page level (not per-section). Completed standalone tasks appear at the bottom of each section, visually muted. Project card progress already shows done count.

2. **Should the search functionality be preserved?**
   - What we know: Current tasks page has a search input that filters by task title.
   - What's unclear: Where search fits in the new section-based layout.
   - Recommendation: Keep search at the page level (above sections). It filters both standalone tasks and project task previews.

3. **How should the "Create Project" button interact with the "Create Task" button?**
   - What we know: User decided on a single "Create Project" button at the top of the tasks page. There's already a "Create Task" button.
   - What's unclear: Visual hierarchy between the two buttons.
   - Recommendation: Primary button for "Create Task" (most common action), secondary/outline button for "Create Project" next to it.

4. **Does archiving a project affect its tasks?**
   - What we know: User didn't specify. Archive hides the project from default view.
   - What's unclear: Whether tasks in an archived project remain visible, or are also hidden.
   - Recommendation: Tasks in archived projects become standalone (same as delete behavior) but keep their project_id. On the archived page, show projects with their task counts. This avoids "hidden tasks" confusion.

## Sources

### Primary (HIGH confidence)
- **Codebase analysis** - Read and analyzed: `lib/db/tasks.ts`, `lib/db/types.ts`, `lib/db/habits.ts`, `lib/validations/task.ts`, `lib/tasks/sync.ts`, `lib/tasks/sort-order.ts`, `app/api/tasks/route.ts`, `app/api/tasks/[id]/route.ts`, `components/tasks/task-form.tsx`, `components/tasks/tasks-page-content.tsx`, `components/tasks/task-card.tsx`, `components/tasks/task-list.tsx`, `components/tasks/create-task-content.tsx`, `components/tasks/edit-task-content.tsx`, `components/ui/progress.tsx`, `components/ui/toggle-group.tsx`, `app/globals.css`, `tailwind.config.ts`, `supabase/migrations/20260218000001_add_task_status_section_sort_order.sql`, `supabase/migrations/20260129_initial_schema.sql`, `tests/lib/db/tasks.test.ts`, `tests/app/api/tasks/route.test.ts`
- **Supabase JS Client docs** (Context7 `/supabase/supabase-js`) - CRUD operations, FK joins, filtering patterns, soft delete, RLS
- **Phase 13 Research** (`.planning/phases/13-data-foundation-migration/13-RESEARCH.md`) - Prior decisions on status/section/sort_order

### Secondary (MEDIUM confidence)
- **Web search: project card color patterns** - Confirmed left border accent as dominant pattern across Linear, Asana, Jira. [UXPin Card Color Guide](https://www.uxpin.com/studio/blog/use-color-to-up-the-ante-on-your-ui-cards/), [Appian SAIL Card Layout](https://docs.appian.com/suite/help/25.4/sail/ux-card-layout.html)
- **Web search: 2025-2026 design trends** - Neutral bases with vivid color accents is the dominant SaaS UI pattern

### Tertiary (LOW confidence)
- None -- all findings verified against codebase or official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already in the project; verified by reading package.json-equivalent imports and component files
- Architecture: HIGH - Patterns directly extrapolated from existing codebase (DB classes, API routes, form components, SWR hooks)
- Pitfalls: HIGH - Derived from analyzing actual code paths and data relationships in the codebase
- Color application: MEDIUM - Based on web research of similar apps; specific HSL values will need visual tuning

**Research date:** 2026-02-19
**Valid until:** 2026-03-19 (30 days -- stable domain, no fast-moving dependencies)
