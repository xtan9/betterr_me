import { pathToFileURL } from "node:url";

const QUALITY_PATTERNS = [
  /^(?:app|components|emails|hooks|i18n|lib|scripts|tests)\//,
  /\.(?:c|m)?(?:j|t)sx?$/,
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json|vitest\.config\.ts|eslint\.config\.mjs|next\.config\.ts|proxy\.ts)$/,
  /^\.github\/(?:actions\/.+\/action|workflows\/.+)\.ya?ml$/,
];

const FULL_TEST_PATTERNS = [
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|vitest\.config\.ts|tsconfig\.json|tests\/setup\.ts|tests\/setup-mock-helpers\.test\.ts)$/,
];

const FULL_LINT_PATTERNS = [
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|eslint\.config\.mjs|tsconfig\.json)$/,
];

const CI_ONLY_PATTERNS = [
  /^\.github\/(?:actions\/.+\/action|workflows\/.+)\.ya?ml$/,
  /^scripts\/ci\/(?:classify-changes\.sh|detect-pull-request-validated-push\.mjs|production-smoke\.mjs|reconcile-scheduled-workflow-issue\.mjs|select-e2e-tests\.mjs|select-quality-checks\.mjs)$/,
  /^tests\/scripts\/(?:classify-changes|detect-pull-request-validated-push|production-smoke|reconcile-scheduled-workflow-issue|select-e2e-tests|select-quality-checks)\.test\.ts$/,
  /^tests\/scripts\/github-actions-runtime-policy\.test\.ts$/,
];

const CI_SMOKE_MAPPINGS = [
  {
    patterns: [
      /^\.github\/(?:actions\/.+\/action|workflows\/.+)\.ya?ml$/,
      /^tests\/scripts\/github-actions-runtime-policy\.test\.ts$/,
    ],
    tests: ["tests/scripts/github-actions-runtime-policy.test.ts"],
  },
  {
    patterns: [
      /^scripts\/ci\/select-quality-checks\.mjs$/,
      /^tests\/scripts\/select-quality-checks\.test\.ts$/,
    ],
    tests: ["tests/scripts/select-quality-checks.test.ts"],
  },
  {
    patterns: [
      /^\.github\/workflows\/e2e\.yml$/,
      /^scripts\/ci\/select-e2e-tests\.mjs$/,
      /^tests\/scripts\/select-e2e-tests\.test\.ts$/,
    ],
    tests: ["tests/scripts/select-e2e-tests.test.ts"],
  },
  {
    patterns: [
      /^scripts\/ci\/classify-changes\.sh$/,
      /^tests\/scripts\/classify-changes\.test\.ts$/,
    ],
    tests: [
      "tests/scripts/classify-changes.test.ts",
      "tests/scripts/select-e2e-tests.test.ts",
      "tests/scripts/select-quality-checks.test.ts",
    ],
  },
  {
    patterns: [/^\.github\/workflows\/ci\.yml$/],
    tests: [
      "tests/scripts/classify-changes.test.ts",
      "tests/scripts/detect-pull-request-validated-push.test.ts",
      "tests/scripts/select-quality-checks.test.ts",
    ],
  },
  {
    patterns: [
      /^scripts\/ci\/detect-pull-request-validated-push\.mjs$/,
      /^tests\/scripts\/detect-pull-request-validated-push\.test\.ts$/,
    ],
    tests: ["tests/scripts/detect-pull-request-validated-push.test.ts"],
  },
  {
    patterns: [
      /^\.github\/workflows\/production-smoke\.yml$/,
      /^scripts\/ci\/production-smoke\.mjs$/,
      /^tests\/scripts\/production-smoke\.test\.ts$/,
    ],
    tests: ["tests/scripts/production-smoke.test.ts"],
  },
  {
    patterns: [
      /^\.github\/workflows\/scheduled-failure-alerts\.yml$/,
      /^scripts\/ci\/reconcile-scheduled-workflow-issue\.mjs$/,
      /^tests\/scripts\/reconcile-scheduled-workflow-issue\.test\.ts$/,
    ],
    tests: ["tests/scripts/reconcile-scheduled-workflow-issue.test.ts"],
  },
];

function matchesAny(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

function normalizeFiles(changedFiles) {
  const files = Array.isArray(changedFiles)
    ? changedFiles
    : String(changedFiles).split(/\r?\n/);

  return files
    .map((file) => file.trim().replaceAll("\\", "/"))
    .filter(Boolean);
}

export function selectQualityChecks(changedFiles) {
  const files = normalizeFiles(changedFiles);
  const quality = files.some((file) => matchesAny(file, QUALITY_PATTERNS));
  const fullTests = files.some((file) => matchesAny(file, FULL_TEST_PATTERNS));
  const fullLint = files.some((file) => matchesAny(file, FULL_LINT_PATTERNS));
  const smokeTests = new Set();

  for (const file of files) {
    for (const mapping of CI_SMOKE_MAPPINGS) {
      if (matchesAny(file, mapping.patterns)) {
        for (const test of mapping.tests) smokeTests.add(test);
      }
    }
  }

  const changedTests = quality
    && !fullTests
    && files.some((file) => !matchesAny(file, CI_ONLY_PATTERNS));

  const selection = {
    quality,
    fullTests,
    fullLint,
    changedTests,
    smokeTests: [...smokeTests].sort(),
  };

  return { ...selection, label: qualitySelectionLabel(selection) };
}

export function qualitySelectionLabel(selection) {
  if (!selection.quality) return "not needed";
  if (selection.fullTests || selection.fullLint) return "full suite";
  if (selection.changedTests && selection.smokeTests.length > 0) {
    return "changed code + CI smoke";
  }
  if (selection.changedTests) return "changed code";
  if (selection.smokeTests.length > 0) return "CI smoke";
  return "changed files";
}

export function formatGitHubOutputs(selection) {
  return [
    `quality=${selection.quality}`,
    `full_tests=${selection.fullTests}`,
    `full_lint=${selection.fullLint}`,
    `changed_tests=${selection.changedTests}`,
    `quality_smoke_tests=${selection.smokeTests.join(",")}`,
    `quality_label=${selection.label}`,
  ].join("\n");
}

async function main() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(`${formatGitHubOutputs(selectQualityChecks(input))}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
