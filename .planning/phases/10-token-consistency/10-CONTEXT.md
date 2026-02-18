# Phase 10: Token Consistency - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace all hardcoded color and spacing values in component files with semantic design tokens. Every color and spacing value should reference a token so that light/dark themes stay coherent. No new UI features or layout changes — strictly a token adoption pass.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User directive: **"Make sure our code is enterprise production ready."**

Claude has full discretion on all implementation decisions for this phase, guided by that standard. Specifically:

**Replacement scope**
- Replace every hardcoded Tailwind color class (`bg-slate-*`, `text-gray-*`, `border-zinc-*`, etc.) with semantic tokens (`bg-muted`, `text-muted-foreground`, `border-border`, etc.)
- Be thorough — no partial adoption. If a value can reference a token, it should
- One-off decorative values (e.g., brand accent in a specific spot) get tokens too — use semantic names that describe purpose, not color

**Spacing tokens**
- Layout-level spacing (page padding, card gaps, section margins) should use spacing tokens if they exist
- Micro-spacing (small icon margins, inline gaps) can stay as plain Tailwind utilities — only promote to tokens if a pattern repeats across 3+ components
- Prioritize consistency: same semantic context = same token

**Progress bar appearance**
- Track should use `bg-muted` (or equivalent semantic token) so it adapts correctly in both light and dark mode
- Ensure sufficient contrast between track and fill in both themes

**Dark mode**
- Every replaced value must be verified in both light and dark mode
- No visual regressions — if a hardcoded value was working in dark mode, the token replacement must produce the same or better result

**Quality bar**
- Zero hardcoded color classes in component files after this phase
- Spacing tokens used consistently at layout boundaries
- All existing tests pass
- No dark mode regressions

</decisions>

<specifics>
## Specific Ideas

No specific requirements — Claude has full discretion within enterprise production-ready standards. Thoroughness and consistency over speed.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-token-consistency*
*Context gathered: 2026-02-17*
