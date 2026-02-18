# Design Token Reference

**Source:** Chameleon (app.chameleon.io) light mode extraction + Linear-inspired dark mode
**Defined in:** `app/globals.css`
**Registered in:** `tailwind.config.ts`
**Last updated:** 2026-02-16

---

## Table of Contents

1. [Surface Hierarchy](#surface-hierarchy)
2. [Color Palette](#color-palette)
3. [Typography Scale](#typography-scale)
4. [Spacing Scale](#spacing-scale)
5. [Layout Dimensions](#layout-dimensions)
6. [Tailwind Utility Quick Reference](#tailwind-utility-quick-reference)
7. [Hardcoded Color Audit](#hardcoded-color-audit)
8. [Migration Notes](#migration-notes)

---

## Surface Hierarchy

### Light Mode (3 levels)

```
Level 0 (Canvas)     --page: 216 25% 97%         bg-page        Gray canvas behind content
Level 1 (Content)    --background: 0 0% 100%      bg-background  White content areas, cards
                     --card: 0 0% 100%            bg-card        Card surfaces (same as bg)
Level 2 (Elevated)   --popover: 0 0% 100%         bg-popover     Dropdowns, modals
```

In light mode, depth is conveyed via borders and subtle shadows, not background color differences between content/card/popover. The key distinction is between the gray canvas (`--page`) and white content areas (`--background`/`--card`).

### Dark Mode (3 levels, Linear-inspired)

```
Level 0 (Canvas)     --page: 240 27% 14%          bg-page        Darkest, page canvas
                     --background: 240 27% 14%    bg-background  Same as page in dark
Level 1 (Content)    --card: 240 25% 18%          bg-card        Elevated card surfaces
Level 2 (Elevated)   --popover: 240 24% 22%       bg-popover     Highest elevation
```

Dark mode uses a blue-purple hue (240) with 4% lightness steps between levels: 14% -> 18% -> 22%. Higher = lighter = more elevated. The sidebar sits below level 0 at 12% lightness.

---

## Color Palette

### Surface Colors

| Token | CSS Variable | Light Value | Dark Value | Tailwind Class | Usage |
|-------|-------------|-------------|------------|----------------|-------|
| Background | `--background` | `0 0% 100%` (white) | `240 27% 14%` | `bg-background` | Main content background |
| Foreground | `--foreground` | `0 0% 3.9%` | `0 0% 95%` | `text-foreground` | Primary text color |
| Page | `--page` | `216 25% 97%` (light gray) | `240 27% 14%` | `bg-page` | Gray canvas behind content |
| Card | `--card` | `0 0% 100%` | `240 25% 18%` | `bg-card` | Card surfaces |
| Card Foreground | `--card-foreground` | `0 0% 3.9%` | `0 0% 95%` | `text-card-foreground` | Text on cards |
| Popover | `--popover` | `0 0% 100%` | `240 24% 22%` | `bg-popover` | Dropdowns, modals |
| Popover Foreground | `--popover-foreground` | `0 0% 3.9%` | `0 0% 95%` | `text-popover-foreground` | Text in popovers |
| Highlight | `--highlight` | `155 50% 94%` (light teal tint) | `160 30% 20%` | `bg-highlight` | Active/highlighted rows |

### Brand / Accent Colors

| Token | CSS Variable | Light Value | Dark Value | Tailwind Class | Usage |
|-------|-------------|-------------|------------|----------------|-------|
| Primary | `--primary` | `157 63% 45%` (teal-green) | `160 60% 50%` | `bg-primary` | CTA buttons, active states |
| Primary Foreground | `--primary-foreground` | `0 0% 100%` | `0 0% 9%` | `text-primary-foreground` | Text on primary |
| Ring | `--ring` | `157 63% 45%` | `160 60% 50%` | `ring-ring` | Focus rings |

### Neutral Semantic Colors

| Token | CSS Variable | Light Value | Dark Value | Tailwind Class | Usage |
|-------|-------------|-------------|------------|----------------|-------|
| Secondary | `--secondary` | `216 16% 96%` | `240 15% 20%` | `bg-secondary` | Secondary buttons, tags |
| Secondary Foreground | `--secondary-foreground` | `0 0% 9%` | `0 0% 95%` | `text-secondary-foreground` | Text on secondary |
| Muted | `--muted` | `216 16% 96%` | `240 15% 20%` | `bg-muted` | Muted backgrounds |
| Muted Foreground | `--muted-foreground` | `0 0% 45%` | `240 5% 60%` | `text-muted-foreground` | Subdued text |
| Accent | `--accent` | `216 16% 96%` | `240 15% 20%` | `bg-accent` | Hover/accent backgrounds |
| Accent Foreground | `--accent-foreground` | `0 0% 9%` | `0 0% 95%` | `text-accent-foreground` | Text on accent |

### Border Colors

| Token | CSS Variable | Light Value | Dark Value | Tailwind Class | Usage |
|-------|-------------|-------------|------------|----------------|-------|
| Border | `--border` | `216 16% 91%` | `240 15% 25%` | `border-border` | Card borders, dividers |
| Input | `--input` | `216 16% 91%` | `240 15% 25%` | `border-input` | Form input borders |

### Destructive

| Token | CSS Variable | Light Value | Dark Value | Tailwind Class | Usage |
|-------|-------------|-------------|------------|----------------|-------|
| Destructive | `--destructive` | `0 84.2% 60.2%` | `0 62.8% 30.6%` | `bg-destructive` | Delete buttons, errors |
| Destructive Foreground | `--destructive-foreground` | `0 0% 98%` | `0 0% 98%` | `text-destructive-foreground` | Text on destructive |

### Chart Colors

| Token | CSS Variable | Light Value | Dark Value | Tailwind Class | Usage |
|-------|-------------|-------------|------------|----------------|-------|
| Chart 1 | `--chart-1` | `12 76% 61%` | `220 70% 50%` | `bg-chart-1` | First chart series |
| Chart 2 | `--chart-2` | `173 58% 39%` | `160 60% 45%` | `bg-chart-2` | Second chart series |
| Chart 3 | `--chart-3` | `197 37% 24%` | `30 80% 55%` | `bg-chart-3` | Third chart series |
| Chart 4 | `--chart-4` | `43 74% 66%` | `280 65% 60%` | `bg-chart-4` | Fourth chart series |
| Chart 5 | `--chart-5` | `27 87% 67%` | `340 75% 55%` | `bg-chart-5` | Fifth chart series |

### Sidebar Colors

| Token | CSS Variable | Light Value | Dark Value | Tailwind Class | Usage |
|-------|-------------|-------------|------------|----------------|-------|
| Sidebar BG | `--sidebar-background` | `220 20% 98%` (light gray) | `240 28% 12%` | `bg-sidebar` | Sidebar background |
| Sidebar FG | `--sidebar-foreground` | `240 5.3% 26.1%` | `240 5% 85%` | `text-sidebar-foreground` | Sidebar text |
| Sidebar Primary | `--sidebar-primary` | `157 63% 45%` | `160 60% 50%` | `bg-sidebar-primary` | Active sidebar item |
| Sidebar Primary FG | `--sidebar-primary-foreground` | `0 0% 100%` | `0 0% 9%` | `text-sidebar-primary-foreground` | Text on active item |
| Sidebar Accent | `--sidebar-accent` | `216 24% 95%` | `240 15% 18%` | `bg-sidebar-accent` | Hover state |
| Sidebar Accent FG | `--sidebar-accent-foreground` | `240 5.9% 10%` | `240 5% 85%` | `text-sidebar-accent-foreground` | Text on hover |
| Sidebar Border | `--sidebar-border` | `216 16% 91%` | `240 15% 20%` | `border-sidebar-border` | Sidebar dividers |
| Sidebar Ring | `--sidebar-ring` | `157 63% 45%` | `160 60% 50%` | `ring-sidebar-ring` | Sidebar focus rings |

---

## Typography Scale

All typography tokens are defined as CSS custom properties and registered as Tailwind font-size utilities with associated line-height and font-weight.

| Token | CSS Variable | Value | Tailwind Class | Line Height | Font Weight | Usage |
|-------|-------------|-------|----------------|-------------|-------------|-------|
| Page Title | `--font-size-page-title` | `1.75rem` (28px) | `text-page-title` | 1.2 | 700 (bold) | Main page headings |
| Section Heading | `--font-size-section-heading` | `1.125rem` (18px) | `text-section-heading` | 1.3 | 600 (semibold) | Card/section headers |
| Body | `--font-size-body` | `0.875rem` (14px) | `text-body` | 1.5 | 400 (normal) | Standard body text |
| Caption | `--font-size-caption` | `0.8125rem` (13px) | `text-caption` | 1.4 | 400 (normal) | Subtext, timestamps |
| Stat | `--font-size-stat` | `1.75rem` (28px) | `text-stat` | 1.2 | 700 (bold) | Large stat numbers |

**Usage example:**
```html
<h1 class="text-page-title">Dashboard</h1>
<h2 class="text-section-heading">Today's Habits</h2>
<p class="text-body">Complete your daily habits to build streaks.</p>
<span class="text-caption text-muted-foreground">Updated 5 minutes ago</span>
<span class="text-stat text-primary">42</span>
```

---

## Spacing Scale

| Token | CSS Variable | Value | Tailwind Class | Usage |
|-------|-------------|-------|----------------|-------|
| Card Padding | `--spacing-card-padding` | `1.5rem` (24px) | `p-card-padding` | Internal card padding |
| Page Padding | `--spacing-page-padding` | `2rem` (32px) | `p-page-padding` | Page-level horizontal padding |
| Card Gap | `--spacing-card-gap` | `1.5rem` (24px) | `gap-card-gap` | Gap between cards in grid |

**Usage example:**
```html
<div class="p-page-padding">
  <div class="grid gap-card-gap">
    <div class="p-card-padding bg-card rounded-lg border">...</div>
    <div class="p-card-padding bg-card rounded-lg border">...</div>
  </div>
</div>
```

---

## Layout Dimensions

| Token | CSS Variable | Value | Tailwind Class | Usage |
|-------|-------------|-------|----------------|-------|
| Sidebar Width | `--sidebar-width` | `200px` | `w-sidebar` | Expanded sidebar |
| Sidebar Mobile | `--sidebar-width-mobile` | `280px` | `w-sidebar-mobile` | Mobile sidebar overlay |
| Sidebar Icon | `--sidebar-width-icon` | `48px` | `w-sidebar-icon` | Collapsed (icon-only) sidebar |

### Border Radius

| Token | CSS Variable | Value | Tailwind Class |
|-------|-------------|-------|----------------|
| Radius | `--radius` | `0.75rem` (12px) | `rounded-lg` |
| Radius - 2px | computed | `0.625rem` (10px) | `rounded-md` |
| Radius - 4px | computed | `0.5rem` (8px) | `rounded-sm` |

---

## Tailwind Utility Quick Reference

### "What class do I use for X?"

| I want to... | Use this class | Token |
|--------------|----------------|-------|
| Gray page canvas | `bg-page` | `--page` |
| White content area | `bg-background` | `--background` |
| Card surface | `bg-card` | `--card` |
| Highlighted row | `bg-highlight` | `--highlight` |
| Sidebar background | `bg-sidebar` | `--sidebar-background` |
| Primary button | `bg-primary text-primary-foreground` | `--primary` |
| Subdued text | `text-muted-foreground` | `--muted-foreground` |
| Card border | `border` (uses default) | `--border` |
| Page title | `text-page-title` | `--font-size-page-title` |
| Section header | `text-section-heading` | `--font-size-section-heading` |
| Body text size | `text-body` | `--font-size-body` |
| Caption/subtext | `text-caption` | `--font-size-caption` |
| Large stat number | `text-stat` | `--font-size-stat` |
| Card internal padding | `p-card-padding` | `--spacing-card-padding` |
| Page horizontal padding | `p-page-padding` | `--spacing-page-padding` |
| Grid gap between cards | `gap-card-gap` | `--spacing-card-gap` |
| Sidebar width | `w-sidebar` | `--sidebar-width` |
| Active sidebar item | `bg-sidebar-accent text-sidebar-accent-foreground` | `--sidebar-accent` |

---

## Hardcoded Color Audit

The following files use hardcoded Tailwind color classes (`emerald-*`, `green-*`, `teal-*`) that will NOT respond to the `--primary` token. These need migration in future phases (Phases 5-6: Page Migration).

### Summary

| Color Family | Occurrences | Files |
|-------------|-------------|-------|
| `emerald-*` | ~75 | 19 files |
| `green-*` | ~10 | 5 files |
| `teal-*` | ~8 | 4 files |

### Detailed File-by-File Audit

#### `components/footer.tsx` (16 occurrences)
- `hover:text-emerald-600` on all footer links
- **Pattern:** Hover accent color for navigation links
- **Migration:** Replace with `hover:text-primary`

#### `components/hero.tsx` (7 occurrences)
- `from-emerald-50`, `to-teal-50`, `dark:from-emerald-950/20`, `dark:to-teal-950/20` - gradient backgrounds
- `from-emerald-600`, `to-teal-500` - text gradient
- `bg-emerald-600`, `hover:bg-emerald-700` - CTA button
- `text-green-600` (x3) - checkmark icons
- **Pattern:** Brand gradients and CTA styling
- **Migration:** Replace with `bg-primary`/`hover:bg-primary/90` for buttons; gradient needs design decision

#### `app/page.tsx` (7 occurrences)
- `text-emerald-600` - feature icon color
- `bg-emerald-600` - stats section background + CTA button
- `text-emerald-100` (x3) - text on emerald background
- **Pattern:** Landing page brand sections
- **Migration:** Replace with `bg-primary` and `text-primary-foreground`

#### `components/habits/milestone-card.tsx` (7 occurrences)
- `from-emerald-50`, `to-teal-50`, `border-emerald-200` - card gradient
- `bg-emerald-100`, `dark:bg-emerald-900/50` - icon background
- `text-emerald-600`, `dark:text-emerald-400` - icon color
- `text-emerald-900`, `dark:text-emerald-100` - title text
- `text-emerald-700`, `dark:text-emerald-300` - subtitle text
- **Pattern:** Celebration/achievement card styling
- **Migration:** Replace with semantic tokens; icon bg -> `bg-primary/10`

#### `components/habits/frequency-selector.tsx` (6 occurrences)
- `bg-emerald-500`, `hover:bg-emerald-600`, `data-[state=on]:bg-emerald-500` (x2 blocks)
- **Pattern:** Active/selected toggle states
- **Migration:** Replace with `bg-primary`/`hover:bg-primary/90`

#### `components/dashboard/habit-checklist.tsx` (5 occurrences)
- `from-emerald-50`, `to-teal-50`, `dark:from-emerald-950/30`, `dark:to-teal-950/30` - celebration gradient
- `bg-emerald-100`, `dark:bg-emerald-900/50` - icon background
- `text-emerald-600`, `dark:text-emerald-400` - icon color
- `text-emerald-900`, `dark:text-emerald-100` - heading
- `text-emerald-700`, `dark:text-emerald-300` - subtitle
- **Pattern:** "All done" celebration state
- **Migration:** Same as milestone-card pattern

#### `components/dashboard/tasks-today.tsx` (4 occurrences)
- `text-green-500` (x2) - low priority color
- `data-[state=checked]:bg-emerald-500`, `data-[state=checked]:border-emerald-500` - checked checkbox
- `text-emerald-600`, `dark:text-emerald-400` - completed task text
- **Pattern:** Task completion states and priority colors
- **Migration:** Checkboxes -> `data-[state=checked]:bg-primary`; priority may need separate token

#### `components/habits/streak-counter.tsx` (4 occurrences)
- `text-emerald-500` (x4) - streak count, star icons, personal best label
- **Pattern:** Streak celebration/highlight color
- **Migration:** Replace with `text-primary`

#### `components/habits/habit-empty-state.tsx` (3 occurrences)
- `text-emerald-500` - icon color
- `bg-emerald-100` - icon background
- `bg-emerald-500`, `hover:bg-emerald-600` - CTA button
- **Pattern:** Empty state icon and CTA
- **Migration:** Replace with `text-primary`, `bg-primary/10`, `bg-primary`

#### `components/tasks/task-empty-state.tsx` (3 occurrences)
- Same pattern as habit-empty-state
- **Migration:** Same approach

#### `components/tasks/task-detail-content.tsx` (5 occurrences)
- `text-green-500` - priority color
- `text-emerald-500` - completed icon
- `bg-emerald-500` - completed badge
- `border-l-emerald-500`, `bg-emerald-50`, `dark:bg-emerald-950/20` - completion banner
- `text-emerald-700`, `dark:text-emerald-400` - completion text
- **Pattern:** Task completion states
- **Migration:** Replace with `text-primary`, `bg-primary`, `bg-highlight`

#### `components/dashboard/absence-card.tsx` (4 occurrences)
- `border-l-emerald-500`, `bg-emerald-50`, `dark:bg-emerald-950/20` - success banner
- `text-emerald-500` - check icon
- `text-emerald-700`, `dark:text-emerald-400` - success text
- `data-[state=checked]:bg-emerald-500`, `data-[state=checked]:border-emerald-500` - checkbox
- **Pattern:** Absence acknowledgment success state
- **Migration:** Replace with `border-l-primary`, `bg-highlight`, `text-primary`

#### `components/habits/heatmap.tsx` (3 occurrences)
- `bg-emerald-500` - completed day cell
- `ring-emerald-500` - today indicator ring
- `bg-emerald-500` - legend completed marker
- **Pattern:** Habit completion visualization
- **Migration:** Replace with `bg-primary`, `ring-primary`

#### `components/habits/habit-card.tsx` (2 occurrences)
- `data-[state=checked]:bg-emerald-500`, `data-[state=checked]:border-emerald-500` - checkbox
- `from-emerald-500`, `to-emerald-400` - progress bar gradient
- **Pattern:** Habit card completion state
- **Migration:** Checkbox -> `data-[state=checked]:bg-primary`; progress bar -> `bg-primary`

#### `components/habits/habit-row.tsx` (1 occurrence)
- `data-[state=checked]:bg-emerald-500`, `data-[state=checked]:border-emerald-500` - checkbox
- **Migration:** `data-[state=checked]:bg-primary`

#### `components/habits/habit-form.tsx` (1 occurrence)
- `bg-emerald-500`, `hover:bg-emerald-600` - submit button
- **Migration:** `bg-primary hover:bg-primary/90`

#### `components/tasks/task-form.tsx` (2 occurrences)
- `text-green-500` - low priority color
- `bg-emerald-500`, `hover:bg-emerald-600` - submit button
- **Migration:** Button -> `bg-primary`; priority color needs separate token

#### `components/tasks/task-card.tsx` (2 occurrences)
- `text-green-500` - low priority color
- `data-[state=checked]:bg-emerald-500`, `data-[state=checked]:border-emerald-500` - checkbox
- **Migration:** Checkbox -> `data-[state=checked]:bg-primary`

#### `components/habits/habit-detail-content.tsx` (1 occurrence)
- `bg-emerald-500` - active status indicator
- **Migration:** `bg-primary`

#### `components/habits/next-milestone.tsx` (2 occurrences)
- `text-emerald-600`, `dark:text-emerald-400` - target icon
- **Migration:** `text-primary`

#### `components/mobile-bottom-nav.tsx` (1 occurrence)
- `text-emerald-600`, `dark:text-emerald-400` - active nav item
- **Migration:** `text-primary`

#### `components/layouts/app-layout.tsx` (1 occurrence)
- `from-emerald-600`, `to-teal-500` - logo text gradient
- **Migration:** Needs design decision (gradient vs solid `text-primary`)

#### `components/navbar.tsx` (1 occurrence)
- `text-emerald-600` - logo text
- **Migration:** `text-primary`

#### `components/settings/settings-content.tsx` (1 occurrence)
- `text-green-500` - success checkmark
- **Migration:** `text-primary`

#### `components/dashboard/daily-snapshot.tsx` (3 occurrences)
- `text-emerald-500` - positive trend indicator
- `text-emerald-600`, `dark:text-emerald-400` - target icon
- `bg-emerald-100`, `dark:bg-emerald-900/30` - icon background
- **Migration:** `text-primary`, `bg-primary/10`

### Test Files (informational, not migrated)

#### `tests/components/habits/heatmap.test.tsx` (2 occurrences)
- Asserts `bg-emerald-500` and `ring-emerald-500` classes
- **Note:** These tests will need updating when heatmap.tsx is migrated

#### `tests/components/dashboard/daily-snapshot.test.tsx` (1 occurrence)
- Asserts `text-emerald-500` class
- **Note:** This test will need updating when daily-snapshot.tsx is migrated

### Common Migration Patterns

| Current Pattern | Replace With | Notes |
|----------------|--------------|-------|
| `bg-emerald-500` | `bg-primary` | Buttons, active states |
| `hover:bg-emerald-600` | `hover:bg-primary/90` | Button hover |
| `text-emerald-600` | `text-primary` | Icons, accent text |
| `dark:text-emerald-400` | `dark:text-primary` | Dark mode accent (auto via token) |
| `bg-emerald-100` | `bg-primary/10` | Light accent backgrounds |
| `bg-emerald-50` | `bg-highlight` | Highlighted/celebration rows |
| `border-emerald-500` | `border-primary` | Active borders |
| `data-[state=checked]:bg-emerald-500` | `data-[state=checked]:bg-primary` | Checkbox checked state |
| `text-green-500` | `text-primary` | Success/low-priority (evaluate per-use) |
| `from-emerald-600 to-teal-500` | Design decision needed | Brand gradients |

---

## Migration Notes

### What Changed from Previous Token Values

| Token | Old Value | New Value | Why |
|-------|-----------|-----------|-----|
| `--primary` | `160 84% 39%` | `157 63% 45%` | Chameleon-extracted; less saturated, more professional |
| `--radius` | `0.5rem` (8px) | `0.75rem` (12px) | Chameleon uses 12px border-radius |
| `--border` (light) | `214.3 31.8% 91.4%` | `216 16% 91%` | Cleaner hue, lower saturation |
| `--muted-foreground` (light) | `215.4 16.3% 46.9%` | `0 0% 45%` | Neutral gray instead of blue-tinted |

### New Tokens (not present before)

| Token | Purpose |
|-------|---------|
| `--page` | Gray canvas color; separates page background from content areas |
| `--highlight` | Active/highlighted row tint (light teal in light mode, deep teal in dark) |
| `--sidebar-*` (8 tokens) | Full sidebar color system (was partially defined before) |
| `--font-size-*` (5 tokens) | Typography scale from Chameleon measurements |
| `--spacing-*` (3 tokens) | Semantic spacing from Chameleon measurements |
| `--sidebar-width-*` (3 tokens) | Sidebar dimension tokens for responsive layout |

### Key Differences from Default shadcn/ui

1. **Primary is green/teal, not neutral** -- This is the BetterR.Me brand color
2. **Sidebar has dedicated tokens** -- Goes beyond default shadcn which just uses `accent` for sidebar
3. **`--page` token is new** -- shadcn default doesn't separate page canvas from content background
4. **`--highlight` token is new** -- Custom for BetterR.Me's highlighted row pattern
5. **Dark mode uses warm blue-purple base** -- Default shadcn dark is neutral gray; this uses `240` hue for warmth
6. **Border radius is larger** -- 12px vs default 8px for a more rounded, friendly feel

---

*Reference document for Phase 01: Design Token Extraction & CSS Foundation*
*All subsequent phases should use this document to look up correct Tailwind classes*
