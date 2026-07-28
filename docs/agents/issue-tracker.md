# Issue tracker: GitHub

Issues and PRDs for this repo live in GitHub Issues for `xtan9/betterr_me`.

Use the `github-issues` skill for all issue operations. Do not invoke the `gh` CLI directly for issue creation, reading, updating, labeling, commenting, or closing.

## Conventions

- Create, read, list, update, comment on, label, and close issues through the `github-issues` skill.
- Infer the repository from the `origin` remote: `https://github.com/xtan9/betterr_me.git`.
- Use the triage labels defined in `docs/agents/triage-labels.md`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

Set this to `yes` if the repository later begins treating external pull requests as feature requests.

## When a skill says "publish to the issue tracker"

Create a GitHub issue through the `github-issues` skill.

## When a skill says "fetch the relevant ticket"

Read the referenced GitHub issue, including its labels and comments, through the `github-issues` skill.

## Wayfinding operations

The map is a single GitHub issue with child issues as tickets.

- **Map:** An issue labeled `wayfinder:map`, containing Notes, Decisions-so-far, and Fog.
- **Child ticket:** A GitHub sub-issue linked to the map. Where sub-issues are unavailable, link it through the map's task list and put `Part of #<map>` at the top of the child.
- **Child labels:** `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- **Blocking:** Prefer GitHub's native issue dependencies. Where unavailable, put `Blocked by: #<n>, #<n>` at the top of the child.
- **Frontier:** The first open, unassigned child in map order with no open blockers.
- **Claim:** Assign the selected issue to the current user as the session's first write.
- **Resolve:** Comment with the answer, close the child, and append a context pointer to the map's Decisions-so-far.
