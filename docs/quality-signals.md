# Advisory quality signals

This document defines what the repository's optional visual, accessibility,
and performance signals prove. These signals provide evidence for a pull
request or scheduled run; they are not additional required merge-check names.
The required aggregate names remain `CI Gate` and `E2E Gate`.

## Visual checks

### Screenshot comparison

`pnpm test:e2e:visual` and a selected E2E status labelled `screenshot
comparison` run Playwright's `toHaveScreenshot` assertions against checked-in
baselines. The suite covers the login page, light and dark dashboards, habits
list, create-habit form, and settings page. It allows a 1% differing-pixel
ratio and masks the dynamic regions named in `e2e/visual-regression.spec.ts`.

A passing comparison proves only that the unmasked pixels are within that
tolerance on the configured CI browser and platform. It is not a claim that
the screenshots are deterministic across operating systems, that masked or
uncovered states are correct, or that a person approved the appearance.

### Screenshot baseline production

The manually dispatched `Produce Visual Comparison Baselines` workflow runs
Playwright with `--update-snapshots` and commits changed screenshot baselines to
the selected branch. Its `Produce screenshot baselines` job produces reference
files; it does not compare them to an independent expected image and does not
provide a visual-correctness verdict.

### Human visual review

Human visual review means a reviewer inspects the intended UI and the changed
baseline images in context. No workflow or reported status performs or records
that review. Producing baselines and passing screenshot comparison must not be
described as human approval.

## Automated accessibility checks

### Automated rules and assertions

The repository has three different automated accessibility surfaces:

- Component tests that call `vitest-axe` run the axe-core 4.11 rules applicable
  to the rendered JSDOM fixture. A test may disable a rule locally and must say
  why at that call site. These checks cover only the component states rendered
  by those tests and do not exercise browser layout, navigation, or a full page.
- `e2e/accessibility.spec.ts` uses explicit Playwright assertions for keyboard
  Tab navigation, visible focus, Space activation, a conditional Escape
  dismissal probe, heading hierarchy, image alt attributes, form labels, common
  ARIA roles, the main landmark, a custom text-contrast heuristic, touch-target
  dimensions, and iOS input font size. The contrast and touch-target checks
  include the tolerances and exclusions written in that spec; they are not full
  WCAG conformance scans.
- Lighthouse collects its accessibility category for the URLs listed below and
  reports a warning below 0.90. That aggregate score is a measurement, not a
  complete list of passed WCAG criteria.

### Exercised pages and journeys

The browser accessibility spec exercises these concrete surfaces:

- `/auth/login`: the custom text-contrast heuristic in an unauthenticated
  browser context.
- `/dashboard`: keyboard movement, visible focus, Space activation of a seeded
  habit checkbox, heading hierarchy, image alt attributes, common interactive
  roles, the main landmark, mobile touch-target sampling, and a conditional
  Escape-dismissal probe when a generic closed trigger opens a visible dialog.
- `/habits`: keyboard movement through the habits page.
- `/habits/new`: keyboard movement through the create-habit form, label checks,
  and the 16px minimum input-font assertion at a mobile viewport.

Component-level axe tests add coverage for their named fixtures throughout
`tests/accessibility` and `tests/components`, but they do not imply that every
state of the containing page was exercised.

### Manual-review gaps

Automation does not establish screen-reader announcement quality, usable
accessible names for every state, logical reading and focus order through each
complete journey, keyboard support outside the journeys above, 200%/400% zoom
and reflow, forced-colors or other assistive display modes, native mobile
screen-reader behavior, cognitive clarity, or contrast in backgrounds and
states skipped by the custom heuristic. Those gaps require deliberate manual
review when a change affects them.

## Performance measurements (advisory)

The `Performance Measurements (Advisory)` workflow reports bundle-size and
Lighthouse budgets. Its status is `Bundle and Lighthouse budgets (advisory)`;
it is not named as a required merge gate. An error-level budget can still make
the advisory workflow red and should be investigated.

### Budgets

The bundle measurement fails its job when total JavaScript exceeds 1,500 KiB
gzipped or any JavaScript chunk exceeds 130 KiB gzipped. CSS sizes are reported
without a budget.

Lighthouse uses simulated mobile throttling and the following assertions:

| Measurement | Budget | Result when exceeded |
| --- | ---: | --- |
| Performance score | at least 0.90 | warning |
| Accessibility score | at least 0.90 | warning |
| Best-practices score | at least 0.90 | warning |
| First Contentful Paint | at most 1,800 ms | error |
| Largest Contentful Paint | at most 2,500 ms | warning |
| Time to Interactive | at most 3,800 ms | warning |
| Cumulative Layout Shift | at most 0.10 | error |
| Total Blocking Time | at most 200 ms | warning |

Lighthouse also collects SEO, but the repository defines no SEO assertion.

### Variance policy

Pull requests collect one Lighthouse sample for `/` only. There is no
repository-level retry, outlier rejection, or variance allowance for that
single sample. Scheduled and manually dispatched runs collect three samples for
`/`, `/auth/login`, `/dashboard`, `/habits`, and `/dashboard/settings`; the
repository does not add its own statistical rule beyond Lighthouse CI's handling
of those samples. A noisy warning should be compared with repeat runs before a
budget is changed. Error budgets are not automatically relaxed for variance.

The bundle measurement performs one production build and one gzip calculation.
It has no variance allowance or retry.

### Ownership

The pull-request author owns investigation of a new warning or failure caused
by the change. Repository maintainers own the budget values, URL scope, run
counts, and any decision to accept or revise a budget. Budget changes should be
reviewed as policy changes, not used to hide an unexplained regression.

## Targeted verification

Run the contract checks without the complete E2E suite:

```bash
pnpm exec vitest run tests/scripts/quality-signal-contracts.test.ts \
  tests/scripts/classify-changes.test.ts \
  tests/scripts/github-actions-runtime-policy.test.ts
```

This verifies the affected workflow and documentation contracts. It does not
launch Playwright, produce screenshots, run axe in a browser, build the app, or
collect Lighthouse measurements.
