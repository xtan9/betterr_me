# Roadmap: BetterR.Me

## Milestones

- ✅ **v1.0 Codebase Hardening** — Phases 1-5 (shipped 2026-02-16)
- ✅ **v1.1 Dashboard Task Fixes** — Phase 6 (shipped 2026-02-17)
- ✅ **v2.0 UI Style Redesign** — Phases 1-9 (shipped 2026-02-17)
- 🚧 **v2.1 UI Polish & Refinement** — Phases 10-12 (in progress)

## Phases

<details>
<summary>✅ v1.0 Codebase Hardening (Phases 1-5) — SHIPPED 2026-02-16</summary>

5 phases, 11 plans, 26 requirements. See `.planning/milestones/v1.0-ROADMAP.md` for details.

</details>

<details>
<summary>✅ v1.1 Dashboard Task Fixes (Phase 6) — SHIPPED 2026-02-17</summary>

- [x] Phase 6: Dashboard Task Data Flow (1/1 plan) — completed 2026-02-16

</details>

<details>
<summary>✅ v2.0 UI Style Redesign (Phases 1-9) — SHIPPED 2026-02-17</summary>

9 phases: design tokens, sidebar navigation, collapse persistence, page header/layout, dashboard migration, remaining pages migration, sidebar enrichment, visual polish, test stabilization. See `.planning/milestones/v2.0-ROADMAP.md` for details.

</details>

### 🚧 v2.1 UI Polish & Refinement (In Progress)

**Milestone Goal:** Polish sidebar, fix layout issues, restore component styles, and enforce design token consistency across the app.

- [ ] **Phase 10: Token Consistency** - Replace all hardcoded color and spacing values with design tokens
- [ ] **Phase 11: Sidebar Polish** - Refine sidebar spacing, transitions, and visual hierarchy
- [ ] **Phase 12: Component Fixes** - Restore motivation message style and fix habit checklist layout

## Phase Details

### Phase 10: Token Consistency
**Goal**: Every color and spacing value in the codebase references a design token, eliminating hardcoded values that break theme coherence
**Depends on**: Nothing (foundation for subsequent phases)
**Requirements**: TOKN-01, TOKN-02, TOKN-03
**Success Criteria** (what must be TRUE):
  1. No hardcoded Tailwind color classes (e.g., `bg-slate-*`, `text-gray-*`, `border-zinc-*`) remain in component files -- all replaced with semantic token variables (`bg-muted`, `text-muted-foreground`, etc.)
  2. No hardcoded spacing values (e.g., `gap-4`, `p-6`, `space-y-3`) remain where a spacing token (`gap-card-gap`, `p-page-padding`, etc.) should be used
  3. Progress bar track renders with `bg-muted` and adapts correctly in both light and dark mode
  4. Existing tests continue to pass with no visual regressions in dark mode
**Plans:** 3 plans

Plans:
- [ ] 10-01-PLAN.md — Define semantic color CSS tokens and Tailwind utilities
- [ ] 10-02-PLAN.md — Migrate habit and dashboard components to semantic tokens
- [ ] 10-03-PLAN.md — Migrate task, auth, hero, settings components + spacing tokens

### Phase 11: Sidebar Polish
**Goal**: The sidebar feels intentional and polished -- consistent spacing, smooth interactions, and clear visual hierarchy
**Depends on**: Phase 10 (tokens must be in place so sidebar uses tokens, not hardcoded values)
**Requirements**: SIDE-01, SIDE-02, SIDE-03
**Success Criteria** (what must be TRUE):
  1. Sidebar items, groups, and sections have uniform spacing and padding derived from design tokens (no pixel-level inconsistencies between nav groups)
  2. Hovering over sidebar items produces a smooth visual transition (not an abrupt color swap), and the active/current page item is clearly distinguished
  3. Sidebar group headers (e.g., "Navigation", "Management") are visually distinct from nav items -- smaller font, muted color, proper spacing above/below
  4. Sidebar icons are vertically aligned with their labels and consistently sized across all nav items
**Plans**: TBD

Plans:
- [ ] 11-01: TBD

### Phase 12: Component Fixes
**Goal**: Two specific layout/style regressions from the v2.0 redesign are restored to their intended appearance
**Depends on**: Phase 10 (fixes should use tokens for any color/spacing values)
**Requirements**: COMP-01, COMP-02
**Success Criteria** (what must be TRUE):
  1. The dashboard motivation message displays with a colored background (`bg-primary/5` or equivalent token) instead of rendering as a plain Card -- visually distinct from surrounding content
  2. The habit checklist footer ("X of Y completed") is pinned to the bottom of its card regardless of how many habits are listed, so cards in the same grid row have aligned footers
  3. Both fixes render correctly in light mode, dark mode, and across the three locales (en, zh, zh-TW) without layout overflow
**Plans**: TBD

Plans:
- [ ] 12-01: TBD

## Progress

**Execution Order:** 10 -> 11 -> 12

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Frequency Correctness | v1.0 | 3/3 | Complete | 2026-02-15 |
| 2. API Hardening | v1.0 | 3/3 | Complete | 2026-02-15 |
| 3. Auth & Profile Reliability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 4. Dead Code & Observability | v1.0 | 2/2 | Complete | 2026-02-16 |
| 5. Test Coverage Backfill | v1.0 | 1/1 | Complete | 2026-02-16 |
| 6. Dashboard Task Data Flow | v1.1 | 1/1 | Complete | 2026-02-16 |
| 10. Token Consistency | v2.1 | 0/3 | Not started | - |
| 11. Sidebar Polish | v2.1 | 0/? | Not started | - |
| 12. Component Fixes | v2.1 | 0/? | Not started | - |
