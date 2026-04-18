# Typography & Border-Radius Token Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete adoption of the five typography design tokens and close 13 border-radius fragments, following the token-by-token PR pattern established by spacing PRs #394–#399.

**Architecture:** Six sequential PRs off `main`, each with a single decision rule. PR 1 redefines `--font-size-caption` (13px → 12px — zero visual impact since nothing uses it). PRs 2–3 finish partial migrations from #405. PRs 4–5 are the large pure class-rename migrations (`text-sm` → `text-body` ~306 sites, `text-xs` → `text-caption` ~216 sites). PR 6 audits 13 `rounded-*` leftovers.

**Tech Stack:** Next.js 16 App Router, Tailwind CSS 3 (tokens in `app/globals.css` + `tailwind.config.ts`), TypeScript strict, pnpm 10.11, Vitest for unit tests, ESLint.

**Per CLAUDE.md:** Each PR goes to its own feature branch. Spec + plan get committed with PR 1. Never push to `main` directly. `components/ui/**`, `tests/**`, `e2e/**`, `.claude/worktrees/**` are excluded from all migrations.

**Design Spec:** `docs/superpowers/specs/2026-04-18-typography-border-radius-token-adoption-design.md`

---

## File Structure

| Path | Role |
|---|---|
| `docs/superpowers/specs/2026-04-18-typography-border-radius-token-adoption-design.md` | Design spec (already exists; committed in PR 1) |
| `docs/superpowers/plans/2026-04-18-typography-border-radius-token-adoption.md` | This plan (committed in PR 1) |
| `app/globals.css` | PR 1 edits line ~170 (`--font-size-caption`) |
| `tailwind.config.ts` | **Unchanged** — CSS variable indirection propagates value |
| `components/**/*.tsx`, `app/**/*.tsx` | PRs 2–6 edit classNames only |

No new files, no new tokens, no new types.

---

## Task 1: PR 1 — Redefine `text-caption` value (13px → 12px)

**Files:**
- Modify: `app/globals.css:170` (the `--font-size-caption` line)
- Create: `docs/superpowers/plans/2026-04-18-typography-border-radius-token-adoption.md` (this file)

**Branch:** `refactor/wave2-typography-caption-value`

- [ ] **Step 1: Verify zero existing `text-caption` usage**

```bash
rg '\btext-caption\b' components/ app/ -g '*.tsx' --glob '!**/.claude/**'
```

Expected: **no output**. This confirms the value change has no visual impact. If ANY site shows up, stop and investigate — the safety premise is broken.

- [ ] **Step 2: Create the feature branch**

```bash
git checkout main
git pull
git checkout -b refactor/wave2-typography-caption-value
```

- [ ] **Step 3: Apply the value change to `app/globals.css`**

Find the line (around line 170 under `/* === Typography scale === */`):

```css
    --font-size-caption: 0.8125rem;
```

Replace with:

```css
    --font-size-caption: 0.75rem; /* aligned to Tailwind text-xs for adoption; previously 0.8125rem (never used) */
```

- [ ] **Step 4: Run lint**

```bash
pnpm lint
```

Expected: clean — no errors, no new warnings.

- [ ] **Step 5: Run tests**

```bash
pnpm test:run
```

Expected: 5221+ tests pass. No test references `text-caption` or the old pixel value.

- [ ] **Step 6: Commit spec + plan + value change**

```bash
git add docs/superpowers/specs/2026-04-18-typography-border-radius-token-adoption-design.md \
        docs/superpowers/plans/2026-04-18-typography-border-radius-token-adoption.md \
        app/globals.css
git commit -m "$(cat <<'EOF'
refactor(tokens): align text-caption to 12px and add Wave 2 typography adoption spec

Changes --font-size-caption from 0.8125rem (13px) to 0.75rem (12px). Zero
visual impact — no site currently uses text-caption. The new value matches
Tailwind's text-xs so subsequent PRs can migrate text-xs → text-caption as
a pure class rename with no visual regression.

Adds design spec and implementation plan for the remaining Wave 2 typography
token work (PRs 2–6).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Push and open PR**

```bash
git push -u origin refactor/wave2-typography-caption-value
gh pr create --title "refactor(tokens): align text-caption to 12px (Wave 2 PR 1/6)" --body "$(cat <<'EOF'
## Summary

PR 1 of 6 in the Wave 2 typography + border-radius token adoption effort. See `docs/superpowers/specs/2026-04-18-typography-border-radius-token-adoption-design.md` for full context.

Changes `--font-size-caption` from 13px to 12px. **Zero visual impact** — grep confirms no site currently uses `text-caption`. This alignment lets subsequent PRs migrate `text-xs` → `text-caption` as a pure class rename.

Also adds the design spec and implementation plan.

## Test plan

- [x] `pnpm lint` clean
- [x] `pnpm test:run` green (5221+ tests)
- [x] Verified zero existing `text-caption` usage via grep

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

After PR 1 merges, proceed to Task 2.

---

## Task 2: PR 2 — Finish `text-page-title` migration (8 sites)

**Files to modify:**
- `components/sign-up-form.tsx:85`
- `components/login-form.tsx:76`
- `components/update-password-form.tsx:52`
- `components/forgot-password-form.tsx:55`
- `components/forgot-password-form.tsx:67`
- `app/auth/sign-up-success/page.tsx:18`
- `app/auth/error/page.tsx:18`
- `components/dashboard/dashboard-content.tsx:326`

**Branch:** `refactor/wave2-text-page-title-adoption`

**Weight preservation rule:** `text-page-title` bakes `fontWeight: 700` and `letterSpacing: -0.025em`. `CardTitle` defaults to `font-semibold` (600). To keep weight unchanged, **always add `font-semibold` explicitly** when converting these sites. The letter-spacing tightening (~0.6px at 24px) is accepted.

- [ ] **Step 1: Pull main (after PR 1 merged), branch**

```bash
git checkout main
git pull
git checkout -b refactor/wave2-text-page-title-adoption
```

- [ ] **Step 2: Re-audit `text-2xl` candidates**

```bash
rg '\btext-2xl\b' components/ app/ -g '*.tsx' --glob '!**/components/ui/**' --glob '!**/.claude/**' -n
```

Expected: ~15 total lines. Confirm the 8 conversion candidates listed above are present. Note any drift. **Do not** convert the following (skip list):
- `components/chat/chat-empty-state.tsx:10` (empty-state display text, intentional)
- `components/journal/journal-widget.tsx:73` (emoji span with `aria-hidden`)
- `components/journal/journal-mood-selector.tsx:38` (emoji picker)
- `components/kanban/kanban-detail-modal.tsx:182,187` (inline editable title)
- `components/money/budget-form.tsx:194` (amount input sizing)
- `components/money/net-worth-summary.tsx:55` (tabular-nums display)

- [ ] **Step 3: Convert `components/sign-up-form.tsx:85`**

```diff
-          <CardTitle className="text-2xl">{t('title')}</CardTitle>
+          <CardTitle className="text-page-title font-semibold">{t('title')}</CardTitle>
```

- [ ] **Step 4: Convert `components/login-form.tsx:76`**

```diff
-          <CardTitle className="text-2xl">{t('title')}</CardTitle>
+          <CardTitle className="text-page-title font-semibold">{t('title')}</CardTitle>
```

- [ ] **Step 5: Convert `components/update-password-form.tsx:52`**

```diff
-          <CardTitle className="text-2xl">{t('title')}</CardTitle>
+          <CardTitle className="text-page-title font-semibold">{t('title')}</CardTitle>
```

- [ ] **Step 6: Convert `components/forgot-password-form.tsx:55` and `:67`**

Both lines (check-email card title and main title):

```diff
-            <CardTitle className="text-2xl">{t('checkEmail')}</CardTitle>
+            <CardTitle className="text-page-title font-semibold">{t('checkEmail')}</CardTitle>
```

```diff
-            <CardTitle className="text-2xl">{t('title')}</CardTitle>
+            <CardTitle className="text-page-title font-semibold">{t('title')}</CardTitle>
```

- [ ] **Step 7: Convert `app/auth/sign-up-success/page.tsx:18`**

```diff
-              <CardTitle className="text-2xl">
+              <CardTitle className="text-page-title font-semibold">
```

- [ ] **Step 8: Convert `app/auth/error/page.tsx:18`**

```diff
-              <CardTitle className="text-2xl">
+              <CardTitle className="text-page-title font-semibold">
```

- [ ] **Step 9: Convert `components/dashboard/dashboard-content.tsx:326`**

The `<h2>` already has `font-semibold`, just swap the size class:

```diff
-              <h2 className="text-2xl font-semibold">{t("empty.title")}</h2>
+              <h2 className="text-page-title font-semibold">{t("empty.title")}</h2>
```

- [ ] **Step 10: Run lint**

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 11: Run tests**

```bash
pnpm test:run
```

Expected: green. If any unit test asserts on `text-2xl` in these files, update the assertion to `text-page-title font-semibold`.

- [ ] **Step 12: Visual spot-check**

```bash
pnpm dev
```

Open each of these pages and confirm titles render correctly (slight letter-spacing tightening is expected and acceptable):
- `http://localhost:3000/auth/login`
- `http://localhost:3000/auth/sign-up`
- `http://localhost:3000/auth/forgot-password`
- `http://localhost:3000/auth/update-password`
- Dashboard empty state (requires no habits/tasks/journal for the account)

Stop dev server (Ctrl+C).

- [ ] **Step 13: Commit, push, PR**

```bash
git add components/ app/
git commit -m "$(cat <<'EOF'
refactor(tokens): adopt text-page-title on auth CardTitles and dashboard empty state

Migrates 8 sites using text-2xl as primary route titles to text-page-title.
Preserves existing font-semibold weight explicitly (text-page-title bakes
fontWeight 700; CardTitle/h2 sites use 600). Accepts a minor letter-spacing
tightening (-0.025em ≈ 0.6px at 24px) as part of the design system convention.

Part of Wave 2 token adoption (PR 2/6).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin refactor/wave2-text-page-title-adoption
gh pr create --title "refactor(tokens): adopt text-page-title on 8 title sites (Wave 2 PR 2/6)" --body "$(cat <<'EOF'
## Summary

Converts 8 `text-2xl` sites to `text-page-title` (auth form CardTitles + dashboard empty-state h2). PR 2 of 6 in Wave 2 typography adoption.

**Weight preserved** via explicit `font-semibold` (token bakes 700; CardTitle defaults to 600).
**Letter-spacing delta accepted** (~0.6px tightening at 24px) as the design-system page-title convention.

7 `text-2xl` sites skipped (emojis, inline editors, amount inputs) — see spec.

## Test plan

- [x] `pnpm lint` clean
- [x] `pnpm test:run` green
- [x] Visual spot-check: `/auth/login`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/update-password`, dashboard empty state

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Task 3: PR 3 — Finish `text-section-heading` migration (~8 sites, + `text-xl` audit)

**Primary conversion candidates:**
- `components/settings/api-keys-section.tsx:58` (`<h3>`)
- `components/habits/habits-page-content.tsx:108` (`<p>` error title)
- `components/fitness/routines/routines-page-content.tsx:157` (`<h3>`)
- `components/fitness/workout-logger/workout-add-exercise.tsx:109` (`<h3>`)
- `components/money/csv-import/csv-result-step.tsx:34` (`<p>`)
- `components/fitness/exercise-library/exercise-library.tsx:164` (`<h3>`)
- `components/dashboard/dashboard-content.tsx:283` (`<p>` error title)
- `components/tasks/tasks-page-content.tsx:243` (`<p>` error title)

**Skip list** (leave as `text-lg`):
- `components/money/spending-donut.tsx:102` (`tabular-nums` stat)
- `components/money/budget-summary-card.tsx:44` (`tabular-nums` stat)
- `components/fitness/workout-history/workout-detail-view.tsx:95` (stat value)
- `components/fitness/workout-logger/workout-finish-dialog.tsx:143, 149, 153, 157` (stat numbers)
- `components/money/net-worth-summary.tsx:86, 92` (`tabular-nums`)
- `components/layouts/sidebar-layout.tsx:74` (`font-display` logo)
- `components/auth-branding.tsx:5` (`font-display` logo)
- `components/journal/journal-widget.tsx:99` (emoji)
- `components/journal/journal-timeline-card.tsx:46` (emoji)
- `components/journal/journal-on-this-day-full.tsx:75` (emoji)

**Branch:** `refactor/wave2-text-section-heading-adoption`

**Weight preservation rule:** `text-section-heading` bakes `fontWeight: 600`. Sites using `font-medium` (500) must keep `font-medium` explicit. Sites using `font-semibold` may drop the class (token supplies 600).

- [ ] **Step 1: Pull main, branch**

```bash
git checkout main
git pull
git checkout -b refactor/wave2-text-section-heading-adoption
```

- [ ] **Step 2: Re-audit**

```bash
rg '\btext-lg\b' components/ app/ -g '*.tsx' --glob '!**/components/ui/**' --glob '!**/.claude/**' -n
```

Cross-reference with the candidate and skip lists above. Note any drift.

- [ ] **Step 3: Convert `components/settings/api-keys-section.tsx:58`**

```diff
-          <h3 className="text-lg font-medium">{t("title")}</h3>
+          <h3 className="text-section-heading font-medium">{t("title")}</h3>
```

- [ ] **Step 4: Convert `components/habits/habits-page-content.tsx:108`**

```diff
-        <p className="text-lg font-medium text-destructive">
+        <p className="text-section-heading font-medium text-destructive">
```

- [ ] **Step 5: Convert `components/fitness/routines/routines-page-content.tsx:157`**

```diff
-          <h3 className="text-lg font-medium">{t("emptyTitle")}</h3>
+          <h3 className="text-section-heading font-medium">{t("emptyTitle")}</h3>
```

- [ ] **Step 6: Convert `components/fitness/workout-logger/workout-add-exercise.tsx:109`**

```diff
-              <h3 className="text-lg font-medium">{t("noResults")}</h3>
+              <h3 className="text-section-heading font-medium">{t("noResults")}</h3>
```

- [ ] **Step 7: Convert `components/money/csv-import/csv-result-step.tsx:34`**

```diff
-          <p className="text-lg font-medium">
+          <p className="text-section-heading font-medium">
```

- [ ] **Step 8: Convert `components/fitness/exercise-library/exercise-library.tsx:164`**

```diff
-          <h3 className="text-lg font-medium">{t("noResults")}</h3>
+          <h3 className="text-section-heading font-medium">{t("noResults")}</h3>
```

- [ ] **Step 9: Convert `components/dashboard/dashboard-content.tsx:283`**

```diff
-        <p className="text-lg font-medium text-destructive">
+        <p className="text-section-heading font-medium text-destructive">
```

- [ ] **Step 10: Convert `components/tasks/tasks-page-content.tsx:243`**

```diff
-        <p className="text-lg font-medium text-destructive">
+        <p className="text-section-heading font-medium text-destructive">
```

- [ ] **Step 11: Audit `text-xl` (6 sites)**

```bash
rg '\btext-xl\b' components/ app/ -g '*.tsx' --glob '!**/components/ui/**' --glob '!**/.claude/**' -n
```

Review each. Expected outcome: all 6 skip (logo `components/navbar.tsx`, hero text `components/hero.tsx`, brand elements). If any qualifies as a section heading by the decision rule, convert it here — otherwise leave with no action and document the decision in the PR description.

- [ ] **Step 12: Lint + test**

```bash
pnpm lint
pnpm test:run
```

Expected: clean, green.

- [ ] **Step 13: Visual spot-check**

```bash
pnpm dev
```

Open (in this order) and confirm section headings/error states render correctly:
- Dashboard error state (force by breaking a fetch in devtools Network tab offline mode)
- Tasks error state
- Habits error state
- `http://localhost:3000/settings` (API keys section)
- Routines empty state, workout add-exercise empty state, exercise library no-results
- CSV import success view

Stop dev server.

- [ ] **Step 14: Commit, push, PR**

```bash
git add components/ app/
git commit -m "$(cat <<'EOF'
refactor(tokens): adopt text-section-heading on section/error/empty headings

Migrates 8 text-lg sites (section h3s, error-state titles, empty-state
headings) to text-section-heading. Preserves font-medium explicitly to
avoid weight shift against the token's baked fontWeight 600.

6 text-xl sites audited; none qualified for conversion (logos, hero, brand).

Part of Wave 2 token adoption (PR 3/6).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin refactor/wave2-text-section-heading-adoption
gh pr create --title "refactor(tokens): adopt text-section-heading (Wave 2 PR 3/6)" --body "$(cat <<'EOF'
## Summary

Converts 8 `text-lg` section/error/empty-state headings to `text-section-heading`. PR 3 of 6 in Wave 2 typography adoption.

**Weight preserved** via explicit `font-medium` (token bakes 600; sites use 500).
Zero visual change by design (1.125rem ≡ 1.125rem, weight preserved).

Skipped: `tabular-nums` stat displays, `font-display` logos, emoji/icon spans, `workout-finish-dialog` stat numbers.

6 `text-xl` sites audited separately — none qualified (logo/hero/brand).

## Test plan

- [x] `pnpm lint` clean
- [x] `pnpm test:run` green
- [x] Visual spot-check: dashboard/tasks/habits error states, settings, routines/exercise-library/workout-add empty states, CSV import

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Task 4: PR 4 — `text-sm` → `text-body` (~306 sites across ~145 files)

**Strategy:** Batch by domain. Same decision rule throughout. Every site gets a read — **no `replace_all` across the whole codebase**.

**Decision rule — convert if:** element renders paragraph/description/card body text (`<p>`, `<div>`, `<span>` presenting sentences or readable lists). `text-sm text-muted-foreground` still qualifies; color is orthogonal to semantics.

**Skip if:**
- `<AvatarFallback className="text-sm">` and similar shadcn-primitive children
- Custom control surfaces where `text-sm` sizes a clickable affordance (toolbar chips, inline selectors, command-bar items)
- `<FormDescription>` / `<FormMessage>` children already managed by shadcn form wrappers (these already use `text-sm` via the shadcn default)
- Tabular / numeric readouts where `text-sm` is chosen for monospace alignment

**Branch:** `refactor/wave2-text-body-adoption`

- [ ] **Step 1: Pull main, branch**

```bash
git checkout main
git pull
git checkout -b refactor/wave2-text-body-adoption
```

- [ ] **Step 2: Domain inventory**

```bash
rg '\btext-sm\b' components/ app/ -g '*.tsx' --glob '!**/components/ui/**' --glob '!**/.claude/**' -c | sort -t: -k2 -rn
```

Expected ~145 files, ~306 sites. Record the per-file count. Process domains in this order (largest first for motivation): `dashboard/`, `money/`, `tasks/`, `habits/`, `fitness/`, `journal/`, `calendar/`, `chat/`, `projects/`, `admin/`, `kanban/`, `settings/`, `layouts/`, top-level components, `app/`.

- [ ] **Step 3: Process domain `components/dashboard/`**

List sites:
```bash
rg '\btext-sm\b' components/dashboard/ -g '*.tsx' -n
```

For each line: open the file, read the surrounding element, apply the decision rule, convert or skip. Convert via Edit:
```
old: text-sm
new: text-body
```
Use a unique `old_string` per edit (include enough context to disambiguate) or `replace_all: true` **only within a single file** where every occurrence in that file has already been reviewed and qualifies.

Quick spot-check after domain:
```bash
rg '\btext-sm\b' components/dashboard/ -g '*.tsx' -c | awk -F: '{s+=$2} END {print s" remaining (expected: the skip sites you identified)"}'
pnpm lint --quiet
```

- [ ] **Step 4: Process domain `components/money/`**

Same pattern as Step 3.

- [ ] **Step 5: Process domain `components/tasks/`**

Same pattern.

- [ ] **Step 6: Process domain `components/habits/`**

Same pattern.

- [ ] **Step 7: Process domain `components/fitness/`**

Same pattern.

- [ ] **Step 8: Process domain `components/journal/`**

Same pattern.

- [ ] **Step 9: Process domain `components/calendar/`**

Same pattern.

- [ ] **Step 10: Process domain `components/chat/`**

Same pattern.

- [ ] **Step 11: Process remaining domains**

`components/projects/`, `components/admin/`, `components/kanban/`, `components/settings/`, `components/layouts/`, top-level `components/*.tsx`, `app/**/*.tsx`. Same pattern.

- [ ] **Step 12: Full lint + test**

```bash
pnpm lint
pnpm test:run
```

Expected: clean, green. If a unit test asserts `text-sm` in one of the converted files, update the assertion to `text-body`.

- [ ] **Step 13: Verify no unintended changes elsewhere**

```bash
git diff --stat
git diff -- 'components/ui/**' 'tests/**' 'e2e/**'
```

Expected: no matches (these paths are excluded).

- [ ] **Step 14: Commit, push, PR**

```bash
git add components/ app/
git commit -m "$(cat <<'EOF'
refactor(tokens): adopt text-body across ~XX sites

Migrates text-sm → text-body on body/description/paragraph content across
all domains except components/ui/, tests, e2e, and worktrees. Zero visual
change: text-body and text-sm both resolve to 0.875rem with no baked
weight/spacing in the token.

Skipped: shadcn primitive children (AvatarFallback, FormDescription,
FormMessage), custom control surfaces with intentional text-sm sizing,
tabular-nums monospace readouts.

Part of Wave 2 token adoption (PR 4/6).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin refactor/wave2-text-body-adoption
gh pr create --title "refactor(tokens): adopt text-body across body-text sites (Wave 2 PR 4/6)" --body "$(cat <<'EOF'
## Summary

Converts ~XX of 306 `text-sm` sites across all domains to `text-body`. PR 4 of 6 in Wave 2 typography adoption.

**Zero visual change** by construction — `text-body` = `text-sm` = 0.875rem. Token bakes no weight or letter-spacing.

Batch processed by domain: dashboard, money, tasks, habits, fitness, journal, calendar, chat, projects, admin, kanban, settings, layouts, top-level, app.

Skipped: shadcn primitive children, custom control surfaces, `tabular-nums` monospace readouts.

## Test plan

- [x] `pnpm lint` clean
- [x] `pnpm test:run` green
- [x] `git diff -- 'components/ui/**' 'tests/**' 'e2e/**'` empty (excluded paths untouched)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

(Update `~XX` in commit/PR body with the actual converted count when committing.)

---

## Task 5: PR 5 — `text-xs` → `text-caption` (~216 sites across ~91 files)

**Decision rule — convert if:** element is metadata, timestamp, helper/caption text, small field label, badge-like annotation, or the "label" half of a label/value pair (where the value is `text-sm`/`text-body`).

**Skip if:** shadcn `Badge` children, shadcn tooltip internals.

**Branch:** `refactor/wave2-text-caption-adoption`

**Depends on PR 1 being merged** (otherwise `text-caption` is still 13px and this PR would create a visual regression).

- [ ] **Step 1: Pull main (after PR 1 merged), branch**

```bash
git checkout main
git pull
git checkout -b refactor/wave2-text-caption-adoption
```

- [ ] **Step 2: Confirm PR 1 landed**

```bash
grep -n 'font-size-caption' app/globals.css
```

Expected: line contains `0.75rem` (not `0.8125rem`). If you see `0.8125rem`, PR 1 has not merged yet — stop, wait for it.

- [ ] **Step 3: Domain inventory**

```bash
rg '\btext-xs\b' components/ app/ -g '*.tsx' --glob '!**/components/ui/**' --glob '!**/.claude/**' -c | sort -t: -k2 -rn
```

Expected ~91 files, ~216 sites.

- [ ] **Step 4: Process each domain in the same order as Task 4**

For each domain, list sites, read each, apply the decision rule, convert via Edit. Same discipline — no blanket `replace_all` across the codebase.

Domains: dashboard, money, tasks, habits, fitness, journal, calendar, chat, projects, admin, kanban, settings, layouts, top-level, app.

- [ ] **Step 5: Full lint + test**

```bash
pnpm lint
pnpm test:run
```

- [ ] **Step 6: Verify excluded paths untouched**

```bash
git diff -- 'components/ui/**' 'tests/**' 'e2e/**'
```

Expected: empty.

- [ ] **Step 7: Commit, push, PR**

```bash
git add components/ app/
git commit -m "$(cat <<'EOF'
refactor(tokens): adopt text-caption across ~XX sites

Migrates text-xs → text-caption on metadata, timestamps, helper text,
captions, and small labels. Depends on PR #XXX (text-caption value
alignment to 0.75rem). Zero visual change — text-caption now equals
text-xs (both 0.75rem) and the token bakes no weight/spacing.

Skipped: shadcn Badge children and tooltip internals.

Part of Wave 2 token adoption (PR 5/6).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin refactor/wave2-text-caption-adoption
gh pr create --title "refactor(tokens): adopt text-caption across caption-text sites (Wave 2 PR 5/6)" --body "$(cat <<'EOF'
## Summary

Converts ~XX of 216 `text-xs` sites across all domains to `text-caption`. PR 5 of 6 in Wave 2 typography adoption.

Depends on PR #XXX (text-caption value aligned to 0.75rem). **Zero visual change** — `text-caption` now equals `text-xs` (both 0.75rem).

Skipped: shadcn `Badge` children, tooltip internals.

## Test plan

- [x] PR 1 (caption value alignment) is merged — verified via `grep font-size-caption app/globals.css`
- [x] `pnpm lint` clean
- [x] `pnpm test:run` green
- [x] Excluded paths untouched

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Task 6: PR 6 — Border-radius leftover audit (13 sites)

**Files to audit (from initial scan):**
- 8 sites using `rounded` (default → Tailwind `rounded-md` = `calc(var(--radius) - 2px)` = same value as `rounded-control`)
- 3 sites using `rounded-sm` (= same value as `rounded-chip`)
- 2 sites using `rounded-2xl` (no matching token; `rounded-card` is smaller — keep hardcoded with a comment)

**Branch:** `refactor/wave2-rounded-leftover-audit`

- [ ] **Step 1: Pull main, branch**

```bash
git checkout main
git pull
git checkout -b refactor/wave2-rounded-leftover-audit
```

- [ ] **Step 2: List all 13 sites**

```bash
echo "--- rounded (default) ---"
rg 'className=\"[^\"]*\brounded\b[^\"-]' components/ app/ -g '*.tsx' --glob '!**/components/ui/**' --glob '!**/.claude/**' -n
echo "--- rounded-sm ---"
rg '\brounded-sm\b' components/ app/ -g '*.tsx' --glob '!**/components/ui/**' --glob '!**/.claude/**' -n
echo "--- rounded-2xl ---"
rg '\brounded-2xl\b' components/ app/ -g '*.tsx' --glob '!**/components/ui/**' --glob '!**/.claude/**' -n
```

Record the actual file:line list for your PR description.

- [ ] **Step 3: Convert `rounded` → `rounded-control` (8 sites)**

For each site: open file, read context, apply Edit:
```
old: rounded (with surrounding context)
new: rounded-control
```

The value is identical (both `calc(var(--radius) - 2px)`), so zero visual change. If a site is clearly intentional (e.g., inline `code` styling where `rounded` reads naturally), leave it and add a one-line comment: `{/* intentional: matches prose code style */}`.

- [ ] **Step 4: Convert `rounded-sm` → `rounded-chip` (3 sites)**

Same pattern. Values identical (both `calc(var(--radius) - 4px)`).

- [ ] **Step 5: Document `rounded-2xl` decisions (2 sites)**

`rounded-2xl` = 1rem = 16px. `rounded-card` = `var(--radius)` = 0.75rem = 12px. The 2xl radius has no matching token. For each of the 2 sites, add a one-line comment explaining the intentional choice:
```diff
-    <div className="rounded-2xl ...">
+    <div className="rounded-2xl ..."> {/* intentional: needs larger radius than rounded-card */}
```

Do NOT introduce a new token for this — the spec's non-goal is "Adding new tokens".

- [ ] **Step 6: Lint + test**

```bash
pnpm lint
pnpm test:run
```

- [ ] **Step 7: Verify the audit is complete**

```bash
rg '\brounded(-sm|-2xl)?\b' components/ app/ -g '*.tsx' --glob '!**/components/ui/**' --glob '!**/.claude/**' | grep -v 'intentional:'
```

Expected: no output. Every remaining hardcoded `rounded`/`rounded-sm`/`rounded-2xl` should either have been migrated to a token or carry an `intentional:` comment.

- [ ] **Step 8: Commit, push, PR**

```bash
git add components/ app/
git commit -m "$(cat <<'EOF'
refactor(tokens): audit and close remaining hardcoded rounded-* sites

Migrates rounded → rounded-control (8 sites) and rounded-sm → rounded-chip
(3 sites) — identical values, zero visual change. 2 rounded-2xl sites
documented as intentional (no matching token; larger than rounded-card).

Closes the Wave 2 border-radius token adoption effort.

Part of Wave 2 token adoption (PR 6/6 — final).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push -u origin refactor/wave2-rounded-leftover-audit
gh pr create --title "refactor(tokens): close 13 rounded-* leftovers (Wave 2 PR 6/6 — final)" --body "$(cat <<'EOF'
## Summary

Final PR in the Wave 2 token adoption sweep. Audits the 13 hardcoded `rounded-*` sites outside `components/ui/`:

- 8 `rounded` → `rounded-control` (identical value)
- 3 `rounded-sm` → `rounded-chip` (identical value)
- 2 `rounded-2xl` kept with `intentional:` comment (no matching token; larger than `rounded-card`)

Zero visual change. Closes Wave 2.

## Test plan

- [x] `pnpm lint` clean
- [x] `pnpm test:run` green
- [x] Verification grep returns empty (every hardcoded site either migrated or commented)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 9: Close the Wave 2 task**

After PR 6 merges, toggle the source task to done via the betterrme MCP or UI:
- Task ID: `9869bbae-0095-4376-a2c2-45f3b488fc1e`
- Title: `[Wave 2] Refactor: Adopt font-size & border-radius design tokens`

---

## Self-Review Notes (done during plan authoring)

**Spec coverage:** Every spec PR (1 through 6) maps to a numbered Task. Weight-preservation rules from the spec are embedded in Tasks 2 and 3 at each conversion step. Border-radius taxonomy from the spec maps 1:1 to Task 6.

**Placeholder scan:** `~XX` in PR 4 and PR 5 commit/PR bodies is an explicit TBD-count placeholder that must be filled in at commit time — this is acceptable because the actual count depends on how many skip-list sites the engineer identifies in real time. No other placeholders.

**Type consistency:** No new types or function signatures are introduced — this is a pure className migration. Token names (`text-page-title`, `text-section-heading`, `text-body`, `text-caption`, `text-stat`, `rounded-card`, `rounded-control`, `rounded-chip`, `rounded-pill`) are used identically wherever referenced.

**Branch / commit discipline:** Every PR has its own branch off `main`. Spec + plan committed with PR 1 (matches prior Wave 2 PR #450 precedent).

**CLAUDE.md compliance:** `components/ui/`, `tests/`, `e2e/`, and `.claude/worktrees/` excluded on every migration step. Feature branches only, PR-based workflow, `pnpm lint` + `pnpm test:run` at every task. Co-authored-by line on every commit.
