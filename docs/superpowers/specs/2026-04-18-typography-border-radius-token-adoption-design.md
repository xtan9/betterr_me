# Typography & Border-Radius Token Adoption (Wave 2 completion)

**Date:** 2026-04-18
**Source task:** `[Wave 2] Refactor: Adopt font-size & border-radius design tokens` (BeterR.me project, task `9869bbae-0095-4376-a2c2-45f3b488fc1e`)

## Background

The Wave 2 task description anticipated a large migration: "32 uses vs 458 hardcoded text-size classes, no border-radius tokens." Since that task was written, both token families have been substantially built out and partially adopted:

- **Border-radius**: tokens added (#412), `rounded-pill` (#415), `rounded-card` (#417, #418), `rounded-control` (#418), `rounded-chip` (#422, #423, #426). Hardcoded `rounded-*` outside `components/ui/` is down to **13 leftover sites** — effectively complete.
- **Typography**: tokens defined. Partially adopted — `text-page-title` (#405), `text-section-heading` (#405), `text-stat` (#421). Two tokens (`text-body`, `text-caption`) were never adopted.

This spec scopes the remaining work: finish typography adoption, redefine one token value so the system is internally coherent, and close out the 13 border-radius fragments.

## Audit Findings (as of 2026-04-18)

### Typography tokens

| Token | Value | Adopted sites | Status |
|---|---|---|---|
| `text-page-title` | 1.5rem | 5 / 4 files | Partial |
| `text-section-heading` | 1.125rem | 33 / 26 files | Partial |
| `text-stat` | 1.75rem | 18 / 9 files | Done |
| `text-body` | 0.875rem | **0** | Never adopted |
| `text-caption` | 0.8125rem (13px) | **0** | Never adopted; **value doesn't match any existing site** |

### Hardcoded text-* outside `components/ui/`

| Class | Sites | Intended semantic destination |
|---|---|---|
| `text-sm` | 306 in 145 files | `text-body` (values match exactly) |
| `text-xs` | 216 in 91 files | `text-caption` *after* redefining to 0.75rem |
| `text-2xl` | 15 in 13 files | 8 `text-page-title`, 7 leave (emojis, inline editors, amount inputs) |
| `text-lg` | 22 in 18 files | 8 `text-section-heading`, 14 leave (tabular stats, display logos, emoji) |
| `text-xl` | 6 in 6 files | Per-site judgment; most likely leave (logo, hero) |
| `text-base` | 29 in 19 files | Per-site judgment (generally leave; closer to body than any heading token) |
| `text-3xl` | 3 in 1 file | Per-site judgment; possibly `text-stat` |

### Border-radius leftovers outside `components/ui/`

13 total: `rounded` (8), `rounded-sm` (3), `rounded-2xl` (2). Single-pass audit.

## The One Behavior Change

**`text-caption` value**: `0.8125rem` (13px) → `0.75rem` (12px).

The 13px value was aspirational and never adopted. Aligning it to 12px makes it equal to Tailwind's `text-xs`, which is the *de facto* caption size in the codebase (216 sites). Zero visual regression because nothing currently uses `text-caption`.

## Token Set (unchanged structurally)

All five typography tokens are defined in `app/globals.css` and `tailwind.config.ts`. No new tokens in this PR. No border-radius token changes.

```diff
/* app/globals.css */
- --font-size-caption: 0.8125rem;
+ --font-size-caption: 0.75rem;
```

`tailwind.config.ts` needs no change — the `text-caption` entry reads `var(--font-size-caption)` so the CSS variable redirect propagates automatically.

## Migration Strategy

Mirrors the spacing PRs #394–#399 pattern: one token (or one small cluster) per PR. Each PR has a single decision rule so review is focused.

### PR 1 — Redefine `text-caption` value

- `app/globals.css`: change `--font-size-caption` to `0.75rem`, add comment explaining the alignment with `text-xs`.
- No component changes.
- Purpose: isolate the only value change into a standalone diff so later adoption PRs are pure class renames.

### PR 2 — Finish `text-page-title` migration

Replace `text-2xl` with `text-page-title` at the 8 confirmed sites (auth form `<CardTitle>`s and `dashboard-content.tsx` empty-state `<h2>`).

**Decision rule — convert if:** the element is `<CardTitle>` on an auth page, or an `<h1>`/`<h2>` acting as a route's primary title.
**Skip if:** emoji/aria-hidden spans, inline editable title inputs, large numeric amount inputs, chat empty-state display text.

**Weight & tracking preservation:** `text-page-title` bakes in `fontWeight: 700` and `letterSpacing: -0.025em`. `CardTitle` defaults to `font-semibold` (600); `dashboard-content.tsx`'s `<h2>` is explicitly `font-semibold`. To preserve current appearance, keep the explicit `font-semibold` class on each converted site. The letter-spacing (-0.025em ≈ 0.6px at 24px) is a minor intentional tightening and does not need override; treat it as part of the design system's page-title convention and note the subtle visual change in the PR description.

Expected candidates (actual file+line inventory to confirm in the plan):
- `components/sign-up-form.tsx`, `components/login-form.tsx`, `components/update-password-form.tsx`, `components/forgot-password-form.tsx` (2 sites), `app/auth/sign-up-success/page.tsx`, `app/auth/error/page.tsx`, `components/dashboard/dashboard-content.tsx` (empty state `<h2>`).

### PR 3 — Finish `text-section-heading` migration

Replace `text-lg` with `text-section-heading` at ~8 confirmed sites (error-state `<p>`s, section `<h3>`s, empty-state `<h3>`s).

**Decision rule — convert if:** the element is `<h2>`/`<h3>`/`<p>` introducing a card section or error/empty-state block.
**Skip if:** `tabular-nums` stat displays, `font-display` logos, emoji/icon spans, consumer-site overrides on shadcn dialog titles where the `text-lg` is explicitly overriding a shadcn default.

**Weight preservation:** `text-section-heading` bakes in `fontWeight: 600`. Sites currently using `font-medium` (500) should keep their explicit `font-medium` class to avoid a weight shift; sites using `font-semibold` may drop the class since the token already supplies 600.

Also handle `text-xl` per-site (6 total) — most will skip (logo, hero, brand); rare conversions individually noted in the PR description.

### PR 4 — `text-sm` → `text-body`

Largest PR: ~306 sites → expected to land ~240–280 after skip rules.

**Decision rule — convert if:** the element renders paragraph/description/card body content (`<p>`, `<div>`, `<span>`) presenting user-readable sentences or lists. `text-sm text-muted-foreground` still qualifies — color is orthogonal to semantics.

**Skip if:**
- Inside shadcn primitive children (e.g., `<AvatarFallback className="text-sm">`) — leave; shadcn owns those
- Custom control surfaces where `text-sm` is a sizing decision for a clickable affordance (toolbar chips, inline selectors)
- Inputs/labels managed by react-hook-form's shadcn wrappers

### PR 5 — `text-xs` → `text-caption`

~216 sites → expected ~160–190 after skip rules.

**Decision rule — convert if:** the element is metadata, timestamp, helper text, small field label, small caption/annotation, or the "label" half of a label/value pair where the value is `text-sm`/`text-body`.

**Skip if:** shadcn `Badge` children, shadcn tooltip internals.

### PR 6 — Border-radius leftover audit (13 sites)

For each site in `rounded` (8), `rounded-sm` (3), `rounded-2xl` (2): migrate to the appropriate semantic token (`rounded-chip` is the likely destination for most) or add a one-line code comment explaining why it stays hardcoded (unique sizing intent). Expect a mix.

## Scope

- **Included:** all `.tsx` under `components/` and `app/`
- **Excluded:** `components/ui/**` (shadcn-managed), `tests/**`, `e2e/**`, `.claude/worktrees/**`

## Non-Goals

- Adding new tokens (e.g., `text-overline`, `text-display-xl`)
- Changing the values of `text-page-title`, `text-section-heading`, `text-body`, `text-stat` (the only value change is `text-caption`)
- Responsive typography variants (`text-body-sm`, `sm:text-body`, etc.)
- Migrating `components/ui/` (shadcn primitives manage their own sizing)
- Creating a design-system documentation site
- Converting `text-base`, `text-3xl`, or `text-4xl` wholesale (handle per-site as they come up)

## Risks

- **Review burden on PR 4 and PR 5.** 200–300 site diffs with one decision rule each. Mitigated by the single-rule pattern (same as spacing PRs #395–#399 which landed successfully) and by zero visual delta for `font-size` (values match exactly).
- **Baked token styles ≠ pure class rename for PR 2 and PR 3.** `text-page-title` bakes `fontWeight: 700` + `letterSpacing: -0.025em`, `text-section-heading` bakes `fontWeight: 600`, and the current sites use `font-semibold`/`font-medium`. The weight-preservation rule above keeps weights identical. The letter-spacing tightening on `text-page-title` sites (~0.6px at 24px) is an accepted minor delta. PRs 4, 5, and 6 do not have this issue (`text-body`/`text-caption` bake no weight/spacing; border-radius tokens are pure sizing).
- **False-positive conversions.** A site that looks like body/caption might be a sized control. Mitigated by the explicit skip lists per PR and by domain spot-checks during review.
- **Semantic churn with no user-visible payoff.** PRs 4 and 5 are purely code-quality refactors. Explicit trade-off: consistent vocabulary across 500+ sites vs. one-time diff noise.
- **shadcn boundary.** `components/ui/**` uses `text-sm`/`text-xs` internally; the global exclusion prevents accidental edits.

## Testing

- Each PR: `pnpm lint` clean, `pnpm test:run` green.
- PR 1 (value change): verified by grepping that no site references `text-caption` before merge — confirms zero visual impact.
- PR 2 (page-title): minor letter-spacing tightening accepted; weight preserved via explicit classes. Spot-check auth pages and dashboard empty state.
- PR 3 (section-heading): weight preserved via explicit classes. Spot-check affected error/empty-state blocks.
- PR 4 (body), PR 5 (caption), PR 6 (border-radius): pure class renames with identical `rem` values → zero visual change by construction. No new tests required beyond the existing suite.

## Success Criteria

- `pnpm lint` and `pnpm test:run` pass after each PR.
- After PR 5: `rg '\btext-(sm|xs)\b' components/ app/ --glob '!**/components/ui/**'` returns only documented skip-list sites.
- After PR 6: `rg '\brounded(-sm|-2xl)?\b' components/ app/ --glob '!**/components/ui/**'` returns only documented hardcoded sites (with inline code comments explaining why).
- Wave 2 task can be closed as complete.
