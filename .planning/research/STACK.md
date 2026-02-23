# Technology Stack: Journal Feature

**Project:** BetterR.Me - v4.0 Journal Milestone
**Researched:** 2026-02-22
**Confidence:** HIGH
**Scope:** Stack ADDITIONS only. Existing stack (Next.js 16, React 19, Supabase, shadcn/ui, Tailwind CSS 3, SWR, next-intl, etc.) is validated and unchanged.

## Decision Summary

The journal feature needs exactly **two new library groups**: a rich text editor (Tiptap) and an emoji picker (Frimousse). Everything else -- calendar, forms, data fetching, i18n, testing -- is already in the stack and sufficient as-is.

## Recommended Stack Additions

### Rich Text Editor: Tiptap 3

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@tiptap/react` | ^3.20.0 | React bindings for the Tiptap editor | Headless WYSIWYG built on ProseMirror. MIT licensed. Outputs structured JSON (ideal for Supabase JSONB storage). Fully supports React 19 (`peerDependencies: ^19.0.0`). Unstyled -- works perfectly with Tailwind CSS and shadcn/ui design tokens. |
| `@tiptap/pm` | ^3.20.0 | ProseMirror foundation (required peer) | Required peer dependency for `@tiptap/react`. Provides the low-level editing primitives. |
| `@tiptap/starter-kit` | ^3.20.0 | Bundle of common extensions | Includes paragraph, heading, bold, italic, underline, strike, code, blockquote, bullet list, ordered list, link, hard break, horizontal rule. Covers all formatting a journal entry needs without cherry-picking individual extensions. |
| `@tiptap/extension-placeholder` | ^3.20.0 | Placeholder text in empty editor | Shows "What's on your mind today?" or writing prompts as placeholder text in the empty editor state. Essential UX for journal entries. |
| `@tiptap/extension-character-count` | ^3.20.0 | Character/word count display | Shows word count for journal entries. Useful for users tracking writing habits. Low cost, high value for a journaling feature. |

**Why Tiptap over a plain `<Textarea>`:**

A journal with "rich text area" (per PROJECT.md requirements) needs at minimum bold, italic, lists, and headings. A plain textarea only supports raw text -- no inline formatting without implementing a custom markdown parser and preview. Tiptap provides:

1. **WYSIWYG editing** -- users see formatted text as they write, no markdown syntax needed
2. **Structured JSON output** -- stores as `JSONB` in Supabase, enabling future search/filtering/export without parsing HTML
3. **Extensible** -- add features like task checkboxes, image embeds, or mentions later without replacing the editor
4. **Headless** -- zero opinions about styling, so it integrates cleanly with the existing Tailwind + shadcn/ui design system
5. **SSR-safe** -- set `immediatelyRender: false` in `useEditor()` to avoid hydration mismatches in Next.js App Router

**Why NOT markdown + preview:**

For a personal journal app, markdown syntax creates friction. Users expect to click "B" for bold, not type `**text**`. The audience is general users tracking habits, not developers. WYSIWYG matches the UX expectations set by the rest of the app (forms, selects, toggles).

**Confidence: HIGH** -- Tiptap v3 explicitly supports React 19 in peer dependencies. Official Next.js integration docs describe the exact `immediatelyRender: false` pattern needed. Verified via npm and tiptap.dev.

### Emoji Picker: Frimousse

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `frimousse` | ^0.3.0 | Mood emoji selection for journal entries | 12kB bundle, dependency-free, unstyled and composable, React 18/19 support, has official shadcn/ui integration via `npx shadcn@latest add`. Virtualized with minimal re-renders. Keyboard navigable and screen-reader friendly. |

**Why Frimousse over alternatives:**

| Criteria | Frimousse | emoji-picker-react | emoji-mart |
|----------|-----------|-------------------|------------|
| Bundle size | ~12kB | ~90kB+ | ~40kB+ |
| Styling approach | Unstyled, composable | Pre-styled, opinionated | Pre-styled |
| shadcn/ui integration | Official (CLI install) | None | None |
| React 19 support | Yes (`^18 \|\| ^19`) | Yes (`>=16`) | Needs verification |
| Dependencies | Zero | Multiple | Multiple |
| Tailwind CSS compat | Native (BYO styles) | Requires overrides | Requires overrides |

Frimousse wins on every dimension that matters for this project: it is the smallest, has zero dependencies, is unstyled (matches our headless component philosophy with shadcn/ui), and has an official shadcn/ui component recipe. The other pickers would fight against our design system.

**Mood selector context:** The journal feature needs a mood picker, not a full emoji keyboard. Frimousse can be constrained to show only a curated set of mood-relevant emojis (e.g., smileys & people category), or we can build a simpler custom grid of 5-8 mood emojis using Frimousse's composable parts. Either approach works cleanly.

**Confidence: HIGH** -- Verified version and peer deps via npm. shadcn/ui integration confirmed at frimousse.liveblocks.io. Liveblocks (the maintainer) uses it in production.

## Existing Stack: Already Sufficient

These existing technologies cover the journal feature's remaining needs with zero additions:

| Existing Technology | Journal Feature Use |
|---------------------|---------------------|
| `react-day-picker` v8.10.1 + shadcn/ui `Calendar` | Calendar view showing which days have entries. Use custom modifiers/`modifiersStyles` to highlight days with entries (colored dots or background). Already in `components/ui/calendar.tsx`. |
| `react-hook-form` + `zod` | Journal entry form (mood, prompt selection, metadata). NOT for the rich text body itself (Tiptap manages its own state), but for the wrapping form fields. |
| `SWR` | Fetching journal entries by date, timeline pagination, calendar entry-existence queries. Same patterns as habits/tasks. |
| `lucide-react` | Icons for journal sidebar nav (e.g., `BookOpen`, `Pencil`, `SmilePlus`), toolbar buttons, prompt icons. Already installed, just use new icon names. |
| `date-fns` v4 | Date formatting for timeline view, "3 days ago" relative dates, grouping entries by week/month. |
| `sonner` | Toast feedback on save/delete/error. |
| `next-intl` | i18n for all journal strings in en, zh, zh-TW. |
| `next-themes` | Dark mode for journal editor and calendar. Tiptap inherits from parent CSS -- style the `.tiptap` class with Tailwind dark: variants. |
| `shadcn/ui Card` | Entry cards in timeline view. |
| `shadcn/ui Dialog` | Quick journal entry from dashboard widget. |
| `shadcn/ui Popover` | Mood emoji picker popover, calendar date picker. |
| `shadcn/ui Badge` | Mood indicator badges, prompt tags. |
| `shadcn/ui Tabs` | Calendar view vs timeline view toggle. |
| `shadcn/ui Textarea` | NOT used for journal body (Tiptap replaces this), but could be used for a simple "prompt response" field if needed. |
| `Supabase` | New `journal_entries` table with JSONB content column for Tiptap JSON. RLS policies follow existing pattern. |
| `Tailwind CSS 3` | All journal layout and editor styling. |

## Installation

```bash
# Rich text editor (Tiptap 3) -- 5 packages
pnpm add @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-placeholder @tiptap/extension-character-count

# Emoji picker
pnpm add frimousse
```

Optionally, install the Frimousse shadcn/ui component recipe:

```bash
npx shadcn@latest add https://frimousse.liveblocks.io/r/emoji-picker
```

This creates a styled `EmojiPicker` component in `components/ui/` that uses the project's existing CSS variables.

No new dev dependencies needed -- existing Vitest + Testing Library + Playwright cover all testing needs.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Rich text | Tiptap 3 | Plain `<Textarea>` | No formatting support. "Rich text area" requirement demands inline formatting (bold, lists, headings). Building markdown parsing + preview on top of textarea reinvents Tiptap poorly. |
| Rich text | Tiptap 3 | Lexical (Meta) | Lower-level than Tiptap, requires more boilerplate for the same features. Smaller extension ecosystem. Less community adoption for journal/note-taking use cases. Tiptap's StarterKit gives us 80% of what we need in one import. |
| Rich text | Tiptap 3 | Plate (shadcn-native) | Plate is built on Slate.js, which has a history of breaking changes and migration pain. Tiptap/ProseMirror has a more stable API surface. Plate's shadcn integration is nice but adds coupling to a specific component library version. |
| Rich text | Tiptap 3 | TinyMCE / CKEditor | Commercial licenses for advanced features. Opinionated styling that clashes with our Tailwind + shadcn/ui design system. Heavier bundle. Not headless. |
| Rich text | Tiptap 3 | Markdown textarea + preview | Adds cognitive overhead for non-technical users. Requires building a preview renderer (react-markdown + rehype). Two states to manage (raw markdown + rendered HTML). Not suitable for a mainstream habit tracking app. |
| Emoji picker | Frimousse | `emoji-picker-react` | 7-8x larger bundle (~90kB). Pre-styled -- fights our design system. No shadcn/ui integration. |
| Emoji picker | Frimousse | `emoji-mart` | 3-4x larger bundle (~40kB). Pre-styled. No shadcn/ui integration. Overkill for a mood selector. |
| Emoji picker | Frimousse | Custom hardcoded grid | Viable for MVP (just 5-8 mood buttons), but Frimousse at 12kB gives us search, categories, and accessibility for free. If users want to pick any emoji as their mood, a hardcoded grid cannot satisfy that. Frimousse is the "costs almost nothing, enables everything" choice. |
| Calendar | Existing `react-day-picker` v8 | `react-calendar` | Already have react-day-picker installed and a shadcn/ui `Calendar` component built. Adding another calendar library is pointless. Custom modifiers in react-day-picker handle "highlight days with entries" perfectly. |

## What NOT to Add

| Do NOT Add | Why | What to Use Instead |
|------------|-----|---------------------|
| `react-markdown` / `remark` / `rehype` | No markdown parsing needed -- Tiptap handles rich text natively and outputs structured JSON | Tiptap's `editor.getJSON()` for storage, `editor.getHTML()` for read-only rendering |
| `@tiptap/extension-image` | Images in journal entries add storage complexity (Supabase Storage, upload UI, S3 costs). Out of scope for v4.0. | Defer to future milestone if users request image support |
| `@tiptap/extension-task-list` | Tempting for "linking tasks to entries", but the journal-task link should be a foreign key reference, not embedded checkboxes in rich text | Use a separate `journal_entry_links` table or JSONB field for habit/task references |
| `@tiptap/extension-mention` | No @-mention use case in a personal journal app | Simple dropdown/multiselect for linking habits/tasks |
| `framer-motion` | No complex animations needed for journal. Page transitions and micro-interactions are handled by Tailwind CSS transitions. | Tailwind `transition-*` classes |
| Any markdown parser | Tiptap stores as JSON, renders as HTML. No markdown intermediate format. | Tiptap JSON in Supabase JSONB column |
| `react-virtualized` / `react-window` | Timeline view pagination via SWR (load 20 entries, fetch more on scroll) is sufficient. A personal journal will have hundreds of entries, not millions. | SWR cursor-based pagination |
| `dompurify` / `sanitize-html` | Tiptap's structured JSON output is inherently safe -- no raw HTML injection risk. Only sanitize if rendering user HTML from external sources, which we don't. | Tiptap's JSON-to-HTML rendering via `generateHTML()` |

## Key Integration Points

### Tiptap + Next.js App Router (SSR)

All Tiptap components MUST be client components (`"use client"`). Set `immediatelyRender: false` to prevent hydration mismatches:

```typescript
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";

export function JournalEditor({ content, onChange }: JournalEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "What's on your mind today?" }),
      CharacterCount,
    ],
    content, // Tiptap JSON from database
    immediatelyRender: false, // CRITICAL: prevents SSR hydration mismatch
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON()); // Pass JSON to parent for saving
    },
  });

  return <EditorContent editor={editor} className="prose dark:prose-invert" />;
}
```

### Tiptap + Supabase (Storage)

Store journal content as **JSONB** in Supabase. Tiptap JSON is the recommended storage format per Tiptap docs -- more flexible than HTML, easier to query, and enables future features (search, analytics) without parsing HTML.

```sql
CREATE TABLE journal_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  entry_date DATE NOT NULL,
  content JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
  mood TEXT,          -- emoji character e.g., '😊'
  prompt_key TEXT,    -- i18n key for which prompt was used, if any
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, entry_date)  -- one entry per day per user
);
```

### Tiptap + Tailwind CSS (Styling)

Tiptap renders into a `.tiptap` container. Style it with Tailwind's `@apply` or the `prose` class from `@tailwindcss/typography` (already available via Tailwind CSS 3). Use the project's semantic design tokens for consistent look:

```css
/* In globals.css or a journal-specific CSS file */
.tiptap {
  @apply text-foreground min-h-[200px] outline-none;
}
.tiptap p.is-editor-empty:first-child::before {
  @apply text-muted-foreground pointer-events-none float-left h-0;
  content: attr(data-placeholder);
}
```

### Frimousse + shadcn/ui Popover (Mood Picker)

Combine Frimousse's composable parts with the existing Popover component:

```typescript
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { EmojiPicker } from "@/components/ui/emoji-picker"; // from shadcn recipe

export function MoodPicker({ value, onChange }: MoodPickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          {value || "Pick mood"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[352px] p-0">
        <EmojiPicker onEmojiSelect={(emoji) => onChange(emoji.emoji)} />
      </PopoverContent>
    </Popover>
  );
}
```

### Calendar + Custom Modifiers (Entry Indicators)

Use the existing `Calendar` component with `modifiers` to highlight days with journal entries:

```typescript
import { Calendar } from "@/components/ui/calendar";

// datesWithEntries: Date[] fetched via SWR
<Calendar
  modifiers={{ hasEntry: datesWithEntries }}
  modifiersClassNames={{ hasEntry: "bg-primary/20 font-semibold" }}
  onDayClick={(day) => navigateToEntry(day)}
/>
```

### SWR Key Pattern (Consistent with Existing Code)

Follow the project's established SWR pattern where keys include the local date:

```typescript
const { data: entries } = useSWR(
  `/api/journal?month=${getLocalMonthString(date)}`,
  fetcher,
  { keepPreviousData: true }
);
```

## Database Additions (Supabase)

No new libraries needed -- use existing Supabase client. Schema changes:

| Table/Column | Type | Purpose |
|--------------|------|---------|
| `journal_entries` table | New table | Stores daily journal entries |
| `journal_entries.content` | `JSONB` | Tiptap JSON document |
| `journal_entries.mood` | `TEXT` | Mood emoji character |
| `journal_entries.prompt_key` | `TEXT` (nullable) | i18n key for writing prompt used |
| `journal_entries.entry_date` | `DATE` | Entry date (browser-local, per existing timezone convention) |
| `journal_entry_links` table (optional) | New table | Links entries to habits/tasks via foreign keys |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@tiptap/react@^3.20.0` | React ^19.0.0 | Explicitly declared in peer deps. Verified via npm. |
| `@tiptap/react@^3.20.0` | Next.js 16 | Works with `immediatelyRender: false`. Official Next.js guide on tiptap.dev. |
| `@tiptap/pm@^3.20.0` | `@tiptap/react@^3.20.0` | Must match major version. Both at 3.20.0. |
| `@tiptap/starter-kit@^3.20.0` | `@tiptap/react@^3.20.0` | Same version family. |
| `frimousse@^0.3.0` | React ^18 or ^19 | Explicitly declared. |
| `frimousse@^0.3.0` | TypeScript >=5.1.0 | Project uses TypeScript ^5. Compatible. |
| `frimousse@^0.3.0` | shadcn/ui | Official CLI recipe available. |

No peer dependency conflicts with the existing stack. No `peerDependencyRules` overrides needed (unlike `@dnd-kit` in v3.0).

## Sources

- [@tiptap/react on npm](https://www.npmjs.com/package/@tiptap/react) -- v3.20.0, React 19 peer dep support, verified 2026-02-22
- [Tiptap Next.js Installation Guide](https://tiptap.dev/docs/editor/getting-started/install/nextjs) -- `immediatelyRender: false` pattern, client component requirement
- [Tiptap Persistence Docs](https://tiptap.dev/docs/editor/core-concepts/persistence) -- JSON storage recommended over HTML
- [Tiptap Export JSON/HTML](https://tiptap.dev/docs/guides/output-json-html) -- `editor.getJSON()` and `generateHTML()` APIs
- [Tiptap SSR Hydration Issue #5856](https://github.com/ueberdosis/tiptap/issues/5856) -- Confirms `immediatelyRender: false` fix
- [Frimousse official site](https://frimousse.liveblocks.io) -- 12kB, dependency-free, shadcn/ui CLI integration
- [Frimousse on npm](https://www.npmjs.com/package/frimousse) -- v0.3.0, React 18/19 peer deps, verified 2026-02-22
- [Frimousse GitHub](https://github.com/liveblocks/frimousse) -- Source, composable API, accessibility features
- [Liveblocks blog: Open-sourced Frimousse](https://liveblocks.io/blog/weve-open-sourced-our-customizable-emoji-picker-for-react) -- Production usage context
- [shadcn/ui Calendar docs](https://ui.shadcn.com/docs/components/radix/calendar) -- Custom modifiers for react-day-picker v8
- [react-day-picker Custom Modifiers](https://daypicker.dev/guides/custom-modifiers) -- API for highlighting specific dates
- [Tiptap Best Practices for Saving JSON vs HTML](https://medium.com/@faisalmujtaba/best-practices-for-saving-tiptap-json-vs-html-in-mongodb-mysql-a5192bd68abc) -- JSON as source of truth recommendation

---
*Stack research for: BetterR.Me v4.0 Journal Feature*
*Researched: 2026-02-22*
