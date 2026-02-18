# Phase 5: Dashboard Page Migration - Research

**Researched:** 2026-02-16
**Domain:** Dashboard UI migration to card-on-gray design system
**Confidence:** HIGH

## Summary

This phase migrates the existing dashboard page from hardcoded Tailwind color classes to the design token system established in Phase 1 and the content layout from Phase 4. The dashboard has 7 component files (dashboard-content, daily-snapshot, motivation-message, habit-checklist, tasks-today, absence-card, weekly-insight-card) plus 2 shared components (milestone-card, habit-row) that render within the dashboard. Together they contain approximately 50+ hardcoded color references (slate, emerald, teal, green, bg-white) that must be replaced with semantic tokens (bg-card, border-border, text-primary, text-muted-foreground, etc.).

The content wrapper (bg-page background, max-w-content centering, responsive padding) is already applied by SidebarLayout from Phase 4, so no page-level container changes are needed. The work is entirely within the dashboard components: (1) wrapping bare text sections (greeting, motivation) in Card components, (2) migrating stat cards from custom divs to shadcn Card, (3) replacing all hardcoded colors with tokens, (4) adjusting the habits/tasks grid breakpoint from lg to xl, and (5) updating tests that assert specific color classes.

**Primary recommendation:** Organize the migration into 3 logical batches: greeting/motivation/skeleton migration, stat cards and grid layout, then the detail cards (absence, weekly insight, milestone, habit checklist celebration, tasks-today). Each batch should be followed by test updates and a full test suite verification.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Card wrapping strategy
- Greeting section (time-based greeting + subtitle) gets wrapped in a white card -- it's currently bare text
- Motivation message gets its own separate card (not merged into greeting card)
- Absence recovery cards keep their warning/accent color styling but migrate to design tokens (no hardcoded slate/emerald colors)
- Weekly insight card keeps its distinct styling, migrated to design tokens
- Milestone celebration cards keep their celebratory gradient treatment, migrated to design tokens
- Habit checklist and tasks today are already in Card components -- migrate any hardcoded colors to tokens

#### Stat cards presentation
- DailySnapshot stat cards remain as individual floating cards (not grouped in a parent card)
- Each stat keeps its distinct accent color (blue for active habits, emerald for progress, orange for streak)
- Stat cards switch from custom div with hardcoded styles to shadcn Card component with design tokens (bg-card, border-border)
- Cards get subtle shadow (shadow-sm) for depth on the gray background

#### Greeting & PageHeader
- Dashboard does NOT use the PageHeader component -- it keeps its own custom greeting style
- Greeting uses the Chameleon-measured text-page-title token (24px) for consistency with the extracted design system
- Wave emoji stays in the greeting
- Greeting card uses standard Chameleon card styling (same bg-card/border/shadow as other cards, no special accent)

#### Responsive grid behavior
- Habits/tasks 2-column grid breakpoint shifts from lg (1024px) to xl (1280px) to account for sidebar width
- Stat cards grid stays at md (768px) for 3-column layout -- compact enough with sidebar
- Mobile layout (<768px) stays single-column stacking as today

### Claude's Discretion
- Mobile layout adjustments if needed for card-on-gray system
- Max-width for dashboard content area (1400px default or adjusted based on visual testing)
- Any spacing/padding adjustments needed for cards on the gray background to feel spacious

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VISL-01 | Page background is a subtle gray with white cards floating on top (card-on-gray depth) | SidebarLayout already provides bg-page canvas; dashboard cards need bg-card + border + shadow-sm |
| VISL-04 | Typography, padding, margins, font sizes, border radius, and spacing match Chameleon's dashboard CSS values | text-page-title (24px) for greeting, text-section-heading (18px) for section headers, gap-card-gap (16px) between cards |
| VISL-10 | All pages updated: dashboard, habits, tasks, profile, auth pages | This phase covers dashboard only; other pages are Phase 6 |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui Card | latest | Card, CardContent, CardHeader components | Already used in habit-checklist and tasks-today; provides bg-card + border + shadow-sm by default |
| Tailwind CSS 3 | ^3.x | Utility-first CSS with design token classes | Project standard; all tokens registered in tailwind.config.ts |
| next-intl | current | i18n translations | All user-facing strings use translation keys |

### Supporting (no new dependencies)
No new packages needed. This phase only touches existing components and their styling classes.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn Card for stat cards | Custom card div | Custom div is what exists today; shadcn Card gives consistent bg-card/border/shadow treatment with zero effort |
| Wrapping greeting in Card | Keeping bare text on gray background | Bare text lacks visual separation; Chameleon screenshot shows greeting inside a card |

**Installation:** No new packages needed.

## Architecture Patterns

### Current Dashboard Component Tree
```
app/dashboard/layout.tsx          -> SidebarShell -> SidebarLayout (bg-page wrapper already applied)
app/dashboard/page.tsx            -> Server component, data fetching
components/dashboard/
  dashboard-content.tsx           -> Client component, orchestrates all sections
    daily-snapshot.tsx            -> StatCard (custom div) x3 in a grid
    motivation-message.tsx        -> Bare div with bg-primary/5
    habit-checklist.tsx           -> Card wrapper (shadcn), HabitRow items
    tasks-today.tsx               -> Card wrapper (shadcn), TaskRow items
    absence-card.tsx              -> Bare div with variant-colored backgrounds
    weekly-insight-card.tsx       -> Card wrapper (shadcn) with gradient
components/habits/
    milestone-card.tsx            -> Card wrapper (shadcn) with gradient (shared component)
    habit-row.tsx                 -> Row item used inside habit-checklist (shared component)
```

### Pattern 1: Hardcoded Color to Token Migration
**What:** Replace every hardcoded Tailwind color class with the equivalent design token class
**When to use:** Every instance of slate-*, emerald-*, teal-*, green-*, bg-white in dashboard components

**Mapping table (dashboard-specific):**

| Current Class | Replace With | Rationale |
|---------------|-------------|-----------|
| `bg-white dark:bg-slate-900` | `bg-card` | Card surface token |
| `border-slate-200 dark:border-slate-700` | `border` (default) | Border token via `* { @apply border-border }` |
| `text-slate-500 dark:text-slate-400` | `text-muted-foreground` | Subdued text token |
| `hover:bg-slate-50 dark:hover:bg-slate-800` | `hover:bg-accent` | Hover state token |
| `text-emerald-500` (trend positive) | `text-primary` | Brand accent for positive trends |
| `text-emerald-600 dark:text-emerald-400` (icons) | `text-primary` | Design token handles dark mode automatically |
| `bg-emerald-100 dark:bg-emerald-900/30` (icon bg) | `bg-primary/10` | 10% opacity of primary token |
| `data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500` | `data-[state=checked]:bg-primary data-[state=checked]:border-primary` | Checkbox checked state |
| `text-emerald-600 dark:text-emerald-400` (completion text) | `text-primary` | Positive/success accent |
| `bg-emerald-50 dark:bg-emerald-950/20` (success bg) | `bg-highlight` | Highlight token (light teal tint) |
| `border-l-emerald-500` | `border-l-primary` | Success border accent |
| `text-emerald-900 dark:text-emerald-100` | `text-foreground` | Standard foreground on highlight bg |
| `text-emerald-700 dark:text-emerald-300` | `text-primary` | Secondary emphasis text |
| `text-green-500` (low priority) | Keep as-is | Semantic priority color, not brand accent |
| `text-slate-400` (no priority) | `text-muted-foreground` | Muted semantic color |

### Pattern 2: Bare Content to Card Wrapping
**What:** Wrap previously unwrapped content sections in shadcn Card components
**When to use:** Greeting section, motivation message

**Example - Greeting card:**
```typescript
// BEFORE: bare text floating on gray background
<div className="space-y-2">
  <h1 className="font-display text-3xl font-bold tracking-tight">
    {getGreeting()}, {userName}! 👋
  </h1>
  <p className="text-muted-foreground">{t("welcome")}</p>
</div>

// AFTER: wrapped in Card with design tokens
<Card>
  <CardContent className="py-5">
    <h1 className="text-page-title tracking-tight">
      {getGreeting()}, {userName}! 👋
    </h1>
    <p className="mt-1 text-muted-foreground">{t("welcome")}</p>
  </CardContent>
</Card>
```

**Example - Motivation message card:**
```typescript
// BEFORE: bare rounded div
<div className="rounded-lg bg-primary/5 dark:bg-primary/10 p-4 flex items-start gap-3">

// AFTER: in its own Card
<Card>
  <CardContent className="flex items-start gap-3 py-4">
    <Lightbulb className="size-5 text-primary shrink-0 mt-0.5" />
    <p className="text-sm text-foreground/90">{message}</p>
  </CardContent>
</Card>
```

### Pattern 3: Custom Div to shadcn Card (StatCard)
**What:** Replace custom stat card div with shadcn Card component
**When to use:** DailySnapshot StatCard component

**Example:**
```typescript
// BEFORE: custom div with hardcoded colors
<div data-testid="stat-card"
  className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900 shadow-sm">

// AFTER: shadcn Card with design tokens
<Card data-testid="stat-card" className="min-w-0 shadow-sm">
  <CardContent className="p-4">
    ...
  </CardContent>
</Card>
```

Note: shadcn Card already applies `bg-card text-card-foreground rounded-xl border shadow-sm`. The only addition needed is `min-w-0` for truncation safety and `shadow-sm` is already in the Card default.

### Pattern 4: Gradient Cards (Celebration/Insight)
**What:** Keep distinct gradient styling but replace hardcoded palette with primary-derived colors
**When to use:** Milestone cards, habit-checklist "perfect day" celebration, weekly insight card

**Example - Milestone card:**
```typescript
// BEFORE:
<Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200
  dark:from-emerald-950/30 dark:to-teal-950/30 dark:border-emerald-800">

// AFTER: use primary token with opacity for gradient
<Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20
  dark:from-primary/10 dark:to-primary/20 dark:border-primary/30">
```

**Example - Weekly insight card (keeps blue theme as information color):**
The weekly insight card uses blue/indigo as an "informational" accent distinct from the primary green. Per the user decision, it "keeps its distinct styling, migrated to design tokens." Since blue is not the primary color and serves as a semantic "information" color, these blue classes should be kept as-is or only lightly adjusted. The key migration is ensuring the Card base uses bg-card in dark mode rather than hardcoded dark backgrounds.

### Pattern 5: Responsive Grid Breakpoint Shift
**What:** Change the habits/tasks 2-column breakpoint from lg to xl
**When to use:** Main content grid in dashboard-content.tsx

```typescript
// BEFORE:
<div className="grid gap-6 lg:grid-cols-2">

// AFTER:
<div className="grid gap-card-gap xl:grid-cols-2">
```

The gap also migrates from `gap-6` (24px) to `gap-card-gap` (16px per Phase 4 correction).

### Anti-Patterns to Avoid
- **Mixing hardcoded and token colors:** Every card that uses bg-card must also use border (default token), not border-slate-200. Inconsistency breaks dark mode.
- **Double-wrapping in Cards:** Habit-checklist and tasks-today already use Card. Do NOT wrap them in another Card. Only migrate internal hardcoded colors.
- **Changing component behavior:** This is a visual migration only. No logic changes, no new props, no new data flows. If a test asserts behavior, it should still pass.
- **Removing accent colors from stat cards:** The decision says stat cards keep distinct accent colors (blue, emerald, orange for icons). The icon colors stay hardcoded. Only the card surface/border/text migrates to tokens.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Card surface styling | Custom div with bg-white/border-slate | shadcn `Card` component | Already provides bg-card, border, rounded-xl, shadow-sm |
| Dark mode color pairs | Manual `dark:bg-*` for every element | Design token classes (bg-card, text-foreground, etc.) | Tokens auto-switch via CSS variables |
| Page background | Adding bg-page to dashboard-content | SidebarLayout content wrapper | Phase 4 already applies bg-page canvas to all pages |
| Max-width centering | Adding max-w-content to dashboard | SidebarLayout content wrapper | Phase 4 already applies max-w-content + mx-auto |
| Typography sizing | Manual text-3xl/text-lg classes | text-page-title, text-section-heading tokens | Tokens match Chameleon-verified values |

**Key insight:** The SidebarLayout from Phase 4 already handles the page-level concerns (gray background, max-width, padding). This phase only needs to handle component-level styling within the dashboard.

## Common Pitfalls

### Pitfall 1: Test assertions on specific color classes
**What goes wrong:** Tests like `daily-snapshot.test.tsx` assert `toHaveClass("text-emerald-500")` for trend indicators. After migration, these will fail.
**Why it happens:** Tests were written to verify visual styling via class names rather than semantic meaning.
**How to avoid:** Update test assertions to use the new token class names (e.g., `text-primary` instead of `text-emerald-500`). Search all test files for the old class names.
**Warning signs:** Test failures mentioning "expected element to have class 'text-emerald-500'".

**Known test files requiring updates:**
- `tests/components/dashboard/daily-snapshot.test.tsx` line 63: asserts `text-emerald-500` for positive trend
- Any other tests that check for hardcoded color classes in rendered output

### Pitfall 2: shadcn Card default padding conflicts
**What goes wrong:** shadcn Card has `py-6` by default and CardContent has `px-6`. The stat cards currently use `p-4`. Wrapping in Card without overriding padding results in too much whitespace.
**Why it happens:** shadcn Card default padding is designed for larger cards; stat cards need tighter padding.
**How to avoid:** Override Card's py-6 with a className. For stat cards: `<Card className="min-w-0 py-0 shadow-sm"><CardContent className="p-4">...`. Or use Card with no gap: `<Card className="gap-0 py-0">`.
**Warning signs:** Stat cards looking bloated with excessive internal whitespace.

### Pitfall 3: Missing dark mode pairs
**What goes wrong:** Replacing `bg-white dark:bg-slate-900` with just `bg-white` (forgetting dark mode) or replacing both with one token but missing some dark: prefixed classes.
**Why it happens:** Find-and-replace doesn't catch all dark mode pairs.
**How to avoid:** Token classes like `bg-card` automatically handle both light and dark modes. When removing hardcoded classes, ensure you remove BOTH the light and dark variants, replacing with a single token class.
**Warning signs:** Broken dark mode appearance.

### Pitfall 4: Greeting card typography mismatch
**What goes wrong:** The greeting currently uses `text-3xl font-bold` (30px). The decision says to use `text-page-title` (24px/1.5rem). The visual reduction needs to be intentional.
**Why it happens:** text-3xl is larger than text-page-title. The migration is a deliberate size reduction to match Chameleon.
**How to avoid:** This is correct behavior per the locked decision. Verify it looks right visually. The text-page-title token already includes fontWeight: 700 (bold) and letterSpacing: -0.025em, so `font-bold` and `tracking-tight` classes can be removed when using the token.
**Warning signs:** None -- the size change is intentional.

### Pitfall 5: Absence card variant colors
**What goes wrong:** Absence cards use amber/blue/orange as semantic colors for recovery/lapse/hiatus variants. These are NOT brand colors and should not all become primary.
**Why it happens:** Over-zealous token migration replaces ALL colors with primary.
**How to avoid:** The decision says "keep their warning/accent color styling but migrate to design tokens." The amber/blue/orange variant colors are semantic (warning/info/caution) and should be kept. Only the success state (emerald) migrates to primary.
**Warning signs:** All absence cards looking the same color.

### Pitfall 6: Skeleton and loading state mismatch
**What goes wrong:** The skeleton (loading.tsx and DashboardSkeleton in dashboard-content.tsx) still uses the old grid breakpoints and doesn't match the migrated layout.
**Why it happens:** Skeletons are often forgotten during visual migrations.
**How to avoid:** Update both skeleton components: change `lg:grid-cols-2` to `xl:grid-cols-2`, and ensure skeleton cards match the new card styling.
**Warning signs:** Layout jump when data loads (skeleton has different grid than actual content).

### Pitfall 7: Weekly insight card gradient
**What goes wrong:** The weekly insight card uses blue/indigo gradient as an "information" accent. Converting this to primary (green) loses the semantic distinction.
**Why it happens:** Blanket replacement of all colors.
**How to avoid:** Per the decision, weekly insight "keeps its distinct styling, migrated to design tokens." Keep the blue information accent. Migrate only the structural parts (Card base styles already handle bg-card/border for the base; the gradient overlays that).
**Warning signs:** Weekly insight card looking green instead of blue.

## Code Examples

### Complete StatCard Migration
```typescript
// Source: Codebase analysis of components/dashboard/daily-snapshot.tsx
// BEFORE:
function StatCard({ icon, iconBgClass, title, value, subtitle, trend }: StatCardProps) {
  return (
    <div data-testid="stat-card"
      className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn("rounded-full p-2.5 shrink-0", iconBgClass)} aria-hidden="true">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
          <p className="font-display text-3xl font-bold mt-0.5">{value}</p>
          {subtitle && (
            <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
          {trend && (
            <div className={cn("flex items-center gap-1 text-sm mt-1",
              trend.isPositive ? "text-emerald-500" : "text-red-500"
            )}>
              ...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// AFTER:
function StatCard({ icon, iconBgClass, title, value, subtitle, trend }: StatCardProps) {
  return (
    <Card data-testid="stat-card" className="min-w-0 gap-0 py-0 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("rounded-full p-2.5 shrink-0", iconBgClass)} aria-hidden="true">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-stat mt-0.5">{value}</p>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <div className={cn("flex items-center gap-1 text-sm mt-1",
                trend.isPositive ? "text-primary" : "text-red-500"
              )}>
                ...
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

### Habit Checklist Celebration Migration
```typescript
// Source: Codebase analysis of components/dashboard/habit-checklist.tsx lines 71-81
// BEFORE:
<div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50
  dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200
  dark:border-emerald-800/30 p-6 text-center">
  <div className="inline-flex items-center justify-center rounded-full
    bg-emerald-100 dark:bg-emerald-900/50 p-3 mb-3">
    <PartyPopper className="size-6 text-emerald-600 dark:text-emerald-400" />
  </div>
  <p className="font-display text-lg font-bold text-emerald-900 dark:text-emerald-100">
  <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">

// AFTER:
<div className="rounded-xl bg-gradient-to-br from-primary/5 to-primary/10
  dark:from-primary/10 dark:to-primary/20 border border-primary/20
  dark:border-primary/30 p-6 text-center">
  <div className="inline-flex items-center justify-center rounded-full
    bg-primary/10 p-3 mb-3">
    <PartyPopper className="size-6 text-primary" />
  </div>
  <p className="font-display text-section-heading font-bold text-foreground">
  <p className="text-sm text-primary mt-1">
```

### Absence Card Success State Migration
```typescript
// Source: Codebase analysis of components/dashboard/absence-card.tsx lines 72-78
// BEFORE:
<div className="flex items-center gap-3 p-4 rounded-lg border-l-4 border-l-emerald-500
  bg-emerald-50 dark:bg-emerald-950/20">
  <Check className="size-5 text-emerald-500 shrink-0" />
  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">

// AFTER:
<div className="flex items-center gap-3 p-4 rounded-lg border-l-4 border-l-primary
  bg-highlight">
  <Check className="size-5 text-primary shrink-0" />
  <p className="text-sm font-medium text-primary">
```

### Hover State Migration (TaskRow and HabitRow)
```typescript
// Source: Codebase analysis of shared hover patterns
// BEFORE:
<div className="... hover:bg-slate-50 dark:hover:bg-slate-800">

// AFTER:
<div className="... hover:bg-accent">
```

### Greeting Section Card Wrapping
```typescript
// Source: Chameleon dashboard screenshot analysis
// The Chameleon dashboard wraps the greeting ("Good evening, Steven Tan") in a white card.
// BEFORE (bare text):
<div className="space-y-2">
  <h1 className="font-display text-3xl font-bold tracking-tight">
    {getGreeting()}, {userName}! 👋
  </h1>
  <p className="text-muted-foreground">{t("welcome")}</p>
</div>

// AFTER (wrapped in Card):
<Card>
  <CardContent className="py-5">
    <h1 className="text-page-title tracking-tight">
      {getGreeting()}, {userName}! 👋
    </h1>
    <p className="mt-1 text-muted-foreground">{t("welcome")}</p>
  </CardContent>
</Card>
```

## Comprehensive Hardcoded Color Inventory

### dashboard-content.tsx
| Line | Current | Migration |
|------|---------|-----------|
| 163, 222 | `text-3xl font-bold tracking-tight` | `text-page-title tracking-tight` (token includes font-weight) |
| 176 | `text-2xl font-semibold` (empty state) | `text-section-heading` or keep for empty state |
| 266 | `grid gap-6 lg:grid-cols-2` | `grid gap-card-gap xl:grid-cols-2` |
| 160-194 | Bare greeting div (empty state) | Wrap in Card |
| 221-226 | Bare greeting div (main state) | Wrap in Card |
| 310 | `grid gap-6 lg:grid-cols-2` (skeleton) | `grid gap-card-gap xl:grid-cols-2` |
| 302 | `grid grid-cols-2 md:grid-cols-3 gap-4` (skeleton) | Keep md:grid-cols-3, use gap-card-gap |

### daily-snapshot.tsx (highest density of hardcoded colors)
| Line | Current | Migration |
|------|---------|-----------|
| 22 | `border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900` | shadcn Card (bg-card, border via default) |
| 28 | `text-slate-500 dark:text-slate-400` | `text-muted-foreground` |
| 31 | `text-slate-500 dark:text-slate-400` | `text-muted-foreground` |
| 37 | `text-emerald-500` (positive trend) | `text-primary` |
| 96 | `grid grid-cols-2 md:grid-cols-3 gap-4` | Keep md breakpoint, use `gap-card-gap` |
| 98-99 | Blue icon + bg kept (semantic accent) | Keep blue as-is |
| 104-105 | Emerald icon + bg | `text-primary`, `bg-primary/10` |
| 112-113 | Orange icon + bg kept (semantic accent) | Keep orange as-is |

### tasks-today.tsx
| Line | Current | Migration |
|------|---------|-----------|
| 72, 321 | `text-slate-400` (no priority) | `text-muted-foreground` |
| 73, 322 | `text-green-500` (low priority) | Keep as-is (semantic priority color) |
| 98 | `hover:bg-slate-50 dark:hover:bg-slate-800` | `hover:bg-accent` |
| 103 | `data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500` | `data-[state=checked]:bg-primary data-[state=checked]:border-primary` |
| 293 | `text-emerald-600 dark:text-emerald-400` ("All tasks done!") | `text-primary` |

### habit-checklist.tsx
| Line | Current | Migration |
|------|---------|-----------|
| 71-81 | Emerald/teal gradient celebration | Primary-based gradient (see code example above) |

### absence-card.tsx
| Line | Current | Migration |
|------|---------|-----------|
| 20-41 | Variant configs (amber/blue/orange) | Keep as-is (semantic warning/info/caution colors) |
| 72-78 | Emerald success state | Primary/highlight tokens (see code example above) |
| 108 | Emerald checkbox checked state | `data-[state=checked]:bg-primary data-[state=checked]:border-primary` |

### weekly-insight-card.tsx
| Line | Current | Migration |
|------|---------|-----------|
| 28-43 | Blue/indigo gradient and text | Keep distinct blue "information" styling per user decision |

### habit-row.tsx (shared component, used by habit-checklist)
| Line | Current | Migration |
|------|---------|-----------|
| 33 | `hover:bg-slate-50 dark:hover:bg-slate-800` | `hover:bg-accent` |
| 39 | `data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500` | `data-[state=checked]:bg-primary data-[state=checked]:border-primary` |

### milestone-card.tsx (shared component)
| Line | Current | Migration |
|------|---------|-----------|
| 32 | Emerald/teal gradient + border | Primary-based gradient |
| 34-36 | Emerald icon colors | `text-primary`, `bg-primary/10` |
| 38-43 | Emerald text colors | `text-foreground`, `text-primary` |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hardcoded `bg-white dark:bg-slate-900` | `bg-card` token | Phase 1 (2026-02-16) | Single class handles both modes |
| Bare content on white background | Card-on-gray with bg-page canvas | Phase 4 (2026-02-17) | SidebarLayout provides canvas |
| `text-3xl` for page titles | `text-page-title` (24px) | Phase 4 (2026-02-17) | Matches Chameleon measurements |
| `gap-6` (24px) between sections | `gap-card-gap` (16px) | Phase 4 (2026-02-17) | Tighter rhythm per Chameleon |
| Custom rounded div for stat cards | shadcn Card component | This phase | Consistent bg-card/border/shadow |

## Open Questions

1. **Stat card value font size**
   - What we know: Currently uses `text-3xl font-bold` (30px). Design tokens include `text-stat` (28px, font-weight 700).
   - What's unclear: Whether stat card values should use the text-stat token (28px) or keep text-3xl (30px).
   - Recommendation: Use `text-stat` token for consistency. The 2px difference is negligible and aligns with the design system. The text-stat token already includes fontWeight: 700.

2. **Progress/emerald stat card icon color after migration**
   - What we know: The decision says "Each stat keeps its distinct accent color (blue, emerald, orange)." The progress stat uses emerald, which is very close to primary.
   - What's unclear: Should the progress stat icon stay hardcoded emerald or become text-primary (which is also green/teal)?
   - Recommendation: Use `text-primary` and `bg-primary/10` for the progress stat since primary IS the green accent. The visual difference is minimal, and it means one less hardcoded color.

3. **Category color pills in HabitRow**
   - What we know: getCategoryColor() in lib/habits/format.ts returns hardcoded colors like `text-rose-500 bg-rose-50`, `text-slate-500 bg-slate-50`.
   - What's unclear: Whether to migrate these in Phase 5 (dashboard) or Phase 6 (habits page migration).
   - Recommendation: Leave getCategoryColor() for Phase 6 since it's a shared utility used across habits pages. Only migrate the slate hover color in HabitRow itself.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: All 7 dashboard component files read and audited for hardcoded colors
- Phase 1 DESIGN-TOKENS.md: Complete token reference with Tailwind utility mapping
- Phase 4 04-01-SUMMARY.md: Verified token corrections and SidebarLayout wrapper
- app/globals.css: Actual CSS variable definitions verified
- tailwind.config.ts: Token registration in Tailwind confirmed
- components/ui/card.tsx: shadcn Card default classes confirmed (`bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm`)
- Chameleon dashboard screenshot (chameleon-home-full.png): Visual reference for card-on-gray aesthetic

### Secondary (MEDIUM confidence)
- Test file analysis: 6 test files reviewed for class name assertions that will break

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing tools
- Architecture: HIGH - all components read and audited line-by-line
- Color inventory: HIGH - grep-verified across all dashboard files
- Pitfalls: HIGH - derived from actual code analysis and known test patterns
- Chameleon fidelity: MEDIUM - based on screenshot visual analysis, not pixel-perfect measurement

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- design tokens won't change)
