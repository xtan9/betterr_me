# Requirements: BetterR.Me

**Defined:** 2026-02-17
**Core Value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable

## v2.1 Requirements

Requirements for UI polish & refinement pass. Each maps to roadmap phases.

### Sidebar Polish

- [ ] **SIDE-01**: Sidebar has consistent spacing and padding using design tokens
- [ ] **SIDE-02**: Sidebar hover/active states have smooth transitions
- [ ] **SIDE-03**: Sidebar group headers and icons are visually refined

### Token Consistency

- [ ] **TOKN-01**: All hardcoded color values replaced with design token variables
- [ ] **TOKN-02**: All hardcoded spacing values (`gap-4`, etc.) replaced with spacing tokens (`gap-card-gap`)
- [ ] **TOKN-03**: Progress bar track uses `bg-muted` instead of hardcoded slate

### Component Fixes

- [ ] **COMP-01**: Motivation message restored to colored background style (`bg-primary/5`) instead of plain Card
- [ ] **COMP-02**: Habit checklist footer ("X of Y completed") sticks to card bottom in grid layout

## Future Requirements

None deferred for this milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Replacing window.confirm() with AlertDialog | Separate polish milestone |
| Dark mode card-on-gray depth fix | Requires design decision on dark surface hierarchy |
| Custom date/time picker components | Native inputs functional, separate effort |
| Mobile sidebar improvements | Current mobile sheet works, separate scope |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIDE-01 | Phase 11 | Pending |
| SIDE-02 | Phase 11 | Pending |
| SIDE-03 | Phase 11 | Pending |
| TOKN-01 | Phase 10 | Pending |
| TOKN-02 | Phase 10 | Pending |
| TOKN-03 | Phase 10 | Pending |
| COMP-01 | Phase 12 | Pending |
| COMP-02 | Phase 12 | Pending |

**Coverage:**
- v2.1 requirements: 8 total
- Mapped to phases: 8
- Unmapped: 0

---
*Requirements defined: 2026-02-17*
*Last updated: 2026-02-17 after roadmap creation*
