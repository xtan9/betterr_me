# Spacing Design Token Adoption

**Date:** 2026-04-12
**Goal:** Expand the spacing design token system and adopt it across the entire codebase, replacing hardcoded Tailwind spacing values with semantic tokens for visual consistency.

## Background

The project defines spacing tokens in `globals.css` and `tailwind.config.ts`, but adoption is at 3.4% (12 of ~357 hardcoded spacing instances). Only `gap-card-gap` is actively used. The remaining tokens (`card-padding`, `page-padding`, `page-padding-top`) have zero usage. Spacing is inconsistent across domains — similar card containers use `p-4`, `p-5`, or `p-6` interchangeably.

## Token Set

### Existing Tokens (unchanged)

| Tailwind Class | CSS Variable | Value | Semantic Use |
|----------------|-------------|-------|--------------|
| `card-padding` | `--spacing-card-padding` | `1.5rem` (24px) | Inner padding of card containers |
| `page-padding` | `--spacing-page-padding` | `2rem` (32px) | Page-level horizontal padding |
| `page-padding-top` | `--spacing-page-padding-top` | `2.5rem` (40px) | Top padding of page content areas |
| `card-gap` | `--spacing-card-gap` | `1rem` (16px) | Gap between cards/sections |

### New Tokens

| Tailwind Class | CSS Variable | Value | Semantic Use |
|----------------|-------------|-------|--------------|
| `section-gap` | `--spacing-section-gap` | `1.5rem` (24px) | Gap between major page sections |
| `card-header-padding-x` | `--spacing-card-header-padding-x` | `1rem` (16px) | Card header horizontal padding |
| `card-header-padding-y` | `--spacing-card-header-padding-y` | `0.75rem` (12px) | Card header vertical padding |
| `modal-padding` | `--spacing-modal-padding` | `1.5rem` (24px) | Modal/dialog content padding |
| `field-gap` | `--spacing-field-gap` | `0.75rem` (12px) | Gap between form fields |

### Convention

- **Tailwind classes**: Semantic flat names (`p-card-padding`, `gap-card-gap`)
- **CSS variables**: Namespaced (`--spacing-card-padding`, `--spacing-section-gap`)
- Both layers connected via `tailwind.config.ts` `theme.extend.spacing`

## Migration Strategy

Token-by-token migration across all files. Each PR replaces one token type everywhere, making review focused on a single decision: "is this instance semantically a [token type]?"

### PR Sequence

#### PR 1: Define new tokens
- Add 5 new CSS variables to `globals.css`
- Add 5 new entries to `tailwind.config.ts` spacing
- No component changes

**Files:**
- `app/globals.css`
- `tailwind.config.ts`

#### PR 2: `card-padding` migration
Replace `p-4`, `p-5`, `p-6` with `p-card-padding` on card-like containers. Estimated ~80-100 replacements (not all `p-4` instances are card padding — form inputs, buttons, compact elements stay as-is).

**Decision rule:** Replace if the element is a `bg-background rounded-lg border shadow-sm` card or similar top-level content container. Do NOT replace padding on: buttons, inputs, badges, inline elements, or intentionally compact sections.

#### PR 3: `card-gap` migration
Replace `gap-4`, `gap-3`, `space-y-4`, `space-y-3` with `gap-card-gap` or equivalent between card-level elements. `space-y-*` requires converting parent to flex column with `gap-card-gap`. Estimated ~100 replacements.

**Decision rule:** Replace if the spacing is between sibling cards or card-like blocks. Do NOT replace gaps inside cards (e.g., between a label and value), or grid gaps for layout-specific purposes.

**Note on `space-y-*` conversion:** `space-y-4` applies margin-top to all children except the first. Replacing with `flex flex-col gap-card-gap` changes the spacing mechanism. Verify there are no margin-dependent styles on children before converting. If a container already uses `flex flex-col`, only the gap value needs changing.

#### PR 4: `card-header-padding-x/y` migration
Replace `px-4 py-3` on card header rows with `px-card-header-padding-x py-card-header-padding-y`. This is a highly consistent pattern across the codebase.

**Decision rule:** Replace if the element is a card header bar (typically contains an `h3` heading, sits above card content, has `border-b`).

#### PR 5: `page-padding` + `page-padding-top` migration
Replace `px-6`, `px-8`, `p-8` on page-level containers with `px-page-padding`. Replace `pt-6`, `pt-8`, `pt-10` on page content tops with `pt-page-padding-top`. Estimated ~15-25 replacements.

**Decision rule:** Replace if the element is a page-level wrapper or the outermost content container within a route. Responsive variants (e.g., `p-4 sm:p-6 lg:p-8`) should collapse to `p-page-padding` if they were approximating the same intent.

#### PR 6: `modal-padding` + `section-gap` + `field-gap` migration
- `modal-padding`: Replace `p-5`, `p-6`, `px-6` inside modal/dialog content with `p-modal-padding`
- `section-gap`: Replace `space-y-6`, `gap-6` between major page sections with `gap-section-gap`
- `field-gap`: Replace `gap-3`, `space-y-3` between form fields with `gap-field-gap`

### Scope

- **Included:** All `.tsx` files under `components/` and `app/` (except `components/ui/`)
- **Excluded:** `components/ui/` (shadcn/ui managed), test files, config files
- **Judgment required:** Not every hardcoded spacing value maps to a token. One-off values, responsive breakpoint-specific overrides, and intentionally different spacing should remain hardcoded.

## Non-Goals

- Changing token values (this is a migration, not a redesign)
- Adding non-spacing tokens (colors, font sizes, border radius)
- Modifying `components/ui/` files
- Adding responsive token variants (e.g., `card-padding-sm`)
- Creating a full design system documentation site

## Risks

- **Visual regressions:** Normalizing `p-4` (16px) and `p-5` (20px) to `p-card-padding` (24px) will increase padding on some cards. This is intentional — it standardizes the look — but should be visually verified per domain.
- **`space-y-*` conversion:** Switching from margin-based to gap-based spacing could affect layouts where children have their own margins. Each conversion should be tested.

## Testing

- Run `pnpm lint` after each PR
- Run `pnpm test:run` after each PR
- Visual verification of affected pages after each PR (Playwright screenshots recommended for before/after comparison)
