---
phase: 21-journal-entry-crud
plan: 01
subsystem: ui
tags: [tiptap, rich-text, editor, bubble-menu, autosave, mood-selector, i18n]

# Dependency graph
requires:
  - phase: 20-database-api-foundation
    provides: Journal DB classes, API routes (POST/PATCH/DELETE), SWR hooks, Zod validation
provides:
  - Tiptap 3 rich-text editor component with floating bubble toolbar
  - Dynamic SSR-safe editor loader (next/dynamic ssr:false)
  - 5-emoji mood selector with radiogroup accessibility
  - Debounced autosave hook (2s) with POST-to-PATCH transition and sendBeacon fallback
  - Save status indicator (idle/saving/saved/error)
  - Journal i18n strings in 3 locales (en, zh, zh-TW)
affects: [21-02-PLAN, 22-journal-views, 23-journal-calendar]

# Tech tracking
tech-stack:
  added: ["@tiptap/react 3.20.0", "@tiptap/pm 3.20.0", "@tiptap/starter-kit 3.20.0", "@tiptap/extensions 3.20.0", "@tiptap/extension-list 3.20.0"]
  patterns: [tiptap-useEditor-with-immediatelyRender-false, BubbleMenu-from-tiptap-react-menus, onUpdate-ref-pattern-for-stale-closure, debounced-autosave-with-sendBeacon-fallback]

key-files:
  created:
    - components/journal/journal-editor.tsx
    - components/journal/journal-bubble-menu.tsx
    - components/journal/journal-editor-loader.tsx
    - components/journal/journal-editor-skeleton.tsx
    - components/journal/journal-mood-selector.tsx
    - components/journal/journal-save-status.tsx
    - lib/hooks/use-journal-autosave.ts
  modified:
    - app/globals.css
    - i18n/messages/en.json
    - i18n/messages/zh.json
    - i18n/messages/zh-TW.json
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Mood onChange passes null (not 0) for deselect -- cleaner API for parent to map to DB"
  - "BubbleMenu imported from @tiptap/react/menus (v3 path), not @tiptap/react"
  - "Autosave hook tracks entryId via useRef to handle POST-to-PATCH transition without stale closures"
  - "sendBeacon uses Blob with application/json content-type for beforeunload fallback"

patterns-established:
  - "Tiptap editor: useEditor with immediatelyRender:false + next/dynamic ssr:false"
  - "onUpdate ref pattern: useRef for callbacks passed to useEditor to prevent stale closures"
  - "Autosave: useRef+setTimeout debounce with entryIdRef for create-then-update flow"

requirements-completed: [ENTR-01, ENTR-04]

# Metrics
duration: 4min
completed: 2026-02-23
---

# Phase 21 Plan 01: Editor UI Primitives Summary

**Tiptap 3 rich-text editor with 14-option floating bubble toolbar, 5-emoji mood selector, debounced autosave hook, and i18n strings for 3 locales**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-23T19:26:12Z
- **Completed:** 2026-02-23T19:30:40Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Installed Tiptap 3 (5 packages) and created a full rich-text editor with SSR-safe dynamic loading
- Built floating bubble toolbar with all 14 formatting options (bold, italic, strikethrough, H2, H3, bullet list, ordered list, task list, blockquote, code block, link, horizontal rule) plus separators
- Created mood selector with 5 emojis, radiogroup accessibility, active state highlighting, and deselect support
- Built autosave hook with 2s debounce, automatic POST-to-PATCH transition after first save, and sendBeacon beforeunload fallback
- Added journal i18n strings to all 3 locale files (en, zh, zh-TW)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Tiptap 3 and create editor component with bubble menu** - `1eaf6a6` (feat)
2. **Task 2: Create mood selector, save status indicator, autosave hook, and i18n strings** - `9ce07c9` (feat)

## Files Created/Modified
- `components/journal/journal-editor.tsx` - Tiptap editor with useEditor, immediatelyRender:false, StarterKit, TaskList, CharacterCount
- `components/journal/journal-bubble-menu.tsx` - Floating BubbleMenu from @tiptap/react/menus with 14 formatting toggles
- `components/journal/journal-editor-loader.tsx` - Dynamic import wrapper with ssr:false (follows kanban-board-loader pattern)
- `components/journal/journal-editor-skeleton.tsx` - Loading skeleton with toolbar strip and editor area
- `components/journal/journal-mood-selector.tsx` - 5-emoji mood selector with radiogroup role and deselect
- `components/journal/journal-save-status.tsx` - Save status display (idle/saving/saved/error) with lucide icons
- `lib/hooks/use-journal-autosave.ts` - Debounced autosave with POST/PATCH transition and sendBeacon fallback
- `app/globals.css` - Tiptap journal editor CSS styles for all rich-text elements
- `i18n/messages/en.json` - Journal namespace with mood, save status, entry management strings
- `i18n/messages/zh.json` - Chinese Simplified journal translations
- `i18n/messages/zh-TW.json` - Chinese Traditional journal translations
- `package.json` + `pnpm-lock.yaml` - Added 5 Tiptap packages

## Decisions Made
- Mood onChange passes `null` (not `0`) for deselect -- cleaner API that matches the DB schema (mood is nullable integer)
- BubbleMenu imported from `@tiptap/react/menus` (Tiptap v3 import path)
- Autosave hook tracks entryId via `useRef` to handle the POST-to-PATCH transition without stale closure issues
- sendBeacon uses `new Blob([JSON.stringify(data)], { type: 'application/json' })` to ensure correct content-type

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All UI primitives ready for Plan 02 to wire into the entry modal and page route
- Editor, mood selector, save status, and autosave hook are self-contained and composable
- i18n strings cover all Plan 01 and Plan 02 needs (mood labels, save status, entry management, delete confirmation)

## Self-Check: PASSED

All 7 created files verified on disk. Both task commits (1eaf6a6, 9ce07c9) verified in git log.

---
*Phase: 21-journal-entry-crud*
*Completed: 2026-02-23*
