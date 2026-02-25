# Phase 21: Journal Entry CRUD - Research

**Researched:** 2026-02-22
**Domain:** Tiptap rich-text editor integration, autosave pattern, mood selector, dialog-based entry form
**Confidence:** HIGH

## Summary

Phase 21 builds the journal entry form UI: a center modal with a Tiptap rich-text editor (floating bubble toolbar), a 5-emoji mood selector, debounced autosave with status indicators, and delete with confirmation. The entire data layer (DB classes, API routes, SWR hooks, Zod validation) is already complete from Phase 20. This phase adds zero API code -- it is purely client-side component work that calls the existing `POST /api/journal`, `PATCH /api/journal/[id]`, and `DELETE /api/journal/[id]` endpoints via the `useJournalEntry` SWR hook.

The primary technical challenge is integrating Tiptap 3 with Next.js 16 (SSR-safe via `immediatelyRender: false`, loaded via `next/dynamic` with `ssr: false`), implementing a floating bubble menu that appears on text selection (Medium-style), and building a debounced autosave system that triggers 2 seconds after the user stops typing with a visible "Saving..."/"Saved" status indicator. The mood selector is trivially simple: 5 hardcoded emoji buttons, not a full emoji picker.

**Primary recommendation:** Install Tiptap 3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extensions`, `@tiptap/extension-list`). Build the editor as a dynamically-loaded client component inside a shadcn/ui Dialog (widened to ~70% viewport). Use the existing `useJournalEntry` hook for data fetching, and plain `fetch()` for mutations (matching the project's existing mutation pattern). Do NOT install `@tailwindcss/typography` -- style the Tiptap editor with custom Tailwind classes instead, keeping the dependency footprint minimal.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Rich formatting toolbar: bold, italic, strikethrough, headings (H2/H3), bullet list, numbered list, blockquote, links, code blocks, horizontal rule, task lists
- Floating bubble toolbar -- appears on text selection only (Medium-style), not a fixed top bar
- No placeholder text -- blank editor with cursor ready
- Tiptap as the rich-text engine (per roadmap)
- 5 emoji faces on an expressive scale: amazing, happy, neutral, sad, awful
- Standard emoji rendering (not custom icons or abstract colors)
- Debounced autosave on content change (~2 seconds after user stops typing)
- No unsaved-changes browser warning -- autosave handles it, with a save-on-beforeunload fallback
- Center modal (~70% viewport) for both creating and editing entries -- journal page visible at edges
- Delete requires a confirmation dialog ("Delete this entry?") before proceeding

### Claude's Discretion
- Editor height/sizing approach (auto-grow vs fixed)
- Mood selector placement relative to editor (above, below, or alongside)
- Whether mood is required or optional (and prompting behavior)
- Save status indicator style (inline text vs icon-based)
- Create vs edit flow unification (unified upsert vs explicit create/edit entry points)
- Threshold for first autosave on new entries (immediate vs minimum content)
- Save-on-beforeunload implementation details

### Deferred Ideas (OUT OF SCOPE)
- None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENTR-01 | User can create a journal entry for a specific date with rich text (Tiptap editor) | Tiptap 3 with `useEditor` hook, `BubbleMenu` for floating toolbar, `StarterKit` + `TaskList`/`TaskItem` for all required formatting. POST /api/journal upsert endpoint already exists. |
| ENTR-02 | User can edit and update an existing journal entry | `useJournalEntry(date)` SWR hook loads existing entry, populates `editor.commands.setContent(json)`. PATCH /api/journal/[id] endpoint already exists. Autosave via debounced `onUpdate` callback. |
| ENTR-03 | User can delete a journal entry | DELETE /api/journal/[id] endpoint already exists. shadcn/ui `AlertDialog` for confirmation. SWR `mutate()` to invalidate cache after deletion. |
| ENTR-04 | User can select a mood emoji (5-point scale) for each entry | 5-button mood selector using hardcoded emoji array. Mood stored as integer 1-5 in DB (already in schema). Sent via the same autosave POST/PATCH as content. |
</phase_requirements>

## Standard Stack

### Core (NEW -- must install)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tiptap/react` | ^3.x | React bindings for Tiptap editor (`useEditor`, `EditorContent`) | Headless WYSIWYG on ProseMirror. React 19 compatible. Outputs JSON for Supabase JSONB. |
| `@tiptap/pm` | ^3.x | ProseMirror foundation (required peer dependency) | Required by `@tiptap/react`. |
| `@tiptap/starter-kit` | ^3.x | Bundle: bold, italic, strike, heading, blockquote, bullet/ordered list, code block, horizontal rule, link, underline | Covers 90% of the required formatting in one import. |
| `@tiptap/extensions` | ^3.x | Consolidated extension package: CharacterCount, Placeholder, etc. | We need `CharacterCount` for word count tracking. v3 consolidated import path. |
| `@tiptap/extension-list` | ^3.x | TaskList, TaskItem, ListKeymap | TaskList/TaskItem not in StarterKit. Required per user decision on formatting features. |

### Supporting (EXISTING -- already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `radix-ui` (Dialog) | existing | shadcn/ui Dialog for the center modal | Entry form container |
| `radix-ui` (AlertDialog) | existing | shadcn/ui AlertDialog for delete confirmation | Delete confirmation dialog |
| `swr` | existing | `useJournalEntry(date)` hook for data fetching | Loading existing entries |
| `sonner` | existing | Toast notifications for save errors, delete success | Feedback on mutations |
| `lucide-react` | existing | Icons for bubble toolbar buttons | Formatting toolbar |
| `next-intl` | existing | i18n for all UI strings | All user-facing text |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tiptap 3 | Lexical (Meta) | Lower-level, more boilerplate. Tiptap StarterKit gives 80% for free. **Decision: Tiptap (locked).** |
| Custom Tailwind styles for editor | `@tailwindcss/typography` (`prose` class) | Typography plugin adds ~3KB and opinions about styling. Custom `.tiptap` styles give full control with Tailwind design tokens. **Recommendation: Custom styles.** |
| Frimousse emoji picker | 5 hardcoded emoji buttons | The mood selector is exactly 5 fixed emojis, not a search-based picker. Frimousse (12KB) is overkill. **Recommendation: Simple button group.** |
| Custom debounce | `use-debounce` npm package | Project already has `lib/hooks/use-debounce.ts`. But for autosave, a `useRef` + `setTimeout` pattern is cleaner because we need the callback to fire (not just a debounced value). **Recommendation: useRef/setTimeout for autosave, not the existing useDebounce hook.** |

**Installation:**
```bash
pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extensions @tiptap/extension-list
```

Note: Do NOT install `@tiptap/extension-placeholder` (user decided: "No placeholder text"). Do NOT install `frimousse` (5 hardcoded emoji buttons suffice). Do NOT install `@tailwindcss/typography` (custom styles preferred).

## Architecture Patterns

### Recommended Project Structure
```
components/journal/
  journal-entry-modal.tsx       # Dialog wrapper (~70% viewport center modal)
  journal-editor.tsx            # Tiptap editor component (dynamically loaded)
  journal-editor-loader.tsx     # next/dynamic loader (ssr: false) -- matches kanban pattern
  journal-bubble-menu.tsx       # Floating toolbar with formatting buttons
  journal-mood-selector.tsx     # 5-emoji mood button group
  journal-save-status.tsx       # "Saving..." / "Saved" indicator
  journal-delete-dialog.tsx     # AlertDialog for delete confirmation

lib/hooks/
  use-journal-autosave.ts       # Debounced autosave hook (useRef + setTimeout)
  use-journal-entry.ts          # (EXISTING) SWR hook for fetching entry by date

app/journal/
  page.tsx                      # Journal page (Phase 23 will add calendar/timeline)
  layout.tsx                    # SidebarShell layout (same as dashboard)
```

### Pattern 1: Dynamic Import for Tiptap (SSR-Safe)
**What:** Load Tiptap via `next/dynamic` with `ssr: false` to avoid hydration mismatches
**When to use:** Always -- Tiptap is a client-only library that accesses the DOM
**Example:**
```typescript
// Source: Existing kanban-board-loader.tsx pattern + Tiptap docs
"use client";

import dynamic from "next/dynamic";
import { JournalEditorSkeleton } from "./journal-editor-skeleton";

const JournalEditor = dynamic(
  () => import("./journal-editor").then((m) => m.JournalEditor),
  { ssr: false, loading: () => <JournalEditorSkeleton /> }
);

export function JournalEditorLoader(props: JournalEditorProps) {
  return <JournalEditor {...props} />;
}
```

### Pattern 2: useEditor with BubbleMenu (Tiptap v3)
**What:** Initialize Tiptap editor with floating bubble menu
**When to use:** The journal entry editor component
**Example:**
```typescript
// Source: Tiptap v3 docs (Context7) + verified import paths
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";  // v3: /menus subpath
import StarterKit from "@tiptap/starter-kit";
import { CharacterCount } from "@tiptap/extensions";  // v3: consolidated
import { TaskList, TaskItem } from "@tiptap/extension-list";  // v3: list bundle

interface JournalEditorProps {
  content: Record<string, unknown>;
  onUpdate: (json: Record<string, unknown>, wordCount: number) => void;
}

export function JournalEditor({ content, onUpdate }: JournalEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },  // H2/H3 only per user decision
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
    ],
    content,
    immediatelyRender: false,  // CRITICAL: prevents SSR hydration mismatch
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const wordCount = editor.storage.characterCount.words();
      onUpdate(json, wordCount);
    },
  });

  if (!editor) return null;

  return (
    <>
      <BubbleMenu editor={editor}>
        {/* Formatting buttons */}
      </BubbleMenu>
      <EditorContent editor={editor} className="tiptap-journal" />
    </>
  );
}
```

### Pattern 3: Debounced Autosave with Status Indicator
**What:** Autosave content 2s after last keystroke with visible status feedback
**When to use:** The journal entry form wrapping the editor
**Example:**
```typescript
// Source: Custom pattern based on project conventions
import { useRef, useState, useCallback, useEffect } from "react";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useJournalAutosave(
  entryId: string | null,
  entryDate: string,
  delay = 2000
) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown> | null>(null);

  const save = useCallback(async (data: Record<string, unknown>) => {
    setSaveStatus("saving");
    try {
      const url = entryId ? `/api/journal/${entryId}` : "/api/journal";
      const method = entryId ? "PATCH" : "POST";
      const body = entryId ? data : { ...data, entry_date: entryDate };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Save failed");
      const result = await res.json();
      setSaveStatus("saved");
      return result.entry;
    } catch {
      setSaveStatus("error");
      return null;
    }
  }, [entryId, entryDate]);

  const scheduleSave = useCallback((data: Record<string, unknown>) => {
    pendingRef.current = data;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      if (pendingRef.current) save(pendingRef.current);
    }, delay);
  }, [save, delay]);

  // Flush on unmount (beforeunload fallback)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (pendingRef.current) {
        // Use sendBeacon for reliable delivery during unload
        navigator.sendBeacon(
          entryId ? `/api/journal/${entryId}` : "/api/journal",
          JSON.stringify(pendingRef.current)
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [entryId]);

  return { saveStatus, scheduleSave, saveNow: save };
}
```

### Pattern 4: Center Modal Dialog (~70% Viewport)
**What:** Radix Dialog sized to ~70% viewport width for the entry form
**When to use:** Both create and edit entry flows
**Example:**
```typescript
// Source: Existing shadcn/ui Dialog component + custom sizing
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";

export function JournalEntryModal({
  open,
  onOpenChange,
  date,
}: JournalEntryModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[70vw] max-h-[85vh] overflow-y-auto"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>{formatDate(date)}</DialogTitle>
        </DialogHeader>
        {/* Editor + mood selector + status indicator */}
      </DialogContent>
    </Dialog>
  );
}
```
Note: The existing `DialogContent` has `sm:max-w-lg` as default. Override with `sm:max-w-[70vw]` via className.

### Pattern 5: Simple 5-Emoji Mood Selector
**What:** Five hardcoded emoji buttons in a row, with active state highlighting
**When to use:** Inside the journal entry modal
**Example:**
```typescript
const MOODS = [
  { value: 5, emoji: "\uD83E\uDD29", label: "Amazing" },
  { value: 4, emoji: "\uD83D\uDE0A", label: "Good" },
  { value: 3, emoji: "\uD83D\uDE42", label: "Okay" },
  { value: 2, emoji: "\uD83D\uDE15", label: "Not great" },
  { value: 1, emoji: "\uD83D\uDE29", label: "Awful" },
] as const;

export function MoodSelector({ value, onChange }: MoodSelectorProps) {
  return (
    <div role="radiogroup" aria-label="Mood" className="flex gap-2">
      {MOODS.map((mood) => (
        <button
          key={mood.value}
          type="button"
          role="radio"
          aria-checked={value === mood.value}
          aria-label={mood.label}
          onClick={() => onChange(mood.value)}
          className={cn(
            "text-2xl p-2 rounded-lg transition-all",
            value === mood.value
              ? "bg-primary/10 ring-2 ring-primary scale-110"
              : "hover:bg-muted opacity-60 hover:opacity-100"
          )}
        >
          {mood.emoji}
        </button>
      ))}
    </div>
  );
}
```

### Pattern 6: Delete with AlertDialog Confirmation
**What:** shadcn/ui AlertDialog for delete confirmation before calling DELETE endpoint
**When to use:** Delete button in the entry modal
**Example:**
```typescript
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive" size="sm">
      <Trash2 className="size-4" />
      {t("journal.delete")}
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("journal.deleteConfirm.title")}</AlertDialogTitle>
      <AlertDialogDescription>
        {t("journal.deleteConfirm.description")}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>
        {t("common.delete")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Anti-Patterns to Avoid
- **Never import BubbleMenu from `@tiptap/react` in v3** -- use `@tiptap/react/menus` (v3 breaking change)
- **Never import CharacterCount from `@tiptap/extension-character-count`** -- use `@tiptap/extensions` (v3 consolidated)
- **Never import TaskList/TaskItem from individual packages** -- use `@tiptap/extension-list` (v3 consolidated)
- **Never use `useDebounce` hook for autosave** -- the existing hook debounces a value, not a callback. Use `useRef` + `setTimeout` for autosave where you need the callback to fire.
- **Never use `editor.getHTML()` for storage** -- use `editor.getJSON()`. The DB schema stores JSONB, not HTML strings.
- **Never forget `immediatelyRender: false`** -- required in Next.js to prevent SSR hydration mismatches.
- **Never use `sendBeacon` with non-JSON content type** -- `navigator.sendBeacon` sends `text/plain` by default. The API route must handle this, or use a Blob with `application/json` type.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rich text editing | Custom contenteditable + execCommand | Tiptap 3 with StarterKit | ProseMirror handles all edge cases (cursor, selection, undo/redo, paste normalization) |
| Floating toolbar positioning | Manual absolute positioning on selection | Tiptap `BubbleMenu` component | Handles positioning, show/hide logic, viewport boundary detection |
| Word count | Regex-based word counting | `CharacterCount` extension via `editor.storage.characterCount.words()` | Handles Unicode, CJK characters, whitespace edge cases |
| Debounce timer | Custom setInterval polling | `useRef` + `setTimeout` with cleanup | Simple, correct, handles unmount cleanup |
| Delete confirmation | `window.confirm()` | shadcn/ui `AlertDialog` | Accessible, styled consistently, keyboard navigable |
| Emoji rendering | Custom emoji images or sprites | Native Unicode emoji characters | Project decision: "Standard emoji rendering". Native emojis render correctly on all modern platforms. |

**Key insight:** The data layer is 100% complete from Phase 20. This phase is purely UI components calling existing endpoints. The only new library is Tiptap -- everything else uses existing project primitives.

## Common Pitfalls

### Pitfall 1: Tiptap Hydration Mismatch in Next.js
**What goes wrong:** React hydration error on page load: "Text content did not match"
**Why it happens:** Tiptap renders content into the DOM during SSR, but the server has no editor state. The client-rendered content differs from the server-rendered empty div.
**How to avoid:** Two defenses: (1) `immediatelyRender: false` on `useEditor()`, and (2) load the editor component via `next/dynamic` with `ssr: false` (the kanban-board-loader pattern).
**Warning signs:** Red hydration error in console. White flash on page load.

### Pitfall 2: BubbleMenu Import Path (v3 Breaking Change)
**What goes wrong:** `import { BubbleMenu } from '@tiptap/react'` fails or shows warning in Tiptap v3.
**Why it happens:** Tiptap v3 moved menu components to a `/menus` subpath: `@tiptap/react/menus`.
**How to avoid:** Always import: `import { BubbleMenu } from '@tiptap/react/menus'`
**Warning signs:** Module not found error, or deprecation warning in console.

### Pitfall 3: Autosave Race Condition on Rapid Edits
**What goes wrong:** User types fast, autosave fires, then fires again before the first save completes. The second save overwrites with stale content, or two saves run concurrently causing conflict.
**Why it happens:** The debounce timer fires the save callback, but the previous save hasn't completed yet.
**How to avoid:** Use an `isSaving` ref to skip/queue saves while one is in flight. Or use an AbortController to cancel the previous request. The simplest approach: let saves overlap -- the upsert is idempotent, and the latest save wins because it has the most recent content.
**Warning signs:** Save status flickering between "Saving" and "Saved" rapidly.

### Pitfall 4: Stale Closure in onUpdate Callback
**What goes wrong:** The `onUpdate` callback in `useEditor` captures a stale reference to the autosave function or entry ID.
**Why it happens:** `useEditor` memoizes the config object. If the entry ID changes (e.g., after first save creates the entry), the `onUpdate` still references the old ID.
**How to avoid:** Use a `useRef` for the autosave callback and update the ref when dependencies change. The `onUpdate` callback reads from the ref instead of closing over the value.
**Warning signs:** Autosave creates duplicate entries instead of updating the existing one.

### Pitfall 5: Empty Content Triggers Autosave Flood
**What goes wrong:** Opening the editor for a new entry triggers `onUpdate` immediately (Tiptap emits an update when content is set), causing an autosave to fire before the user has typed anything.
**Why it happens:** `editor.commands.setContent()` or initial content loading emits an `onUpdate` event.
**How to avoid:** Add a dirty flag that only becomes `true` after the first real user edit. Skip autosave if the content hasn't actually changed from the loaded state.
**Warning signs:** API calls immediately on modal open, creating empty entries.

### Pitfall 6: Dialog Content Size on Mobile
**What goes wrong:** The 70% viewport modal is too small on mobile screens, or scrolling inside the dialog fights with the page scroll.
**Why it happens:** `max-w-[70vw]` works on desktop but leaves too little space on small screens.
**How to avoid:** Use responsive sizing: `w-full sm:max-w-[70vw]`. On mobile, the dialog should be near full-width. Use `overflow-y-auto` on the content area and `overscroll-behavior: contain` to prevent scroll passthrough.
**Warning signs:** Cramped editor on mobile, scroll fighting, content overflow.

### Pitfall 7: sendBeacon Limitations for beforeunload Fallback
**What goes wrong:** `navigator.sendBeacon()` sends data as `text/plain` by default, and the API route rejects it because it expects JSON.
**Why it happens:** `sendBeacon` with a string payload doesn't set `Content-Type: application/json`.
**How to avoid:** Send a `Blob` with the correct content type: `new Blob([JSON.stringify(data)], { type: 'application/json' })`. Or, handle `text/plain` content type in the API route.
**Warning signs:** beforeunload saves silently failing (no console output during unload).

### Pitfall 8: Testing Tiptap Components with Vitest/JSDOM
**What goes wrong:** Tests fail because JSDOM doesn't support `contenteditable` or ProseMirror's view layer.
**Why it happens:** Tiptap relies on DOM APIs that JSDOM implements incompletely (Selection, Range, etc.).
**How to avoid:** For unit tests, mock the Tiptap editor at the module level. Test the autosave hook independently (it just calls fetch). Test the mood selector as a standalone component. For full editor interaction tests, use Playwright E2E tests. Do NOT try to render Tiptap `EditorContent` in JSDOM.
**Warning signs:** Cryptic errors about `getSelection()` or `document.createRange()` in test output.

## Code Examples

Verified patterns from official sources and existing codebase:

### Tiptap Editor Styles (CSS for `.tiptap` class)
```css
/* In globals.css or a journal-specific CSS module */

/* Base editor styling */
.tiptap-journal {
  @apply text-foreground outline-none;
}

/* Editor content area */
.tiptap-journal .tiptap {
  @apply min-h-[300px] focus:outline-none;
}

/* Headings */
.tiptap-journal h2 {
  @apply text-xl font-bold mt-6 mb-2;
}
.tiptap-journal h3 {
  @apply text-lg font-semibold mt-4 mb-2;
}

/* Paragraphs */
.tiptap-journal p {
  @apply mb-3 leading-relaxed;
}

/* Lists */
.tiptap-journal ul {
  @apply list-disc pl-6 mb-3;
}
.tiptap-journal ol {
  @apply list-decimal pl-6 mb-3;
}

/* Task lists */
.tiptap-journal ul[data-type="taskList"] {
  @apply list-none pl-0;
}
.tiptap-journal ul[data-type="taskList"] li {
  @apply flex items-start gap-2;
}

/* Blockquote */
.tiptap-journal blockquote {
  @apply border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground;
}

/* Code block */
.tiptap-journal pre {
  @apply bg-muted rounded-md p-4 font-mono text-sm overflow-x-auto mb-3;
}

/* Inline code */
.tiptap-journal code {
  @apply bg-muted rounded px-1.5 py-0.5 font-mono text-sm;
}

/* Horizontal rule */
.tiptap-journal hr {
  @apply border-border my-6;
}

/* Links */
.tiptap-journal a {
  @apply text-primary underline;
}

/* Strikethrough */
.tiptap-journal s {
  @apply line-through text-muted-foreground;
}
```

### Bubble Menu Toolbar Component
```typescript
// Source: Tiptap v3 docs (Context7)
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import {
  Bold, Italic, Strikethrough, Heading2, Heading3,
  List, ListOrdered, Quote, Code2, Link2, Minus,
  ListChecks
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Toggle } from "@/components/ui/toggle";

interface BubbleToolbarProps {
  editor: Editor;
}

export function JournalBubbleMenu({ editor }: BubbleToolbarProps) {
  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ placement: "top" }}
      className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-lg"
    >
      <Toggle
        size="sm"
        pressed={editor.isActive("bold")}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("italic")}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </Toggle>
      {/* ... more formatting toggles ... */}
    </BubbleMenu>
  );
}
```

### Vitest Mock for Tiptap Editor (Unit Testing)
```typescript
// Source: Project testing patterns (tests/app/dashboard/dashboard-content.test.tsx)

// Mock next/dynamic to eagerly resolve lazy components in tests
vi.mock("next/dynamic", () => ({
  __esModule: true,
  default: (importFn: () => Promise<any>, options?: any) => {
    const LazyComponent = React.lazy(importFn);
    const DynamicMock = (props: any) =>
      React.createElement(
        React.Suspense,
        { fallback: options?.loading?.() ?? null },
        React.createElement(LazyComponent, props),
      );
    DynamicMock.displayName = "DynamicMock";
    return DynamicMock;
  },
}));

// Mock Tiptap for JSDOM (don't try to render the real editor)
vi.mock("@tiptap/react", () => ({
  useEditor: () => ({
    getJSON: () => ({ type: "doc", content: [] }),
    commands: { setContent: vi.fn() },
    isActive: () => false,
    chain: () => ({ focus: () => ({ toggleBold: () => ({ run: vi.fn() }) }) }),
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
    storage: { characterCount: { words: () => 0 } },
  }),
  EditorContent: ({ editor }: any) =>
    React.createElement("div", { "data-testid": "tiptap-editor" }),
}));

vi.mock("@tiptap/react/menus", () => ({
  BubbleMenu: ({ children }: any) =>
    React.createElement("div", { "data-testid": "bubble-menu" }, children),
}));
```

### Complete Autosave Flow (Conceptual)
```
User types in editor
  -> onUpdate fires (Tiptap event)
  -> Update dirty flag to true
  -> Call scheduleSave(json, mood, wordCount)
  -> Clear previous timeout
  -> Set new 2s timeout
  -> [2 seconds pass with no more edits]
  -> Timeout fires
  -> setSaveStatus("saving")
  -> POST or PATCH /api/journal
  -> On success: setSaveStatus("saved"), update entryId ref if new
  -> On error: setSaveStatus("error"), show toast
  -> SWR mutate to update cache

User navigates away (beforeunload)
  -> Flush pending save immediately via sendBeacon
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `import { BubbleMenu } from '@tiptap/react'` | `import { BubbleMenu } from '@tiptap/react/menus'` | Tiptap v3 | Breaking import path change |
| `import CharacterCount from '@tiptap/extension-character-count'` | `import { CharacterCount } from '@tiptap/extensions'` | Tiptap v3 | Consolidated package |
| `import { TaskList } from '@tiptap/extension-task-list'` | `import { TaskList, TaskItem } from '@tiptap/extension-list'` | Tiptap v3 | Consolidated list package |
| `editor.getCharacterCount()` method | `editor.storage.characterCount.words()` storage API | Tiptap v3 | Storage-based access pattern |
| Tippy.js for floating menus | Floating UI (built-in) | Tiptap v3 | No manual Tippy.js dependency needed |

**Deprecated/outdated:**
- Individual extension packages (`@tiptap/extension-placeholder`, `@tiptap/extension-character-count`, etc.) -- replaced by consolidated `@tiptap/extensions` in v3
- Individual list packages (`@tiptap/extension-task-list`, `@tiptap/extension-task-item`) -- replaced by `@tiptap/extension-list` in v3
- `shouldRerenderOnTransaction: true` default -- disabled by default in v3 React

## Open Questions

1. **BubbleMenu tippyOptions in Tiptap v3**
   - What we know: Tiptap v3 replaced Tippy.js with Floating UI internally
   - What's unclear: Whether `tippyOptions` prop name changed to `floatingOptions` or similar
   - Recommendation: Check at install time. If `tippyOptions` is deprecated, use the new API. LOW confidence this will be an issue (likely backward compatible).

2. **sendBeacon content type handling in API route**
   - What we know: `navigator.sendBeacon()` with string sends `text/plain` by default
   - What's unclear: Whether Next.js API routes using `request.json()` will parse `text/plain` bodies
   - Recommendation: Use `new Blob([JSON.stringify(data)], { type: 'application/json' })` as the sendBeacon payload. Test this explicitly.

3. **Tiptap v3 exact package versions at install time**
   - What we know: STACK.md references `^3.20.0` but the exact latest version may differ
   - What's unclear: Exact latest stable version
   - Recommendation: Use `pnpm add @tiptap/react@latest` (caret range). Verify compatibility after install.

## Sources

### Primary (HIGH confidence)
- `/ueberdosis/tiptap-docs` (Context7) -- useEditor hook, BubbleMenu component, StarterKit configuration, extensions setup, React integration
- [Tiptap v2 to v3 Migration Guide](https://tiptap.dev/docs/guides/upgrade-tiptap-v2) -- Consolidated packages, import path changes, breaking changes
- [Tiptap StarterKit docs](https://tiptap.dev/docs/editor/extensions/functionality/starterkit) -- Included extensions list, configuration options
- [Tiptap CharacterCount docs](https://tiptap.dev/docs/editor/extensions/functionality/character-count) -- Word count API, storage access pattern
- [Tiptap TaskList docs](https://tiptap.dev/docs/editor/extensions/nodes/task-list) -- `@tiptap/extension-list` package
- Existing codebase: `components/kanban/kanban-board-loader.tsx` -- `next/dynamic` with `ssr: false` pattern
- Existing codebase: `components/ui/dialog.tsx` -- Dialog component with `showCloseButton` prop
- Existing codebase: `components/ui/alert-dialog.tsx` -- AlertDialog for delete confirmation
- Existing codebase: `lib/hooks/use-journal-entry.ts` -- SWR hook (already built in Phase 20)
- Existing codebase: `app/api/journal/route.ts` -- POST upsert endpoint (already built in Phase 20)
- Existing codebase: `app/api/journal/[id]/route.ts` -- PATCH, DELETE endpoints (already built in Phase 20)
- Existing codebase: `tests/app/dashboard/dashboard-content.test.tsx` -- `vi.mock("next/dynamic")` pattern for testing dynamic imports

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` -- Tiptap 3 version compatibility verified 2026-02-22, React 19 peer deps confirmed
- `.planning/phases/20-database-api-foundation/20-RESEARCH.md` -- DB schema, API patterns, Zod validation (all confirmed working)

### Tertiary (LOW confidence)
- BubbleMenu `tippyOptions` vs `floatingOptions` naming -- needs verification at install time (Tiptap v3 changed underlying library from Tippy.js to Floating UI)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Tiptap v3 packages verified via Context7 and official migration guide. Import paths confirmed for v3.
- Architecture: HIGH -- All UI patterns follow existing codebase conventions (dynamic import, Dialog, AlertDialog, SWR hooks). Data layer is 100% complete.
- Pitfalls: HIGH -- Hydration mismatch, stale closures, autosave race conditions all documented with solutions.
- Testing: MEDIUM -- Tiptap mock pattern is derived from existing project patterns but not yet validated. JSDOM limitations with contenteditable are well-known.

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (stable patterns, Tiptap v3 is recent but API is settling)
