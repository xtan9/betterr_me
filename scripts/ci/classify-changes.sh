#!/usr/bin/env bash
set -euo pipefail

# Scheduled/manual runs and pushes to main are intentionally full safety runs.
if [[ "${EVENT_NAME:-}" != "pull_request" ]]; then
  {
    echo "quality=true"
    echo "full_tests=true"
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

if [[ -z "${BASE_SHA:-}" || -z "${HEAD_SHA:-}" ]]; then
  echo "::warning::Missing comparison SHA; running all checks."
  {
    echo "quality=true"
    echo "full_tests=true"
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

quality=false
full_tests=false
migrations=false
performance=false

# Source, tests, executable scripts, or tool configuration can affect lint/unit tests.
if matches '^(app|components|emails|hooks|i18n|lib|scripts|tests)/|\.(c|m)?(j|t)sx?$|^(package\.json|pnpm-lock\.yaml|tsconfig\.json|vitest\.config\.ts|eslint\.config\.mjs|next\.config\.ts|proxy\.ts|\.github/workflows/ci\.yml)$'; then
  quality=true
fi

# Dependency/test-runner/global setup changes invalidate Vitest's related-test graph.
if matches '^(package\.json|pnpm-lock\.yaml|vitest\.config\.ts|tsconfig\.json|tests/setup\.ts|tests/setup-mock-helpers\.test\.ts|\.github/workflows/ci\.yml|scripts/ci/classify-changes\.sh)$'; then
  full_tests=true
fi

if matches '^supabase/migrations/|^\.github/workflows/ci\.yml$'; then
  migrations=true
fi

if matches '^(app|components|emails|hooks|i18n|lib|public)/|^\.github/actions/|^(package\.json|pnpm-lock\.yaml|next\.config\.ts|proxy\.ts|tailwind\.config\.ts|postcss\.config\.mjs|lighthouserc\.js|\.github/workflows/performance\.yml|scripts/analyze-bundle\.ts)$'; then
  performance=true
fi

e2e_outputs="$(printf '%s\n' "$changed_files" | node scripts/ci/select-e2e-tests.mjs)"
printf '%s\n' "$e2e_outputs"
printf '%s\n' "$e2e_outputs" >> "$GITHUB_OUTPUT"

{
  echo "quality=$quality"
  echo "full_tests=$full_tests"
  echo "migrations=$migrations"
  echo "performance=$performance"
  echo "base_sha=$BASE_SHA"
} >> "$GITHUB_OUTPUT"
