# Requirements: BetterR.Me UI Style Redesign

**Defined:** 2026-02-15
**Core Value:** The app must feel spacious, clean, and professional — like a premium SaaS product — while preserving all existing functionality and the emerald/teal brand identity.

## v1 Requirements

Requirements for the UI style redesign. Each maps to roadmap phases.

### Sidebar Navigation

- [ ] **SIDE-01**: User sees a persistent left sidebar with icon + label navigation items (Dashboard, Habits, Tasks)
- [ ] **SIDE-02**: User can collapse sidebar to icon-only mode via pin/unpin toggle button
- [ ] **SIDE-03**: Current page is highlighted with an active state indicator in the sidebar
- [ ] **SIDE-04**: On mobile (<768px), sidebar appears as a sheet/drawer from the left (replaces bottom nav)
- [ ] **SIDE-05**: User avatar, name, and account dropdown appear in the sidebar footer with logout/settings
- [ ] **SIDE-06**: Sidebar expand/collapse animates smoothly (CSS transitions, <300ms)
- [ ] **SIDE-07**: Sidebar auto-collapses to sheet on tablet breakpoint (<768px)
- [ ] **SIDE-08**: Sidebar nav items are organized into collapsible section groups (Main / Account)
- [ ] **SIDE-09**: When unpinned, sidebar auto-hides and reveals on hover over left edge
- [ ] **SIDE-10**: Sidebar items show notification badges (e.g., tasks due count, incomplete habits count)
- [ ] **SIDE-11**: Sidebar collapse state persists across page reloads (cookie-based)
- [ ] **SIDE-12**: User can toggle sidebar with keyboard shortcut (Cmd/Ctrl+B)

### Visual System

- [ ] **VISL-01**: Page background is a subtle gray with white cards floating on top (card-on-gray depth), matching Chameleon's exact background gray value
- [ ] **VISL-02**: Dark mode uses proper elevation levels (lighter surfaces for higher elements)
- [ ] **VISL-03**: Every page has a consistent page header (title, optional subtitle, primary action button)
- [ ] **VISL-04**: Typography, padding, margins, font sizes, border radius, and spacing match Chameleon's dashboard CSS values (pixel-perfect)
- [ ] **VISL-05**: Content area has a max-width with centering on ultra-wide screens
- [ ] **VISL-06**: Emerald/teal accent is slightly desaturated in dark mode for eye comfort
- [ ] **VISL-07**: Cards and buttons have subtle hover/focus micro-interactions
- [ ] **VISL-08**: Detail/edit views show breadcrumb navigation in the page header
- [ ] **VISL-09**: Theme and language switchers move to sidebar (removed from top header)
- [ ] **VISL-10**: All pages updated: dashboard, habits, tasks, profile, auth pages
- [ ] **VISL-11**: Design tokens (background gray, card radius, sidebar width, font sizes, spacing scale) are extracted from Chameleon's live site and replicated

### Testing & Quality

- [ ] **TEST-01**: All existing Vitest unit tests pass after redesign
- [ ] **TEST-02**: All existing Playwright E2E tests updated and passing with new sidebar layout
- [ ] **TEST-03**: Visual regression baselines regenerated for the new design
- [ ] **TEST-04**: Accessibility standards maintained (vitest-axe tests pass)
- [ ] **TEST-05**: All three locales (en, zh, zh-TW) render correctly with the new layout
- [ ] **TEST-06**: Dark mode and light mode both fully styled and tested

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Features

- **ADV-01**: Command palette (Cmd+K) for quick navigation to pages, habits, tasks
- **ADV-02**: Page transition animations (fade/slide between routes)
- **ADV-03**: Keyboard shortcut hints shown next to sidebar items (D, H, T, S)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Glassmorphism / frosted glass cards | Poor contrast, accessibility failure, performance cost |
| Neumorphism / soft UI shadows | Terrible interactive element contrast, dated trend |
| Spring physics animations | Bundle size increase, CSS transitions sufficient |
| Right-side detail panels (split view) | Habit data not dense enough, mobile breakpoint nightmare |
| Mega-menu / multi-level flyouts | Only 4 nav items, overengineering |
| Theme color picker | High engineering cost, edge cases with contrast |
| Sidebar drag-to-resize | Minimal value vs engineering complexity |
| Parallax / scroll-linked animations | Motion sickness risk, distracting in productivity app |
| Dual navigation (sidebar + bottom nav on desktop) | Confusing, redundant, maintenance burden |
| Changes to API routes, database layer, or business logic | Purely visual redesign |
| New pages or routes | Layout change only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIDE-01 | - | Pending |
| SIDE-02 | - | Pending |
| SIDE-03 | - | Pending |
| SIDE-04 | - | Pending |
| SIDE-05 | - | Pending |
| SIDE-06 | - | Pending |
| SIDE-07 | - | Pending |
| SIDE-08 | - | Pending |
| SIDE-09 | - | Pending |
| SIDE-10 | - | Pending |
| SIDE-11 | - | Pending |
| SIDE-12 | - | Pending |
| VISL-01 | - | Pending |
| VISL-02 | - | Pending |
| VISL-03 | - | Pending |
| VISL-04 | - | Pending |
| VISL-05 | - | Pending |
| VISL-06 | - | Pending |
| VISL-07 | - | Pending |
| VISL-08 | - | Pending |
| VISL-09 | - | Pending |
| VISL-10 | - | Pending |
| VISL-11 | - | Pending |
| TEST-01 | - | Pending |
| TEST-02 | - | Pending |
| TEST-03 | - | Pending |
| TEST-04 | - | Pending |
| TEST-05 | - | Pending |
| TEST-06 | - | Pending |

**Coverage:**
- v1 requirements: 29 total
- Mapped to phases: 0
- Unmapped: 29

---
*Requirements defined: 2026-02-15*
*Last updated: 2026-02-15 after initial definition*
