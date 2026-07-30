#!/usr/bin/env bash
set -euo pipefail

# Scheduled/manual runs are intentionally full safety runs. Pull requests and
# pushes to main use the same changed-file selection so a merge is not tested
# twice at full-repository scope.
if [[ "${EVENT_NAME:-}" != "pull_request" && "${EVENT_NAME:-}" != "push" ]]; then
  {
    echo "quality=true"
    echo "full_tests=true"
    echo "full_lint=true"
    echo "changed_tests=false"
    echo "quality_smoke_tests="
    echo "quality_label=full suite"
    echo "migrations=true"
    echo "e2e=true"
    echo "e2e_full=true"
    echo "e2e_specs="
    echo "e2e_runway=false"
    echo "e2e_visual=false"
    echo "e2e_supabase=true"
    echo "e2e_label=full Chromium"
    echo "performance=true"
    echo "base_sha=${BASE_SHA:-}"
  } >> "$GITHUB_OUTPUT"
  exit 0
fi

# Pull requests already validate their exact head before merge. A push created
# by merging one of those pull requests only needs the separate production
# smoke; direct pushes still flow through the normal changed-file selection.
if [[ "${EVENT_NAME:-}" == "push" && "${VALIDATED_BY_PULL_REQUEST:-false}" == "true" ]]; then
  {
    echo "quality=false"
    echo "full_tests=false"
    echo "full_lint=false"
    echo "changed_tests=false"
    echo "quality_smoke_tests="
    echo "quality_label=already validated"
    echo "migrations=false"
    echo "e2e=false"
    echo "e2e_full=false"
    echo "e2e_specs="
    echo "e2e_runway=false"
    echo "e2e_visual=false"
    echo "e2e_supabase=false"
    echo "e2e_label=not needed"
    echo "performance=false"
    echo "base_sha=${BASE_SHA:-}"
  } >> "$GITHUB_OUTPUT"
  exit 0
fi

if [[ -z "${BASE_SHA:-}" || -z "${HEAD_SHA:-}" ]]; then
  echo "::warning::Missing comparison SHA; running all checks."
  {
    echo "quality=true"
    echo "full_tests=true"
    echo "full_lint=true"
    echo "changed_tests=false"
    echo "quality_smoke_tests="
    echo "quality_label=full suite"
    echo "migrations=true"
    echo "e2e=true"
    echo "e2e_full=true"
    echo "e2e_specs="
    echo "e2e_runway=false"
    echo "e2e_visual=false"
    echo "e2e_supabase=true"
    echo "e2e_label=full Chromium"
    echo "performance=true"
    echo "base_sha=${BASE_SHA:-}"
  } >> "$GITHUB_OUTPUT"
  exit 0
fi

changed_files="$(git diff --name-only "$BASE_SHA" "$HEAD_SHA")"
printf '%s\n' "$changed_files"

matches() {
  grep -Eq "$1" <<< "$changed_files"
}

migrations=false
performance=false

if matches '^supabase/migrations/|^\.github/workflows/ci\.yml$'; then
  migrations=true
fi

if matches '^(app|components|emails|hooks|i18n|lib|public)/|^\.github/actions/|^(package\.json|pnpm-lock\.yaml|next\.config\.ts|proxy\.ts|tailwind\.config\.ts|postcss\.config\.mjs|lighthouserc\.js|\.github/workflows/performance\.yml|scripts/analyze-bundle\.ts)$'; then
  performance=true
fi

e2e_outputs="$(printf '%s\n' "$changed_files" | node scripts/ci/select-e2e-tests.mjs)"
printf '%s\n' "$e2e_outputs"
printf '%s\n' "$e2e_outputs" >> "$GITHUB_OUTPUT"

quality_outputs="$(printf '%s\n' "$changed_files" | node scripts/ci/select-quality-checks.mjs)"
printf '%s\n' "$quality_outputs"
printf '%s\n' "$quality_outputs" >> "$GITHUB_OUTPUT"

{
  echo "migrations=$migrations"
  echo "performance=$performance"
  echo "base_sha=$BASE_SHA"
} >> "$GITHUB_OUTPUT"
