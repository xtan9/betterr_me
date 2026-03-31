# Roadmap: BetterR.Me

## Milestones

- ✅ **v1.0 Codebase Hardening** — Phases 1-5 (shipped 2026-02-16)
- ✅ **v1.1 Dashboard Task Fixes** — Phase 6 (shipped 2026-02-17)
- ✅ **v2.0 UI Style Redesign** — Phases 1-9 (shipped 2026-02-17)
- ✅ **v2.1 UI Polish & Refinement** — Phases 10-12 (shipped 2026-02-18)
- ✅ **v3.0 Projects & Kanban** — Phases 13-17 (shipped 2026-02-21)
- ✅ **v4.0 Money Tracking** — Phases 18-26 (shipped 2026-02-28)

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

<details>
<summary>✅ v4.0 Money Tracking (Phases 18-26) — SHIPPED 2026-02-28</summary>

9 phases, 38 plans, 66 requirements. See `.planning/milestones/v4.0-ROADMAP.md` for details.

- [x] Phase 18: Database Foundation & Household Schema (2/2 plans) — completed 2026-02-21
- [x] Phase 19: Plaid Bank Connection Pipeline (6/6 plans) — completed 2026-02-22
- [x] Phase 20: Transaction Management & Categorization (5/5 plans) — completed 2026-02-23
- [x] Phase 21: Budgets & Spending Analytics (5/5 plans) — completed 2026-02-23
- [x] Phase 22: Bills, Goals & Net Worth (6/6 plans) — completed 2026-02-24
- [x] Phase 23: Household & Couples (4/4 plans) — completed 2026-02-24
- [x] Phase 24: Future-First Dashboard & AI Insights (5/5 plans) — completed 2026-02-24
- [x] Phase 25: Data Management & Polish (2/2 plans) — completed 2026-02-24
- [x] Phase 26: CSV Import & Integration Polish (3/3 plans) — completed 2026-02-28

</details>

### 🚧 v5.1 Exercise Illustrations & Detail Page (In Progress)

**Milestone Goal:** Add animated exercise illustrations, step-by-step instructions, and a Hevy-style exercise detail page using ExerciseDB API data.

- [x] **Phase 27: Data Layer & Sync** — completed 2026-03-30
- [x] **Phase 28: Thumbnails in Existing UI** — completed 2026-03-31
- [ ] **Phase 29: Exercise Detail Page** - Three-tab detail page (Summary, History, How To) with navigation from existing UI

### Phase 29: Exercise Detail Page
**Goal**: Users can view a comprehensive exercise detail page with animated demonstration, progress history, and step-by-step instructions
**Depends on**: Phase 28 (thumbnail component and data layer validated in real UI)
**Requirements**: DETL-01, DETL-02, DETL-03, DETL-04, DETL-05, I18N-01 (partial — detail page strings)
**Success Criteria** (what must be TRUE):
  1. User can navigate to /workouts/exercises/[id] from both the workout logger (exercise name link) and exercise library (card click) and see a three-tab layout
  2. Summary tab displays an animated GIF demonstration, primary/secondary muscle groups, alternative names, a progress chart, and personal records
  3. History tab shows past workout sets for the exercise, reusing existing exercise history display
  4. How To tab shows step-by-step instructions as a numbered list (tab hidden when no instructions available)
  5. All detail page tab labels, headings, and UI strings are translated in en, zh, and zh-TW
**Plans**: 2 plans
Plans:
- [ ] 29-01-PLAN.md — Detail page components + tabs + i18n
- [ ] 29-02-PLAN.md — Navigation links from exercise library and workout logger
**UI hint**: yes

## Progress

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
| 18. Database Foundation | v4.0 | 2/2 | Complete | 2026-02-21 |
| 19. Plaid Bank Connection | v4.0 | 6/6 | Complete | 2026-02-22 |
| 20. Transactions & Categorization | v4.0 | 5/5 | Complete | 2026-02-23 |
| 21. Budgets & Spending | v4.0 | 5/5 | Complete | 2026-02-23 |
| 22. Bills, Goals & Net Worth | v4.0 | 6/6 | Complete | 2026-02-24 |
| 23. Household & Couples | v4.0 | 4/4 | Complete | 2026-02-24 |
| 24. Dashboard & AI Insights | v4.0 | 5/5 | Complete | 2026-02-24 |
| 25. Data Management | v4.0 | 2/2 | Complete | 2026-02-24 |
| 26. CSV Import & Polish | v4.0 | 3/3 | Complete | 2026-02-28 |
| 27. Data Layer & Sync | v5.1 | 3/3 | Complete    | 2026-03-30 |
| 28. Thumbnails in Existing UI | v5.1 | 2/2 | Complete | 2026-03-31 |
| 29. Exercise Detail Page | v5.1 | 0/2 | Not started | - |
