# Phase 6: Dashboard Task Data Flow - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the dashboard task display: getTodayTasks must use the client-sent date (not server time), completed tasks must remain visible with correct counts, and tasks must not duplicate across today/tomorrow sections. No new features — purely correcting existing behavior.

</domain>

<decisions>
## Implementation Decisions

### Overdue handling
- Keep current behavior: "Today's Tasks" includes overdue tasks (due_date <= today)
- The fix is that "today" must come from the client-sent date parameter, not server-local time
- Client date is required — no server-side fallback. getTodayTasks must accept a date parameter

### Completed task visibility
- Completed tasks stay visible in the dashboard task list, greyed out with strikethrough and checked checkbox
- Completed tasks sort to the bottom of the list (current sort logic already does this)
- API must return both completed and incomplete tasks for today (currently only returns incomplete)
- When all tasks are completed, keep the "All done! 🎉" celebration behavior

### Count display
- Format: "X of Y completed" (e.g., "1 of 2 completed") — same format as current, just with correct numbers
- Y = total tasks for today (completed + incomplete), X = completed count

### Claude's Discretion
- How to modify getTodayTasks signature (add date param vs restructure query)
- Whether to also fix other methods that use server-side getLocalDateString (getUpcomingTasks, getOverdueTasks) — only if needed for this phase's requirements
- Styling details for completed task appearance (exact opacity, text decoration)

</decisions>

<specifics>
## Specific Ideas

- Root cause: getTodayTasks() calls getLocalDateString() server-side — UTC on Vercel. At 9:35 PM Pacific, Vercel thinks "today" is Feb 17 while client says Feb 16.
- The dashboard route already receives client date via query param and uses it for other queries (habit logs, tomorrow tasks) — just not for getTodayTasks
- The TasksToday component already has sort logic that puts completed tasks at bottom (line 223-241 of tasks-today.tsx)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-dashboard-task-data-flow*
*Context gathered: 2026-02-16*
