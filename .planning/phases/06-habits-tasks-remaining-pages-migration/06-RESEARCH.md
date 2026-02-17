# Phase 6: Habits, Tasks & Remaining Pages Migration - Research

**Researched:** 2026-02-16
**Domain:** Layout migration (card-on-gray, PageHeader, breadcrumbs) for all non-dashboard pages
**Confidence:** HIGH

## Summary

Phase 6 migrates all remaining authenticated pages (habits, tasks, settings) and unauthenticated pages (auth) to the new visual system established in Phases 4-5. The core work involves: (1) replacing custom inline headers with the `PageHeader` component, (2) wrapping form/detail content in Cards on the gray `bg-page` canvas, (3) building a `Breadcrumbs` component that integrates above `PageHeader` for nested views, and (4) restyling auth pages with centered card-on-white layout with branding.

The codebase is well-structured for this migration. All authenticated pages already use `SidebarShell` which provides the `bg-page` gray background and content wrapper (`max-w-content`, responsive padding). Individual habit/task cards already use the shadcn `Card` component. The shadcn/ui `Breadcrumb` primitives are already installed at `components/ui/breadcrumb.tsx`. Auth pages render under the root layout (no SidebarShell), so they get `bg-background` (white) naturally -- exactly what the user wants.

The main risk is test assertion breakage. There are ~20 test files covering habit and task components that may need selector updates when we replace inline `<h1>` headers with `PageHeader` or add Card wrapping. However, tests mostly query by text content or test-id rather than CSS classes, which limits the blast radius.

**Primary recommendation:** Split into 3-4 plans: (1) Create Breadcrumbs component + add i18n strings, (2) Migrate habits pages (list, detail, edit, create) with PageHeader and breadcrumbs, (3) Migrate tasks pages (same pattern), (4) Migrate settings + auth pages. Each plan should update affected tests.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Breadcrumbs appear above the PageHeader title (small line, Chameleon/SaaS style)
- Simple 2-level hierarchy: Section > Item name (e.g., Habits > Running)
- Breadcrumbs on all nested views: detail, edit, and create pages
- Create pages use pattern: Habits > New Habit; edit pages use: Habits > Running
- Auth pages use white background (not gray) -- auth pages feel distinct from the app interior
- Auth form wrapped in Card component with border and shadow for visual weight
- Logo + app name branding above the form card
- Use standard card tokens (bg-card, shadow, border-radius) -- same as rest of app
- Sign-up success and error pages use same centered card layout as login/signup
- Existing cross-links between auth pages (login <-> signup) preserved as-is within new card layout
- Individual habit/task cards float directly on the gray page background (not wrapped in a container)
- Keep existing responsive grid layout (1 col mobile, 2 col tablet, 3 col desktop)
- Replace custom inline headers with PageHeader component (title + Create action button)
- Settings page keeps multi-card layout on gray (Profile, Week Start, Export as separate Cards)
- Create and edit forms wrapped in a single Card on gray background
- Detail pages (viewing a habit/task) use a single card for all content
- Breadcrumbs on create/edit pages (same as detail views)
- Save/Cancel form actions go in the PageHeader actions slot (top-right, consistent with list pages)

### Claude's Discretion
- Whether breadcrumbs appear on top-level list pages (Habits, Tasks, Settings) or only nested views
- Mobile truncation behavior for long item names
- Breadcrumb separator style and typography
- Whether to use an existing logo asset or styled text mark for auth branding
- Exact spacing and sizing of branding above the card

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VISL-08 | Detail/edit views show breadcrumb navigation in the page header | shadcn/ui Breadcrumb primitives already installed; PageHeader needs breadcrumbs prop/slot; breadcrumbs use i18n strings from existing nav keys |
| VISL-10 | All pages updated: dashboard, habits, tasks, profile, auth pages | Dashboard already done (Phase 5); this phase covers habits (4 pages), tasks (4 pages), settings (1 page), auth (6 pages) = 15 pages total |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui Card | installed | Card wrapping for forms, detail views | Already used extensively; provides bg-card, border, shadow-sm, rounded-xl |
| shadcn/ui Breadcrumb | installed | Accessible breadcrumb navigation | Already at `components/ui/breadcrumb.tsx`; provides Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator |
| PageHeader | custom | Consistent page header with title/subtitle/actions | Created in Phase 4 at `components/layouts/page-header.tsx`; uses text-page-title token |
| next-intl | installed | i18n for breadcrumb labels | Already provides "common.nav.habits", "common.nav.tasks", "common.nav.settings" |
| next/link | built-in | Breadcrumb navigation links | Client-side navigation for breadcrumb section links |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | installed | ChevronRight for separator (optional) | shadcn BreadcrumbSeparator uses ChevronRight by default |
| cn utility | custom | Conditional class merging | For className composition in breadcrumb/page components |

### Alternatives Considered
None needed -- all required components are already in the project.

**Installation:** No new dependencies needed.

## Architecture Patterns

### Current Page Structure (Before Migration)

```
app/habits/page.tsx (server)          -> HabitsPageContent (client)
app/habits/[id]/page.tsx (server)     -> HabitDetailContent (client)
app/habits/[id]/edit/page.tsx (server) -> EditHabitContent (client)
app/habits/new/page.tsx (server)      -> CreateHabitContent (client)
```

All authenticated pages render inside `SidebarShell > SidebarLayout` which provides:
- `bg-page` gray canvas background
- `max-w-content` (1400px) centering
- Responsive padding: `px-4 py-6 sm:px-6 md:px-8 md:pt-10`

### Pattern 1: List Page Migration (Habits List, Tasks List)
**What:** Replace inline header with PageHeader, keep grid cards floating on gray
**When to use:** Top-level list pages with create action button

Current (habits-page-content.tsx):
```tsx
<div className="space-y-6">
  <div className="flex items-center justify-between">
    <h1 className="font-display text-3xl font-bold tracking-tight">{t("page.title")}</h1>
    <Button onClick={handleCreateHabit}>
      <Plus className="size-4 mr-2" />
      {t("page.createButton")}
    </Button>
  </div>
  <HabitList habits={data || []} ... />
</div>
```

Migrated:
```tsx
import { PageHeader } from "@/components/layouts/page-header";

<div className="space-y-6">
  <PageHeader
    title={t("page.title")}
    actions={
      <Button onClick={handleCreateHabit}>
        <Plus className="size-4 mr-2" />
        {t("page.createButton")}
      </Button>
    }
  />
  <HabitList habits={data || []} ... />
</div>
```

The grid cards (`HabitCard`, `TaskCard`) already use shadcn `Card` and float naturally on `bg-page`. No Card wrapping needed for list pages.

### Pattern 2: Detail Page Migration (Habit Detail, Task Detail)
**What:** Replace back button + inline header with breadcrumbs above PageHeader, wrap content in Card
**When to use:** Detail views showing a single entity

Current (habit-detail-content.tsx):
```tsx
<div className="max-w-3xl mx-auto space-y-6">
  <div className="flex items-center justify-between">
    <Button variant="ghost" onClick={() => router.push("/habits")}>
      <ArrowLeft className="size-4" /> Back to Habits
    </Button>
    <Button onClick={() => router.push(`/habits/${habitId}/edit`)}>
      <Edit className="size-4" /> Edit
    </Button>
  </div>
  {/* Title, metadata, stats, heatmap, actions -- all inline */}
</div>
```

Migrated:
```tsx
import { PageHeader } from "@/components/layouts/page-header";
import { PageBreadcrumbs } from "@/components/layouts/page-breadcrumbs";
import { Card, CardContent } from "@/components/ui/card";

<div className="space-y-6">
  <div>
    <PageBreadcrumbs section="habits" itemName={habit.name} />
    <PageHeader
      title={habit.name}
      actions={
        <Button onClick={() => router.push(`/habits/${habitId}/edit`)}>
          <Edit className="size-4 mr-2" /> {t("detail.edit")}
        </Button>
      }
    />
  </div>
  <Card>
    <CardContent className="space-y-6 pt-6">
      {/* All detail content: metadata, streaks, stats, heatmap, actions */}
    </CardContent>
  </Card>
</div>
```

Key changes:
- Remove `max-w-3xl mx-auto` -- `SidebarLayout` already provides `max-w-content` (1400px). Detail pages can optionally constrain via `max-w-3xl mx-auto` on the Card or content area.
- Replace back button with breadcrumbs (e.g., "Habits > Running")
- Edit button moves to PageHeader actions slot
- All content below header wrapped in single Card

### Pattern 3: Form Page Migration (Create/Edit)
**What:** Breadcrumbs + PageHeader with Save/Cancel in actions, form body in Card
**When to use:** Create and edit pages with form content

Current (create-habit-content.tsx):
```tsx
<div className="max-w-2xl mx-auto">
  <HabitForm mode="create" onSubmit={...} onCancel={...} isLoading={...} />
</div>
```

Where HabitForm internally renders its own title and save/cancel buttons:
```tsx
<div className="space-y-6">
  <h2 className="text-lg font-semibold">{mode === "create" ? "Create" : "Edit"}</h2>
  <Form ...>
    {/* fields */}
    <div className="flex justify-end gap-3 pt-2">
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      <Button type="submit">Save</Button>
    </div>
  </Form>
</div>
```

Migrated approach:
```tsx
<div className="space-y-6">
  <div>
    <PageBreadcrumbs section="habits" itemName={t("form.newHabit")} />
    <PageHeader
      title={t("form.createTitle")}
      actions={
        <>
          <Button variant="ghost" onClick={handleCancel}>{t("form.cancel")}</Button>
          <Button type="submit" form="habit-form">{t("form.create")}</Button>
        </>
      }
    />
  </div>
  <Card>
    <CardContent className="pt-6">
      <HabitForm mode="create" onSubmit={...} onCancel={...} isLoading={...} />
    </CardContent>
  </Card>
</div>
```

**Important decision point:** The user wants Save/Cancel in PageHeader actions slot. However, the form submit button needs to be associated with the form. Two approaches:
1. **form attribute approach:** Add `id="habit-form"` to the `<form>` element and `form="habit-form"` to the submit `<Button>` in PageHeader. This lets the button live outside the form element while still triggering form submission.
2. **Lift state approach:** Keep buttons inside the form but restyle. This is simpler but doesn't match the locked decision.

**Recommendation:** Use the `form` attribute approach (option 1). It's well-supported in all modern browsers and cleanly separates the header actions from the form body. The HabitForm/TaskForm components will need their internal title and button sections removed (or hidden via a prop) when used in this new layout.

### Pattern 4: Auth Page Migration
**What:** White background, Card form with branding above
**When to use:** All auth pages (login, signup, forgot-password, update-password, sign-up-success, error)

Current (login page):
```tsx
<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
  <div className="w-full max-w-sm">
    <LoginForm />
  </div>
</div>
```

LoginForm already wraps content in a `<Card>`. Migration is minimal -- add branding above the Card.

Migrated:
```tsx
<div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
  <div className="w-full max-w-sm">
    {/* Branding */}
    <div className="flex items-center justify-center gap-2 mb-8">
      <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <span className="font-display font-bold text-lg">B</span>
      </div>
      <span className="font-display font-semibold text-xl">BetterR.me</span>
    </div>
    <LoginForm />
  </div>
</div>
```

Auth pages already render with `bg-background` (white) since they're not inside SidebarShell. The forms already use Card. The main addition is the branding block above.

### Pattern 5: Settings Page Migration
**What:** PageHeader with Save action, multi-card layout preserved
**When to use:** Settings page

Current (settings-content.tsx):
```tsx
<div className="space-y-6">
  <div className="flex items-center justify-between">
    <h1 className="text-2xl font-bold">{t("title")}</h1>
    <Button onClick={handleSave}>Save</Button>
  </div>
  <Card>Profile</Card>
  <Card>Week Start</Card>
  <Card>Export</Card>
</div>
```

Migrated:
```tsx
<div className="space-y-6">
  <PageHeader
    title={t("title")}
    actions={<Button onClick={handleSave}>Save</Button>}
  />
  <Card>Profile</Card>
  <Card>Week Start</Card>
  <Card>Export</Card>
</div>
```

Settings already uses multi-card layout on the gray background. The only change is replacing the inline header with PageHeader. Settings is a top-level page (not nested), so no breadcrumbs needed per default recommendation (Claude's discretion).

### Recommended New Component: PageBreadcrumbs

Create `components/layouts/page-breadcrumbs.tsx` as a thin wrapper over shadcn Breadcrumb primitives:

```tsx
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";

type Section = "habits" | "tasks" | "settings";

const SECTION_HREFS: Record<Section, string> = {
  habits: "/habits",
  tasks: "/tasks",
  settings: "/dashboard/settings",
};

interface PageBreadcrumbsProps {
  section: Section;
  itemName?: string;
  className?: string;
}

export function PageBreadcrumbs({ section, itemName, className }: PageBreadcrumbsProps) {
  const t = useTranslations("common.nav");

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList className="text-xs sm:text-sm">
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={SECTION_HREFS[section]}>{t(section)}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        {itemName && (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="truncate max-w-[200px] sm:max-w-none">
                {itemName}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
```

Key design decisions (Claude's discretion recommendations):
- **Breadcrumbs only on nested views** (detail, edit, create) -- not on top-level list pages. Rationale: top-level pages are one click from sidebar nav; breadcrumbs add clutter without value. This follows the Chameleon/Linear pattern.
- **Mobile truncation:** `truncate max-w-[200px] sm:max-w-none` on the item name. Long habit/task names get truncated with ellipsis on mobile, shown in full on desktop.
- **Separator:** Use the default shadcn `ChevronRight` (already the default in `BreadcrumbSeparator`). Clean and standard.
- **Typography:** `text-xs sm:text-sm` on `BreadcrumbList` -- smaller than default sm text to keep breadcrumbs visually subordinate to the page title. The `text-muted-foreground` color is already applied by shadcn's BreadcrumbList.

### Anti-Patterns to Avoid
- **Wrapping list page cards in a container Card:** Per locked decision, individual cards float on gray. Don't add an outer Card.
- **Duplicating header logic:** Always use PageHeader for consistency. Don't create one-off header markup in components.
- **Keeping the back button AND breadcrumbs:** Breadcrumbs replace the back button on detail/edit pages. Don't have both.
- **Adding breadcrumbs to list pages:** Top-level pages (Habits list, Tasks list, Settings) don't need breadcrumbs -- sidebar already indicates location.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Breadcrumb rendering | Custom breadcrumb markup | shadcn `Breadcrumb` primitives (`components/ui/breadcrumb.tsx`) | Already installed, accessible (nav aria-label, aria-current), separator handling, responsive |
| Page header | Inline h1/button divs | `PageHeader` from `components/layouts/page-header.tsx` | Consistent typography (text-page-title), responsive stacking, actions slot |
| Card wrapping | Custom div with rounded/shadow | shadcn `Card` / `CardContent` | Already provides bg-card, border, shadow-sm, rounded-xl, dark mode support |
| Auth form card | New auth card component | Existing Card inside LoginForm/SignUpForm/etc. | Auth forms already use Card internally; just add branding above |

**Key insight:** The existing codebase already has all the building blocks. This phase is integration and consistency work, not new infrastructure.

## Common Pitfalls

### Pitfall 1: Form Submit Button Outside Form Element
**What goes wrong:** Moving Save/Cancel to PageHeader actions slot puts the submit button outside the `<form>` element, breaking form submission.
**Why it happens:** HTML forms only submit when a submit button is inside the form or linked via the `form` attribute.
**How to avoid:** Use `id` on the `<form>` and `form="form-id"` attribute on the `<Button type="submit">`. Alternatively, use `formRef.current?.requestSubmit()` via a ref.
**Warning signs:** Clicking Save does nothing; form validation doesn't trigger.

### Pitfall 2: HabitForm/TaskForm Internal Headers Conflicting
**What goes wrong:** The HabitForm and TaskForm components render their own `<h2>` title and Save/Cancel buttons internally. After migration, this creates duplicate headers and buttons.
**Why it happens:** The form components were designed as standalone pages with their own chrome.
**How to avoid:** Either (a) add a prop like `hideChrome` to suppress the internal title + buttons, or (b) refactor the form components to not render their own header/footer, letting the parent handle it. Option (a) is safer for backward compatibility if forms are used elsewhere.
**Warning signs:** Two titles visible, two sets of save/cancel buttons.

### Pitfall 3: Test Assertions on Page Title Text
**What goes wrong:** Tests that assert `screen.getByText("My Habits")` may break if the title rendering changes (e.g., from `<h1>` inline to PageHeader).
**Why it happens:** PageHeader renders an `<h1>` with `text-page-title` class. If the text content stays the same, `getByText` should still work. But `getByRole("heading")` queries might need updating if heading levels change.
**How to avoid:** After each component migration, run the relevant test file. Most tests use `getByText` which is resilient. Check for `getByRole("heading")` queries that might be affected.
**Warning signs:** Tests fail on "Unable to find an accessible element with the role heading".

### Pitfall 4: max-w-3xl vs max-w-content Confusion
**What goes wrong:** Detail pages currently use `max-w-3xl mx-auto` (768px). The SidebarLayout already provides `max-w-content` (1400px). Removing `max-w-3xl` makes detail content too wide.
**Why it happens:** Detail pages should be narrower than list pages (which use a 3-column grid).
**How to avoid:** For detail and form pages, apply `max-w-3xl mx-auto` (or similar constraint) on the Card itself or on a wrapping div inside the content area. The outer SidebarLayout constraint is for the page overall; inner content can be narrower.
**Warning signs:** Detail page content stretches full width on large screens, looking sparse.

### Pitfall 5: Auth Page Background Color
**What goes wrong:** Adding `bg-page` to auth pages turns them gray, contradicting the locked decision.
**Why it happens:** Copy-pasting from authenticated page patterns.
**How to avoid:** Auth pages don't use SidebarShell and render under the root layout with `bg-background` (white). Don't add any background color override. Verify by checking the page renders on white.
**Warning signs:** Auth pages have gray background instead of white.

### Pitfall 6: i18n String for Breadcrumb "New Habit" / "New Task"
**What goes wrong:** Breadcrumb shows raw key instead of translated text.
**Why it happens:** New i18n strings needed for breadcrumb item names on create pages.
**How to avoid:** Add breadcrumb-specific strings to all 3 locale files (en, zh, zh-TW). For create pages, use the existing form title strings like `habits.form.createTitle` or add a dedicated `habits.breadcrumb.new` key.
**Warning signs:** Breadcrumb shows key path instead of human text.

## Code Examples

### Example 1: PageBreadcrumbs Component Usage

```tsx
// In habit detail page
<div>
  <PageBreadcrumbs section="habits" itemName={habit.name} />
  <PageHeader title={habit.name} actions={<Button>Edit</Button>} />
</div>

// In create habit page
<div>
  <PageBreadcrumbs section="habits" itemName={t("breadcrumb.newHabit")} />
  <PageHeader title={t("form.createTitle")} actions={...} />
</div>

// In edit habit page
<div>
  <PageBreadcrumbs section="habits" itemName={habit.name} />
  <PageHeader title={t("form.editTitle")} actions={...} />
</div>
```

### Example 2: Form ID Attribute for External Submit Button

```tsx
// In the content component (e.g., create-habit-content.tsx)
<PageHeader
  title={t("form.createTitle")}
  actions={
    <>
      <Button variant="ghost" onClick={handleCancel} disabled={isLoading}>
        {t("form.cancel")}
      </Button>
      <Button type="submit" form="habit-form" disabled={isLoading}>
        {isLoading ? t("form.creating") : t("form.create")}
      </Button>
    </>
  }
/>
<Card>
  <CardContent className="pt-6">
    <HabitForm
      id="habit-form"        // New prop to set form element id
      mode="create"
      onSubmit={handleSubmit}
      hideChrome             // New prop to hide internal title + buttons
      isLoading={isLoading}
    />
  </CardContent>
</Card>
```

### Example 3: Auth Branding Block

```tsx
// Reusable branding block for auth pages
function AuthBranding() {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <span className="font-display font-bold text-lg">B</span>
      </div>
      <span className="font-display font-semibold text-xl">BetterR.me</span>
    </div>
  );
}
```

This uses the same branding pattern from the sidebar (`AppSidebar` renders `B` icon + `BetterR.me` text). Uses `bg-primary` / `text-primary-foreground` tokens for the icon, and `font-display` for the brand font. No logo asset exists; styled text mark is the only option (Claude's discretion decision).

### Example 4: Detail Page with Card Wrapping

```tsx
// Habit detail with all content in a single Card
<div className="space-y-6">
  <div>
    <PageBreadcrumbs section="habits" itemName={habit.name} />
    <PageHeader
      title={habit.name}
      actions={
        <Button onClick={() => router.push(`/habits/${habitId}/edit`)}>
          <Edit className="size-4 mr-2" /> {t("detail.edit")}
        </Button>
      }
    />
  </div>
  <Card className="max-w-3xl">
    <CardContent className="space-y-6 pt-6">
      {/* Status badge, category, frequency */}
      {/* Streak counter */}
      {/* Completion stats */}
      {/* Heatmap */}
      {/* Actions (pause, archive, delete) */}
    </CardContent>
  </Card>
</div>
```

## Inventory of Pages to Migrate

### Habits (4 pages, inside SidebarShell)
| Page | Route | Content Component | Current Header | Migration |
|------|-------|-------------------|----------------|-----------|
| List | `/habits` | `HabitsPageContent` | Inline h1 + Create button | PageHeader. Cards already float. |
| Detail | `/habits/[id]` | `HabitDetailContent` | Back button + Edit button | Breadcrumbs + PageHeader + Card wrap |
| Edit | `/habits/[id]/edit` | `EditHabitContent` | HabitForm internal h2 + buttons | Breadcrumbs + PageHeader + Card wrap + form refactor |
| Create | `/habits/new` | `CreateHabitContent` | HabitForm internal h2 + buttons | Breadcrumbs + PageHeader + Card wrap + form refactor |

### Tasks (4 pages, inside SidebarShell)
| Page | Route | Content Component | Current Header | Migration |
|------|-------|-------------------|----------------|-----------|
| List | `/tasks` | `TasksPageContent` | Inline h1 + Create button | PageHeader. Cards already float. |
| Detail | `/tasks/[id]` | `TaskDetailContent` | Back button + Edit button | Breadcrumbs + PageHeader + Card wrap |
| Edit | `/tasks/[id]/edit` | `EditTaskContent` | TaskForm internal h2 + buttons | Breadcrumbs + PageHeader + Card wrap + form refactor |
| Create | `/tasks/new` | `CreateTaskContent` | TaskForm internal h2 + buttons | Breadcrumbs + PageHeader + Card wrap + form refactor |

### Settings (1 page, inside SidebarShell via dashboard layout)
| Page | Route | Content Component | Current Header | Migration |
|------|-------|-------------------|----------------|-----------|
| Settings | `/dashboard/settings` | `SettingsContent` | Inline h1 + Save button | PageHeader. Multi-card already correct. |

### Auth (6 pages, NO SidebarShell)
| Page | Route | Form Component | Current Layout | Migration |
|------|-------|---------------|----------------|-----------|
| Login | `/auth/login` | `LoginForm` | Centered, Card already used | Add branding above Card |
| Sign Up | `/auth/sign-up` | `SignUpForm` | Centered, Card already used | Add branding above Card |
| Forgot Password | `/auth/forgot-password` | `ForgotPasswordForm` | Centered, Card already used | Add branding above Card |
| Update Password | `/auth/update-password` | `UpdatePasswordForm` | Centered, Card already used | Add branding above Card |
| Sign Up Success | `/auth/sign-up-success` | Inline Card | Centered, Card already used | Add branding above Card |
| Error | `/auth/error` | Inline Card | Centered, Card already used | Add branding above Card |

### Test Files Potentially Affected
| Test File | Component | Likely Impact |
|-----------|-----------|---------------|
| `tests/app/habits/habits-page-content.test.tsx` | HabitsPageContent | Title text assertion should still pass (PageHeader renders same text). Create button text unchanged. |
| `tests/app/habits/habit-detail-page.test.tsx` | HabitDetailContent | Back button removal may break assertions. Edit button text unchanged. |
| `tests/app/habits/edit-habit-page.test.tsx` | EditHabitContent | HabitForm chrome changes may break heading assertions. |
| `tests/app/habits/create-habit-page.test.tsx` | CreateHabitContent | HabitForm chrome changes may break heading assertions. |
| `tests/components/habits/habit-form.test.tsx` | HabitForm | If hideChrome prop added, existing tests unaffected (default shows chrome). |
| `tests/components/tasks/tasks-page-content.test.tsx` | TasksPageContent | Same as habits list -- title text should survive. |
| `tests/components/tasks/task-detail-content.test.tsx` | TaskDetailContent | Back button removal may break assertions. |
| `tests/components/tasks/edit-task-content.test.tsx` | EditTaskContent | Form chrome changes. |
| `tests/components/tasks/create-task-content.test.tsx` | CreateTaskContent | Form chrome changes. |

## Discretion Recommendations

### 1. Breadcrumbs on Top-Level List Pages
**Recommendation: NO breadcrumbs on list pages.** Breadcrumbs only on nested views (detail, edit, create). Rationale:
- Sidebar already shows the current section (Habits/Tasks active highlight)
- A single breadcrumb ("Habits") with no parent adds no navigation value
- Chameleon/Linear only show breadcrumbs on nested views
- Keeps the list page headers clean and consistent with dashboard (which has no breadcrumbs)

### 2. Mobile Truncation
**Recommendation:** `truncate max-w-[200px] sm:max-w-none` on the breadcrumb item name. 200px allows approximately 20-25 characters before truncation, which handles most habit/task names. On sm+ screens, no truncation.

### 3. Breadcrumb Separator
**Recommendation:** Use the default shadcn `ChevronRight` icon (14px, `[&>svg]:size-3.5`). It's already configured in `BreadcrumbSeparator`. No need to customize.

### 4. Auth Branding
**Recommendation:** Styled text mark using the same pattern as AppSidebar:
- `size-10` primary-colored square with "B" in font-display
- "BetterR.me" text in font-display font-semibold text-xl
- `mb-8` spacing below branding, above the form card
- No logo asset exists in the project; text mark is the only option

### 5. Spacing Above Card (Auth)
**Recommendation:** `mb-8` (32px) between branding and form card. This provides visual breathing room without pushing the card too low on the viewport.

## Open Questions

1. **HabitForm/TaskForm refactoring approach**
   - What we know: Forms have internal titles and buttons that conflict with PageHeader
   - What's unclear: Whether to add `hideChrome` prop or fully refactor forms to be headless
   - Recommendation: Add `hideChrome` boolean prop (default false) to suppress title + buttons. This is backward-compatible and minimal change. Also add `id` string prop for external form association. The form still works standalone when `hideChrome` is false.

2. **Detail page Card content width**
   - What we know: Detail pages currently use `max-w-3xl mx-auto` (768px). SidebarLayout provides max-w-content (1400px).
   - What's unclear: Should the Card be max-w-3xl or should it span full content width?
   - Recommendation: Keep `max-w-3xl` constraint on a wrapper div or the Card itself for detail/form pages. This prevents content from feeling too sparse on wide screens. List pages stay full width for the 3-column grid.

3. **Skeleton states for breadcrumbs**
   - What we know: PageHeaderSkeleton exists but has no breadcrumb skeleton
   - What's unclear: Whether breadcrumb loading state is needed
   - Recommendation: For detail/edit pages where the item name comes from an API call, breadcrumbs render after data loads (same time as the content). The skeleton state already shows PageHeaderSkeleton. No separate breadcrumb skeleton needed -- breadcrumbs appear with the full page content, not before.

## Sources

### Primary (HIGH confidence)
- Codebase inspection: `components/ui/breadcrumb.tsx` -- shadcn Breadcrumb primitives already installed with Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator exports
- Codebase inspection: `components/layouts/page-header.tsx` -- PageHeader with title, subtitle, actions, className props
- Codebase inspection: `components/layouts/sidebar-layout.tsx` -- SidebarLayout with bg-page, max-w-content, responsive padding
- Codebase inspection: All 15 pages inventoried with current structure documented
- Phase 4 plan (04-01-PLAN.md) -- PageHeader spec and content wrapper design
- Phase 5 plan (05-01-PLAN.md) -- Card-on-gray migration pattern (dashboard)

### Secondary (MEDIUM confidence)
- Prior decisions from CONTEXT.md -- breadcrumb positioning, auth styling, card wrapping rules

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all components already exist in the codebase, no new libraries needed
- Architecture: HIGH -- patterns established by Phase 4/5 dashboard migration, directly applicable
- Pitfalls: HIGH -- identified from direct code inspection (form submit, test assertions, max-width, auth background)

**Research date:** 2026-02-16
**Valid until:** 2026-03-16 (stable -- no external dependencies changing)
