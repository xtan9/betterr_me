import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  classifyChanges,
  formatGitHubOutputs,
} from "../../scripts/ci/classify-changes.mjs";

const require = createRequire(import.meta.url);

function repositoryFile(path: string): string {
  return readFileSync(resolve(path), "utf8").replaceAll("\r\n", "\n");
}

function githubOutputsFor(path: string) {
  return Object.fromEntries(
    formatGitHubOutputs(classifyChanges([{ status: "M", path }]))
      .split("\n")
      .map((line: string) => line.split("=", 2)),
  );
}

function section(markdown: string, heading: string, nextHeading: string) {
  const start = markdown.indexOf(`${heading}\n`);
  const end = nextHeading
    ? markdown.indexOf(`${nextHeading}\n`, start + heading.length)
    : markdown.length;
  if (start < 0 || end < 0) throw new Error(`Missing section ${heading}`);
  return markdown.slice(start + heading.length + 1, end).trim();
}

function normalizedParagraph(markdown: string) {
  return markdown.replaceAll("\n", " ").replaceAll(/\s+/g, " ").trim();
}

describe("advisory quality-signal contracts", () => {
  it("distinguishes baseline production from screenshot comparison", () => {
    const baselineWorkflow = repositoryFile(
      ".github/workflows/update-snapshots.yml",
    );
    const topLevelName = baselineWorkflow.match(/^name: (.+)$/m)?.[1];
    const baselineJobName = baselineWorkflow.match(
      /^  update-snapshots:\n    name: (.+)$/m,
    )?.[1];
    const outputs = githubOutputsFor("e2e/visual-regression.spec.ts");

    expect({ topLevelName, baselineJobName }).toEqual({
      topLevelName: "Produce Visual Comparison Baselines",
      baselineJobName: "Produce screenshot baselines",
    });
    expect({
      e2eLabel: outputs.e2e_label,
      e2eVisual: outputs.e2e_visual,
    }).toEqual({
      e2eLabel: "screenshot comparison",
      e2eVisual: "true",
    });
  });

  it("documents exact automated accessibility surfaces and journeys", () => {
    const contract = repositoryFile("docs/quality-signals.md");
    const headings = [...contract.matchAll(/^(#{2,3}) (.+)$/gm)]
      .map((match) => `${match[1]} ${match[2]}`);
    const accessibility = section(
      contract,
      "## Automated accessibility checks",
      "## Performance measurements (advisory)",
    );
    const journeys = [...accessibility.matchAll(/^- `([^`]+)`:/gm)]
      .map((match) => match[1]);
    const journeySection = section(
      accessibility,
      "### Exercised pages and journeys",
      "### Manual-review gaps",
    );
    const journeyFacts = [...journeySection.matchAll(
      /(?:^|\n)(- `[^\n]+[\s\S]*?)(?=\n- `|\n\n|$)/g,
    )].map((match) => normalizedParagraph(match[1]));
    const automatedSurfaces = [...section(
      accessibility,
      "### Automated rules and assertions",
      "### Exercised pages and journeys",
    ).matchAll(/^- (.+)$/gm)].map((match) => match[1]);

    expect(headings).toEqual([
      "## Visual checks",
      "### Screenshot comparison",
      "### Screenshot baseline production",
      "### Human visual review",
      "## Automated accessibility checks",
      "### Automated rules and assertions",
      "### Exercised pages and journeys",
      "### Manual-review gaps",
      "## Performance measurements (advisory)",
      "### Budgets",
      "### Variance policy",
      "### Ownership",
      "## Targeted verification",
    ]);
    expect(automatedSurfaces).toEqual([
      "Component tests that call `vitest-axe` run the axe-core 4.11 rules applicable",
      "`e2e/accessibility.spec.ts` uses explicit Playwright assertions for keyboard",
      "Lighthouse collects its accessibility category for the URLs listed below and",
    ]);
    expect(journeys).toEqual([
      "/auth/login",
      "/dashboard",
      "/habits",
      "/habits/new",
    ]);
    expect(journeyFacts).toEqual([
      "- `/auth/login`: the custom text-contrast heuristic in an unauthenticated browser context.",
      "- `/dashboard`: keyboard movement, visible focus, Space activation of a seeded habit checkbox, heading hierarchy, image alt attributes, common interactive roles, the main landmark, mobile touch-target sampling, and a conditional Escape-dismissal probe when a generic closed trigger opens a visible dialog.",
      "- `/habits`: keyboard movement through the habits page.",
      "- `/habits/new`: keyboard movement through the create-habit form, label checks, and the 16px minimum input-font assertion at a mobile viewport.",
    ]);
    expect(normalizedParagraph(section(
      accessibility,
      "### Manual-review gaps",
      "",
    ))).toBe(
      "Automation does not establish screen-reader announcement quality, usable accessible names for every state, logical reading and focus order through each complete journey, keyboard support outside the journeys above, 200%/400% zoom and reflow, forced-colors or other assistive display modes, native mobile screen-reader behavior, cognitive clarity, or contrast in backgrounds and states skipped by the custom heuristic. Those gaps require deliberate manual review when a change affects them.",
    );
  });

  it("keeps documented accessibility interactions on their exercised pages", () => {
    const spec = repositoryFile("e2e/accessibility.spec.ts");
    const spaceCase = section(
      spec,
      "  test('should activate checkboxes with Space key', async ({ page }) => {",
      "  test('should close dialogs with Escape key', async ({ page }) => {",
    );
    const escapeCase = section(
      spec,
      "  test('should close dialogs with Escape key', async ({ page }) => {",
      "});\n\ntest.describe('Accessibility - Semantic HTML', () => {",
    );

    expect({
      spaceUsesDashboard: /new DashboardPage\(page\)[\s\S]*dashboard\.goto\(\)/.test(spaceCase),
      escapeUsesDashboard: /new DashboardPage\(page\)[\s\S]*dashboard\.goto\(\)/.test(escapeCase),
      escapeIsConditional: /if \(triggerCount > 0[\s\S]*if \(dialogVisible\)/.test(escapeCase),
    }).toEqual({
      spaceUsesDashboard: true,
      escapeUsesDashboard: true,
      escapeIsConditional: true,
    });
  });

  it("keeps documented performance budgets aligned with configuration", () => {
    const contract = repositoryFile("docs/quality-signals.md");
    const performance = section(
      contract,
      "## Performance measurements (advisory)",
      "## Targeted verification",
    );
    const budgetRows = [...section(
      performance,
      "### Budgets",
      "### Variance policy",
    ).matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)]
      .slice(2)
      .map((match) => match.slice(1));
    const lighthouse = require("../../lighthouserc.js");
    const bundleAnalyzer = repositoryFile("scripts/analyze-bundle.ts");
    const bundleThresholds = {
      totalGzipKiB: bundleAnalyzer.match(
        /if \(totalGzip > (\d+) \* 1024\)/,
      )?.[1],
      perChunkGzipKiB: bundleAnalyzer.match(
        /bundle\.gzipSize > (\d+) \* 1024/,
      )?.[1],
    };

    expect(budgetRows).toEqual([
      ["Performance score", "at least 0.90", "warning"],
      ["Accessibility score", "at least 0.90", "warning"],
      ["Best-practices score", "at least 0.90", "warning"],
      ["First Contentful Paint", "at most 1,800 ms", "error"],
      ["Largest Contentful Paint", "at most 2,500 ms", "warning"],
      ["Time to Interactive", "at most 3,800 ms", "warning"],
      ["Cumulative Layout Shift", "at most 0.10", "error"],
      ["Total Blocking Time", "at most 200 ms", "warning"],
    ]);
    expect(lighthouse.ci.assert.assertions).toEqual({
      "categories:performance": ["warn", { minScore: 0.9 }],
      "categories:accessibility": ["warn", { minScore: 0.9 }],
      "categories:best-practices": ["warn", { minScore: 0.9 }],
      "first-contentful-paint": ["error", { maxNumericValue: 1800 }],
      "largest-contentful-paint": ["warn", { maxNumericValue: 2500 }],
      interactive: ["warn", { maxNumericValue: 3800 }],
      "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
      "total-blocking-time": ["warn", { maxNumericValue: 200 }],
    });
    expect(bundleThresholds).toEqual({
      totalGzipKiB: "1500",
      perChunkGzipKiB: "130",
    });
  });

  it("documents the exact variance and ownership policy", () => {
    const contract = repositoryFile("docs/quality-signals.md");
    const performance = section(
      contract,
      "## Performance measurements (advisory)",
      "## Targeted verification",
    );
    const workflow = repositoryFile(".github/workflows/performance.yml");

    expect(normalizedParagraph(section(
      performance,
      "### Variance policy",
      "### Ownership",
    ))).toBe(
      "Pull requests collect one Lighthouse sample for `/` only. There is no repository-level retry, outlier rejection, or variance allowance for that single sample. Scheduled and manually dispatched runs collect three samples for `/`, `/auth/login`, `/dashboard`, `/habits`, and `/dashboard/settings`; the repository does not add its own statistical rule beyond Lighthouse CI's handling of those samples. A noisy warning should be compared with repeat runs before a budget is changed. Error budgets are not automatically relaxed for variance. The bundle measurement performs one production build and one gzip calculation. It has no variance allowance or retry.",
    );
    expect(normalizedParagraph(section(
      performance,
      "### Ownership",
      "",
    ))).toBe(
      "The pull-request author owns investigation of a new warning or failure caused by the change. Repository maintainers own the budget values, URL scope, run counts, and any decision to accept or revise a budget. Budget changes should be reviewed as policy changes, not used to hide an unexplained regression.",
    );
    expect({
      numberOfRuns: workflow.match(/LHCI_NUMBER_OF_RUNS: (.+)$/m)?.[1],
      smokeOnly: workflow.match(/LHCI_SMOKE_ONLY: (.+)$/m)?.[1],
    }).toEqual({
      numberOfRuns: "${{ github.event_name == 'pull_request' && '1' || '3' }}",
      smokeOnly: "${{ github.event_name == 'pull_request' && 'true' || 'false' }}",
    });
  });

  it("uses consistent advisory status names and preserves required gate names", () => {
    const performanceWorkflow = repositoryFile(
      ".github/workflows/performance.yml",
    );
    const alertsWorkflow = repositoryFile(
      ".github/workflows/scheduled-failure-alerts.yml",
    );
    const workflowFiles = readdirSync(resolve(".github/workflows"))
      .filter((path) => /\.ya?ml$/.test(path))
      .map((path) => repositoryFile(`.github/workflows/${path}`));
    const gateNames = workflowFiles.flatMap((contents) =>
      [...contents.matchAll(/^\s+name:\s+(.+ Gate)$/gm)]
        .map((match) => match[1]),
    );

    expect({
      workflow: performanceWorkflow.match(/^name: (.+)$/m)?.[1],
      status: performanceWorkflow.match(
        /^  lighthouse:\n    name: (.+)$/m,
      )?.[1],
    }).toEqual({
      workflow: "Performance Measurements (Advisory)",
      status: "Bundle and Lighthouse budgets (advisory)",
    });
    const monitoredWorkflowBlock = alertsWorkflow.match(
      /    workflows:\n([\s\S]*?)    types:/,
    )?.[1] ?? "";
    expect([...monitoredWorkflowBlock.matchAll(/^      - (.+)$/gm)]
      .map((match) => match[1])).toEqual([
      "CI",
      "Cross-Browser Smoke",
      "E2E Tests",
      "Performance Measurements (Advisory)",
      "Mutation Testing",
      "Dispatch Reminders",
    ]);
    expect(gateNames).toEqual(["CI Gate", "E2E Gate"]);
  });
});
