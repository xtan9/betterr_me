# Roadmap: BetterR.Me

## Milestones

- ✅ **v1.0 Codebase Hardening** — Phases 1-5 (shipped 2026-02-16)
- ✅ **v1.1 Dashboard Task Fixes** — Phase 6 (shipped 2026-02-17)
- ✅ **v2.0 UI Style Redesign** — Phases 1-9 (shipped 2026-02-17)
- ✅ **v2.1 UI Polish & Refinement** — Phases 10-12 (shipped 2026-02-18)
- ✅ **v3.0 Projects & Kanban** — Phases 13-17 (shipped 2026-02-21)
- 📋 **v4.0 Journal** — Phases 20-25 (planned)

## Phases

<details>
<summary>✅ v1.0 Codebase Hardening (Phases 1-5) — SHIPPED 2026-02-16</summary>

5 phases, 11 plans, 26 requirements. See `.planning/milestones/v1.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v1.1 Dashboard Task Fixes (Phase 6) — SHIPPED 2026-02-17</summary>

1 phase, 1 plan, 3 requirements. See `.planning/milestones/v1.1-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v2.0 UI Style Redesign (Phases 1-9) — SHIPPED 2026-02-17</summary>

9 phases, 21 plans, 28 requirements. See `.planning/milestones/v2.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v2.1 UI Polish & Refinement (Phases 10-12) — SHIPPED 2026-02-18</summary>

3 phases, 6 plans, 8 requirements. See `.planning/milestones/v2.1-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v3.0 Projects & Kanban (Phases 13-17) — SHIPPED 2026-02-21</summary>

5 phases, 12 plans, 17 requirements. See `.planning/milestones/v3.0-ROADMAP.md` for details.

</details>

### v4.0 Journal (In Progress)

**Milestone Goal:** Add a reflective journaling layer with free-form + prompted daily entries, mood tracking, optional habit/task links, and calendar + timeline browsing.

- [x] **Phase 20: Database & API Foundation** - Schema, DB class, API routes, SWR hooks for journal entries (completed 2026-02-23)
- [x] **Phase 21: Journal Entry CRUD** - Tiptap editor, mood selector, create/edit/delete entry flows (completed 2026-02-23)
- [x] **Phase 22: Writing Prompts** - Prompt library with categories and free-form fallback (completed 2026-02-23)
- [ ] **Phase 23: Journal Page & Navigation** - Calendar view, timeline feed, sidebar nav entry
- [ ] **Phase 24: Dashboard & Cross-Feature Integration** - Quick-entry widget, habit/task linking, On This Day, streak
- [ ] **Phase 25: i18n & Polish** - Full translation coverage and dark mode verification

## Phase Details

### Phase 20: Database & API Foundation
**Goal**: Journal data layer exists end-to-end -- schema enforces one-entry-per-day, API routes handle all CRUD, and SWR hooks provide client-side data access
**Depends on**: Nothing (first phase of v4.0)
**Requirements**: ENTR-05
**Success Criteria** (what must be TRUE):
  1. Database migration creates `journal_entries` and `journal_entry_links` tables with RLS policies and UNIQUE(user_id, entry_date) constraint
  2. API routes at `/api/journal`, `/api/journal/[id]`, and `/api/journal/calendar` accept requests and return correct JSON responses
  3. Creating a second entry for the same date upserts (updates) instead of creating a duplicate
  4. SWR hooks (`useJournalEntry`, `useJournalCalendar`, `useJournalTimeline`) fetch and cache journal data with date-keyed cache keys
**Plans**: 2 plans

Plans:
- [ ] 20-01-PLAN.md — Schema, types, DB classes, validation schemas, preview utility
- [ ] 20-02-PLAN.md — API routes, SWR hooks, and comprehensive unit tests

### Phase 21: Journal Entry CRUD
**Goal**: Users can write, edit, and delete rich-text journal entries with mood tracking through a complete entry form
**Depends on**: Phase 20
**Requirements**: ENTR-01, ENTR-02, ENTR-03, ENTR-04
**Success Criteria** (what must be TRUE):
  1. User can create a journal entry with a Tiptap rich-text editor (bold, italic, lists, headings) and the content persists across page reloads
  2. User can select one of 5 mood emojis for an entry, and the mood selection is saved and displayed when revisiting the entry
  3. User can edit an existing entry (both content and mood) and see the updated version immediately
  4. User can delete a journal entry and it no longer appears anywhere in the app
  5. Editor autosaves with a visible "Saving..."/"Saved" indicator, preventing data loss on navigation
**Plans**: 2 plans

Plans:
- [ ] 21-01-PLAN.md — Install Tiptap 3, create editor with bubble menu, mood selector, save status, autosave hook, CSS styles, i18n strings
- [ ] 21-02-PLAN.md — Journal entry modal, delete dialog, page route, and unit tests

### Phase 22: Writing Prompts
**Goal**: Users have optional writing prompts to reduce blank-page anxiety, organized by category, with the freedom to skip and write free-form
**Depends on**: Phase 21
**Requirements**: PRMT-01, PRMT-02
**Success Criteria** (what must be TRUE):
  1. User can browse and select from a library of writing prompts organized into gratitude, reflection, and goals categories
  2. User can start writing without selecting a prompt (free-form is the default state)
  3. Selected prompt text appears in or above the editor area to guide writing, and the prompt key is saved with the entry
**Plans**: 2 plans

Plans:
- [ ] 22-01-PLAN.md — Prompt data structure, i18n strings, Tiptap Placeholder extension + CSS
- [ ] 22-02-PLAN.md — Prompt browser sheet, prompt banner, modal integration, and unit tests

### Phase 23: Journal Page & Navigation
**Goal**: Users can browse their journal history through a calendar and timeline, and access the journal from the sidebar
**Depends on**: Phase 21
**Requirements**: BRWS-01, BRWS-02, BRWS-03, BRWS-04
**Success Criteria** (what must be TRUE):
  1. Journal page shows a calendar where days with entries display colored dot indicators (mood-colored)
  2. Clicking a calendar day with an entry navigates to view that entry; clicking a day without an entry opens the create form for that date
  3. Timeline feed displays past entries in reverse chronological order with mood, date, and content preview
  4. Sidebar contains a "Journal" navigation item (BookOpen icon) that links to `/journal` with proper active-state highlighting
**Plans**: 2 plans

Plans:
- [ ] 23-01-PLAN.md — Calendar + timeline UI components, sidebar nav item, i18n strings
- [ ] 23-02-PLAN.md — Page integration (Tabs, modal wiring, data refresh) + unit tests

### Phase 24: Dashboard & Cross-Feature Integration
**Goal**: Journal is woven into the daily workflow through a dashboard widget, habit/task linking, historical reflections, and streak tracking
**Depends on**: Phase 23
**Requirements**: INTG-01, INTG-02, INTG-03, INTG-04
**Success Criteria** (what must be TRUE):
  1. Dashboard displays a journal widget that shows quick mood selector and "Write more..." link when no entry exists for today, or a summary with "View entry" link when one does
  2. User can optionally link a journal entry to specific habits or tasks, and those links display as tags on the entry
  3. User can see "On This Day" past reflections showing entries from the same calendar date in previous periods (30 days ago, 1 year ago)
  4. Journal streak counter displays the number of consecutive days with journal entries
**Plans**: TBD

Plans:
- [ ] 24-01: TBD
- [ ] 24-02: TBD

### Phase 25: i18n & Polish
**Goal**: All journal UI and prompts are fully translated in three locales, dark mode renders correctly across all journal components
**Depends on**: Phase 24
**Requirements**: I18N-01, I18N-02
**Success Criteria** (what must be TRUE):
  1. All journal UI strings (labels, buttons, placeholders, toasts, empty states) exist in en.json, zh.json, and zh-TW.json with no missing keys
  2. Writing prompts are available in all three locales with culturally appropriate translations
  3. All journal components render correctly in dark mode with no hardcoded colors or broken contrast
**Plans**: TBD

Plans:
- [ ] 25-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 20 -> 21 -> 22 -> 23 -> 24 -> 25

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Frequency Correctness | v1.0 | 3/3 | Complete | 2026-02-15 |
| 2. API Hardening | v1.0 | 3/3 | Complete | 2026-02-15 |
| 3. Auth & Profile Reliability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 4. Dead Code & Observability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 5. Test Coverage Backfill | v1.0 | 1/1 | Complete | 2026-02-16 |
| 6. Dashboard Task Data Flow | v1.1 | 1/1 | Complete | 2026-02-16 |
| 10. Token Consistency | v2.1 | 3/3 | Complete | 2026-02-18 |
| 11. Sidebar Polish | v2.1 | 2/2 | Complete | 2026-02-18 |
| 12. Component Fixes | v2.1 | 1/1 | Complete | 2026-02-18 |
| 13. Data Foundation & Migration | v3.0 | 2/2 | Complete | 2026-02-19 |
| 14. Projects & Sections | v3.0 | 3/3 | Complete | 2026-02-20 |
| 15. Kanban Board | v3.0 | 4/4 | Complete | 2026-02-20 |
| 16. Integration Bug Fixes | v3.0 | 2/2 | Complete | 2026-02-21 |
| 17. Fix Archive/Restore Validation | v3.0 | 1/1 | Complete | 2026-02-21 |
| 20. Database & API Foundation | 2/2 | Complete    | 2026-02-23 | - |
| 21. Journal Entry CRUD | 2/2 | Complete    | 2026-02-23 | - |
| 22. Writing Prompts | 2/2 | Complete    | 2026-02-23 | - |
| 23. Journal Page & Navigation | v4.0 | 0/? | Not started | - |
| 24. Dashboard & Cross-Feature Integration | v4.0 | 0/? | Not started | - |
| 25. i18n & Polish | v4.0 | 0/? | Not started | - |
