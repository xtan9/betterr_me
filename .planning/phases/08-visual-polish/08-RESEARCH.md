# Phase 8: Visual Polish - Research

**Researched:** 2026-02-17
**Domain:** CSS design tokens (dark mode accent desaturation), Tailwind CSS micro-interactions (hover/focus transitions)
**Confidence:** HIGH

## Summary

Phase 8 addresses two focused requirements: (1) desaturating the emerald/teal accent color in dark mode for eye comfort (VISL-06), and (2) adding subtle hover/focus micro-interactions to cards and buttons (VISL-07). Both requirements are purely CSS/Tailwind concerns with no new libraries needed.

**VISL-06 (Dark mode desaturation):** The current dark mode primary is `160 60% 50%` while light mode is `157 63% 45%`. The saturation difference is only 3 percentage points (63% vs 60%), which is imperceptible. Best practices recommend reducing saturation by ~15-20% in dark mode and slightly increasing lightness. A target of approximately `160 45% 55%` would be visibly more muted while maintaining readability. This is a single-line CSS change in `globals.css` under `.dark`. Additionally, 13 component files still use hardcoded `emerald-*` and `teal-*` Tailwind classes that bypass the design token system entirely -- these must be migrated to `bg-primary`/`text-primary` tokens so that the dark mode desaturation actually takes effect.

**VISL-07 (Micro-interactions):** The project already uses `tailwindcss-animate` (v1.0.7) and Tailwind's built-in `transition-*` utilities. Two components (HabitCard, TaskCard) already have hover interactions (`hover:shadow-lg hover:scale-[1.03] hover:-translate-y-0.5 duration-200`). However, the base Card component in `components/ui/card.tsx` has zero hover/focus styles, StatCard has no interactions, and buttons only have basic `hover:bg-primary/90` opacity shifts with no transition timing beyond `transition-colors`. The approach is to add `transition-all duration-200` and subtle hover effects (border highlight, shadow lift) without modifying shadcn/ui primitives -- instead applying via className overrides at the usage site, or by extending the base Card with a composable wrapper/utility class.

**Primary recommendation:** Split into two sub-plans: (1) dark mode desaturation token change + remaining hardcoded emerald migration, (2) micro-interaction utility classes and application across all interactive elements.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VISL-06 | Emerald/teal accent is slightly desaturated in dark mode for eye comfort | Change `--primary` in `.dark` from `160 60% 50%` to approximately `160 45% 55%` (reduce saturation ~15%, increase lightness ~5%). Also migrate remaining 13 files with hardcoded emerald/teal colors to design tokens so the desaturation applies universally. |
| VISL-07 | Cards and buttons have subtle hover/focus micro-interactions | Add `transition-all duration-200` base, `hover:shadow-md hover:border-border/80` to interactive cards, `hover:-translate-y-0.5` for lift effect, consistent `focus-visible:ring-2 focus-visible:ring-ring` for keyboard nav. Apply via className at usage sites (not by modifying `components/ui/` primitives). |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Tailwind CSS | 3.4.17 | Utility classes for transitions, shadows, transforms | Already installed; all interactions expressed as utility classes |
| tailwindcss-animate | 1.0.7 | Extended animation utilities (fade, slide, zoom) | Already installed as Tailwind plugin; used by shadcn/ui components |
| CSS Custom Properties | N/A | Design token system for theme colors | Already in `globals.css`; the dark mode desaturation is a token value change |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| next-themes | (installed) | Class-based dark mode toggle | Already wired; no changes needed for theme switching mechanism |
| class-variance-authority | (installed) | Variant-based component styling | Used in Button; could be used if creating a CardVariant wrapper |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Tailwind transition utilities | Framer Motion | Overkill for CSS-only hover/focus effects; adds 30KB+ bundle; ROADMAP.md explicitly excludes spring physics |
| CSS custom properties for color | CSS `color-mix()` | Modern but limited browser support for complex operations; HSL direct values are simpler and more explicit |
| OKLCH color space | HSL | OKLCH is perceptually uniform (better for lightness matching), but project already uses HSL throughout; switching color spaces is out of scope |

**Installation:**
```bash
# No new packages needed. Everything required is already installed.
```

## Architecture Patterns

### Pattern 1: Dark Mode Accent Desaturation via CSS Custom Properties

**What:** Reduce the `--primary` saturation value in the `.dark` CSS class to create a visibly muted accent color in dark mode.

**When to use:** Whenever accent colors need different vibrancy between light and dark themes.

**Current state:**
```css
/* Light mode */
:root {
  --primary: 157 63% 45%;        /* S=63% L=45% -- vibrant teal-green */
}

/* Dark mode (current -- too similar to light) */
.dark {
  --primary: 160 60% 50%;        /* S=60% L=50% -- only 3% less saturated */
}
```

**Recommended change:**
```css
/* Dark mode (desaturated for eye comfort) */
.dark {
  --primary: 160 45% 55%;        /* S=45% L=55% -- visibly muted, lighter */
}
```

**Rationale:**
- Saturation drops from 63% to 45% (18-point reduction) -- visible difference
- Lightness increases from 45% to 55% -- ensures contrast against dark backgrounds
- Hue stays at 160 -- maintains brand identity
- Must also update `--ring`, `--sidebar-primary`, `--sidebar-ring` to match since they reference the same accent color
- Source: [Material Design dark theme guidance](https://m3.material.io/styles/color/dark-theme), [web.dev HSL theming patterns](https://web.dev/patterns/theming/hsl-starter-kit)

**Confidence:** HIGH -- direct CSS custom property change, immediately verifiable by toggling dark mode.

### Pattern 2: Hardcoded Emerald Migration to Design Tokens

**What:** Replace remaining hardcoded Tailwind color classes (`emerald-*`, `teal-*`, `green-*`) with design token references (`bg-primary`, `text-primary`, `bg-highlight`, etc.) so that dark mode desaturation applies universally.

**When to use:** Any component still using `emerald-500`, `teal-500`, or `green-500` as accent/brand colors.

**Files requiring migration (13 component files + 1 page + 1 test file):**

| File | Current Pattern | Replacement |
|------|----------------|-------------|
| `components/footer.tsx` | `hover:text-emerald-600` (x16) | `hover:text-primary` |
| `components/hero.tsx` | `bg-emerald-600`, gradient classes, `text-green-600` | `bg-primary`, `text-primary`, gradient needs decision |
| `components/navbar.tsx` | `text-emerald-600` | `text-primary` |
| `components/habits/heatmap.tsx` | `bg-emerald-500`, `ring-emerald-500` | `bg-primary`, `ring-primary` |
| `components/habits/streak-counter.tsx` | `text-emerald-500` (x4) | `text-primary` |
| `components/habits/habit-card.tsx` | `data-[state=checked]:bg-emerald-500`, gradient | `data-[state=checked]:bg-primary`, `bg-primary` |
| `components/habits/habit-empty-state.tsx` | `text-emerald-500`, `bg-emerald-100`, `bg-emerald-500` | `text-primary`, `bg-primary/10`, `bg-primary` |
| `components/habits/frequency-selector.tsx` | `bg-emerald-500`, `hover:bg-emerald-600` | `bg-primary`, `hover:bg-primary/90` |
| `components/tasks/task-card.tsx` | `data-[state=checked]:bg-emerald-500` | `data-[state=checked]:bg-primary` |
| `components/tasks/task-empty-state.tsx` | `text-emerald-500`, `bg-emerald-100`, `bg-emerald-500` | `text-primary`, `bg-primary/10`, `bg-primary` |
| `components/tasks/task-detail-content.tsx` | `text-emerald-500`, `bg-emerald-500`, border/bg patterns | `text-primary`, `bg-primary`, `bg-highlight`, `border-primary` |
| `components/habits/next-milestone.tsx` | `text-emerald-600 dark:text-emerald-400` | `text-primary` |
| `app/page.tsx` | `text-emerald-600`, `bg-emerald-600`, `text-emerald-100` | `text-primary`, `bg-primary`, `text-primary-foreground` |
| `tests/components/habits/heatmap.test.tsx` | asserts `bg-emerald-500`, `ring-emerald-500` | Update to `bg-primary`, `ring-primary` |

**Confidence:** HIGH -- migration patterns are well-documented in DESIGN-TOKENS.md from Phase 1.

### Pattern 3: Micro-Interaction Classes for Cards

**What:** Apply consistent hover/focus transitions to interactive card elements using Tailwind utility classes.

**Recommended card interaction pattern:**
```tsx
// Interactive card (clickable or containing interactive content)
<Card className="transition-all duration-200 hover:shadow-md hover:border-primary/30">
  {/* content */}
</Card>

// Card with lift effect (grid items like HabitCard, TaskCard)
<Card className="transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30">
  {/* content */}
</Card>

// Non-interactive card (display-only like StatCard, MotivationMessage)
<Card> {/* No transition classes -- don't animate static content */} </Card>
```

**What NOT to do:**
- Do NOT modify `components/ui/card.tsx` -- it is a shadcn/ui managed primitive
- Do NOT use `hover:scale-[1.03]` -- the current 3% scale on HabitCard/TaskCard is too aggressive, causes layout jank, and feels "bouncy" not "polished". Replace with `-translate-y-0.5` (subtle lift only)
- Do NOT add transitions to `<Card>` itself -- not all cards are interactive

**Confidence:** HIGH -- Tailwind transition utilities are well-documented and already used in codebase.

### Pattern 4: Button Micro-Interactions

**What:** Enhance button hover/focus states beyond the current `hover:bg-primary/90` opacity shift.

**Current button base:**
```tsx
// From components/ui/button.tsx (DO NOT MODIFY)
"transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
```

**Enhancement approach -- at usage sites or via wrapper utility:**
```tsx
// Option A: Direct className override at usage site
<Button className="transition-all duration-200 hover:shadow-sm active:scale-[0.98]">

// Option B: Utility class in globals.css for consistency
// @layer components {
//   .btn-interactive {
//     @apply transition-all duration-200 hover:shadow-sm active:scale-[0.98];
//   }
// }
```

**Note:** The shadcn/ui button already has `transition-colors`. Changing to `transition-all` broadens what gets animated (shadow, transform). This is additive, not a breaking change.

**Confidence:** HIGH -- `transition-all` is a superset of `transition-colors`.

### Pattern 5: Focus-Visible Consistency

**What:** Ensure all interactive elements (cards, rows, clickable divs) have consistent `focus-visible:ring` styles for keyboard navigation.

**Current gaps identified:**
- `HabitRow` button has no focus-visible styles (only `text-left min-w-0`)
- `DashboardContent` empty state buttons rely on Button default
- `TaskCard`/`HabitCard` inner buttons have `focus-visible:ring-2` but the Card itself has none

**Standard pattern:**
```tsx
// Interactive non-button elements
className="... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md"
```

**Confidence:** HIGH -- follows existing shadcn/ui focus pattern.

### Anti-Patterns to Avoid

- **Modifying `components/ui/*` files:** These are shadcn/ui managed. Apply overrides via className props at usage sites.
- **Using `hover:scale-[1.03]`:** 3% scale causes layout reflow and feels unprofessional at fast hover speeds. Prefer `hover:-translate-y-0.5` (GPU-accelerated translate, no reflow).
- **Adding transitions to static/display-only cards:** MotivationMessage, StatCard, WeeklyInsightCard are not clickable as wholes -- don't add hover lift effects to them.
- **Forgetting `prefers-reduced-motion`:** Currently zero motion reduction support exists. Must add `motion-reduce:transition-none motion-reduce:transform-none` for accessibility.
- **Overly bright accent in dark mode:** Don't increase lightness above ~60% or it will appear washed out. The desaturated accent should still be clearly green/teal, just muted.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hover animations | Custom CSS keyframes | `transition-all duration-200` + Tailwind hover utilities | Simpler, consistent, GPU-accelerated transforms |
| Dark mode color switching | JavaScript-based color manipulation | CSS custom properties in `.dark` class | Already the established pattern; zero-JS, instant theme toggle |
| Focus ring styling | Custom outline/border hacks | `focus-visible:ring-2 focus-visible:ring-ring` | shadcn/ui standard, respects `--ring` token |
| Reduced motion | Manual media query | `motion-reduce:*` Tailwind variant | Built into Tailwind 3, maps to `@media (prefers-reduced-motion: reduce)` |

**Key insight:** Phase 8 is entirely CSS/Tailwind -- no JavaScript behavior changes, no new components, no new packages. The "visual polish" is achieved through token refinement and utility class application.

## Common Pitfalls

### Pitfall 1: Modifying shadcn/ui Components Directly

**What goes wrong:** Changes to `components/ui/card.tsx` or `components/ui/button.tsx` get overwritten by `npx shadcn@latest add` updates.
**Why it happens:** Tempting to add `transition-all` to the Card base since it applies everywhere.
**How to avoid:** Apply interaction classes at usage sites via `className` prop. If a consistent pattern emerges, create a utility class in `globals.css` under `@layer components`.
**Warning signs:** Diff touching files in `components/ui/` directory.

### Pitfall 2: Inconsistent Hover Effects Between Themes

**What goes wrong:** Hover shadow that looks subtle in light mode becomes invisible or too harsh in dark mode.
**Why it happens:** `shadow-md` uses black alpha -- in dark mode on dark backgrounds, the shadow blends in; on light backgrounds, it's prominent.
**How to avoid:** Use `hover:shadow-md` which works reasonably in both themes due to Tailwind's shadow defaults. For border highlights, use `hover:border-primary/30` which auto-adapts via the `--primary` token.
**Warning signs:** Hover effect only visible in one theme.

### Pitfall 3: Missing prefers-reduced-motion Support

**What goes wrong:** Users with vestibular disorders experience discomfort from card lift/translate animations.
**Why it happens:** `prefers-reduced-motion` is forgotten because developers test without enabling it.
**How to avoid:** Add `motion-reduce:transition-none motion-reduce:transform-none` alongside any `transition-*` class.
**Warning signs:** No `motion-reduce:` classes anywhere in the codebase (currently the case -- zero instances found).

### Pitfall 4: Scale Transform Causing Layout Reflow

**What goes wrong:** `hover:scale-[1.03]` on grid cards causes sibling elements to shift and the page to "jitter."
**Why it happens:** `transform: scale()` affects the element's visual bounding box, which can cause parent container recalculation.
**How to avoid:** Use `hover:-translate-y-0.5` instead (vertical lift without size change). Or use `will-change-transform` to promote to GPU layer.
**Warning signs:** Adjacent cards visually shifting when hovering one card.

### Pitfall 5: Hardcoded Colors Bypassing Dark Mode Desaturation

**What goes wrong:** After desaturating `--primary` in dark mode, many elements still show vibrant `emerald-500` because they use hardcoded Tailwind classes.
**Why it happens:** 13+ files still use `emerald-*` instead of `primary` token.
**How to avoid:** Migrate ALL remaining hardcoded emerald/teal/green accent colors to design tokens as part of this phase.
**Warning signs:** Some UI elements are muted in dark mode while others remain vibrant.

### Pitfall 6: Forgetting Sidebar-Related Primary Tokens

**What goes wrong:** After updating `--primary` in `.dark`, the sidebar active state still uses the old value.
**Why it happens:** `--sidebar-primary` and `--sidebar-ring` are separate tokens that also reference the accent color.
**How to avoid:** Update `--sidebar-primary`, `--sidebar-ring`, and `--ring` in `.dark` to match the new desaturated `--primary`.
**Warning signs:** Sidebar active indicator looks different from page-level primary buttons in dark mode.

## Code Examples

### Example 1: Dark Mode Desaturation Token Change

```css
/* In app/globals.css under .dark */
.dark {
  /* Before: barely desaturated (S=60, L=50) */
  /* --primary: 160 60% 50%; */

  /* After: visibly desaturated (S=45, L=55) */
  --primary: 160 45% 55%;
  --ring: 160 45% 55%;

  /* Sidebar tokens must match */
  --sidebar-primary: 160 45% 55%;
  --sidebar-ring: 160 45% 55%;
}
```

### Example 2: Migrating Hardcoded Emerald to Token

```tsx
// Before (habit-card.tsx)
<Checkbox
  className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
/>

// After
<Checkbox
  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
/>
```

### Example 3: Interactive Card with Micro-Interactions

```tsx
// Before (habit-card.tsx)
<Card className="transition-all hover:shadow-lg hover:scale-[1.03] hover:-translate-y-0.5 duration-200 p-5">

// After -- refined, no scale, added border highlight + motion-reduce
<Card className="transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 motion-reduce:transition-none motion-reduce:hover:transform-none p-5">
```

### Example 4: Reduced Motion Support

```tsx
// Any element with transition animations
className="transition-all duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:transform-none"
```

### Example 5: Button Active State Micro-Interaction

```tsx
// Primary button with press feedback
<Button className="transition-all duration-150 active:scale-[0.98]">
  Save
</Button>
```

### Example 6: Progress Bar Gradient Migration

```tsx
// Before (habit-card.tsx)
<div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" />

// After -- uses primary token
<div className="h-full rounded-full bg-primary" />
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Same accent color light/dark | Desaturated accent in dark mode | Material Design 3 (2022+) | Reduces eye strain, feels more premium |
| `hover:scale()` for card hover | `hover:-translate-y` for card lift | UX consensus 2023+ | Avoids layout reflow, smoother GPU animation |
| No motion reduction | `motion-reduce:*` Tailwind variant | Tailwind 3.x (2022) | WCAG 2.1 SC 2.3.3 compliance |
| Hardcoded color classes | Design token system (CSS custom properties) | Industry standard 2020+ | Theme-aware, single source of truth |

**Deprecated/outdated:**
- `hover:scale-[1.0x]` for card interactions -- causes reflow, replaced by translate-based lift
- Hardcoded `emerald-*` color classes -- should all be design tokens by now

## Open Questions

1. **Hero section gradient handling**
   - What we know: `components/hero.tsx` uses `from-emerald-600 to-teal-500` for text gradient and `from-emerald-50 via-background to-teal-50` for background gradient
   - What's unclear: Should gradients become solid `bg-primary` / `text-primary`, or should we define `--primary-gradient-from` / `--primary-gradient-to` tokens?
   - Recommendation: Landing page is lower priority than app pages. Convert CTA button to `bg-primary`, keep background gradient as-is (cosmetic, not functional accent). Convert text gradient to `text-primary` for simplicity. The hero page is not behind auth so dark mode is less critical.

2. **`text-green-500` for priority indicators**
   - What we know: Task priority "low" uses `text-green-500` in `task-card.tsx`, `task-form.tsx`, `task-detail-content.tsx`
   - What's unclear: Is green-500 for "low priority" a brand accent or a semantic color (like red for destructive)?
   - Recommendation: Keep `text-green-500` for priority -- it's semantic (green=low, yellow=medium, red=high), not brand accent. It should NOT be converted to `text-primary`. This is intentional use of color semantics.

3. **Exact desaturated primary value**
   - What we know: Light is `157 63% 45%`, current dark is `160 60% 50%`, recommended target is approximately `160 45% 55%`
   - What's unclear: Exact HSL values need visual testing in browser
   - Recommendation: Start with `160 45% 55%` and adjust during implementation based on visual contrast check. Verify WCAG AA contrast against `--card` background (`240 25% 18%` = approximately `#2a2d45`).

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `app/globals.css`, `tailwind.config.ts`, `components/ui/button.tsx`, `components/ui/card.tsx` -- current token values and component patterns
- `.planning/phases/01-design-token-extraction-css-foundation/DESIGN-TOKENS.md` -- complete token reference with migration patterns
- [Tailwind CSS V3 documentation](https://v3.tailwindcss.com/docs) via Context7 (`/websites/v3_tailwindcss`) -- transition, shadow, transform utilities
- [tailwindcss-animate documentation](https://github.com/jamiebuilds/tailwindcss-animate) via Context7 (`/jamiebuilds/tailwindcss-animate`) -- animation utilities

### Secondary (MEDIUM confidence)
- [Material Design dark theme guidance](https://m3.material.io/styles/color/dark-theme) -- desaturation best practices (reduce S ~15-20%, increase L ~5-10%)
- [web.dev HSL theming patterns](https://web.dev/patterns/theming/hsl-starter-kit) -- HSL-based light/dark token patterns
- [Dark mode accent desaturation best practices (WebSearch)](https://design.dev/guides/dark-mode-css/) -- consensus on S reduction 60-80% range in dark mode

### Tertiary (LOW confidence)
- None -- all findings verified through primary or secondary sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed, everything already installed
- Architecture: HIGH -- patterns directly observed in existing codebase, well-documented migration paths from Phase 1
- Pitfalls: HIGH -- identified through direct codebase analysis (zero motion-reduce instances, 13 files with hardcoded emerald, scale-causing-reflow observed in existing cards)

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable domain -- CSS token values and Tailwind utilities don't change frequently)
