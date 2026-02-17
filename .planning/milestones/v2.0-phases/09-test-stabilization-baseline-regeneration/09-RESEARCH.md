# Phase 9: Test Stabilization & Baseline Regeneration - Research

**Researched:** 2026-02-17
**Domain:** Vitest unit testing, Playwright E2E testing, visual regression, accessibility (vitest-axe), i18n locale verification
**Confidence:** HIGH

## Summary

Phase 9 is a stabilization phase, not a feature phase. All 77 Vitest unit test files (972 tests) already pass green on the current branch. The sidebar-related unit tests (AppSidebar, SidebarUserFooter, PageHeader) were created inline during Phases 2-7 and are fully passing. The primary work remaining is: (1) auditing and updating E2E tests for sidebar navigation selectors, (2) regenerating visual regression baselines that now show the sidebar layout, (3) verifying accessibility in the new layout across all three locales and both themes, and (4) cleaning up orphaned test code (e.g., the Navbar a11y test that tests an old component).

The codebase has strong test infrastructure already in place: page object models for Playwright, mock patterns for sidebar components (documented in Phase 2 plan), E2E global setup/teardown with seed data, and a well-configured visual regression pipeline with platform-specific snapshots.

**Primary recommendation:** Structure this phase as two plans: (1) Unit test audit + E2E selector updates + accessibility verification, (2) Visual regression baseline regeneration + locale/theme matrix verification. Plan 1 can run without a dev server; Plan 2 requires a running server for Playwright.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | All existing Vitest unit tests pass after redesign | Already passing (972/972). Audit needed for orphaned Navbar a11y test and any selector-dependent assertions. |
| TEST-02 | All existing Playwright E2E tests updated and passing with new sidebar layout | E2E page objects and spec files identified. Key updates: cross-browser theme toggle selector, tasks-list nav selector, responsive nav test, dashboard nav test. |
| TEST-03 | Visual regression baselines regenerated for the new design | 18 existing baseline PNGs in `e2e/visual-regression.spec.ts-snapshots/`. Delete all, regenerate with `--update-snapshots`. |
| TEST-04 | Accessibility standards maintained (vitest-axe tests pass) | vitest-axe tests pass. Navbar a11y test references old `navbar.tsx` -- needs removal or replacement with sidebar a11y test. E2E accessibility spec needs sidebar-aware selectors. |
| TEST-05 | All three locales render correctly with new layout | All 3 locale files have sidebar translations. Need E2E locale smoke test or manual verification script. |
| TEST-06 | Dark mode and light mode both fully styled and tested | Visual regression already captures light/dark dashboard. Cross-browser theme toggle test needs selector update (theme now in sidebar dropdown, not top-nav button). |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | (project) | Unit testing | Already configured in vitest.config.ts |
| @testing-library/react | (project) | Component rendering | Standard React testing |
| vitest-axe | (project) | Accessibility assertions | axe-core integration for vitest |
| @playwright/test | (project) | E2E & visual regression | Already configured with 8 browser projects |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @testing-library/user-event | (project) | User interaction simulation | When testing interactive components |

### No New Dependencies Needed
This phase uses exclusively existing tooling. No new packages are required.

## Architecture Patterns

### Test File Organization (current)
```
tests/
  accessibility/a11y.test.tsx          # vitest-axe component audits
  components/layouts/
    app-sidebar.test.tsx               # Sidebar nav (created Phase 2)
    sidebar-user-footer.test.tsx       # User footer (created Phase 7)
    page-header.test.tsx               # PageHeader (created Phase 4)
  components/dashboard/                # Dashboard component tests
  components/habits/                   # Habit component tests
  components/tasks/                    # Task component tests
  app/api/                            # API route tests
  lib/                                # Utility/DB layer tests

e2e/
  pages/                              # Page Object Models
    dashboard.page.ts
    habits.page.ts
    create-habit.page.ts
    login.page.ts
  helpers/checkbox.ts                 # Radix checkbox toggle helper
  visual-regression.spec.ts           # Screenshot comparison tests
  accessibility.spec.ts               # E2E keyboard nav + contrast
  responsive.spec.ts                  # Layout-specific responsive tests
  cross-browser.spec.ts               # Cross-browser functional tests
  dashboard.spec.ts                   # Dashboard load + navigation
  create-habit.spec.ts                # Habit creation flow
  complete-habit.spec.ts              # Habit toggle flow
  tasks-list.spec.ts                  # Tasks page tests
  task-detail.spec.ts                 # Task detail/edit/delete
```

### Pattern 1: Sidebar Component Mock (established in Phase 2)
**What:** Mock shadcn sidebar components with simplified HTML elements for unit testing
**When to use:** All unit tests that render components inside sidebar layout
**Example:**
```typescript
// Source: tests/components/layouts/app-sidebar.test.tsx (existing)
vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children, ...props }: any) => (
    <nav data-testid="sidebar" {...props}>{children}</nav>
  ),
  SidebarContent: ({ children }: any) => <div>{children}</div>,
  SidebarMenuButton: ({ children, isActive, asChild, tooltip, ...props }: any) => {
    if (asChild) {
      const child = React.Children.only(children);
      return React.cloneElement(child, {
        "data-active": isActive || undefined,
        "aria-current": isActive ? "page" : undefined,
      });
    }
    return <button data-active={isActive || undefined} {...props}>{children}</button>;
  },
  // ... other components render as simple HTML
}));
```

### Pattern 2: Tooltip Mock (established in Phase 3)
**What:** Passthrough tooltip components with data-testid for content assertions
**When to use:** Any component using Tooltip from shadcn
**Example:**
```typescript
// Source: tests/components/layouts/app-sidebar.test.tsx (existing)
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: any) => {
    if (asChild) return <>{children}</>;
    return <>{children}</>;
  },
  TooltipContent: ({ children }: any) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
  TooltipProvider: ({ children }: any) => <>{children}</>,
}));
```

### Pattern 3: Visual Regression Baseline Regeneration
**What:** Delete old baselines, run tests with `--update-snapshots` to create new ones
**When to use:** After visual changes stabilize
**Example:**
```bash
# Delete all existing baselines
rm -rf e2e/visual-regression.spec.ts-snapshots/

# Regenerate baselines (visual-regression project only)
pnpm test:e2e:visual -- --update-snapshots
```

### Pattern 4: E2E Page Object Model
**What:** Locators encapsulated in page classes for maintainability
**When to use:** All E2E tests use page objects, selectors updated here propagate everywhere
**Example:**
```typescript
// Source: e2e/pages/dashboard.page.ts (existing)
export class DashboardPage {
  get navLinks() { return this.page.getByRole('link'); }
  get statCards() { return this.page.locator('[data-testid="stat-card"]'); }
}
```

### Anti-Patterns to Avoid
- **Modifying business logic in tests:** Phase 9 MUST NOT change any business logic. Only selectors, layout assertions, and visual baselines change.
- **Adding E2E tests for features not yet implemented:** Only stabilize existing tests.
- **Keeping dead test code:** Remove tests for deleted components (Navbar a11y test).
- **Running `--update-snapshots` on all projects:** Only update visual-regression project baselines; other projects don't do screenshot comparison.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accessibility checking | Custom DOM inspection | vitest-axe (`axe(container)`) | axe-core covers WCAG 2.1 AA rules comprehensively |
| Visual regression | Pixel-by-pixel comparison | Playwright `toHaveScreenshot()` | Built-in snapshot management, diff generation, platform awareness |
| Theme toggling in E2E | Direct cookie/class manipulation | `page.evaluate()` to set class on `documentElement` | Mirrors how visual-regression.spec.ts already handles it |
| Locale smoke testing | Custom fetch-and-parse | Playwright with cookie-based locale setting | next-intl reads `locale` cookie; set it before navigation |

## Common Pitfalls

### Pitfall 1: Cross-Browser Theme Toggle Selector Is Stale
**What goes wrong:** The cross-browser spec (`cross-browser.spec.ts` line 91) looks for `button:has(svg[class*="moon"]), button:has(svg[class*="sun"]), [aria-label*="theme"]`. The theme toggle is now inside the sidebar user footer dropdown, not a standalone button in the top nav.
**Why it happens:** Theme/language switchers moved from top header to sidebar footer dropdown (Phase 7, VISL-09).
**How to avoid:** Update the selector to open the sidebar user dropdown first, then find the theme radio items. Or, simplify to test via `page.evaluate()` class toggle (matching the visual regression approach).
**Warning signs:** Test times out looking for a button that doesn't exist.

### Pitfall 2: Navbar A11y Test References Deleted Component
**What goes wrong:** `tests/accessibility/a11y.test.tsx` has a "Accessibility - Navbar" describe block that imports `@/components/navbar`. While the file still exists, it's an orphan (no longer used in layouts). The test currently passes because the file exists, but it's testing dead code.
**Why it happens:** The Navbar was replaced by AppSidebar in Phase 2, but the a11y test was never updated.
**How to avoid:** Remove the Navbar test block. Optionally add an AppSidebar a11y test (using axe) in its place.
**Warning signs:** Test passes but provides no value; if `navbar.tsx` is later deleted, the test will break.

### Pitfall 3: Visual Regression Baselines Are Platform-Dependent
**What goes wrong:** Baselines generated on Linux won't match macOS or Windows renders. The current baselines are all `*-linux.png` (from the snapshot path template using `{platform}`).
**Why it happens:** Playwright screenshot comparison is pixel-level. Font rendering differs by OS.
**How to avoid:** Always regenerate baselines on the same platform used in CI (Linux). The `maxDiffPixelRatio: 0.01` threshold is already set in the spec.
**Warning signs:** All visual regression tests fail with pixel diffs that show only font smoothing differences.

### Pitfall 4: Mobile E2E Tests May Need Sidebar Sheet Interaction
**What goes wrong:** On mobile viewports (<768px), the sidebar is a sheet/drawer. Tests that navigate between pages by clicking nav links need to open the sheet first.
**Why it happens:** The sidebar is hidden by default on mobile; only the `SidebarTrigger` (hamburger) is visible.
**How to avoid:** For mobile projects, check if the nav link is visible. If not, click the `SidebarTrigger` first to open the sheet, then click the nav link.
**Warning signs:** `responsive.spec.ts` navigation test fails because `navLinks.count()` returns 0 on mobile.

### Pitfall 5: Dynamic Content in Visual Regression Screenshots
**What goes wrong:** Screenshots contain dynamic data (streaks, dates, completion counts) that change between runs, causing false failures.
**Why it happens:** Tests interact with a real Supabase backend; data changes with seed habits.
**How to avoid:** The existing visual regression spec already masks dynamic elements (`stat-card`, checkboxes, greeting text). Verify masks are still correct after layout changes.
**Warning signs:** Visual regression fails on content inside stat cards or habit lists.

### Pitfall 6: E2E Tasks Nav Selector Uses `nav a[href="/tasks"]`
**What goes wrong:** `tasks-list.spec.ts` line 47 uses `page.locator('nav a[href="/tasks"]').first()`. This still works because the sidebar renders inside a `<nav>` element (mocked as `<nav>` in tests, actual shadcn Sidebar renders as `<aside>` with `<nav>` inside).
**Why it happens:** The selector is fragile -- it depends on the sidebar's internal DOM structure.
**How to avoid:** Verify this selector still matches the actual sidebar DOM. If the sidebar `<aside>` doesn't contain a `<nav>`, update to use `page.getByRole('link', { name: /tasks/i })`.
**Warning signs:** Test fails with "element not found" on the nav link locator.

### Pitfall 7: The 2 Known Pre-Existing Test Failures
**What goes wrong:** `habit-logs.test.ts` has 2 known failures (`times_per_week getDetailedHabitStats`) tracked in issue #98.
**Why it happens:** Pre-existing bug, not related to the redesign.
**How to avoid:** Document these as known failures. Do NOT fix them in Phase 9 (out of scope). If they appear in the test run, acknowledge them.
**Warning signs:** These tests fail but were failing before the redesign started.

## Code Examples

### Regenerating Visual Regression Baselines
```bash
# Source: e2e/visual-regression.spec.ts comment (line 10)
# Step 1: Delete all existing baselines
rm -rf e2e/visual-regression.spec.ts-snapshots/

# Step 2: Regenerate with update-snapshots flag
pnpm test:e2e:visual -- --update-snapshots

# Step 3: Verify the new baselines pass
pnpm test:e2e:visual
```

### Running Vitest with Coverage Check
```bash
# Source: vitest.config.ts coverage thresholds
pnpm test:coverage
# Thresholds: lines 50%, functions 50%, branches 50%, statements 50%
# components/ui/ excluded from coverage
```

### Updating E2E Theme Toggle for Sidebar Dropdown
```typescript
// OLD (cross-browser.spec.ts line 91):
const themeToggle = page.locator(
  'button:has(svg[class*="moon"]), button:has(svg[class*="sun"]), [aria-label*="theme"]'
);

// NEW approach: Theme is now in sidebar user footer dropdown.
// On desktop, click the user avatar button in sidebar footer to open dropdown.
// Then use page.evaluate() to toggle the class directly (matching visual-regression pattern).
await page.evaluate(() => {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  html.classList.toggle('dark', !isDark);
  html.classList.toggle('light', isDark);
  html.style.colorScheme = isDark ? 'light' : 'dark';
});
await expect(page.locator('html')).toHaveAttribute('class', /dark|light/);
```

### Locale Verification Pattern for E2E
```typescript
// Set locale via cookie before navigation
await page.context().addCookies([{
  name: 'locale',
  value: 'zh',
  domain: 'localhost',
  path: '/',
}]);
await page.goto('/dashboard');
// Verify Chinese text appears in sidebar
await expect(page.getByText('...')).toBeVisible(); // Chinese nav label
```

### Removing Orphaned Navbar A11y Test
```typescript
// In tests/accessibility/a11y.test.tsx, REMOVE this block:
describe("Accessibility - Navbar", () => {
  it("should have aria-label on nav element", async () => {
    const Navbar = (await import("@/components/navbar")).default;
    const { container } = render(await Navbar());
    // ...
  });
});

// Also remove associated mock:
vi.mock("@/components/auth-button", ...);
vi.mock("@/components/language-switcher", ...);
vi.mock("@/components/theme-switcher", ...);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Top navbar + bottom tab nav | Sidebar with SidebarShell/SidebarLayout | Phase 2-3 | E2E selectors for navigation need update |
| ThemeSwitcher in top header | Theme toggle in sidebar user footer dropdown | Phase 7 | cross-browser.spec.ts theme test selector invalid |
| Navbar a11y test | AppSidebar a11y test (or removed) | Phase 9 (this phase) | Dead code removal |
| Old visual baselines (pre-redesign) | Some baselines already exist on branch | Phases 1-8 | All 18 baselines need regeneration |

**Deprecated/outdated:**
- `components/navbar.tsx`: Still exists as file but unused in any layout. The a11y test for it should be removed.
- `components/theme-switcher.tsx`: Still exists but only imported by old `navbar.tsx`. Test (`tests/components/theme-switcher.test.tsx`) still passes because the component exists, but it's testing dead code.
- `components/language-switcher.tsx`: Same situation -- imported only by old navbar.

## Inventory of Test Updates Needed

### Unit Tests (Vitest) - Currently All Passing
| File | Status | Action Needed |
|------|--------|--------------|
| tests/accessibility/a11y.test.tsx | PASSES but has dead code | Remove "Accessibility - Navbar" describe block; remove unused mocks for AuthButton, LanguageSwitcher, ThemeSwitcher |
| tests/components/theme-switcher.test.tsx | PASSES | Consider removing (tests dead component) or keep for now |
| All other 75 test files | PASSING | No changes needed |

### E2E Tests (Playwright)
| File | Potential Issue | Action Needed |
|------|----------------|--------------|
| cross-browser.spec.ts | Theme toggle selector (`button:has(svg[class*="moon"])`) won't find sidebar dropdown theme | Update theme toggle test to use `page.evaluate()` approach or open sidebar dropdown first |
| tasks-list.spec.ts | `nav a[href="/tasks"]` selector -- verify against actual sidebar DOM | Test if selector still works; update to role-based if needed |
| responsive.spec.ts | Navigation test on mobile -- sidebar is a sheet, navLinks may not be visible | Update to open sidebar trigger on mobile before checking navLinks |
| dashboard.spec.ts | `navLinks` getter returns ALL links on page (not just nav) -- may be fine | Verify count assertion is still valid with sidebar links |
| accessibility.spec.ts | Keyboard navigation may tab through sidebar items differently | Verify tab order; may need adjustment to find "create" button reliably |
| visual-regression.spec.ts | All baselines stale -- sidebar visible in screenshots | Delete all baselines and regenerate |
| create-habit.spec.ts | No nav-specific selectors, should work | Verify passes |
| complete-habit.spec.ts | No nav-specific selectors, should work | Verify passes |
| task-detail.spec.ts | References `main` locator, should work | Verify passes |

### Visual Regression Baselines
| Baseline | Status | Action |
|----------|--------|--------|
| 18 PNG files in `e2e/visual-regression.spec.ts-snapshots/` | Stale (pre-sidebar or mid-redesign) | Delete ALL and regenerate with `--update-snapshots` |

## Open Questions

1. **Are the existing 18 baseline PNGs from before or during the redesign?**
   - What we know: They exist on the feature branch, suggesting they were created during an earlier phase
   - What's unclear: Whether they reflect the final post-Phase-8 visual state
   - Recommendation: Delete all and regenerate regardless -- this is the safest approach and the roadmap explicitly calls for it

2. **Should the old ThemeSwitcher test be removed?**
   - What we know: `theme-switcher.tsx` still exists and the test passes, but the component is only imported by the old `navbar.tsx` which is unused
   - What's unclear: Whether `navbar.tsx` and `theme-switcher.tsx` will be deleted in this phase or kept as dead code
   - Recommendation: Remove the test to avoid testing dead code. If the components are deleted later, no test breaks. If they're kept, the test provides no value since the component isn't used.

3. **How should locale verification be done for E2E?**
   - What we know: All 3 locale JSON files have complete sidebar translations. Unit tests mock i18n. No existing E2E test specifically verifies locale rendering.
   - What's unclear: Whether TEST-05 requires full E2E locale tests or just a build verification
   - Recommendation: Add a lightweight E2E test that sets locale cookie to each value, navigates to dashboard, and verifies key sidebar text appears in the expected language. This covers the new sidebar translations without requiring a complex i18n test suite.

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: All test files, E2E specs, page objects, component source, config files
- `vitest.config.ts` -- test configuration, coverage thresholds
- `playwright.config.ts` -- E2E configuration, browser projects, visual regression project
- `tests/setup.ts` -- global mocks and polyfills
- `e2e/visual-regression.spec.ts` -- screenshot test patterns and masks
- `e2e/pages/*.page.ts` -- page object models with selectors

### Secondary (MEDIUM confidence)
- Phase 2 plan (`02-02-PLAN.md`) -- sidebar mock patterns and test approach
- Prior decisions from roadmap context -- E2E baselines deleted upfront, regenerated in Phase 9

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - directly inspected all config files and test infrastructure
- Architecture: HIGH - read every test file and component affected by the redesign
- Pitfalls: HIGH - identified by comparing E2E selectors against actual component DOM

**Research date:** 2026-02-17
**Valid until:** 2026-03-17 (stable -- test infrastructure doesn't change frequently)
