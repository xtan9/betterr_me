# Requirements: BetterR.Me v1.1

**Defined:** 2026-02-16
**Core Value:** Users see accurate stats, the API rejects bad input, and the codebase is maintainable

## v1.1 Requirements

### Task Display

- [ ] **TASK-01**: Dashboard `getTodayTasks` uses the client-sent `date` parameter instead of server-local time, so tasks filter correctly regardless of server timezone
- [ ] **TASK-02**: Dashboard task list includes completed tasks for the current day, showing accurate "X of Y completed" count (e.g., "1 of 2 completed" after completing one of two tasks)
- [ ] **TASK-03**: A task with a due date of tomorrow does not appear in both "Today's Tasks" and "Coming Up Tomorrow" sections simultaneously

## Future Requirements

(None — bugfix milestone)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Refactoring TasksDB query interface | Only fix the specific methods involved in these bugs |
| Task timezone handling across all views | Focus on dashboard only; other views can be addressed separately |
| Changing how tasks store dates in DB | Schema changes not needed for these fixes |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TASK-01 | — | Pending |
| TASK-02 | — | Pending |
| TASK-03 | — | Pending |

**Coverage:**
- v1.1 requirements: 3 total
- Mapped to phases: 0
- Unmapped: 3 ⚠️

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-02-16 after initial definition*
