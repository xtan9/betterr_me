# Domain Pitfalls

**Domain:** Adding journal/diary features (rich text, mood tracking, calendar browse, dashboard widget) to an existing habit tracking + task management app (BetterR.Me)
**Researched:** 2026-02-22
**Confidence:** HIGH (verified against codebase patterns, official Tiptap/Supabase docs, community reports)

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or major integration breakage.

### Pitfall 1: Rich Text Editor SSR Hydration Mismatch

**What goes wrong:** Tiptap (or any ProseMirror-based editor) renders differently on the server vs the browser because it depends on browser DOM APIs. In Next.js App Router, components are Server Components by default. Dropping a Tiptap EditorContent into a page without proper isolation causes React hydration errors that crash the page or produce silent rendering bugs.

**Why it happens:** Tiptap's useEditor hook initializes a ProseMirror EditorView that requires document and window globals. During SSR, these do not exist. Even with "use client", if immediatelyRender is not explicitly set to false, the editor tries to render content before hydration completes.

**Consequences:** Page crash on first load, intermittent hydration warnings in dev, invisible content in production. The existing kanban board already hit a similar issue (solved with next/dynamic + ssr: false -- see PROJECT.md key decisions).

**Prevention:**
1. Create the journal editor as a standalone "use client" component in `components/journal/journal-editor.tsx`
2. Load it via `next/dynamic` with `ssr: false` (matching the existing KanbanBoard pattern)
3. Set `immediatelyRender: false` in the useEditor config
4. Return a skeleton/placeholder while the editor initializes (`if (!editor) return <EditorSkeleton />`)

**Detection:** Hydration error in browser console: "Text content does not match server-rendered HTML" or "SSR has been detected, please set immediatelyRender explicitly to false"

**Sources:**
- [Tiptap Next.js install docs](https://tiptap.dev/docs/editor/getting-started/install/nextjs)
- [Tiptap GitHub issue #5856](https://github.com/ueberdosis/tiptap/issues/5856) -- bug persists in Next.js 15+
- Existing codebase: next/dynamic pattern in `components/dashboard/dashboard-content.tsx`

---

### Pitfall 2: Content Storage Format Lock-in

**What goes wrong:** Storing journal content as raw HTML string in a Supabase TEXT column. Later, you need to search entries, render previews, migrate editor libraries, or sanitize output -- and raw HTML makes all of these painful or insecure.

**Why it happens:** The quickest Tiptap integration stores editor.getHTML() as a string. It works initially but creates three problems: (a) searching requires HTML-aware parsing, (b) rendering previews requires sanitization against XSS, (c) changing editor libraries requires HTML-to-new-format migration.

**Consequences:** XSS vulnerabilities if rendering unsanitized HTML. Inability to full-text search journal content without stripping tags. Tight coupling to Tiptap's HTML output format.

**Prevention:**
1. Store Tiptap's native JSON document format (editor.getJSON()) in a JSONB column -- this is Tiptap's recommended approach and PostgreSQL's JSONB is optimized for it
2. Add a computed plain_text column (or a generated column / trigger) that strips formatting for search
3. Never store raw HTML -- render HTML on the client from the JSON document at display time
4. If you need a text preview (dashboard widget, timeline), extract plain text from the JSON document at write time and store in a separate `preview_text VARCHAR(300)` column

**Detection:** If you find yourself importing DOMPurify or a sanitizer library, you likely chose the wrong storage format.

**Sources:**
- [Tiptap persistence docs](https://tiptap.dev/docs/editor/core-concepts/persistence)
- [Supabase JSON/JSONB docs](https://supabase.com/docs/guides/database/json)
- [Tiptap discussion #964: best practices for saving to DB](https://github.com/ueberdosis/tiptap/discussions/964)

---

### Pitfall 3: Autosave Data Loss on Navigation

**What goes wrong:** User writes a journal entry, navigates away (clicks sidebar link, hits back button), and their unsaved content is lost. Unlike tasks and habits which are discrete form submissions, journal entries involve extended writing sessions.

**Why it happens:** The existing app uses form submit patterns (react-hook-form + explicit save buttons). Journal writing is different -- users expect continuous autosave like Google Docs or Notion. Without debounced autosave and navigation guards, content loss is inevitable.

**Consequences:** User loses writing. This is the single most frustrating UX failure in a journal app. Users will abandon the feature entirely.

**Prevention:**
1. Implement debounced autosave (2-3 second debounce after last keystroke) using Tiptap's onUpdate callback
2. Show a visible save status indicator ("Saving...", "Saved", "Unsaved changes")
3. Use beforeunload event to warn about unsaved changes on browser close/refresh
4. Use Next.js router events or a useEffect cleanup to save on component unmount
5. Store a draft in localStorage as a fallback (keyed by date), auto-recover on return
6. On initial load: check for localStorage draft newer than DB content, offer recovery

**Detection:** Manual test: type in journal, click sidebar nav to dashboard, come back -- if content is gone, this pitfall was not addressed.

**Sources:**
- [Tiptap discussion #5677: efficient saving to DB](https://github.com/ueberdosis/tiptap/discussions/5677)
- [Tiptap discussion #2871: save with delay](https://github.com/ueberdosis/tiptap/discussions/2871)

---

### Pitfall 4: Dashboard API Bloat from Adding Journal Data

**What goes wrong:** Adding journal entry data to the existing /api/dashboard endpoint. The dashboard already fetches habits, tasks, milestones, absence data, and recurring task instances in a single endpoint with 4+ parallel DB queries. Adding journal queries makes it slower and creates coupling between unrelated features.

**Why it happens:** The existing dashboard pattern aggregates everything in one API call. The temptation is to add journal_entry_today to the DashboardData type and add more queries to the already-complex route handler.

**Consequences:** Dashboard load time increases. A journal table schema change requires touching the dashboard route. The DashboardData type becomes a god object. Testing the dashboard route requires mocking journal DB classes too.

**Prevention:**
1. Create a separate `/api/journal/today` endpoint for the dashboard widget
2. Use a separate useSWR call in the dashboard for journal data -- SWR deduplicates and caches independently
3. The journal dashboard widget should be a self-contained component that fetches its own data
4. Keep DashboardData type unchanged -- the journal widget is additive, not integrated into the existing data structure
5. Follow the existing pattern: WeeklyInsightCard already uses a separate `/api/insights/weekly` SWR call alongside the main dashboard SWR call

**Detection:** If DashboardData type in lib/db/types.ts gains journal fields, or if app/api/dashboard/route.ts imports JournalDB, the coupling has happened.

---

### Pitfall 5: One-Entry-Per-Day Constraint Missing or Mishandled

**What goes wrong:** Users create multiple journal entries for the same date, leading to confusion about which is "today's entry." Calendar views show inconsistent counts. The dashboard widget does not know which entry to display.

**Why it happens:** Without a unique constraint on (user_id, entry_date), the API happily creates duplicates. The UI may use "create" when it should "upsert." Race conditions with autosave can create duplicates if two tabs are open.

**Consequences:** Duplicate entries, data confusion, broken calendar dots, dashboard widget showing wrong entry.

**Prevention:**
1. Add a UNIQUE constraint on (user_id, entry_date) in the migration
2. Use `INSERT ... ON CONFLICT (user_id, entry_date) DO UPDATE` (Supabase's .upsert()) for saves
3. The API should be `PUT /api/journal/:date` (idempotent) not `POST /api/journal` (creates new)
4. If allowing multiple entries per day is desired (not in current scope), design for it from the start with explicit entry IDs in the URL

**Detection:** Try opening the journal in two tabs, write in both, save both. If two rows appear in the DB, the constraint is missing.

## Moderate Pitfalls

### Pitfall 6: Mood Emoji Picker Accessibility Failures

**What goes wrong:** Mood selection uses emoji icons without aria labels, keyboard navigation, or screen reader support. The picker looks pretty but is inaccessible.

**Why it happens:** Emoji pickers are visually intuitive so developers skip accessibility. Custom emoji grids do not inherit button semantics. The app already uses vitest-axe for accessibility testing but only on existing components.

**Prevention:**
1. Use semantic `<button>` elements for each mood option, not `<span>` or `<div>`
2. Add aria-label to each mood button (e.g., `aria-label="Great mood"` not just the emoji character)
3. Implement `role="radiogroup"` with `role="radio"` for mood buttons since mood is single-select
4. Support keyboard navigation: arrow keys to move between options, Enter/Space to select
5. Translate mood labels via next-intl -- "Great" in English vs the Chinese equivalent
6. Add vitest-axe tests for the mood picker component
7. Use an accessible color for the selected state that works in both light and dark mode

**Detection:** Run axe on the mood picker component. If violations appear for missing labels or roles, this was not addressed.

**Sources:**
- [Building an accessible emoji picker (Nolan Lawson)](https://nolanlawson.com/2020/07/01/building-an-accessible-emoji-picker/)
- [React Aria emoji picker example](https://react-spectrum.adobe.com/beta/react-aria/examples/emoji-picker.html)

---

### Pitfall 7: i18n of Journal Prompts and Mood Labels vs User Content

**What goes wrong:** Confusing system-provided content (writing prompts, mood labels, UI strings) with user-generated content (journal text). System content needs translation via next-intl. User content must NOT be translated -- it should be stored and displayed as-is regardless of locale.

**Why it happens:** When prompts are stored in the DB or mixed with user text, locale switching can cause prompts to display in the wrong language. Or worse, someone tries to translate user journal content.

**Consequences:** Prompts appear in wrong language after locale switch. User content gets mangled. Mixed-language entries.

**Prevention:**
1. Writing prompts are i18n keys, not DB strings -- store the key (e.g., "prompts.gratitude.1") and resolve to translated text at render time
2. User journal content is stored as-is in the DB -- never pass through t() or any translation function
3. Mood values are stored as enum strings (e.g., "great", "good", "okay", "bad", "terrible") in the DB, displayed via `t("mood.great")` at render time
4. Add a "journal" top-level key to all three i18n message files (en.json, zh.json, zh-TW.json) -- do not nest under existing keys
5. Prompts should be defined in the i18n message files, not in the DB

**Detection:** Switch locale from English to Chinese, check if (a) prompts show in Chinese, (b) previously written English journal content is still in English. If prompts do not translate or content gets corrupted, this was not handled correctly.

---

### Pitfall 8: Calendar View Performance with Large Date Ranges

**What goes wrong:** The journal calendar loads ALL entries to render dots/indicators on dates with entries. For a user with 365+ days of entries, this means fetching hundreds of rows just to show which dates have dots.

**Why it happens:** The naive approach fetches full journal entries for a month to check existence. Tiptap JSON documents can be 1-50KB each. Fetching 30 full documents just to show dots is wasteful.

**Prevention:**
1. Create a dedicated lightweight API endpoint: `GET /api/journal/calendar?month=2026-02` that returns only `{ dates: ["2026-02-01", "2026-02-05", ...] }` -- no content, no mood, just date existence
2. Use a SQL query like `SELECT DISTINCT entry_date FROM journal_entries WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3`
3. Optionally include mood per date for color-coded calendar dots: `SELECT entry_date, mood FROM journal_entries WHERE ...`
4. Cache this in SWR with a month-based key (e.g., `/api/journal/calendar?month=2026-02`)
5. Only fetch the visible month plus adjacent months for smooth navigation

**Detection:** Profile the network tab when navigating months in the calendar. If full entry content is being transferred, the optimization is missing.

---

### Pitfall 9: Habit/Task Linking Creates Tight Coupling

**What goes wrong:** Journal entries link to habits and tasks via direct FK references (habit_id, task_id). When a habit or task is deleted, the journal entry's link becomes a dangling reference or the entry itself gets cascade-deleted.

**Why it happens:** The natural instinct is `REFERENCES habits(id)` or `REFERENCES tasks(id)`. But habits and tasks have their own lifecycle (archive, delete, complete) independent of journal entries. The journal is a reflective record -- it should preserve the user's writing even if the linked entity disappears.

**Consequences:** Cascade delete destroys journal entries when habits are deleted. Or ON DELETE SET NULL silently removes the association, but the user's text referencing "my morning run habit" still references something now invisible.

**Prevention:**
1. Use a junction/linking table: `journal_entry_links(id, entry_id, entity_type, entity_id, entity_name_snapshot)` -- polymorphic with a name snapshot
2. entity_type is 'habit' or 'task' and entity_id is the UUID
3. entity_name_snapshot stores the habit/task name at link time -- so even after deletion, the journal shows "Linked to: Morning Run (deleted)"
4. No FK constraint on entity_id -- this is a soft reference. Check existence at display time
5. Alternatively: store links as a JSONB array on the journal entry itself: `linked_items: [{ type: "habit", id: "...", name: "Morning Run" }]` -- simpler, no junction table, good enough for read-heavy display

**Detection:** Create a journal entry linked to a habit, delete the habit, view the journal entry. If the link info is gone with no trace, this was not handled.

---

### Pitfall 10: Tiptap Bundle Size Explosion

**What goes wrong:** Importing all Tiptap extensions (table, code block, image, task list, color, etc.) balloons the client bundle. Tiptap's core is approximately 30KB gzipped, but adding 10+ extensions can push it to 100KB+.

**Why it happens:** Journal editors seem to need "all the features." Developers add extensions preemptively. The existing app has a tight bundle (no rich text libraries at all), so this is a proportionally huge increase.

**Consequences:** Significant increase in initial page load for the journal page. TTI (Time to Interactive) degrades. The journal page loads noticeably slower than other pages.

**Prevention:**
1. Start with the minimal extension set: StarterKit (includes bold, italic, bullet list, ordered list, heading, blockquote, code, hard break, horizontal rule) -- this covers 90% of journal writing needs
2. Do NOT add: Table, TaskList, Image, Color, Highlight, CodeBlockLowlight unless explicitly required
3. Use next/dynamic with ssr: false to code-split the editor out of the main bundle
4. Measure: add the editor, run `pnpm analyze` (@next/bundle-analyzer is already installed), verify the journal page chunk stays under 80KB gzipped
5. If prompts need just bold/italic/lists, StarterKit alone is sufficient

**Detection:** Run `pnpm analyze` before and after adding Tiptap. If the journal page chunk exceeds 100KB gzipped, too many extensions were added.

## Minor Pitfalls

### Pitfall 11: SWR Key Collision Between Journal Endpoints

**What goes wrong:** Multiple journal-related SWR hooks use similar keys, causing cache collisions. For example, `/api/journal?date=2026-02-22` (full entry) and `/api/journal/calendar?month=2026-02` (date list) could interact unexpectedly if the SWR key structure is not carefully designed.

**Prevention:**
1. Use distinct API paths for distinct data shapes: `/api/journal/entries/:date`, `/api/journal/calendar`, `/api/journal/today`
2. Include the full URL path as the SWR key (the existing pattern uses the URL string directly)
3. Follow the existing dashboard pattern: separate SWR hooks for separate data (dashboard uses one hook for main data, another for weekly insights)

---

### Pitfall 12: Writing Prompts Becoming Stale or Repetitive

**What goes wrong:** A fixed set of 5-10 prompts feels repetitive within a week. Users skip the prompt feature entirely.

**Prevention:**
1. Organize prompts by category (gratitude, reflection, goals, achievements) in the i18n files
2. Rotate prompts daily using a deterministic seed (e.g., hash(user_id + date) % promptCount) so each day shows a different prompt but the same prompt on revisit
3. Allow dismissing/skipping the prompt without it blocking the entry
4. Start with 20-30 prompts per locale -- enough for a month without repeats

---

### Pitfall 13: Timezone Bug on Journal Date Assignment

**What goes wrong:** Journal entries created near midnight get assigned to the wrong date because the server uses UTC while the user is in a different timezone.

**Why it happens:** This is the exact same pitfall the app already solved for habits and tasks (see PROJECT.md: "getTodayTasks accepts client date param"). But it is easy to forget when building a new feature.

**Prevention:**
1. Follow the existing pattern exactly: the client sends date as a query/body parameter using getLocalDateString()
2. The entry_date column in the DB is DATE type (not TIMESTAMPTZ)
3. The API validates the date format with the same regex used in the dashboard route: `/^\d{4}-\d{2}-\d{2}$/`
4. Never derive the entry date from new Date() on the server

**Detection:** Set system clock to 11:55 PM, create an entry, verify it is assigned to today not tomorrow.

---

### Pitfall 14: Dark Mode Contrast Issues with Mood Colors

**What goes wrong:** Mood indicators use bright colors (green for great, red for terrible) that look fine in light mode but have poor contrast or look washed out in dark mode.

**Prevention:**
1. Define mood colors as CSS custom properties (matching the existing HSL token pattern in globals.css)
2. Provide light and dark variants: `--mood-great: 142 71% 45%` (light) vs `--mood-great: 142 71% 65%` (dark)
3. Test all 5 mood states in both themes
4. Use the existing semantic color token pattern -- do not hardcode hex/rgb values

---

### Pitfall 15: Migration Breaks Existing RLS Policies

**What goes wrong:** The new journal_entries table is created without RLS policies, or the RLS policies are inconsistent with the existing pattern, exposing journal data cross-user.

**Prevention:**
1. Follow the exact RLS pattern from the categories migration (the most recent migration): ENABLE ROW LEVEL SECURITY + four policies (SELECT, INSERT, UPDATE, DELETE) all using `auth.uid() = user_id`
2. Add `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` as the first column after id
3. Create index on user_id: `CREATE INDEX idx_journal_entries_user ON journal_entries(user_id)`
4. Test with Supabase's RLS testing: try querying without auth, verify 0 rows returned

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| DB schema / migration | Pitfall 5 (missing unique constraint), Pitfall 15 (RLS), Pitfall 9 (FK coupling) | Add unique constraint, copy RLS pattern from categories, use soft references for links |
| Rich text editor integration | Pitfall 1 (SSR hydration), Pitfall 10 (bundle size), Pitfall 3 (data loss) | next/dynamic + ssr: false, minimal extensions, debounced autosave |
| Content storage | Pitfall 2 (HTML storage lock-in) | JSONB column for Tiptap JSON, separate plain_text/preview column |
| Mood tracking | Pitfall 6 (accessibility), Pitfall 14 (dark mode), Pitfall 7 (i18n) | radiogroup pattern, CSS tokens, enum DB values with translated labels |
| Calendar view | Pitfall 8 (performance), Pitfall 13 (timezone) | Lightweight calendar endpoint, client-sent date |
| Dashboard widget | Pitfall 4 (API bloat), Pitfall 11 (SWR collision) | Separate endpoint, self-contained widget component |
| Writing prompts | Pitfall 7 (i18n confusion), Pitfall 12 (staleness) | Prompts as i18n keys, 20+ per locale, deterministic rotation |
| Habit/task linking | Pitfall 9 (FK coupling) | Soft references with name snapshots, no cascade behavior |

## Sources

- [Tiptap Next.js installation guide](https://tiptap.dev/docs/editor/getting-started/install/nextjs) -- SSR guidance
- [Tiptap persistence docs](https://tiptap.dev/docs/editor/core-concepts/persistence) -- storage format recommendations
- [Tiptap GitHub issue #5856](https://github.com/ueberdosis/tiptap/issues/5856) -- SSR bug in Next.js 15+
- [Tiptap GitHub discussion #964](https://github.com/ueberdosis/tiptap/discussions/964) -- DB storage best practices
- [Tiptap GitHub discussion #5677](https://github.com/ueberdosis/tiptap/discussions/5677) -- autosave patterns
- [Supabase JSON/JSONB documentation](https://supabase.com/docs/guides/database/json) -- JSONB column guidance
- [Building an accessible emoji picker (Nolan Lawson)](https://nolanlawson.com/2020/07/01/building-an-accessible-emoji-picker/) -- a11y patterns
- [React Aria emoji picker example](https://react-spectrum.adobe.com/beta/react-aria/examples/emoji-picker.html) -- keyboard nav reference
- [next-intl rich text translation docs](https://next-intl.dev/docs/usage/translations) -- t.rich() usage
- [Liveblocks: which rich text editor framework in 2025](https://liveblocks.io/blog/which-rich-text-editor-framework-should-you-choose-in-2025) -- editor comparison
- Existing codebase patterns: dashboard-content.tsx (SWR + dynamic imports), categories migration (RLS pattern), getLocalDateString() (timezone handling)
