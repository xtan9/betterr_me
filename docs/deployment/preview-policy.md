# Vercel preview policy

Vercel previews are advisory and manual. The pull-request CI workflow reports
whether a preview is warranted; it never dispatches the deployment workflow.
The policy is implemented by
[`scripts/ci/preview-deployment-policy.mjs`](../../scripts/ci/preview-deployment-policy.mjs)
and uses the same path classification as the controlled Vercel build policy.

## Default decision

The policy requests a preview when at least one changed path can affect the
deployed Next.js application. It does not request one by default when all
changed paths are limited to:

- documentation;
- unit or end-to-end tests;
- scripts and automation;
- GitHub Actions or other CI policy files; or
- Supabase migrations and other database-only files.

An unfamiliar path is treated conservatively as runtime-affecting. A mixed
change requests a preview because its runtime files are listed in the report.
An empty or unclassifiable comparison is advisory-only and requires manual
review; it does not dispatch a preview automatically.

## Pull-request report

For pull requests, the `Preview policy (request|skip)` CI job writes the
decision, reason, and runtime files to the GitHub Actions job summary. This is
an advisory signal and is not part of `CI Gate` or `E2E Gate`.

## Authorized dispatch

An authorized human or AI process may use `Vercel Deploy` with `target: preview`
and provide:

1. the pull-request number;
2. the exact pull-request head commit SHA; and
3. the explicit `allow_fork_preview: true` input only when a maintainer has
   authorized deployment of a fork pull request.

The workflow verifies that the SHA is the pull-request head and that the exact
SHA has successful `CI Gate` and `E2E Gate` checks. It checks out that SHA
before invoking the Vercel CLI. Fork pull requests do not receive deployment
credentials unless the explicit fork authorization input is supplied by an
authorized workflow dispatcher; the credentials are not job-level environment
variables.

The workflow keeps the existing non-cancelling Vercel concurrency control and
adds the exact preview commit to its group. Before credentials are used, it
creates a `Vercel Preview` check on the commit. A later dispatch for the same
commit sees that check and skips, so at most one preview is dispatched per
commit.
