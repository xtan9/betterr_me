# Phase 2: Security and Validation - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire Zod schemas into all API POST/PATCH routes for input validation, harden profile auto-creation to handle missing OAuth email and trigger failures, add auth redirect allowlist to prevent open redirects, and enforce a 20-habit limit per user. No new features — only hardening existing API boundaries.

</domain>

<decisions>
## Implementation Decisions

### Validation Error Format
- Claude's discretion on error response structure (structured field errors vs simple message)
- Claude's discretion on whether to include submitted values in error responses
- Claude's discretion on server-side logging of validation failures
- Claude's discretion on shared validation helper vs inline safeParse pattern

### Profile Auto-Creation
- Claude's discretion on when ensureProfile is called (every write vs login/signup only)
- Claude's discretion on what to store when OAuth user has no email
- Claude's discretion on handle_new_user() trigger error handling approach
- Claude's discretion on user-visible indication of delayed profile creation

### Auth Redirect Policy
- Claude's discretion on allowlist strictness (exact paths vs pattern-based)
- Fallback route when redirect path is invalid: `/` (root) — let proxy middleware handle routing
- Claude's discretion on logging blocked redirect attempts
- Claude's discretion on explicit external URL rejection vs relying on allowlist

### Habit Limit Behavior
- Error message should include current count: "You have 20/20 habits. Remove one before adding another."
- Limit stored as a named constant (e.g., `MAX_HABITS = 20`) — not hardcoded inline
- Only active (non-deleted) habits count toward the 20 limit
- Claude's discretion on whether frontend also checks the limit or server-side only

### Claude's Discretion
- Validation error response format and structure
- Validation logging level
- Shared helper vs inline validation pattern
- ensureProfile placement and trigger error handling
- Auth redirect allowlist implementation approach
- Whether frontend pre-checks habit limit

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. User trusts Claude to make implementation decisions based on codebase patterns and security best practices.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-security-and-validation*
*Context gathered: 2026-02-15*
