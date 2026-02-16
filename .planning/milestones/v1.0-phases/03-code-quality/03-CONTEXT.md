# Phase 3: Code Quality - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove dead code and fragile patterns so the codebase is maintainable and debuggable. Covers: dead cache removal, debug log cleanup, theme-switcher DOM workaround fix, constructor enforcement for DB classes, and error logging with graceful degradation. No new features — strictly cleanup and hardening.

</domain>

<decisions>
## Implementation Decisions

### Theme switching fix
- Instant swap, no transition animation
- Respect OS/system color scheme preference by default (three options: light/dark/system)
- If the DOM workaround exists due to a real next-themes bug, use the smallest possible workaround and document why — don't over-engineer a fix
- Current theme switching works fine visually for the user — this is a code quality cleanup, not a UX fix

### Error surfacing
- Establish a reusable `_warnings` pattern as a convention for any API route (not just dashboard)
- When computeMissedDays fails: show last known good / stale data if available, rather than omitting or showing zeros
- Server-side logging: log error message plus relevant context (user ID, date range, habit IDs involved)

### Debug log strategy
- Replace console.logs with proper logging where meaningful, delete pure debug noise — Sentry will be added later so keep logs that would be useful for error tracking
- Create a thin logger wrapper module (log.error, log.warn, log.info) that wraps console methods now but can swap to Sentry later with one change
- Scan all source files for stray console.logs, not just the two files in SC#1 — clean up the entire codebase while we're at it

### Claude's Discretion
- Logger wrapper API design (method signatures, context parameter shape)
- Whether user-facing warning indicators are needed (vs dev-only _warnings in API response)
- Logging approach choice (console methods vs lightweight library) — leaning console methods with thin wrapper
- Which console.logs across the codebase are meaningful enough to keep as proper logs vs delete

</decisions>

<specifics>
## Specific Ideas

- "I'll use Sentry later" — logger wrapper should be designed with future Sentry integration in mind (one-change swap)
- _warnings should be a reusable convention, not a one-off — any API route should be able to add warnings for graceful degradation

</specifics>

<deferred>
## Deferred Ideas

- Sentry integration — future phase/milestone
- Comprehensive observability/monitoring — out of scope for cleanup

</deferred>

---

*Phase: 03-code-quality*
*Context gathered: 2026-02-16*
