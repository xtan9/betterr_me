import { pathToFileURL } from "node:url";

const SPECS = {
  accessibility: "e2e/accessibility.spec.ts",
  completeHabit: "e2e/complete-habit.spec.ts",
  createHabit: "e2e/create-habit.spec.ts",
  crossBrowser: "e2e/cross-browser.spec.ts",
  dashboard: "e2e/dashboard.spec.ts",
  locale: "e2e/locale-verification.spec.ts",
  responsive: "e2e/responsive.spec.ts",
  taskDetail: "e2e/task-detail.spec.ts",
  tasksList: "e2e/tasks-list.spec.ts",
};

const CHROMIUM_SPEC_PATHS = new Set(Object.values(SPECS));
const DIRECT_CHROMIUM_SPEC = /^e2e\/[A-Za-z0-9][A-Za-z0-9._/-]*\.spec\.ts$/;

const SPEC_LABEL_GROUPS = [
  ["habits", [SPECS.completeHabit, SPECS.createHabit]],
  ["tasks", [SPECS.taskDetail, SPECS.tasksList]],
  ["dashboard", [SPECS.dashboard]],
  ["locale", [SPECS.locale]],
  ["layout", [SPECS.accessibility, SPECS.crossBrowser, SPECS.responsive]],
];

const FULL_SUITE_PATTERNS = [
  /^\.github\/actions\//,
  /^(?:package\.json|pnpm-lock\.yaml|next\.config\.ts|playwright\.config\.ts|proxy\.ts|tailwind\.config\.ts|postcss\.config\.mjs)$/,
  /^e2e\/(?:auth\.setup|constants|global-setup|global-teardown)\.ts$/,
  /^e2e\/(?:helpers|pages)\//,
  /^supabase\//,
  /^app\/auth\//,
  /^app\/(?:globals\.css|layout\.tsx|page\.tsx)$/,
  /^components\/(?:auth|layouts|providers|shared|ui)\//,
  /^components\/(?:auth-branding|auth-button|env-var-warning|forgot-password-form|login-form|logout-button|navbar|profile-avatar(?:-client)?|sign-up-form|theme-switcher|timezone-detector|update-password-form)\.tsx$/,
  /^lib\/(?:auth|supabase)\//,
  /^lib\/db\/(?:ensure-profile|index|types)\.ts$/,
  /^lib\/(?:constants(?:\/.*|\.ts)|fetcher|logger|utils)\.ts$/,
  /^lib\/types\/database\.ts$/,
];

const FEATURE_MAPPINGS = [
  {
    patterns: [
      /^\.github\/workflows\/e2e\.yml$/,
      /^scripts\/ci\/(?:classify-changes\.sh|select-e2e-tests\.mjs)$/,
    ],
    specs: [SPECS.dashboard],
  },
  {
    patterns: [
      /^app\/(?:api\/habits|habits)\//,
      /^components\/habits\//,
      /^lib\/habits\//,
      /^lib\/db\/habit[^/]*\.ts$/,
      /^lib\/hooks\/use-habit[^/]*\.ts$/,
      /^lib\/validations\/habit\.ts$/,
    ],
    specs: [SPECS.completeHabit, SPECS.createHabit, SPECS.dashboard],
  },
  {
    patterns: [
      /^app\/(?:api\/(?:projects|recurring-tasks|tasks)|projects|tasks)\//,
      /^components\/(?:kanban|projects|tasks)\//,
      /^lib\/(?:projects|recurring-tasks|tasks)\//,
      /^lib\/db\/(?:projects|recurring-tasks|tasks)\.ts$/,
      /^lib\/hooks\/use-(?:projects|tasks-realtime)\.ts$/,
      /^lib\/validations\/(?:project|recurring-task|task)\.ts$/,
    ],
    specs: [SPECS.dashboard, SPECS.taskDetail, SPECS.tasksList],
  },
  {
    patterns: [
      /^app\/(?:api\/dashboard|dashboard)\//,
      /^components\/dashboard\//,
      /^lib\/dashboard\//,
      /^lib\/hooks\/use-dashboard\.ts$/,
    ],
    specs: [SPECS.dashboard],
  },
  {
    patterns: [
      /^i18n\/(?!household-runway-messages\.ts$)/,
      /^components\/language-switcher\.tsx$/,
    ],
    specs: [SPECS.locale],
  },
  {
    patterns: [
      /^hooks\/use-mobile\.ts$/,
      /^lib\/sidebar-styles\.ts$/,
    ],
    specs: [SPECS.accessibility, SPECS.crossBrowser, SPECS.responsive],
  },
];

const FINANCE_PATTERNS = [
  /^app\/(?:api\/finance|finance)\//,
  /^components\/finance\//,
  /^lib\/finance\//,
  /^lib\/validations\/finance-cushion\.ts$/,
  /^i18n\/household-runway-messages\.ts$/,
  /^e2e\/financial-cushion\.spec\.ts$/,
];

const VISUAL_PATTERNS = [
  /^e2e\/visual-regression\.spec\.ts$/,
  /^e2e\/visual-regression\.spec\.ts-snapshots\//,
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

export function selectE2ETests(changedFiles) {
  const files = normalizeFiles(changedFiles);
  const specs = new Set();
  let full = false;
  let runway = false;
  let visual = false;

  for (const file of files) {
    if (matchesAny(file, FULL_SUITE_PATTERNS)) full = true;
    if (matchesAny(file, FINANCE_PATTERNS)) runway = true;
    if (matchesAny(file, VISUAL_PATTERNS)) visual = true;

    if (
      (CHROMIUM_SPEC_PATHS.has(file) || DIRECT_CHROMIUM_SPEC.test(file))
      && !matchesAny(file, [...FINANCE_PATTERNS, ...VISUAL_PATTERNS])
    ) {
      specs.add(file);
    }

    for (const mapping of FEATURE_MAPPINGS) {
      if (matchesAny(file, mapping.patterns)) {
        for (const spec of mapping.specs) specs.add(spec);
      }
    }
  }

  const chromiumSpecs = [...specs].sort();
  const selection = {
    e2e: full || runway || visual || chromiumSpecs.length > 0,
    full,
    chromiumSpecs,
    runway,
    visual,
    supabase: full || visual || chromiumSpecs.length > 0,
  };

  return { ...selection, label: e2eSelectionLabel(selection) };
}

export function e2eSelectionLabel(selection) {
  if (!selection.e2e) return "not needed";

  const labels = [];
  if (selection.full) {
    labels.push("full Chromium");
  } else {
    const selectedSpecs = new Set(selection.chromiumSpecs);
    const groupedSpecs = new Set();

    for (const [label, specs] of SPEC_LABEL_GROUPS) {
      if (specs.some((spec) => selectedSpecs.has(spec))) labels.push(label);
      for (const spec of specs) groupedSpecs.add(spec);
    }

    for (const spec of selection.chromiumSpecs) {
      if (!groupedSpecs.has(spec)) {
        labels.push(
          spec.split("/").at(-1).replace(/\.spec\.ts$/, "").replaceAll("-", " "),
        );
      }
    }
  }

  if (selection.runway) labels.push("finance");
  if (selection.visual) labels.push("visual regression");
  return labels.join(" + ") || "selected specs";
}

export function formatGitHubOutputs(selection) {
  return [
    `e2e=${selection.e2e}`,
    `e2e_full=${selection.full}`,
    `e2e_specs=${selection.chromiumSpecs.join(",")}`,
    `e2e_runway=${selection.runway}`,
    `e2e_visual=${selection.visual}`,
    `e2e_supabase=${selection.supabase}`,
    `e2e_label=${selection.label}`,
  ].join("\n");
}

async function main() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  process.stdout.write(`${formatGitHubOutputs(selectE2ETests(input))}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
