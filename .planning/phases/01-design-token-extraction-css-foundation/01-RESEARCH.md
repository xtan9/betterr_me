# Phase 1: Design Token Extraction & CSS Foundation - Research

**Researched:** 2026-02-16
**Domain:** CSS custom properties, design tokens, Tailwind CSS theming, dark mode elevation
**Confidence:** HIGH

## Summary

This phase is purely CSS token work: extract visual values from Chameleon's dashboard (via screenshots), encode them as CSS custom properties in `globals.css`, fix the sidebar variable format inconsistency, and define a Linear-inspired dark mode elevation system. No component changes, no layout changes.

The current codebase has a critical inconsistency: Tailwind CSS 3.4.17 is installed but `globals.css` contains Tailwind v4 directives (`@custom-variant`, `@theme inline`) that are silently ignored. The shadcn/ui core tokens use raw HSL format (`--background: 0 0% 100%`) consumed via `hsl(var(--background))` in `tailwind.config.ts`, but the sidebar tokens use `hsl()`-wrapped values (`--sidebar: hsl(0 0% 98%)`) in a `@theme inline` block that Tailwind 3 does not process. This entire sidebar variable block needs reformatting to match the raw HSL pattern used by all other shadcn tokens.

The Chameleon screenshots provide clear visual reference for light mode token extraction. Dark mode uses a Linear-inspired approach rather than Chameleon's dark mode.

**Primary recommendation:** Fix the sidebar variable format to raw HSL, add new semantic surface tokens (page background, card surface, sidebar surface), define typography scale tokens, and establish a 3-level dark mode elevation system -- all as CSS custom properties consumed through Tailwind's `hsl(var(--xxx))` pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Main content area background is white (or very near-white) -- NOT gray
- Cards are white with subtle light gray borders for separation -- depth comes from borders, not shadows
- Sidebar background is a distinct light gray -- noticeably different from the white content area
- Extract Chameleon's exact measured values for all three surfaces (content bg, card bg, sidebar bg)
- Subtle light gray border, minimal or no visible box-shadow for cards
- Rounded corners -- match Chameleon's exact measured radius (~12px observed)
- Generous internal padding -- match Chameleon's measured value (~24px observed)
- Active/highlighted rows (like leaderboard #1) use a light teal/green background tint
- Softer dark base (~#1a1a2e range), NOT near-black -- easier on eyes, like Linear's dark mode
- 3 elevation levels: page background (darkest), card surface (mid-tone), popover/modal (lightest)
- Sidebar is darker than the main content area in dark mode -- sidebar recedes visually
- Reference: Linear's dark mode for overall feel, adapted with emerald/teal accent
- Chameleon uses green/teal (same family as BetterR.Me's current emerald) -- NOT blue
- Extract Chameleon's exact accent shade to replace current primary (160 84% 39%)
- Accent used for: active sidebar states, CTA buttons, links, stat values, logo tinting
- Extract Chameleon's exact type scale: heading sizes, body text sizes, font weights, line heights
- Chameleon uses Inter -- clean sans-serif with clear weight hierarchy
- Page titles are large and bold, body text is well-spaced
- Pixel-perfect extraction of all typographic values
- Pixel-perfect extraction of Chameleon's CSS values for light mode
- Extract ALL tokens: colors, border radius, spacing/padding, typography, border colors, shadows
- Only exception: dark mode is Linear-inspired (Chameleon dark mode not used as reference)

### Claude's Discretion
- Exact HSL reformatting approach for sidebar CSS variables
- How to organize/name the extracted design tokens in globals.css
- Dark mode elevation step values (exact lightness increments between 3 levels)
- Which Chameleon page(s) to measure from when values differ between pages

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Critical Codebase Finding: Tailwind v3/v4 Mixed State

**Confidence: HIGH** (verified by examining installed packages and source files)

The project has a critical inconsistency that must be understood before making changes:

| Aspect | Current State | Expected for TW3 |
|--------|---------------|-------------------|
| Installed Tailwind | 3.4.17 | 3.x |
| `tailwind.config.ts` | Present, uses `hsl(var(--xxx))` | Correct for TW3 |
| `@custom-variant` in CSS | Present | TW4 only, ignored by TW3 |
| `@theme inline` in CSS | Present | TW4 only, ignored by TW3 |
| Core tokens format | Raw HSL: `--background: 0 0% 100%` | Correct for TW3 |
| Sidebar tokens format | Wrapped: `--sidebar: hsl(0 0% 98%)` | Wrong for TW3 |
| Sidebar in `tailwind.config.ts` | NOT present | Would need to be added for TW3 |

**Impact:** The sidebar variables currently exist in CSS but are NOT consumable by Tailwind 3 utility classes. The `@theme inline` block is ignored. When Phase 2 adds the sidebar component, these variables need to be in raw HSL format AND registered in `tailwind.config.ts`.

**Recommendation:** Convert sidebar variables to raw HSL format, move them inside `@layer base` alongside other tokens, and register sidebar colors in `tailwind.config.ts` so they work as utility classes. Remove the orphaned `@theme inline` block and `@custom-variant` directive (these are dead code under TW3).

## Chameleon Visual Analysis (from Screenshots)

**Confidence: MEDIUM** (visual estimation from screenshots, not DevTools-inspected)

### Extracted Values from Screenshots

Based on careful analysis of `chameleon-home-full.png`, `chameleon-sidebar.png`, and `chameleon-tours.png`:

#### Surfaces & Backgrounds
| Token | Estimated Value | HSL Approximation | Source |
|-------|----------------|-------------------|--------|
| Page background | `#f5f7fa` (cool light gray) | `216 25% 97%` | Home + Tours page main area |
| Card/content surface | `#ffffff` (white) | `0 0% 100%` | Card panels on home page |
| Sidebar background | `#f8f9fb` (off-white, slightly gray) | `220 20% 98%` | Sidebar in all screenshots |
| Sidebar active item bg | `#eef1f5` (light gray-blue) | `216 24% 95%` | "Home" active state |
| Card border | `#e5e8ec` (subtle gray) | `216 16% 91%` | Card edges on home page |

**Note on success criterion 1:** The roadmap says "page background (gray) and card surfaces (white)" but the user decided content area background is "white (or very near-white) -- NOT gray." The gray background is actually the page-level background visible around and between cards, while the main content area itself has white cards. Both values are needed: the page canvas is a subtle gray, and cards floating on it are white.

#### Accent / Green
| Token | Estimated Value | HSL Approximation | Source |
|-------|----------------|-------------------|--------|
| Primary green (CTA buttons) | `#2db67e` or similar | `157 63% 45%` | "Create New Experience" button |
| Green stat values | Same green family | `157 63% 45%` | Leaderboard numbers |
| Active sidebar icon tint | Softer green/teal | `160 50% 40%` | Home icon active state |
| Highlighted row bg | `#e8f7f0` (very light green) | `155 50% 94%` | Leaderboard #1 row |

**Comparison to current primary:** Current is `160 84% 39%` (a more saturated emerald). Chameleon's green appears slightly less saturated and shifted toward teal. Recommend `157 63% 45%` as the new primary.

#### Typography
| Token | Estimated Value | Notes |
|-------|----------------|-------|
| Font family | Inter | Confirmed in screenshots, already used by project |
| Page title (e.g. "Tours") | ~28-32px, weight 700 | Tours page title |
| Section heading | ~18-20px, weight 600 | "User Coverage", "Experiences Leaderboard" |
| Body text | 14px, weight 400 | Table content, descriptions |
| Small/caption | 12-13px, weight 400-500 | Labels, metadata |
| Stat value (large) | ~28-32px, weight 700 | "22.6K", "20", "842" |
| Subtitle | 14px, weight 400, muted color | "Announcements or Walkthroughs..." |
| Line height (body) | ~1.5 | Standard body text |
| Line height (headings) | ~1.2-1.3 | Titles |

#### Spacing & Radius
| Token | Estimated Value | Source |
|-------|----------------|--------|
| Card border-radius | 12px (0.75rem) | Cards on home page |
| Card padding | 24px (1.5rem) | Internal card spacing |
| Card gap (between cards) | 20-24px | Space between adjacent cards |
| Page content padding | 32px (2rem) | Padding around content area |
| Sidebar width (expanded) | ~200px | Sidebar in screenshots |
| Button border-radius | 8px (0.5rem) | CTA buttons |
| Badge/pill border-radius | 6px (0.375rem) | Status badges on Tours page |
| Table row height | ~48-52px | Leaderboard rows |

#### Shadows
| Token | Estimated Value | Notes |
|-------|----------------|--------|
| Card shadow | `0 1px 3px rgba(0,0,0,0.04)` or none | Very minimal, border-driven depth |
| Button shadow | None visible | Flat green buttons |

## Dark Mode Elevation System

**Confidence: MEDIUM** (informed by Linear's approach and dark mode best practices, user specified ~#1a1a2e range)

### Recommended 3-Level System

The user specified a softer dark base around `#1a1a2e` -- this is a desaturated dark blue-purple, much more comfortable than the current near-black `0 0% 3.9%` (approximately `#0a0a0a`).

| Level | Role | Hex | HSL | Lightness Step |
|-------|------|-----|-----|----------------|
| Level 0 (base) | Page background | `#1a1a2e` | `240 27% 14%` | Base |
| Level 1 (surface) | Cards, main panels | `#22223a` | `240 25% 18%` | +4% lightness |
| Level 2 (elevated) | Popovers, modals, dropdowns | `#2a2a48` | `240 24% 22%` | +4% lightness |
| Sidebar | Sidebar background | `#151528` | `240 28% 12%` | -2% from base (darker) |

**Rationale:**
- Base at 14% lightness matches `#1a1a2e` range specified by user
- 4% lightness increments between levels provide visible but subtle separation
- Sidebar at 12% lightness is darker than the main content (user requirement)
- The slight blue-purple hue (240 hue) gives warmth compared to pure neutral dark
- Consistent with Linear's approach: charcoal base, not black, with elevation via lightness

### Dark Mode Borders & Text
| Token | HSL | Notes |
|-------|-----|-------|
| Border (dark) | `240 15% 25%` | Subtle but visible on dark surfaces |
| Foreground (dark) | `0 0% 95%` | Near-white, not pure white |
| Muted foreground (dark) | `240 5% 60%` | Secondary text |
| Primary (dark) | `160 60% 50%` | Slightly lighter/desaturated emerald for dark bg |

## Architecture Patterns

### Recommended Token Organization in globals.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* === Core shadcn tokens === */
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;

    /* === Surface hierarchy (NEW) === */
    --page: 216 25% 97%;              /* Gray canvas behind cards */
    --card: 0 0% 100%;                /* White card surface */
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;

    /* === Accent / Brand === */
    --primary: 157 63% 45%;           /* Chameleon green/teal */
    --primary-foreground: 0 0% 100%;
    --ring: 157 63% 45%;

    /* === Neutral semantic === */
    --secondary: 216 16% 96%;
    --secondary-foreground: 0 0% 9%;
    --muted: 216 16% 96%;
    --muted-foreground: 0 0% 45%;
    --accent: 216 16% 96%;
    --accent-foreground: 0 0% 9%;

    /* === Borders === */
    --border: 216 16% 91%;
    --input: 216 16% 91%;

    /* === Destructive === */
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;

    /* === Radius === */
    --radius: 0.75rem;                /* 12px card radius */

    /* === Sidebar (raw HSL, same format as above) === */
    --sidebar-background: 220 20% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-primary: 157 63% 45%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 216 24% 95%;
    --sidebar-accent-foreground: 240 5.9% 10%;
    --sidebar-border: 216 16% 91%;
    --sidebar-ring: 157 63% 45%;

    /* === Highlight === */
    --highlight: 155 50% 94%;         /* Light green row highlight */

    /* === Typography scale (px values as custom properties) === */
    --font-size-page-title: 1.75rem;  /* 28px */
    --font-size-section-heading: 1.125rem; /* 18px */
    --font-size-body: 0.875rem;       /* 14px */
    --font-size-caption: 0.8125rem;   /* 13px */
    --font-size-stat: 1.75rem;        /* 28px */

    /* === Spacing === */
    --spacing-card-padding: 1.5rem;   /* 24px */
    --spacing-page-padding: 2rem;     /* 32px */
    --spacing-card-gap: 1.5rem;       /* 24px */

    /* === Layout === */
    --sidebar-width: 200px;
    --sidebar-width-mobile: 280px;
    --sidebar-width-icon: 48px;

    /* === Chart colors (keep existing) === */
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
  }

  .dark {
    --background: 240 27% 14%;         /* #1a1a2e base */
    --foreground: 0 0% 95%;

    --page: 240 27% 14%;               /* Same as background in dark */
    --card: 240 25% 18%;               /* Elevated surface */
    --card-foreground: 0 0% 95%;
    --popover: 240 24% 22%;            /* Highest elevation */
    --popover-foreground: 0 0% 95%;

    --primary: 160 60% 50%;            /* Slightly lighter teal for dark */
    --primary-foreground: 0 0% 9%;
    --ring: 160 60% 50%;

    --secondary: 240 15% 20%;
    --secondary-foreground: 0 0% 95%;
    --muted: 240 15% 20%;
    --muted-foreground: 240 5% 60%;
    --accent: 240 15% 20%;
    --accent-foreground: 0 0% 95%;

    --border: 240 15% 25%;
    --input: 240 15% 25%;

    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;

    --sidebar-background: 240 28% 12%;
    --sidebar-foreground: 240 5% 85%;
    --sidebar-primary: 160 60% 50%;
    --sidebar-primary-foreground: 0 0% 9%;
    --sidebar-accent: 240 15% 18%;
    --sidebar-accent-foreground: 240 5% 85%;
    --sidebar-border: 240 15% 20%;
    --sidebar-ring: 160 60% 50%;

    --highlight: 160 30% 20%;

    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
  }

  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

### tailwind.config.ts Registration

New tokens must be registered in `tailwind.config.ts` to be usable as Tailwind utility classes:

```typescript
// Add to theme.extend.colors:
page: "hsl(var(--page))",
highlight: "hsl(var(--highlight))",
sidebar: {
  DEFAULT: "hsl(var(--sidebar-background))",
  foreground: "hsl(var(--sidebar-foreground))",
  primary: "hsl(var(--sidebar-primary))",
  "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
  accent: "hsl(var(--sidebar-accent))",
  "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
  border: "hsl(var(--sidebar-border))",
  ring: "hsl(var(--sidebar-ring))",
},
```

### Key Pattern: Variable Naming

**Recommendation (Claude's Discretion):** Use the shadcn/ui v3 naming convention for sidebar variables: `--sidebar-background` instead of just `--sidebar`. This matches the v3 docs and avoids confusion. For new tokens like page background and highlight, use short semantic names (`--page`, `--highlight`) that are consistent with how shadcn names `--background`, `--card`, `--popover`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HSL color conversions | Manual hex-to-HSL math | Online converter or DevTools | Easy to get wrong, especially with space-separated format |
| Dark mode color testing | Guessing if contrast is sufficient | Browser DevTools contrast checker | WCAG contrast ratios matter |
| Typography scale | Arbitrary pixel values | Measured values from screenshots + Inter standard weights | Consistency with Chameleon reference |
| Token documentation | Separate design doc | Comments in globals.css + documented in PLAN.md | Single source of truth |

## Common Pitfalls

### Pitfall 1: Sidebar Variable Format Mismatch
**What goes wrong:** Sidebar uses `hsl()` wrappers while all other tokens use raw HSL. Tailwind 3 `hsl(var(--xxx))` pattern double-wraps to `hsl(hsl(0 0% 98%))` which is invalid CSS.
**Why it happens:** The sidebar variables were added with Tailwind v4 patterns (`@theme inline`) in mind, but the project runs Tailwind 3.
**How to avoid:** Convert ALL sidebar variables to raw HSL format. Register them in `tailwind.config.ts`.
**Warning signs:** Sidebar utilities like `bg-sidebar` producing no visible color, or computed styles showing `hsl(hsl(...))`.

### Pitfall 2: Dead Tailwind v4 Directives
**What goes wrong:** `@custom-variant` and `@theme inline` blocks in globals.css are ignored by Tailwind 3, creating confusion about what's active.
**Why it happens:** Components.json has `"config": ""` (TW4 pattern) and sidebar vars were added with TW4 syntax.
**How to avoid:** Remove `@custom-variant dark (&:is(.dark *));` and the `@theme inline` block. The dark mode already works through `darkMode: ["class"]` in `tailwind.config.ts`.
**Warning signs:** Developers thinking these blocks are functional when they are silently ignored.

### Pitfall 3: Duplicate `@layer base` Blocks
**What goes wrong:** The current globals.css has THREE separate `@layer base` blocks (lines 7, 63, 105) with duplicate `*` and `body` rules.
**Why it happens:** Incremental additions without cleanup.
**How to avoid:** Consolidate into a single `@layer base` block.
**Warning signs:** CSS specificity confusion, rules overriding each other unexpectedly.

### Pitfall 4: --background vs --page Confusion
**What goes wrong:** `--background` is applied to `<body>` via `bg-background`. If `--background` becomes the gray page background, the entire body becomes gray -- including areas where white is expected.
**Why it happens:** shadcn/ui's Card component uses `bg-card` which reads `--card`, so it would correctly be white. But other elements using `bg-background` would become gray.
**How to avoid:** Keep `--background` as white (the content area default). Introduce `--page` as a NEW token for the gray canvas. Apply `--page` via a wrapper div, not body. This preserves backward compatibility with all existing `bg-background` usage.
**Warning signs:** Auth pages, dialogs, or other non-dashboard areas appearing with unexpected gray background.

### Pitfall 5: Forgetting to Update tailwind.config.ts
**What goes wrong:** New CSS variables are added to globals.css but NOT registered in `tailwind.config.ts`. Tailwind utility classes like `bg-page` or `bg-sidebar` don't work.
**Why it happens:** In Tailwind 3, CSS variables alone aren't enough -- they must be mapped in the config.
**How to avoid:** Every new CSS custom property that should be a Tailwind color needs a corresponding entry in `tailwind.config.ts` `theme.extend.colors`.
**Warning signs:** `bg-page` producing no styles, IDE showing unknown utility class warnings.

### Pitfall 6: Breaking Existing Component Styles
**What goes wrong:** Changing `--primary` from `160 84% 39%` to `157 63% 45%` changes the accent color everywhere at once, which is the goal, but some hardcoded `bg-emerald-600` values won't update.
**Why it happens:** Some components use Tailwind color classes directly instead of semantic tokens.
**How to avoid:** Search for `emerald-` and `green-` class usage before changing `--primary`. Document any hardcoded colors found so they can be addressed.
**Warning signs:** Inconsistent green shades after the token change -- some elements using the new primary, others still on old emerald-600.

## Code Examples

### Sidebar Variable Conversion (Before/After)

**Before (current -- broken for Tailwind 3):**
```css
:root {
  --sidebar: hsl(0 0% 98%);
  --sidebar-foreground: hsl(240 5.3% 26.1%);
  /* ... */
}
/* @theme inline block -- dead code in TW3 */
```

**After (correct for Tailwind 3):**
```css
@layer base {
  :root {
    /* ... other tokens ... */
    --sidebar-background: 220 20% 98%;
    --sidebar-foreground: 240 5.3% 26.1%;
    --sidebar-primary: 157 63% 45%;
    --sidebar-primary-foreground: 0 0% 100%;
    --sidebar-accent: 216 24% 95%;
    --sidebar-accent-foreground: 240 5.9% 10%;
    --sidebar-border: 216 16% 91%;
    --sidebar-ring: 157 63% 45%;
  }
}
```

Plus in `tailwind.config.ts`:
```typescript
sidebar: {
  DEFAULT: "hsl(var(--sidebar-background))",
  foreground: "hsl(var(--sidebar-foreground))",
  // ... etc
},
```

### Adding New Tokens (page background, highlight)

```css
/* In :root */
--page: 216 25% 97%;
--highlight: 155 50% 94%;
```

```typescript
/* In tailwind.config.ts theme.extend.colors */
page: "hsl(var(--page))",
highlight: "hsl(var(--highlight))",
```

Usage: `<div className="bg-page">` for gray canvas, `<tr className="bg-highlight">` for active rows.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| shadcn raw HSL (TW3) | shadcn OKLCH wrapped (TW4) | Late 2024 | Project stays on TW3, use raw HSL |
| `--sidebar` naming | `--sidebar-background` naming | shadcn v3 sidebar docs | Use `--sidebar-background` for clarity |
| Single bg color | Surface hierarchy tokens | Modern design systems 2024+ | Need page/card/popover distinction |
| Flat dark mode | Elevation-based dark mode | Material Design 3 / Linear | Lighter = higher elevation |

## Open Questions

1. **Exact Chameleon green accent HSL**
   - What we know: Visually appears to be in the `157 63% 45%` range from screenshots
   - What's unclear: Exact computed value would need DevTools inspection of live site
   - Recommendation: Use `157 63% 45%` as starting point. Fine-tune visually against screenshots. The difference from current `160 84% 39%` is mainly reduced saturation (84% to 63%) which makes the green feel more professional/restrained.

2. **Dark mode primary accent fine-tuning**
   - What we know: Need slightly lighter/desaturated version for dark backgrounds
   - What's unclear: Exact adjustment needed for WCAG AA contrast on dark surfaces
   - Recommendation: Start with `160 60% 50%` (lighter + slightly desaturated), verify 4.5:1 contrast ratio against card surface `240 25% 18%`

3. **Tailwind v4 migration timing**
   - What we know: Project has partial TW4 artifacts. Full migration would change the variable format entirely.
   - What's unclear: Whether a TW4 migration is planned for this redesign or later
   - Recommendation: Proceed with TW3 patterns (raw HSL + tailwind.config.ts). If TW4 migration happens later, the variable values transfer easily -- only the format wrapper changes. Clean up the dead TW4 directives now to avoid confusion.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `app/globals.css`, `tailwind.config.ts`, `package.json`, `components.json` -- direct file reads
- shadcn/ui v3 sidebar docs: https://v3.shadcn.com/docs/components/sidebar -- sidebar CSS variable format
- shadcn/ui theming docs: https://ui.shadcn.com/docs/theming -- HSL variable convention
- Chameleon screenshots: `chameleon-home-full.png`, `chameleon-sidebar.png`, `chameleon-tours.png` -- visual analysis

### Secondary (MEDIUM confidence)
- shadcn/ui Tailwind v4 migration: https://ui.shadcn.com/docs/tailwind-v4 -- understanding v3 vs v4 differences
- Linear dark mode approach: https://linear.app/now/how-we-redesigned-the-linear-ui -- elevation system philosophy
- linear.style community site -- dark mode color values (`#121212` base, `#1b1c1d` surface)
- Dark mode best practices: https://www.graphiceagle.com/dark-mode-ui/ -- elevation through lightness
- Atlassian elevation tokens: https://atlassian.design/foundations/elevation/ -- surface/raised/overlay pattern

### Tertiary (LOW confidence)
- Chameleon exact CSS values -- estimated from screenshots, not DevTools-inspected. Colors could be off by a few HSL degrees. Values are reasonable starting points that can be refined visually.
- Typography pixel values -- estimated from screenshot proportions, not measured with precision tools. Will need visual validation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- using existing Tailwind 3 + shadcn/ui patterns, well documented
- Architecture (token organization): HIGH -- follows shadcn/ui conventions with clear rationale
- Chameleon values: MEDIUM -- visual estimation from screenshots, good enough for implementation, may need tuning
- Dark mode elevation: MEDIUM -- informed by Linear/Material Design patterns, user-specified base color range
- Pitfalls: HIGH -- verified by examining actual codebase state and Tailwind 3 behavior

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable domain, Tailwind 3 patterns well-established)
