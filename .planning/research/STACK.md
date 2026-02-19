# Technology Stack: Projects & Kanban Features

**Project:** BetterR.Me - Projects & Kanban Milestone
**Researched:** 2026-02-18
**Scope:** Stack ADDITIONS only. Existing stack (Next.js 16, React 19, Supabase, shadcn/ui, etc.) is validated and unchanged.

## Recommended Stack Additions

### Drag-and-Drop: `@dnd-kit/core` + `@dnd-kit/sortable` (Stable v6)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@dnd-kit/core` | ^6.3.1 | DnD primitives (DndContext, sensors, collision detection) | Battle-tested, hook-based API, ~10kB, zero external deps, excellent accessibility (keyboard + screen reader), massive community adoption for kanban boards |
| `@dnd-kit/sortable` | ^10.0.0 | Sortable preset (SortableContext, useSortable, vertical list strategy) | Purpose-built for reordering items within and between columns -- exactly what kanban needs |
| `@dnd-kit/utilities` | ^3.2.2 | CSS transform utilities | Helper for applying drag transforms to DOM elements |

**Why `@dnd-kit/core` v6 (stable) over `@dnd-kit/react` v0.x (new):**

- `@dnd-kit/react` is at v0.3.1 -- experimental, ground-up rewrite, NOT backwards-compatible with stable v5/v6 API. [Source: npm](https://www.npmjs.com/package/@dnd-kit/react)
- No maintainer response on stability timeline or production-readiness. [Source: GitHub Discussion #1842](https://github.com/clauderic/dnd-kit/discussions/1842)
- Missing `"use client"` directives for Next.js App Router. [Source: GitHub Issue #1654](https://github.com/clauderic/dnd-kit/issues/1654)
- The stable v6 API has extensive community examples for kanban boards with React + Tailwind + shadcn/ui. [Source: Georgegriff/react-dnd-kit-tailwind-shadcn-ui](https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui)

**Confidence: HIGH** -- Verified across multiple sources: npm, GitHub, multiple tutorials, and community projects all converge on `@dnd-kit/core` v6 as the recommended path for React kanban boards in 2025-2026.

### React 19 Compatibility Fix

`@dnd-kit/core` v6.3.1 declares peer dependencies for React 16-18 but does NOT officially include React 19. The library works correctly with React 19 -- the peer dependency declaration is simply outdated.

**Required: Add `peerDependencyRules` to `package.json`:**

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

This is the cleanest approach for pnpm -- it suppresses the peer dependency warnings without forcing global version overrides, and it scopes the allowance to only the `@dnd-kit` packages.

**Confidence: HIGH** -- This is the officially documented pnpm mechanism for handling outdated peer deps. The shadcn/ui team uses the same pattern for React 19 compatibility. [Source: pnpm docs](https://pnpm.io/settings), [Source: shadcn/ui React 19 guide](https://ui.shadcn.com/docs/react-19)

### No Additional Libraries Needed

Everything else required for the kanban/projects feature is already in the stack:

| Existing Technology | How It Serves Kanban/Projects |
|---------------------|-------------------------------|
| `shadcn/ui Card` | Task cards within kanban columns |
| `shadcn/ui Badge` | Status/priority indicators on cards |
| `shadcn/ui Select` | Project/section selectors in task form |
| `shadcn/ui Dialog` | Quick-add task modals |
| `shadcn/ui Tabs` | Switching between list view and kanban view |
| `shadcn/ui Skeleton` | Loading states for kanban columns |
| `radix-ui` (unified) | Dropdown menus on project cards, tooltips |
| `react-hook-form` + `zod` | Task form with new section/project fields |
| `SWR` | Fetching and caching project/task data, optimistic updates on drag |
| `lucide-react` | Icons for columns, drag handles, projects |
| `sonner` | Toast feedback on drag-complete, errors |
| `next-intl` | i18n for all new kanban/project strings |
| `date-fns` | Due date formatting on kanban cards |
| Tailwind CSS 3 | All kanban layout styling (grid, flex, gap) |
| Supabase | Database for projects, sections, task status fields |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| DnD Library | `@dnd-kit/core` v6 | `@dnd-kit/react` v0.3.1 | Experimental (v0.x), no stability timeline, missing `"use client"` directives, not production-ready |
| DnD Library | `@dnd-kit/core` v6 | `@hello-pangea/dnd` v18 | Does NOT support React 19 (peer dep locked to `^18.0.0`), no official React 19 release planned. [Source: GitHub Issue #864](https://github.com/hello-pangea/dnd/issues/863) |
| DnD Library | `@dnd-kit/core` v6 | `@atlaskit/pragmatic-drag-and-drop` v1.7.7 | Some packages lack React 19 support ([Issue #181](https://github.com/atlassian/pragmatic-drag-and-drop/issues/181)), uses native HTML5 DnD API (less smooth animations), heavier learning curve for headless approach, reported bugs with Next.js + Tailwind ([Issue #92](https://github.com/atlassian/pragmatic-drag-and-drop/issues/92)) |
| DnD Library | `@dnd-kit/core` v6 | `react-dnd` | Deprecated, no React 19 support ([Issue #3655](https://github.com/react-dnd/react-dnd/issues/3655)), stale maintenance |
| Kanban Component | Build custom with `@dnd-kit` | `@diceui/kanban` (Dice UI) | Uses `@dnd-kit` under the hood anyway, adds an abstraction layer we do not need given our existing shadcn/ui components, less control over the kanban behavior and styling |
| Kanban Component | Build custom with `@dnd-kit` | `shadcn-kanban-board` (janhesters) | Zero-dependency approach (pure React DnD) -- interesting but less battle-tested than `@dnd-kit`, smaller community, fewer edge cases handled (touch devices, accessibility sensors, collision detection algorithms) |

## Installation

```bash
# New dependencies for kanban DnD (3 packages, ~15kB combined)
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Then add the pnpm peer dependency rules to `package.json`:

```jsonc
// Add to package.json root level
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

No new dev dependencies are needed -- existing Vitest + Testing Library + Playwright cover all testing needs.

## What NOT to Add

These were considered and explicitly rejected to avoid bloat:

| Do NOT Add | Why |
|------------|-----|
| `@dnd-kit/modifiers` | Only needed for constraining drag to axes or snap-to-grid. Kanban columns use simple vertical sorting -- no modifiers needed. Can add later if requirements change. |
| `@dnd-kit/accessibility` | `@dnd-kit/core` already includes built-in keyboard and screen reader support via `KeyboardSensor` and `Announcements`. The separate accessibility package is for the old legacy API. |
| `framer-motion` | No need for a full animation library. Tailwind CSS transitions + `@dnd-kit`'s built-in `DragOverlay` animations are sufficient for smooth kanban interactions. |
| `react-virtualized` / `react-window` | Premature optimization. A personal habit tracker will have at most dozens of tasks, not thousands. Virtualization adds complexity for no measurable gain at this scale. |
| Any state management library (Redux, Zustand, Jotai) | SWR already handles server state caching and revalidation. React useState/useReducer handles local drag state. Adding a global state library for this feature would be over-engineering. |
| `immer` | Drag-and-drop state updates (moving tasks between columns) can be handled with simple spread operators and array methods. Immer adds bundle weight for marginal DX improvement at this scale. |

## Key Integration Points

### DnD + SWR (Optimistic Updates)

The kanban board will use SWR's `mutate()` with optimistic data for instant feedback on drag:

```typescript
// Pattern: optimistic update on drag end
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;
  if (!over) return;

  // Optimistic: update local cache immediately
  mutate(
    "/api/tasks",
    (current: Task[]) => reorderTasks(current, active.id, over.id),
    { revalidate: false }
  );

  // Persist: send update to API
  try {
    await fetch(`/api/tasks/${active.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus, sort_order: newOrder }),
    });
  } catch {
    // Rollback: revalidate from server on failure
    mutate("/api/tasks");
    toast.error(t("kanban.dragError"));
  }
};
```

### DnD + shadcn/ui Card

Existing `TaskCard` component wraps in shadcn `Card`. For DnD, wrap it with `useSortable`:

```typescript
// Pattern: make existing card draggable
function DraggableTaskCard({ task, ...props }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} {...props} />
    </div>
  );
}
```

### DnD + Next.js App Router

All DnD components MUST be client components (`"use client"`). The kanban board page can be a server component that renders a client-side `<KanbanBoard />` child. This is the standard Next.js App Router pattern and requires no special configuration.

### DnD + Accessibility

`@dnd-kit/core` provides built-in accessibility via:
- `KeyboardSensor` -- arrow keys to move items between columns
- `Announcements` -- screen reader announcements on drag start/over/end
- ARIA attributes auto-applied via `useSortable` hook

Custom announcements should use `next-intl` translations for all three locales (en, zh, zh-TW).

## Database Additions (Supabase)

No new libraries needed -- use existing Supabase client. New tables/columns required:

| Table/Column | Type | Purpose |
|--------------|------|---------|
| `sections` table | New table | Group tasks into sections (e.g., "Work", "Personal Projects") |
| `projects` table | New table | Projects within sections, with kanban view |
| `tasks.status` | New column: `text` | Kanban status: `'backlog'`, `'todo'`, `'in_progress'`, `'done'` |
| `tasks.section_id` | New column: `uuid` (FK) | Link task to a section |
| `tasks.project_id` | New column: `uuid` (FK, nullable) | Link task to a project |
| `tasks.sort_order` | New column: `integer` | Position within a kanban column for drag ordering |

These are schema changes handled by Supabase migrations, not library additions.

## Sources

- [@dnd-kit/core on npm](https://www.npmjs.com/package/@dnd-kit/core) -- v6.3.1, package details
- [@dnd-kit/react on npm](https://www.npmjs.com/package/@dnd-kit/react) -- v0.3.1, experimental status
- [dnd-kit official docs](https://dndkit.com/) -- API reference, installation guide
- [GitHub Discussion #1842: @dnd-kit/react vs @dnd-kit/core roadmap](https://github.com/clauderic/dnd-kit/discussions/1842) -- no maintainer response on stability
- [GitHub Issue #1654: "use client" missing in @dnd-kit/react](https://github.com/clauderic/dnd-kit/issues/1654) -- Next.js App Router compatibility
- [Georgegriff/react-dnd-kit-tailwind-shadcn-ui](https://github.com/Georgegriff/react-dnd-kit-tailwind-shadcn-ui) -- Accessible kanban with dnd-kit + shadcn/ui
- [Dice UI Kanban component](https://www.diceui.com/docs/components/kanban) -- shadcn-compatible kanban using @dnd-kit
- [janhesters/shadcn-kanban-board](https://github.com/janhesters/shadcn-kanban-board) -- Zero-dependency alternative
- [Top 5 DnD Libraries for React 2026 (Puck)](https://puckeditor.com/blog/top-5-drag-and-drop-libraries-for-react) -- Ecosystem comparison
- [@hello-pangea/dnd React 19 Issue #864](https://github.com/hello-pangea/dnd/issues/863) -- No React 19 support
- [pragmatic-drag-and-drop React 19 Issue #181](https://github.com/atlassian/pragmatic-drag-and-drop/issues/181) -- Partial React 19 support
- [react-dnd React 19 Issue #3655](https://github.com/react-dnd/react-dnd/issues/3655) -- Deprecated, no React 19
- [pnpm peerDependencyRules docs](https://pnpm.io/settings) -- allowedVersions configuration
- [shadcn/ui React 19 guide](https://ui.shadcn.com/docs/react-19) -- Precedent for peer dep handling
- [Build a Kanban board with dnd-kit (LogRocket)](https://blog.logrocket.com/build-kanban-board-dnd-kit-react/) -- Implementation patterns
- [Build a Kanban Board with shadcn (Marmelab, Jan 2026)](https://marmelab.com/blog/2026/01/15/building-a-kanban-board-with-shadcn.html) -- Recent shadcn kanban tutorial
