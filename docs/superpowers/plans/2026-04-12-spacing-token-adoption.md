# Spacing Design Token Adoption — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the spacing token system (4 existing + 5 new tokens) and adopt it across all component files, replacing hardcoded Tailwind spacing values with semantic tokens.

**Architecture:** CSS variables defined in `globals.css`, mapped through `tailwind.config.ts` `theme.extend.spacing`, consumed as Tailwind utility classes in `.tsx` files. Migration is token-by-token — each task replaces one token type across the entire codebase.

**Tech Stack:** Tailwind CSS 3, CSS custom properties, Next.js App Router

**Spec:** `docs/superpowers/specs/2026-04-12-spacing-token-adoption-design.md`

---

## File Structure

**Modified files:**
- `app/globals.css` — add 5 new CSS variable definitions
- `tailwind.config.ts` — add 5 new spacing entries
- ~40-50 `.tsx` files under `components/` and `app/` (excluding `components/ui/`)

**No new files created** — this is purely a migration of existing code.

---

## Task 1: Define New Spacing Tokens

**Files:**
- Modify: `app/globals.css:169-173`
- Modify: `tailwind.config.ts:161-166`

- [ ] **Step 1: Add CSS variables to globals.css**

In `app/globals.css`, find the `/* === Spacing === */` section and replace it:

```css
    /* === Spacing === */
    --spacing-card-padding: 1.5rem;
    --spacing-page-padding: 2rem;
    --spacing-page-padding-top: 2.5rem;
    --spacing-card-gap: 1rem;
    --spacing-section-gap: 1.5rem;
    --spacing-card-header-padding-x: 1rem;
    --spacing-card-header-padding-y: 0.75rem;
    --spacing-modal-padding: 1.5rem;
    --spacing-field-gap: 0.75rem;
```

- [ ] **Step 2: Add Tailwind spacing entries**

In `tailwind.config.ts`, find the `spacing` object inside `theme.extend` and replace it:

```ts
      spacing: {
        "card-padding": "var(--spacing-card-padding)",
        "page-padding": "var(--spacing-page-padding)",
        "page-padding-top": "var(--spacing-page-padding-top)",
        "card-gap": "var(--spacing-card-gap)",
        "section-gap": "var(--spacing-section-gap)",
        "card-header-padding-x": "var(--spacing-card-header-padding-x)",
        "card-header-padding-y": "var(--spacing-card-header-padding-y)",
        "modal-padding": "var(--spacing-modal-padding)",
        "field-gap": "var(--spacing-field-gap)",
      },
```

- [ ] **Step 3: Verify tokens are available**

Run: `pnpm build 2>&1 | head -5`

Expected: Build succeeds (exit 0). If Tailwind can't resolve the vars, the build will warn.

- [ ] **Step 4: Run lint**

Run: `pnpm lint --quiet`

Expected: No new lint errors.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css tailwind.config.ts
git commit -m "feat(tokens): add 5 new spacing design tokens

Add section-gap, card-header-padding-x/y, modal-padding, and field-gap
tokens to the design system for upcoming codebase-wide adoption."
```

---

## Task 2: Migrate `card-padding` Token

**Goal:** Replace hardcoded `p-4`, `p-5`, `p-6` with `p-card-padding` on card-like containers across all component files.

**Decision rule:** Replace if the element is a card container — typically identified by classes like `bg-background rounded-lg border shadow-sm`, `CardContent`, or similar top-level content wrappers. Do NOT replace padding on buttons, inputs, badges, inline elements, or intentionally compact/large sections.

**Scope:** All `.tsx` files under `components/` and `app/` except `components/ui/`.

- [ ] **Step 1: Find all card-padding candidates**

Search for card containers with hardcoded padding. Focus on elements that have card-like styling (`bg-background`, `rounded-lg`, `border`, `shadow-sm`) combined with `p-4`, `p-5`, or `p-6`.

```bash
# Find card containers with hardcoded padding
grep -rn "p-[456].*rounded" components/ app/ --include="*.tsx" | grep -v "components/ui/"
grep -rn "rounded.*p-[456]" components/ app/ --include="*.tsx" | grep -v "components/ui/"
grep -rn "CardContent.*p-[456]\|p-[456].*CardContent" components/ app/ --include="*.tsx" | grep -v "components/ui/"
```

Review each result and determine if it's a card container. Common patterns:

**YES — replace these:**
```tsx
// Card body padding
<div className="bg-background rounded-lg border p-4 shadow-sm">
<div className="p-6 space-y-4">  {/* inside a Card component */}
<CardContent className="p-6">
```

**NO — leave these alone:**
```tsx
// Button/input padding
<button className="p-4 rounded-md">
// Compact inner sections
<div className="p-4 bg-muted/50 rounded-md">  {/* small inset, not a card */}
// Responsive padding on page wrappers (handled in Task 5)
<div className="p-4 sm:p-6 lg:p-8">
```

- [ ] **Step 2: Replace card padding values**

For each confirmed card container, replace the padding class:
- `p-4` → `p-card-padding`
- `p-5` → `p-card-padding`
- `p-6` → `p-card-padding`
- `pt-6` on CardContent → `pt-card-padding`
- `px-4` + `py-4` on card bodies → `p-card-padding`

Example replacements:

```tsx
// Before (kanban-detail-modal.tsx:265)
<div className="p-4">
// After
<div className="p-card-padding">

// Before (budget-overview.tsx — CardContent)
<CardContent className="p-6">
// After
<CardContent className="p-card-padding">

// Before (task-detail-content.tsx — CardContent)
<CardContent className="pt-6">
// After
<CardContent className="pt-card-padding">
```

- [ ] **Step 3: Run lint and tests**

Run: `pnpm lint --quiet && pnpm test:run 2>&1 | tail -5`

Expected: No new lint errors. All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(tokens): adopt card-padding token across components

Replace hardcoded p-4/p-5/p-6 with p-card-padding on card containers.
Normalizes card padding to 1.5rem (24px) across all domains."
```

---

## Task 3: Migrate `card-gap` Token

**Goal:** Replace hardcoded `gap-4`, `gap-3`, `space-y-4`, `space-y-3` with `gap-card-gap` between card-level sibling elements.

**Decision rule:** Replace if the spacing is between sibling cards or card-like blocks. Do NOT replace gaps inside cards (e.g., between a label and value), or grid gaps for non-card layouts (e.g., a 2-column form grid).

**Important:** Converting `space-y-*` to `gap-card-gap` requires the parent to use `flex flex-col` layout. If the parent already uses `flex flex-col`, just change the gap. If it uses `space-y-*` without flex, convert:
```tsx
// Before
<div className="space-y-4">
// After
<div className="flex flex-col gap-card-gap">
```

Verify no children rely on margin-based styling before converting.

- [ ] **Step 1: Find all card-gap candidates**

```bash
# gap between cards
grep -rn "gap-[34]" components/ app/ --include="*.tsx" | grep -v "components/ui/" | grep -v "gap-card-gap"
# space-y between cards
grep -rn "space-y-[34]" components/ app/ --include="*.tsx" | grep -v "components/ui/"
```

**YES — replace these:**
```tsx
// Card grid gaps
<div className="grid grid-cols-2 gap-4">  {/* cards in a grid */}
// Stacked cards
<div className="space-y-4">  {/* card, card, card */}
<div className="flex flex-col gap-4">  {/* card list */}
```

**NO — leave these alone:**
```tsx
// Inside a card (label + value spacing)
<div className="space-y-3">  {/* form fields — handled in Task 6 */}
// Non-card grid items
<div className="grid grid-cols-3 gap-3">  {/* stat boxes, not cards */}
```

- [ ] **Step 2: Replace card gap values**

For each confirmed card gap:
- `gap-4` → `gap-card-gap`
- `gap-3` → `gap-card-gap` (if between cards; normalize to token value)
- `space-y-4` → convert parent to `flex flex-col gap-card-gap`
- `space-y-3` → convert parent to `flex flex-col gap-card-gap` (if between cards)

- [ ] **Step 3: Run lint and tests**

Run: `pnpm lint --quiet && pnpm test:run 2>&1 | tail -5`

Expected: No new lint errors. All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(tokens): adopt card-gap token across components

Replace hardcoded gap-4/gap-3/space-y-4 with gap-card-gap between card
elements. Converts space-y patterns to flex+gap where needed."
```

---

## Task 4: Migrate `card-header-padding-x/y` Tokens

**Goal:** Replace hardcoded `px-4 py-3` on card header bars with `px-card-header-padding-x py-card-header-padding-y`.

**Decision rule:** Replace if the element is a card header — identified by: sits at the top of a card, contains a heading (`h3`, `h4`), typically has `border-b`, and uses `px-4 py-3` or similar.

- [ ] **Step 1: Find all card header candidates**

```bash
grep -rn "px-4 py-3" components/ app/ --include="*.tsx" | grep -v "components/ui/"
grep -rn "px-4 py-2" components/ app/ --include="*.tsx" | grep -v "components/ui/"
```

The canonical pattern is:
```tsx
<div className="flex items-center justify-between px-4 py-3 border-b">
  <h3 className="text-base font-semibold">{title}</h3>
</div>
```

- [ ] **Step 2: Replace card header padding**

For each confirmed card header:
- `px-4` → `px-card-header-padding-x`
- `py-3` → `py-card-header-padding-y`
- `py-2.5` → `py-card-header-padding-y` (normalize to token)

Example:
```tsx
// Before (kanban-detail-modal.tsx:260)
<div className="flex items-center justify-between px-4 py-3 border-b">
// After
<div className="flex items-center justify-between px-card-header-padding-x py-card-header-padding-y border-b">
```

- [ ] **Step 3: Run lint and tests**

Run: `pnpm lint --quiet && pnpm test:run 2>&1 | tail -5`

Expected: No new lint errors. All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(tokens): adopt card-header-padding tokens across components

Replace hardcoded px-4 py-3 on card header bars with
px-card-header-padding-x py-card-header-padding-y tokens."
```

---

## Task 5: Migrate `page-padding` and `page-padding-top` Tokens

**Goal:** Replace hardcoded `px-6`, `px-8`, `p-8` on page-level containers with `px-page-padding`, and `pt-6`/`pt-8`/`pt-10` on page content tops with `pt-page-padding-top`.

**Decision rule:** Replace if the element is a page-level wrapper — the outermost content container within a route, or a layout shell. For responsive padding progressions (e.g., `p-4 sm:p-6 lg:p-8`), collapse to the single token if the intent is "page-level padding."

- [ ] **Step 1: Find all page-padding candidates**

```bash
# Page-level horizontal padding
grep -rn "px-[678]" components/ app/ --include="*.tsx" | grep -v "components/ui/"
# Page-level top padding
grep -rn "pt-[6-9]\|pt-10\|pt-page" components/ app/ --include="*.tsx" | grep -v "components/ui/"
# Responsive page padding patterns
grep -rn "p-4 sm:p-6\|p-4 md:p-6\|sm:p-8\|lg:p-8" components/ app/ --include="*.tsx" | grep -v "components/ui/"
```

**YES — replace these:**
```tsx
// Page wrapper padding
<div className="px-6 py-8">  {/* page shell */}
// Responsive page padding
<main className="p-4 sm:p-6 lg:p-8">  {/* → p-page-padding */}
// Page top spacing
<div className="pt-8">  {/* page content top */}
```

**NO — leave these alone:**
```tsx
// Modal padding (handled in Task 6)
<DialogContent className="px-6">
// Board header padding (specific to kanban layout)
<div className="px-4 py-3 border-b">  {/* card header, not page */}
```

- [ ] **Step 2: Replace page padding values**

- `px-6` / `px-8` → `px-page-padding` (on page wrappers)
- `pt-6` / `pt-8` / `pt-10` → `pt-page-padding-top` (on page content tops)
- `p-4 sm:p-6 lg:p-8` → `p-page-padding` (collapse responsive if same intent)

- [ ] **Step 3: Run lint and tests**

Run: `pnpm lint --quiet && pnpm test:run 2>&1 | tail -5`

Expected: No new lint errors. All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(tokens): adopt page-padding and page-padding-top tokens

Replace hardcoded px-6/px-8 on page wrappers with px-page-padding and
pt-6/pt-8/pt-10 on page tops with pt-page-padding-top."
```

---

## Task 6: Migrate `modal-padding`, `section-gap`, and `field-gap` Tokens

**Goal:** Replace remaining hardcoded spacing with the three remaining tokens.

### 6a: `modal-padding`

**Decision rule:** Replace `p-5`, `p-6`, `px-6` inside `DialogContent`, `Dialog`, modal wrappers.

- [ ] **Step 1: Find modal padding candidates**

```bash
grep -rn "DialogContent\|modal\|Modal" components/ app/ --include="*.tsx" | grep -v "components/ui/" | head -30
```

Then check those files for hardcoded padding inside modal content areas.

- [ ] **Step 2: Replace modal padding**

- `p-5` / `p-6` inside modal content → `p-modal-padding`
- `px-6` on modal headers/footers → `px-modal-padding`

Example:
```tsx
// Before (kanban-detail-modal.tsx:220)
<div className="bg-background border-b px-6 pt-5 pb-4 flex-shrink-0">
// After
<div className="bg-background border-b px-modal-padding pt-5 pb-4 flex-shrink-0">

// Before (kanban-detail-modal.tsx:257)
<div className="flex-[3] p-5 flex flex-col gap-4 overflow-y-auto">
// After
<div className="flex-[3] p-modal-padding flex flex-col gap-4 overflow-y-auto">
```

### 6b: `section-gap`

**Decision rule:** Replace `space-y-6`, `gap-6` between major page sections (not between cards — that's `card-gap`). Major sections are visually distinct blocks separated by larger gaps.

- [ ] **Step 3: Find section-gap candidates**

```bash
grep -rn "space-y-6\|gap-6\|space-y-8" components/ app/ --include="*.tsx" | grep -v "components/ui/"
```

- [ ] **Step 4: Replace section gaps**

- `space-y-6` → convert to `flex flex-col gap-section-gap`
- `gap-6` → `gap-section-gap`

### 6c: `field-gap`

**Decision rule:** Replace `gap-3`, `space-y-3` between form field rows. Typically inside `<form>` elements or field groups with labels + inputs.

- [ ] **Step 5: Find field-gap candidates**

```bash
grep -rn "space-y-3\|gap-3" components/ app/ --include="*.tsx" | grep -v "components/ui/"
```

Review each — only replace if it's between form fields, not between other types of elements.

- [ ] **Step 6: Replace field gaps**

- `space-y-3` → convert to `flex flex-col gap-field-gap`
- `gap-3` → `gap-field-gap`

### Finalize

- [ ] **Step 7: Run lint and tests**

Run: `pnpm lint --quiet && pnpm test:run 2>&1 | tail -5`

Expected: No new lint errors. All existing tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(tokens): adopt modal-padding, section-gap, and field-gap tokens

Complete the spacing token migration with the remaining three tokens.
Replaces hardcoded modal padding, section spacing, and form field gaps."
```

---

## PR Strategy

Each task maps to one PR:
- **Task 1** → PR: "feat(tokens): add 5 new spacing design tokens"
- **Task 2** → PR: "refactor(tokens): adopt card-padding token"
- **Task 3** → PR: "refactor(tokens): adopt card-gap token"
- **Task 4** → PR: "refactor(tokens): adopt card-header-padding tokens"
- **Task 5** → PR: "refactor(tokens): adopt page-padding tokens"
- **Task 6** → PR: "refactor(tokens): adopt modal-padding, section-gap, field-gap tokens"

Create and merge each PR sequentially. Visual verification recommended after each merge — check affected pages in the browser or via Playwright screenshots.
