# Phase 6: Habits, Tasks & Remaining Pages Migration - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Migrate all remaining pages (habits, tasks, settings, auth) to the new card-on-gray layout with consistent PageHeader usage and breadcrumb navigation for nested views. All pages render correctly at 768px, 1024px, and 1280px with sidebar expanded and collapsed. No new features — purely visual/layout migration.

</domain>

<decisions>
## Implementation Decisions

### Breadcrumb navigation
- Breadcrumbs appear above the PageHeader title (small line, Chameleon/SaaS style)
- Simple 2-level hierarchy: Section > Item name (e.g., Habits > Running)
- Breadcrumbs on all nested views: detail, edit, and create pages
- Create pages use pattern: Habits > New Habit; edit pages use: Habits > Running

### Claude's Discretion (Breadcrumbs)
- Whether breadcrumbs appear on top-level list pages (Habits, Tasks, Settings) or only nested views
- Mobile truncation behavior for long item names
- Breadcrumb separator style and typography

### Auth page styling
- White background (not gray) — auth pages feel distinct from the app interior
- Form wrapped in Card component with border and shadow for visual weight
- Logo + app name branding above the form card
- Use standard card tokens (bg-card, shadow, border-radius) — same as rest of app
- Sign-up success and error pages use same centered card layout as login/signup
- Existing cross-links between auth pages (login <-> signup) preserved as-is within new card layout

### Claude's Discretion (Auth)
- Whether to use an existing logo asset or styled text mark
- Exact spacing and sizing of branding above the card

### List page card wrapping
- Individual habit/task cards float directly on the gray page background (not wrapped in a container)
- Keep existing responsive grid layout (1 col mobile, 2 col tablet, 3 col desktop)
- Replace custom inline headers with PageHeader component (title + Create action button)
- Settings page keeps multi-card layout on gray (Profile, Week Start, Export as separate Cards)

### Form/edit page layout
- Create and edit forms wrapped in a single Card on gray background
- Detail pages (viewing a habit/task) use a single card for all content
- Breadcrumbs on create/edit pages (same as detail views)
- Save/Cancel form actions go in the PageHeader actions slot (top-right, consistent with list pages)

</decisions>

<specifics>
## Specific Ideas

- Breadcrumbs above title follows Chameleon/Linear SaaS pattern — small muted text with clickable section link
- Auth pages should feel clean and professional with the card treatment — the white background + card gives a distinct "welcome" feel separate from the app interior
- Settings page already fits the multi-card-on-gray pattern naturally — minimal changes expected

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-habits-tasks-remaining-pages-migration*
*Context gathered: 2026-02-16*
