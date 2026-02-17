# Phase 4: Page Header & Content Layout - Research

**Researched:** 2026-02-16
**Domain:** Reusable page header component + content layout system (spacing, typography, max-width centering)
**Confidence:** HIGH

## Summary

This research extracts exact CSS values from Chameleon's live dashboard (app.chameleon.io/home) using Playwright, maps them against BetterR.Me's existing Phase 1 design tokens, inventories every page that needs a consistent PageHeader, and recommends a component API and content layout wrapper. The existing codebase has ad-hoc page headers with inconsistent typography and spacing across dashboard, habits, tasks, and settings pages. This phase creates two reusable primitives -- `PageHeader` and `ContentLayout` -- plus updates the content wrapper in `SidebarLayout` to match Chameleon's generous padding and max-width behavior.

The Chameleon home page uses a clear pattern: a content container with `padding: 40px 32px 0` and `max-width: 100%` (fluid), a flex-column layout with 16px vertical gaps between sections, and a header row with a greeting/title region on the left and action buttons on the right, wrapped in a card-like container with `padding: 24px 32px` and `border-radius: 12px`. Cards use `border-radius: 12px`, `border: 1px solid rgb(226,232,240)`, and `padding: 24px` internally. Section headings are 18px/700/28px line-height.

**Primary recommendation:** Create a `PageHeader` component (title + optional subtitle + optional action slot) and a `ContentLayout` wrapper, then update `SidebarLayout` to apply page-level padding and background color, so every authenticated page gets consistent Chameleon-matching layout with zero per-page boilerplate.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Match Chameleon's page header pattern exactly: title region on the left, action area on the right
- Chameleon reference shows: greeting/title + subtitle on the left, optional actions (search, CTA buttons) on the right
- PageHeader component must be flexible: accept title (required), subtitle (optional), and action slot (optional ReactNode)
- Title uses the largest content font size from Chameleon's typography scale
- Subtitle uses muted/secondary text color, smaller size
- Match Chameleon's generous, airy spacing pixel-for-pixel
- Extract exact padding, margin, and gap values from Chameleon's live dashboard
- Apply consistent vertical rhythm: header-to-content gap, card-to-card gaps, section spacing
- The app should feel like a premium SaaS dashboard, not a compact personal tool
- Extract Chameleon's max-width value for the content area
- Content should center horizontally within the available space on ultra-wide screens (1920px+)
- When sidebar collapses/expands, content area should respond fluidly (not jump)
- Side gutters match Chameleon's padding values
- Make mobile experience as good as possible
- Header should stack gracefully: title/subtitle on top, actions below on narrow screens
- Reduce spacing proportionally on mobile (not just raw desktop values)
- Ensure touch-friendly action button sizes
- Extract Chameleon's exact font sizes, weights, and line heights
- Establish hierarchy: page title > section header > card title > body text
- Use the design tokens already established in Phase 1

### Claude's Discretion
- All specific pixel values (researcher will extract from Chameleon)
- Exact breakpoint thresholds for responsive behavior
- Component API design (props, slots, composition pattern)
- Whether to use CSS Grid vs Flexbox for the content layout
- Loading/skeleton states for the PageHeader
- Mobile spacing ratios

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VISL-03 | Every page has a consistent page header (title, optional subtitle, primary action button) | PageHeader component API design, inventory of all 10+ pages needing headers, exact Chameleon header CSS values extracted |
| VISL-04 | Typography, padding, margins, font sizes, border radius, and spacing match Chameleon's dashboard CSS values (pixel-perfect) | Full CSS extraction from Chameleon via Playwright: page title 24px/700, section heading 18px/700, body 14px, card padding 24px, page padding 40px/32px, border-radius 12px, card gap 16px |
| VISL-05 | Content area has a max-width with centering on ultra-wide screens | Chameleon uses max-width: 100% (fluid) with side gutters of 32px; recommend adding max-width: 1400px with mx-auto for ultra-wide centering per success criteria |
</phase_requirements>

---

## Chameleon CSS Extraction (Playwright-Verified)

### Page-Level Container
**Source:** Live extraction from `app.chameleon.io/home` on 2026-02-16
**Confidence:** HIGH (direct DOM measurement)

```
Container: .tw-container.tw-max-w-full.tw-mx-auto.tw-py-10.tw-px-8
  max-width: 100% (fluid, fills available space)
  padding-top: 40px (tw-py-10 = 2.5rem)
  padding-left: 32px (tw-px-8 = 2rem)
  padding-right: 32px
  padding-bottom: 0px
  margin: 0 auto

Sidebar width: 224px (computed on Chameleon's nav)
Content width at 1705px viewport: 1466px (= viewport - sidebar - scrollbar)
Body background: rgb(255,255,255) (white)
```

### Page Header Row
```
Outer wrapper: bg-grid tw-rounded-xl tw-mb-4
  background-color: rgb(248, 250, 252) -- slate-50, subtle gray card
  margin-bottom: 16px
  border-radius: 12px

Inner flex row: tw-flex tw-justify-between tw-items-center
  display: flex
  flex-direction: row
  justify-content: space-between
  align-items: center
  padding: 24px 32px

Left side (greeting section):
  display: flex
  align-items: center
  flex: 1
  min-width: 0 (overflow protection)
  margin-right: 8px (tw-mr-2)

Right side (actions section):
  display: flex
  align-items: center
  flex: 1
  min-width: 605px (on wide screens)
  justify-content: flex-end
```

### Typography Values (Extracted)

| Element | Font Size | Font Weight | Line Height | Letter Spacing | Color (Light) | Font Family |
|---------|-----------|-------------|-------------|----------------|---------------|-------------|
| Page title (h1) | 24px | 700 | 32px | -0.6px | rgb(15,23,42) -- slate-900 | Satoshi |
| Subtitle (h3 "Welcome back!") | 18px | 600 | 24px | normal | rgb(100,116,139) -- slate-500 | Satoshi |
| Section heading (card h3) | 18px | 700 | 28px | normal | rgb(15,23,42) -- slate-900 | Satoshi |
| Body text | 14px | 400-600 | 20px | normal | varies | Satoshi |
| Caption/small text | 12px | 700 | 16px | normal | varies | Satoshi |
| CTA button text | 14px | 600 | 20px | normal | rgb(255,255,255) | Satoshi |

**Mapping to Phase 1 tokens:**
- Phase 1 `--font-size-page-title` is 1.75rem (28px) -- Chameleon measures 24px. **Needs update to 1.5rem (24px).**
- Phase 1 `--font-size-section-heading` is 1.125rem (18px) -- matches Chameleon.
- Phase 1 `--font-size-body` is 0.875rem (14px) -- matches Chameleon.
- Phase 1 `--font-size-caption` is 0.8125rem (13px) -- Chameleon's smallest is 12px. Could add a new token or keep 13px. Minor difference.
- Phase 1 `text-page-title` has `lineHeight: 1.2` and `fontWeight: 700`. Chameleon is 32px/24px = 1.333 line-height. **Needs update to `lineHeight: "1.33"`.**
- Phase 1 `text-page-title` doesn't include `letterSpacing: "-0.025em"`. **Should add.**

### Card Styling
```
Border: 1px solid rgb(226, 232, 240) -- slate-200
Border-radius: 12px
Background: rgb(255, 255, 255) -- white
Internal padding (section headers): 24px (tw-px-6 = 1.5rem)
Card header padding: 20px 24px 24px (top slightly less)
Section header row: flex, items-center, justify-between, full-width
```

### Vertical Spacing (Section-to-Section)
```
Header card -> Card row:       16px (tw-mb-4)
Card row -> Jump back card:    16px (tw-mb-4)
Jump back card -> Activity:    16px (tw-mb-4)
Card-to-card (horizontal):     16px (tw-mr-4 on first card in row)
```

**Key insight:** Chameleon uses a uniform 16px (1rem) vertical rhythm between all top-level sections. This is tighter than the current BetterR.Me `space-y-8` (32px). The generous feeling comes from the large container padding (40px top, 32px sides) and card internal padding (24px), not from section gaps.

### CTA Button
```
height: 36px
padding: 8px 16px
border-radius: 6px
font-size: 14px
font-weight: 600
background-color: rgb(24, 54, 46) -- dark teal-green (Chameleon brand)
color: white
```
Note: BetterR.Me uses its own `--primary` color for CTA buttons, not Chameleon's brand color. The button dimensions and typography are what matters.

---

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | 3.4.17 | Utility-first CSS | Already configured with design tokens |
| shadcn/ui | v3 | Component primitives | Already used for sidebar, cards, buttons |
| next-themes | -- | Dark mode | Already configured |
| Radix UI | unified | Accessible primitives | Already installed |

### Supporting (No New Dependencies)
No new libraries needed. This phase is pure component creation using existing Tailwind utilities and Phase 1 design tokens.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom PageHeader | shadcn PageHeader | shadcn doesn't have a PageHeader -- must hand-roll |
| CSS custom wrapper | tailwind-container-queries | Adds dependency for a problem solvable with standard media queries |

---

## Architecture Patterns

### Recommended Component Structure
```
components/
  layouts/
    sidebar-layout.tsx     # UPDATE: add page-level padding, bg-page, max-width
    sidebar-shell.tsx      # No changes needed
    app-sidebar.tsx        # No changes needed
    page-header.tsx        # NEW: reusable PageHeader component
    content-layout.tsx     # NEW: optional content width wrapper
```

### Pattern 1: PageHeader Component

**What:** A reusable flex-row component with title on the left, optional actions on the right.
**When to use:** Every authenticated page.
**Recommendation:** Use Flexbox (not Grid) to match Chameleon's implementation.

```tsx
// components/layouts/page-header.tsx
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn(
      "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
      className
    )}>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-page-title tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-section-heading font-semibold text-muted-foreground mt-1">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
```

**Key design decisions:**
- `flex-col` on mobile, `flex-row` on sm+ -- stacks title and actions vertically on narrow screens
- `min-w-0` on title area prevents long titles from pushing actions off-screen
- `shrink-0` on actions prevents button compression
- Uses Phase 1 tokens: `text-page-title`, `font-display`, `text-muted-foreground`
- No `tracking-[-0.6px]` utility exists in Tailwind by default -- recommend `tracking-tight` (-0.025em = -0.6px at 24px) which is close enough

### Pattern 2: SidebarLayout Content Wrapper Update

**What:** Update the content area in `sidebar-layout.tsx` to apply Chameleon-matching padding, background, and max-width.
**Current:** `<div className="flex-1 p-4 md:p-6">{children}</div>`
**Target:** Match Chameleon's `padding: 40px 32px 0` with `max-width` centering.

```tsx
// In sidebar-layout.tsx, replace the content wrapper:
<SidebarInset>
  <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
    <SidebarTrigger className="-ml-1" />
    <span className="font-display font-bold text-lg text-primary">BetterR.me</span>
  </header>
  <div className="flex-1 bg-page">
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 md:px-8 md:pt-10">
      {children}
    </div>
  </div>
</SidebarInset>
```

**Key values:**
- `bg-page` -- gray canvas background (Phase 1 token: `216 25% 97%`)
- `max-w-[1400px]` -- content centering on ultra-wide screens
- `mx-auto` -- horizontal centering
- Desktop: `px-8` (32px) and `pt-10` (40px) -- matches Chameleon exactly
- Tablet: `px-6` (24px) -- reduced side gutters
- Mobile: `px-4` (16px) and `py-6` (24px) -- compact but breathable
- No bottom padding (content scrolls to edge, like Chameleon)

### Pattern 3: PageHeader Skeleton

**What:** Loading state for the PageHeader component.

```tsx
export function PageHeaderSkeleton({
  hasSubtitle = false,
  hasActions = false,
}: {
  hasSubtitle?: boolean;
  hasActions?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        {hasSubtitle && <Skeleton className="h-5 w-64" />}
      </div>
      {hasActions && <Skeleton className="h-9 w-32" />}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Hardcoding padding in page components:** All page-level padding must come from the SidebarLayout wrapper, not from individual page components. Current pages have `p-4 md:p-6` in the layout -- this becomes the single source of truth.
- **Using `space-y-8` for section gaps:** Chameleon uses 16px (space-y-4), not 32px. The generous feel comes from container padding and card internal padding, not from large inter-section gaps.
- **Duplicating header markup:** Every page currently hand-rolls its own `<h1>` with slightly different classes. The PageHeader component eliminates this.
- **Ignoring `min-w-0`:** Without this on the title container, flex items with long text content will overflow rather than truncate.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Focus management on page transitions | Custom focus trap | Browser default + skip-to-content link | Already works via SidebarInset `<main>` semantics |
| Responsive breakpoints | Custom media query hooks | Tailwind responsive prefixes (sm:, md:, lg:) | Consistent with existing codebase, no JS needed |
| Sticky headers | Custom scroll observer | CSS `sticky` if needed later | Not in Chameleon's pattern; YAGNI |

---

## Common Pitfalls

### Pitfall 1: Token Value Mismatch
**What goes wrong:** Phase 1 `--font-size-page-title` is 1.75rem (28px) but Chameleon's actual h1 is 24px (1.5rem). If the planner doesn't update the token, titles will be 4px too large.
**Why it happens:** Phase 1 tokens were estimated; this research provides Playwright-verified values.
**How to avoid:** Update `--font-size-page-title` from `1.75rem` to `1.5rem` and update line-height from `1.2` to `1.33` in this phase. Also add letter-spacing.
**Warning signs:** Titles look slightly too large compared to the Chameleon screenshot.

### Pitfall 2: Double Padding
**What goes wrong:** If page components retain their own padding AND the layout wrapper adds padding, content gets double-padded.
**Why it happens:** Current page components like `HabitsPageContent` use `space-y-6` as their root which is fine (vertical), but the wrapper div in `SidebarLayout` currently applies `p-4 md:p-6`. When this is updated to `px-8 pt-10`, individual pages must NOT also add horizontal padding.
**How to avoid:** Remove any page-level outer padding from page content components during migration. Only the SidebarLayout wrapper should apply page padding.
**Warning signs:** Content appears indented more than in the Chameleon reference.

### Pitfall 3: Mobile Header Action Overflow
**What goes wrong:** On mobile, the header row tries to show title and actions side-by-side, causing text truncation or buttons falling off-screen.
**Why it happens:** Fixed flex-row at all breakpoints.
**How to avoid:** Use `flex-col sm:flex-row` in PageHeader so it stacks on mobile.
**Warning signs:** Buttons overlap title text on narrow viewports.

### Pitfall 4: Content Shift on Sidebar Toggle
**What goes wrong:** When the sidebar collapses/expands, the content area jumps if max-width is fixed and centering changes.
**Why it happens:** Phase 3 already handles this with the CSS overlay trick (gap div stays at icon width during hover expansion). But the new `max-w-[1400px]` with `mx-auto` means the centering anchor changes as available width changes.
**How to avoid:** The content wrapper should be inside `SidebarInset` which already responds to sidebar state via flexbox. The max-width wrapper just adds a ceiling; it doesn't fight the sidebar layout.
**Warning signs:** Content area jumps left/right when toggling sidebar pin.

### Pitfall 5: Section Gap Too Large
**What goes wrong:** Using `space-y-8` (32px) between sections when Chameleon uses 16px makes the page feel sparse and disconnected rather than airy.
**Why it happens:** Confusing "generous spacing" with "large gaps." Chameleon's generosity comes from:
- 40px top padding on the container
- 32px side padding
- 24px internal card padding
- 12px border-radius (rounded, friendly)
- NOT from large gaps between sections (those are only 16px)
**How to avoid:** Use `space-y-4` (16px) for section gaps, matching Chameleon.
**Warning signs:** Page requires excessive scrolling; sections feel disconnected.

---

## Current Codebase Inventory

### Pages Needing PageHeader

| Page | Current Header Pattern | Title Source | Has Actions | Subtitle |
|------|----------------------|--------------|-------------|----------|
| Dashboard | Inline h1 "Good {time}, {name}!" + p "welcome" | `t("greeting.*")` + userName | No (actions are in content) | Yes ("Welcome back!") |
| Habits list | Inline h1 + Button (flex justify-between) | `t("habits.page.title")` | Yes (Create button) | No |
| Tasks list | Inline h1 + Button (flex justify-between) | `t("tasks.page.title")` | Yes (Create button) | No |
| Settings | Inline h1 + Button (flex justify-between) | `t("settings.title")` | Yes (Save button) | No |
| Habit detail | ArrowLeft back button + h1 | Dynamic habit name | Yes (Edit, More menu) | No |
| Task detail | ArrowLeft back button + h1 | Dynamic task name | Yes (Edit, Delete) | No |
| Habit edit | Back button + h1 "Edit Habit" | `t("habits.edit.title")` | No (form has submit) | No |
| Task edit | Back button + h1 "Edit Task" | `t("tasks.edit.title")` | No (form has submit) | No |
| Create habit | Form with title area | `t("habits.create.title")` | No (form has submit) | No |
| Create task | Form with title area | `t("tasks.create.title")` | No (form has submit) | No |

### Current Layout Structure

```
app/layout.tsx (root)
  body: Inter font, antialiased, ThemeProvider, Toaster

  app/dashboard/layout.tsx -> SidebarShell -> SidebarLayout
  app/habits/layout.tsx    -> SidebarShell -> SidebarLayout
  app/tasks/layout.tsx     -> SidebarShell -> SidebarLayout

  SidebarLayout:
    SidebarProvider (controlled)
      AppSidebar (pin + hover logic)
      SidebarInset (<main>)
        <header> (mobile only: h-14 + SidebarTrigger + brand)
        <div class="flex-1 p-4 md:p-6">  <-- THE KEY CHANGE POINT
          {children}  <-- page content renders here
        </div>
```

### Typography Inconsistencies to Fix

| Location | Current | Should Be |
|----------|---------|-----------|
| Dashboard h1 | `text-3xl font-bold tracking-tight` (30px) | `text-page-title` (24px after token update) |
| Habits h1 | `text-3xl font-bold tracking-tight` (30px) | `text-page-title` (24px) |
| Tasks h1 | `text-3xl font-bold tracking-tight` (30px) | `text-page-title` (24px) |
| Settings h1 | `text-2xl font-bold` (24px) | `text-page-title` (24px) -- correct size but wrong class |
| Dashboard subtitle | `text-muted-foreground` (default size) | `text-section-heading font-semibold text-muted-foreground` |

### Spacing Inconsistencies to Fix

| Location | Current | Should Be |
|----------|---------|-----------|
| SidebarLayout content wrapper | `p-4 md:p-6` (16px / 24px) | `px-4 py-6 sm:px-6 md:px-8 md:pt-10` (→ 32px/40px desktop) |
| Dashboard content | `space-y-8` (32px section gap) | `space-y-4` (16px) |
| Habits content | `space-y-6` (24px) | `space-y-4` (16px) |
| Tasks content | `space-y-6` (24px) | `space-y-4` (16px) |
| Content grid | `grid gap-6` (24px) | `grid gap-4` (16px) |
| Page background | `bg-background` (white) | `bg-page` (gray canvas) |

---

## Token Updates Required

These Phase 1 tokens need updating based on Playwright-verified Chameleon values:

| Token | Current Value | New Value | Reason |
|-------|--------------|-----------|--------|
| `--font-size-page-title` | `1.75rem` (28px) | `1.5rem` (24px) | Chameleon h1 measures 24px |
| `text-page-title` lineHeight | `1.2` | `1.33` | Chameleon: 32px/24px = 1.333 |
| `--spacing-page-padding` | `2rem` (32px) | `2rem` (32px) | **No change** -- matches Chameleon horizontal |
| `--spacing-card-gap` | `1.5rem` (24px) | `1rem` (16px) | Chameleon uses 16px (tw-mb-4) between sections |

**New tokens to add:**

| Token | Value | Purpose |
|-------|-------|---------|
| `--spacing-page-padding-top` | `2.5rem` (40px) | Chameleon's larger top padding |
| `--content-max-width` | `1400px` | Max content width for ultra-wide centering |

**Note:** The `--spacing-card-padding` at `1.5rem` (24px) is correct -- matches Chameleon's card internal padding.

---

## Responsive Breakpoint Recommendations

| Breakpoint | Padding (horizontal) | Padding (top) | Section gap | Max-width |
|------------|---------------------|---------------|-------------|-----------|
| Mobile (<640px) | 16px (px-4) | 24px (py-6) | 12px (space-y-3) | none |
| Tablet (640-767px) | 24px (sm:px-6) | 24px | 16px (space-y-4) | none |
| Desktop (768px+) | 32px (md:px-8) | 40px (md:pt-10) | 16px (space-y-4) | 1400px |

**Mobile spacing ratios:**
- Horizontal padding: 50% of desktop (16px vs 32px)
- Top padding: 60% of desktop (24px vs 40px)
- Section gaps: 75% of desktop (12px vs 16px) -- or keep 16px; 12px is slightly tight
- Card internal padding: Keep at 24px (touch targets need space)

---

## Component API Recommendation

### PageHeader
```tsx
interface PageHeaderProps {
  /** Page title (required) */
  title: string;
  /** Optional subtitle below title */
  subtitle?: string;
  /** Optional action area (buttons, etc.) -- renders on the right (desktop) or below (mobile) */
  actions?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}
```

**Why not a compound component pattern (PageHeader.Title, PageHeader.Actions)?**
- The header anatomy is simple and fixed (title-left, actions-right)
- No need for recomposition flexibility
- Props-based API is simpler, matches the pattern used in habits/tasks pages
- Compound components are overkill for 3 props

**Why not accept children instead of props?**
- Typed props provide better DX (autocomplete, type checking on title)
- Consistent rendering: every page header looks the same
- Children-based API invites layout customization that breaks consistency

### ContentLayout (Optional Wrapper)
```tsx
interface ContentLayoutProps {
  children: React.ReactNode;
  /** Override max-width (default: 1400px) */
  maxWidth?: string;
  /** Additional CSS classes */
  className?: string;
}
```

**Decision: Inline in SidebarLayout vs. separate component?**
Recommend **inline in SidebarLayout** for the max-width wrapper, since it applies to ALL authenticated pages. A separate `ContentLayout` component is unnecessary indirection. If a page needs a different max-width (e.g., settings at 768px), it can add its own `max-w-*` class on its root div.

---

## Code Examples

### Example 1: Updated SidebarLayout Content Wrapper
```tsx
// Source: Chameleon extraction + Phase 1 design tokens
<SidebarInset>
  <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 md:hidden">
    <SidebarTrigger className="-ml-1" />
    <span className="font-display font-bold text-lg text-primary">BetterR.me</span>
  </header>
  <div className="flex-1 overflow-auto bg-page">
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 md:px-8 md:pt-10">
      {children}
    </div>
  </div>
</SidebarInset>
```

### Example 2: Dashboard Page Using PageHeader
```tsx
// Before (current):
<div className="space-y-8">
  <div className="space-y-2">
    <h1 className="font-display text-3xl font-bold tracking-tight">
      {getGreeting()}, {userName}!
    </h1>
    <p className="text-muted-foreground">{t("welcome")}</p>
  </div>
  {/* ... content ... */}
</div>

// After (with PageHeader):
<div className="space-y-4">
  <PageHeader
    title={`${getGreeting()}, ${userName}!`}
    subtitle={t("welcome")}
  />
  {/* ... content ... */}
</div>
```

### Example 3: Habits Page Using PageHeader
```tsx
// Before:
<div className="space-y-6">
  <div className="flex items-center justify-between">
    <h1 className="font-display text-3xl font-bold tracking-tight">{t("page.title")}</h1>
    <Button onClick={handleCreateHabit}>
      <Plus className="size-4 mr-2" />
      {t("page.createButton")}
    </Button>
  </div>
  <HabitList ... />
</div>

// After:
<div className="space-y-4">
  <PageHeader
    title={t("page.title")}
    actions={
      <Button onClick={handleCreateHabit}>
        <Plus className="size-4 mr-2" />
        {t("page.createButton")}
      </Button>
    }
  />
  <HabitList ... />
</div>
```

### Example 4: Token Update in globals.css
```css
/* Updated font-size-page-title */
--font-size-page-title: 1.5rem;    /* was 1.75rem; Chameleon h1 = 24px */

/* Updated card-gap */
--spacing-card-gap: 1rem;           /* was 1.5rem; Chameleon = 16px between sections */
```

### Example 5: Updated Tailwind Config for page-title
```ts
"page-title": [
  "var(--font-size-page-title)",
  { lineHeight: "1.33", fontWeight: "700", letterSpacing: "-0.025em" },
],
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-page inline headers | Reusable PageHeader component | This phase | Consistency, less code |
| `p-4 md:p-6` content padding | `px-4 py-6 sm:px-6 md:px-8 md:pt-10` | This phase | Matches Chameleon's generous layout |
| `bg-background` (white) content area | `bg-page` (gray canvas) | This phase | Gray canvas + white cards = depth |
| `space-y-8` section gaps (32px) | `space-y-4` section gaps (16px) | This phase | Tighter rhythm, Chameleon-matching |

---

## Open Questions

1. **Dashboard greeting as PageHeader vs. special component**
   - What we know: The dashboard greeting is unique -- it has a user avatar, time-based greeting, and an emoji. Other pages have simple text titles.
   - What's unclear: Should the dashboard use PageHeader with a composed title string, or have its own greeting component?
   - Recommendation: Use PageHeader with a composed title string (`"Good morning, John!"`). The avatar and emoji are decorative; the core layout pattern (title-left, actions-right) is the same. If the dashboard needs an avatar later, it can be added as a custom className or wrapper.

2. **Max-width value: 1400px vs fluid**
   - What we know: Chameleon uses `max-width: 100%` (fluid, fills all available space). The success criteria says "max-width with centering on ultra-wide screens."
   - What's unclear: 1400px is a common SaaS dashboard max-width but is not extracted from Chameleon (they go fully fluid).
   - Recommendation: Use `max-w-7xl` (1280px) as a reasonable max-width that prevents uncomfortably wide content on ultra-wide monitors. At 1920px viewport minus 224px sidebar = 1696px available, centered content at 1280px gives ~208px gutters on each side. This is a common pattern (Linear, Notion, etc.). Could also do 1400px for slightly wider content.

3. **bg-page on content area vs. card wrapping**
   - What we know: Chameleon's body bg is white, and the header area uses `rgb(248,250,252)` (slate-50). Individual cards have white bg + border.
   - What's unclear: Should the entire content area be `bg-page` (gray), making cards pop on gray background? Or keep white and only use gray for the header card?
   - Recommendation: Use `bg-page` on the full content area. This matches the Phase 1 surface hierarchy design (page=gray canvas, card=white) and creates clear visual depth. The gray canvas is subtle enough not to be jarring.

---

## Sources

### Primary (HIGH confidence)
- **Chameleon live dashboard** -- Playwright extraction from `app.chameleon.io/home` on 2026-02-16
  - Page container: `padding: 40px 32px 0`, `max-width: 100%`
  - Header row: `padding: 24px 32px`, `flex justify-between items-center`
  - H1: `24px / 700 / 32px line-height / -0.6px letter-spacing`
  - Section h3: `18px / 700 / 28px line-height`
  - Body text: `14px / 600 / 20px line-height`
  - Card: `border-radius: 12px`, `border: 1px solid rgb(226,232,240)`
  - Section gap: `margin-bottom: 16px`
  - Card gap (horizontal): `margin-right: 16px`
  - Card internal padding: `24px`

- **BetterR.Me codebase** -- Direct file inspection
  - `app/globals.css` -- Current design tokens
  - `tailwind.config.ts` -- Current Tailwind extensions
  - `components/layouts/sidebar-layout.tsx` -- Current content wrapper
  - `components/dashboard/dashboard-content.tsx` -- Current dashboard header
  - `components/habits/habits-page-content.tsx` -- Current habits header
  - `components/tasks/tasks-page-content.tsx` -- Current tasks header
  - `components/settings/settings-content.tsx` -- Current settings header

- **Phase 1 DESIGN-TOKENS.md** -- Existing token definitions and utility mappings

### Secondary (MEDIUM confidence)
- Common SaaS dashboard max-width patterns (Linear ~1280px, Notion ~900px, Vercel ~1200px) -- from general knowledge, not verified in this session.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries; pure Tailwind + React components
- Architecture: HIGH -- Pattern is straightforward (reusable component + layout wrapper); Chameleon values directly extracted
- Pitfalls: HIGH -- Common layout pitfalls well-documented; double-padding and gap-size are the main risks
- CSS values: HIGH -- Playwright-extracted from live Chameleon dashboard, not estimated

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- Chameleon's UI unlikely to change significantly)
