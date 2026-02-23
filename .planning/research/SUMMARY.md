# Project Research Summary

**Project:** BetterR.Me — v4.0 Journal Feature
**Domain:** Reflective journaling with mood tracking integrated into an existing habit tracking & task management app
**Researched:** 2026-02-22
**Confidence:** HIGH

## Executive Summary

BetterR.Me's v4.0 Journal feature adds a daily reflection layer to an existing Next.js 16 / Supabase / shadcn/ui application. The research consensus is clear: a one-entry-per-day model with a 5-point mood selector, writing prompts, and optional habit/task linking is the right scope. This mirrors the Daylio + Finch pattern (fast daily check-in) while adding BetterR.Me's unique cross-feature linking advantage. The app already contains nearly everything needed — the only new libraries are Tiptap 3 for rich text editing and Frimousse for the emoji/mood picker.

The recommended approach is to build in strict dependency order: database schema and DB class first, then API routes, then SWR hooks, then UI components, and finally integration into the sidebar and dashboard. Every layer of this stack already has a verified pattern from existing features (habits, tasks, categories). The architecture is additive — no existing feature needs structural changes beyond modest modifications to the dashboard API and sidebar navigation. The `journal_entries` table, `JournalEntriesDB` class, and API routes can be built entirely by following the existing `tasks`/`habits` patterns.

The three critical risks are: (1) Tiptap SSR hydration mismatches in Next.js App Router — prevented by `next/dynamic` with `ssr: false` and `immediatelyRender: false`; (2) content data loss from missing autosave — prevented by debounced autosave with localStorage fallback; and (3) bloating the dashboard API with journal data — prevented by keeping the journal widget self-contained with its own SWR endpoint. There is one notable tension between the STACK and ARCHITECTURE research files: STACK.md recommends Tiptap with JSONB storage while ARCHITECTURE.md initially specifies a plain `TEXT` body. The resolution is clear and opinionated: use Tiptap with JSONB per STACK.md, as the structured JSON enables future search and migration capabilities that raw HTML or plain text cannot.

## Key Findings

### Recommended Stack

The existing stack is nearly complete for this feature. Only two new library groups are needed: Tiptap 3 (rich text editor) and Frimousse (emoji picker). Both are headless and unstyled, fitting cleanly into the Tailwind CSS + shadcn/ui design system. All calendar, form, data fetching, i18n, toast, and icon needs are met by already-installed packages.

**New libraries to add:**
- `@tiptap/react` + `@tiptap/pm` + `@tiptap/starter-kit` + `@tiptap/extension-placeholder` + `@tiptap/extension-character-count` (^3.20.0): Headless WYSIWYG editor — outputs structured JSON for Supabase JSONB storage, React 19 compatible, SSR-safe with `immediatelyRender: false`
- `frimousse` (^0.3.0): 12kB dependency-free emoji picker — official shadcn/ui CLI recipe, zero styling opinions, React 18/19 compatible

**Existing technologies covering remaining needs:**
- `react-day-picker` (already installed via shadcn/ui `Calendar`): Calendar view with custom modifiers for entry dot indicators
- `react-hook-form` + `zod`: Wrapping form fields (not the Tiptap body itself)
- `SWR`: Journal data fetching with the established date-keyed cache pattern
- `lucide-react`, `date-fns`, `sonner`, `next-intl`, `next-themes`, `shadcn/ui` components: No changes needed

**Version note:** Tiptap v3.20.0 explicitly declares React `^19.0.0` as a peer dependency. No `peerDependencyRules` overrides needed.

See `.planning/research/STACK.md` for full rationale and installation commands.

### Expected Features

The feature set divides cleanly into a core MVP (table stakes) and a set of differentiators that leverage the existing habit/task ecosystem.

**Must have (table stakes):**
- Daily journal entry with rich text area (Tiptap) — fundamental journal action
- One entry per day model with upsert semantics — simplifies calendar, dashboard, and mental model
- Mood selection (5-point emoji/icon scale) — Daylio/Finch standard, primary reason users combine journaling with habit tracking
- Create, read, update, delete for entries — universal expectation
- Journal page with calendar view (entry dot indicators) and timeline feed — navigation pattern from every major journal app
- Click calendar day to view or create entry — primary navigation UX
- Sidebar navigation item (4th item, BookOpen icon) — required discoverability
- Full i18n coverage (en, zh, zh-TW) — project constraint, not optional
- Dark mode compliance — inherited free via existing design tokens

**Should have (differentiators):**
- Writing prompts (gratitude, reflection, goals categories; 15-20 prompts; all 3 locales) — reduces blank-page anxiety; static library (no AI)
- Dashboard quick-entry widget — surfaces journal from the app's main entry point, reduces friction to zero
- Optional habit/task linking — unique BetterR.Me differentiator, no competitor offers cross-feature linking
- "On This Day" past reflections card — Day One's signature feature, simple to implement, high emotional value
- Journal streak counter — reuses existing streak calculation pattern from habits

**Defer to v2+:**
- Mood correlation analytics ("you feel better on days you exercise") — requires cross-feature data analysis and charting
- Full-text search across entries — requires pg_trgm or tsvector indexing
- Photo/media attachments — separate storage infrastructure project
- AI-generated prompts or entry analysis — privacy concerns and API costs
- Push notification reminders — no notification infrastructure exists
- Rich-text-to-markdown export — not needed while Tiptap handles display

See `.planning/research/FEATURES.md` for competitor analysis and mood picker UX research.

### Architecture Approach

The architecture is entirely additive and modeled on existing patterns. New files live in `components/journal/`, `app/journal/`, `app/api/journal/`, `lib/db/journal-entries.ts`, `lib/hooks/use-journal.ts`, `lib/validations/journal.ts`, and `lib/journal/` (static prompt and mood definitions). Modified files are minimal: sidebar nav, dashboard API (one HEAD-only query added to `Promise.all`), dashboard content component, and three i18n locale files.

**Major components:**
1. `JournalEntriesDB` (`lib/db/journal-entries.ts`) — Supabase CRUD, upsert-by-date, calendar aggregation, dashboard existence check; mirrors `TasksDB`/`HabitsDB` constructor pattern
2. API routes (`/api/journal`, `/api/journal/[id]`, `/api/journal/calendar`) — REST endpoints following existing task/habit API structure; the calendar endpoint is a separate lightweight route returning only `{entry_date, mood}[]` to avoid transferring full content for dot rendering
3. `JournalEntryForm` (`components/journal/journal-entry-form.tsx`) — shared create/edit form with Tiptap editor, mood selector, prompt selector, and optional link selector; editor loaded via `next/dynamic` with `ssr: false`
4. Journal page (`app/journal/page.tsx`) — calendar + timeline side-by-side layout; mirrors `app/habits/` route structure
5. Dashboard widget (`components/journal/journal-widget.tsx`) — self-contained component with its own SWR hook targeting a separate journal endpoint; does NOT add journal fields to `DashboardData`

**Key patterns:**
- Upsert over insert — `INSERT ... ON CONFLICT (user_id, entry_date) DO UPDATE` enforces one-entry-per-day at the DB level
- Lightweight calendar endpoint — fetches `entry_date` + `mood` only, max 31 rows per month
- SWR date-keyed cache — matches existing dashboard and sidebar-counts patterns
- Static prompt/mood definitions — TypeScript constants, resolved via next-intl at render time; never stored as user content

**Database schema (two new tables):**
- `journal_entries`: `id`, `user_id`, `entry_date DATE`, `content JSONB`, `mood TEXT`, `prompt_key TEXT`, `created_at`, `updated_at` + UNIQUE(user_id, entry_date) + RLS
- `journal_entry_links`: `id`, `journal_entry_id`, `link_type TEXT CHECK ('habit','task')`, `link_id UUID` (soft reference, no FK) + RLS via parent join

**Resolution of STACK vs ARCHITECTURE tension:** ARCHITECTURE.md specifies `body TEXT` while STACK.md recommends Tiptap with `content JSONB`. Use JSONB per STACK.md. The structured JSON format enables future search, analytics, and editor migration without schema changes. The `body TEXT` column in the ARCHITECTURE.md schema should be treated as superseded.

See `.planning/research/ARCHITECTURE.md` for full schema SQL, TypeScript types, and data flow diagrams.

### Critical Pitfalls

1. **Tiptap SSR hydration mismatch** — Use `next/dynamic({ ssr: false })` for the editor component and set `immediatelyRender: false` in `useEditor()`. Both steps are required. This pattern already exists in the codebase for the kanban board (`dashboard-content.tsx`). Skipping either step crashes the journal page on first load.

2. **Content data loss from missing autosave** — Journal writing sessions are long-form; users expect autosave like Notion. Implement debounced autosave (2-3 second debounce on Tiptap's `onUpdate`), a visible save status indicator ("Saving..." / "Saved"), and a localStorage draft fallback keyed by date. Without this, users lose writing on navigation and abandon the feature.

3. **HTML storage lock-in** — Store Tiptap's native JSON via `editor.getJSON()` in a `JSONB` column, not `editor.getHTML()` in a TEXT column. HTML storage creates XSS risk, complicates search, and tightly couples the schema to Tiptap's HTML output format. If you find yourself importing DOMPurify, the wrong storage format was chosen.

4. **Dashboard API bloat** — The journal dashboard widget must be self-contained with its own SWR hook and its own lightweight endpoint. Do not add `journal_today` to `DashboardData` in `lib/db/types.ts` or import `JournalEntriesDB` into `app/api/dashboard/route.ts`. The existing `WeeklyInsightCard` pattern (separate SWR call alongside main dashboard) is the correct model.

5. **Missing unique constraint or incorrect upsert** — The DB migration must include `UNIQUE(user_id, entry_date)`. All saves must use Supabase `.upsert()` with `onConflict: "user_id,entry_date"`. Without this, two tabs open simultaneously create duplicate rows that break calendar dots, the dashboard widget, and the one-entry-per-day mental model.

See `.planning/research/PITFALLS.md` for the full list of 15 pitfalls with detection and prevention guidance.

## Implications for Roadmap

Based on research, the dependency graph is strict and well-understood. Every phase depends cleanly on the prior phase with no cycles. The architecture research provides a 7-phase build order that should be followed.

### Phase 1: Database Foundation

**Rationale:** Every other component — API routes, UI, dashboard widget — depends on the database schema and DB class. Getting the schema right (JSONB content column, unique constraint, RLS policies, soft link references) prevents rewrites later. Mistakes at this layer are the most expensive to fix.

**Delivers:** Supabase migration file, `JournalEntriesDB` class with full CRUD + upsert + calendar query, TypeScript types (`JournalEntry`, `JournalEntryLink`, `JournalCalendarDay`, `MoodKey`), Zod validation schemas (`lib/validations/journal.ts`), static mood definitions (`lib/journal/moods.ts`), static prompt definitions (`lib/journal/prompts.ts`)

**Addresses features:** One-entry-per-day model, mood tracking foundation, habit/task linking foundation

**Avoids pitfalls:** Pitfall 5 (missing unique constraint), Pitfall 15 (RLS missing), Pitfall 9 (FK coupling on links — use soft references from day one), Pitfall 2 (content storage format — JSONB column, not TEXT)

**Research flag:** Standard patterns. Follows existing migration + DB class patterns exactly (copy RLS from categories migration, follow `TasksDB` constructor). No deep research phase needed.

### Phase 2: API Routes

**Rationale:** UI components cannot be built without endpoints to fetch from and submit to. The three API routes (list/create, single entry CRUD, calendar aggregation) are independent of each other and can be built in parallel once Phase 1 completes.

**Delivers:** `GET/POST /api/journal`, `GET/PATCH/DELETE /api/journal/[id]`, `GET /api/journal/calendar?month=YYYY-MM` (lightweight — returns `{entry_date, mood}[]` only)

**Addresses features:** All CRUD table stakes, calendar performance

**Avoids pitfalls:** Pitfall 8 (calendar performance — dedicated lightweight endpoint from the start), Pitfall 13 (timezone — client-sent date param validated with existing regex), Pitfall 11 (SWR key collisions — distinct API paths for distinct data shapes)

**Research flag:** Standard patterns. Mirrors existing `/api/tasks/` and `/api/habits/` routes exactly. No deep research needed.

### Phase 3: SWR Hooks

**Rationale:** Thin layer between API and UI. Must exist before UI components can be built. Building hooks before components keeps components focused on rendering rather than data wiring.

**Delivers:** `lib/hooks/use-journal.ts` with `useJournalEntry(date)`, `useJournalCalendar(yearMonth)`, `useJournalTimeline()` hooks

**Addresses features:** Date-keyed cache for midnight refresh, timeline pagination setup with `keepPreviousData: true`

**Avoids pitfalls:** Pitfall 11 (SWR key collisions), Pitfall 13 (timezone — `getLocalDateString()` in SWR keys)

**Research flag:** Standard patterns. Follows `use-habits.ts` and `use-sidebar-counts.ts` patterns.

### Phase 4: Core UI Components

**Rationale:** Reusable building blocks must exist before pages can compose them. The mood selector, prompt selector, Tiptap editor, and entry form are shared between the journal page and dashboard widget — building them as standalone components prevents duplication.

**Delivers:** `MoodSelector`, `PromptSelector`, `JournalEditor` (Tiptap, loaded via `next/dynamic({ ssr: false })`), `JournalEntryForm` (shared create/edit), `JournalEntryCard` (timeline card)

**Uses stack:** Tiptap 3 (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`, `@tiptap/extension-character-count`), Frimousse if using emoji picker, existing shadcn/ui Popover + Button + Textarea components

**Implements:** `MoodSelector` as `role="radiogroup"` with 5 `role="radio"` buttons (not `<div>` or `<span>`), Tiptap with debounced autosave + localStorage draft fallback, `JournalEditor` wrapped in `next/dynamic` with loading skeleton

**Avoids pitfalls:** Pitfall 1 (SSR hydration — `next/dynamic ssr: false` + `immediatelyRender: false`), Pitfall 3 (data loss — debounced autosave in editor component), Pitfall 6 (mood picker accessibility — radiogroup pattern, aria-labels, keyboard nav), Pitfall 10 (bundle size — StarterKit only, no extra extensions)

**Research flag:** Moderate care needed. Tiptap integration with Next.js App Router has known SSR gotchas — the fix is documented and verified, but must be applied correctly from the start. Review PITFALLS.md Pitfall 1 and Pitfall 3 before implementation. Run `pnpm analyze` after adding Tiptap to verify bundle size.

### Phase 5: Journal Page and Sidebar Navigation

**Rationale:** The full journal browsing experience — calendar view, timeline feed, entry create/edit/view pages — is the core user-facing surface. Sidebar nav provides discoverability. This phase is buildable once Phase 4 components exist.

**Delivers:** `app/journal/` routes (layout, page, new/page, [id]/page, [id]/edit/page, loading skeleton), `JournalCalendar` (react-day-picker with custom modifiers for mood-colored dots), `JournalTimeline` (reverse chronological, paginated), sidebar nav item (BookOpen icon, `/journal` route)

**Implements:** Two-panel calendar + timeline layout (stacked on mobile), react-day-picker `modifiers` + `modifiersClassNames` for entry dot indicators, route structure mirroring `app/habits/`

**Avoids pitfalls:** Pitfall 8 (calendar uses lightweight `useJournalCalendar` hook from Phase 3), Pitfall 14 (dark mode mood colors as CSS custom properties, not hardcoded hex)

**Research flag:** Standard patterns. Calendar modifiers are well-documented in react-day-picker. Route structure mirrors habits exactly. No deep research needed.

### Phase 6: Dashboard Integration

**Rationale:** The dashboard widget is the lowest-friction entry point for journaling. Positioning it here — after the core journal feature is complete — means the widget can reuse Phase 4 components and Phase 2 API routes without circular dependencies.

**Delivers:** `JournalWidget` dashboard component, dedicated self-contained SWR hook for today's entry status (targeting `/api/journal?date=YYYY-MM-DD` or a dedicated `/api/journal/today`), modifications to `dashboard-content.tsx` and `app/dashboard/page.tsx`

**Implements:** Widget pattern matching `WeeklyInsightCard` — separate SWR call alongside main dashboard SWR, no modification to `DashboardData` type, shows quick mood selector + "Write more..." link when no entry exists, shows "View today's entry" link when entry exists

**Avoids pitfalls:** Pitfall 4 (dashboard API bloat — separate endpoint, `DashboardData` type unchanged, no `JournalEntriesDB` import in dashboard route)

**Research flag:** Standard patterns. The `WeeklyInsightCard` component in the codebase provides the exact pattern to follow.

### Phase 7: i18n and Polish

**Rationale:** Final pass to ensure all three locale files are complete, all journal strings are translated, writing prompts exist in all locales, and mood labels are translated. Also includes dark mode verification across all journal components and accessibility audit.

**Delivers:** Complete `journal` namespace in `en.json`, `zh.json`, `zh-TW.json` (approx. 50-80 string keys + 20+ prompts per locale across 3 categories), verified dark mode across all journal components, vitest-axe tests for `MoodSelector` and `JournalEntryForm`

**Avoids pitfalls:** Pitfall 7 (i18n of prompts vs user content — prompts stored as i18n keys, user journal text never passed through `t()`), Pitfall 14 (dark mode mood colors)

**Research flag:** Standard patterns. Follows existing next-intl namespace pattern. Mechanical work; no research needed.

### Phase 8: Differentiators (Conditional)

**Rationale:** Ship if time allows after Phase 7. These are high-value but independent of each other and of the core feature. Each can be built incrementally without blocking the others.

**Delivers:**
- Habit/task linking UI (`LinkSelector` component in entry form, `journal_entry_links` sync in API routes)
- "On This Day" dashboard card (date-range query: today minus 30 days and today minus 365 days)
- Journal streak counter (reuse existing streak calculation pattern from habits)
- Simple mood distribution chart for current month (count per mood level, bar or pixel grid)

**Avoids pitfalls:** Pitfall 9 (habit/task linking — soft references with entity name snapshot at link time so deleted items show as "Morning Run (deleted)" rather than a broken link)

**Research flag:** Habit/task linking needs a deliberate UX decision about orphaned link display before implementation. Everything else is straightforward.

### Phase Ordering Rationale

- **Data before API before UI** — Every phase depends strictly on prior phases. This is required by the dependency graph, not just a stylistic preference.
- **Journal page before dashboard widget** — The widget reuses Phase 4 components and Phase 2 API. Building the widget first would require building those in isolation and then refactoring.
- **i18n as final pass** — Keys should be added incrementally during each phase (using placeholder strings), with a final completeness audit in Phase 7. This avoids blocking UI work on translation completeness.
- **Differentiators last and conditional** — Core value is delivered in Phases 1-6. Differentiators add depth but are not required for a functional, polished journal feature.

### Research Flags

Phases needing careful attention during implementation (review relevant PITFALLS.md sections before starting, not full research sprints):

- **Phase 4 (Core UI):** Tiptap SSR integration and autosave implementation have documented gotchas. The fix is known and verified, but must be applied correctly from the start. Review Pitfalls 1, 3, and 10 before writing `JournalEditor`.
- **Phase 8 (Habit/task linking):** Soft reference display logic for orphaned links (after entity deletion) needs a deliberate UX decision before writing code.

Phases with fully standard patterns (no additional research needed):

- **Phase 1 (Database):** Copy RLS pattern from categories migration, follow `TasksDB` constructor pattern exactly.
- **Phase 2 (API):** Mirror `/api/tasks/` structure exactly.
- **Phase 3 (SWR hooks):** Mirror `use-habits.ts` exactly.
- **Phase 5 (Journal page):** Mirror `app/habits/` route structure; react-day-picker modifiers are documented.
- **Phase 6 (Dashboard widget):** Mirror the `WeeklyInsightCard` component pattern.
- **Phase 7 (i18n):** Mechanical translation work following existing locale file structure.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Tiptap v3.20.0 React 19 peer deps verified on npm. Frimousse shadcn/ui integration confirmed at official site. All existing stack elements verified against running codebase. No peer dependency conflicts. |
| Features | MEDIUM-HIGH | Feature set validated against Daylio, Finch, Day One, and Balance Journal. Mood UX grounded in ECMES academic scale research. Writing prompt content quality depends on native speaker review for zh/zh-TW (flagged as gap). |
| Architecture | HIGH | Based on direct codebase analysis of existing patterns (habits, tasks, categories, dashboard). All patterns verified from source files. Schema SQL is production-ready with RLS. |
| Pitfalls | HIGH | 15 pitfalls documented with verified prevention strategies. Tiptap SSR and autosave pitfalls confirmed against official docs and GitHub issues. Dashboard API pitfall grounded in codebase analysis. |

**Overall confidence:** HIGH

### Gaps to Address

- **STACK vs ARCHITECTURE storage format conflict:** STACK.md recommends Tiptap + JSONB; ARCHITECTURE.md specifies `body TEXT`. Resolution chosen: use JSONB per STACK.md. The architecture DB schema must be updated before migration is written — `body TEXT NOT NULL DEFAULT ''` becomes `content JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb`.

- **Autosave debounce timing:** Research recommends 2-3 seconds but optimal timing for this user base is unvalidated. Start with 2 seconds (matches Notion's pattern) and adjust based on user feedback.

- **Writing prompt quality in zh and zh-TW:** The 20+ prompts per locale need review by a native Chinese speaker. The i18n key structure will be in place; prompt text can be revised without code changes post-launch.

- **Dashboard widget grid position:** The exact placement of the journal widget within the dashboard card grid requires visual design judgment that research cannot determine. Defer this layout decision to Phase 6 implementation.

- **Mood color token values:** Specific HSL values for 5 mood states in both light and dark mode are not defined in research. These need to be established during Phase 4 using the existing CSS custom property pattern in `globals.css`.

## Sources

### Primary (HIGH confidence — official docs and direct codebase analysis)

- `lib/db/tasks.ts`, `lib/db/habits.ts`, `lib/db/categories.ts` — DB class constructor-injected Supabase pattern
- `app/api/tasks/route.ts`, `app/api/dashboard/route.ts` — API route pattern with auth + validation
- `lib/hooks/use-habits.ts`, `lib/hooks/use-sidebar-counts.ts` — SWR hook pattern with date keys
- `components/layouts/app-sidebar.tsx` — Sidebar nav item addition pattern
- `components/dashboard/dashboard-content.tsx` — Dashboard component + `next/dynamic` import pattern
- `components/ui/calendar.tsx` — react-day-picker wrapper with custom modifiers
- `supabase/migrations/20260222000001_create_categories_table.sql` — RLS policy migration pattern
- [Tiptap Next.js Installation Guide](https://tiptap.dev/docs/editor/getting-started/install/nextjs) — SSR pattern, `immediatelyRender: false`
- [Tiptap Persistence Docs](https://tiptap.dev/docs/editor/core-concepts/persistence) — JSONB recommended over HTML
- [Tiptap GitHub issue #5856](https://github.com/ueberdosis/tiptap/issues/5856) — SSR hydration bug confirmed for Next.js 15+
- [Frimousse official site](https://frimousse.liveblocks.io) — shadcn/ui CLI integration, 12kB bundle
- [@tiptap/react on npm](https://www.npmjs.com/package/@tiptap/react) — v3.20.0 React 19 peer deps verified
- [frimousse on npm](https://www.npmjs.com/package/frimousse) — v0.3.0 React 18/19 peer deps verified

### Secondary (MEDIUM confidence — community consensus and competitor analysis)

- [Daylio Official Site](https://daylio.net/) — one-entry-per-day model, 5-point mood scale, activity linking UX
- [Finch: Self-Care App Review](https://webisoft.com/articles/finch-self-care-app/) — guided prompt categories, journaling UX
- [Day One Features](https://dayoneapp.com/features/) — timeline view, "On This Day" feature
- [Tiptap GitHub discussion #5677](https://github.com/ueberdosis/tiptap/discussions/5677) — autosave debounce patterns
- [Tiptap GitHub discussion #964](https://github.com/ueberdosis/tiptap/discussions/964) — DB storage best practices
- [ECMES Emoji Mood Scale](https://www.tandfonline.com/doi/full/10.1080/09638237.2022.2069694) — academic basis for 5-point scale
- [Building an accessible emoji picker (Nolan Lawson)](https://nolanlawson.com/2020/07/01/building-an-accessible-emoji-picker/) — aria-label and keyboard nav patterns
- [shadcn/ui Calendar docs](https://ui.shadcn.com/docs/components/radix/calendar) — custom modifiers API
- [react-day-picker Custom Modifiers](https://daypicker.dev/guides/custom-modifiers) — highlighted dates API

### Tertiary (MEDIUM-LOW confidence — content and UX pattern sites)

- [QuillBot: 75+ Journal Prompts](https://quillbot.com/blog/creative-writing/journal-prompts/) — prompt library inspiration
- [Calm Blog: Gratitude Journal Prompts](https://www.calm.com/blog/gratitude-journal-prompts) — gratitude prompt examples
- [Eleken: Calendar UI Examples](https://www.eleken.co/blog-posts/calendar-ui) — calendar UX patterns
- [Zapier: Best Journal Apps](https://zapier.com/blog/best-journaling-apps/) — competitor landscape

---
*Research completed: 2026-02-22*
*Ready for roadmap: yes*
