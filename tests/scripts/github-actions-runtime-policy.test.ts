import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflowDirectory = resolve(".github/workflows");
const actionDirectory = resolve(".github/actions");
const dependabotConfig = readFileSync(resolve(".github/dependabot.yml"), "utf8")
  .replaceAll("\r\n", "\n")
  .trim();

function yamlFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return yamlFiles(path);
    return /\.ya?ml$/.test(entry.name) ? [path] : [];
  });
}

function automationFile(path: string) {
  return {
    name: relative(resolve(".github"), path).replaceAll("\\", "/"),
    contents: readFileSync(path, "utf8"),
  };
}

const workflowFiles = yamlFiles(workflowDirectory).map(automationFile);
const automationFiles = [
  ...workflowFiles,
  ...yamlFiles(actionDirectory).map(automationFile),
];

const approvedActionMajors = new Map([
  ["actions/cache", "v6"],
  ["actions/checkout", "v7"],
  ["actions/github-script", "v9"],
  ["actions/setup-node", "v7"],
  ["actions/upload-artifact", "v7"],
  ["pnpm/action-setup", "v6"],
  ["supabase/setup-cli", "v3"],
  ["treosh/lighthouse-ci-action", "v12"],
]);

function externalActionReferences() {
  const pattern = /uses:\s*([\w.-]+\/[\w.-]+)@([^\s#]+)(?:\s*#\s*(\S+))?/g;
  return automationFiles.flatMap(({ name, contents }) =>
    [...contents.matchAll(pattern)].map((match) => ({
      workflow: name,
      action: match[1],
      reference: match[2],
      versionComment: match[3],
    }))
  );
}

describe("GitHub Actions runtime policy", () => {
  it("publishes one unambiguous CI Gate and E2E Gate for pull requests and default-branch pushes", () => {
    const gateNames = workflowFiles.flatMap(({ contents }) =>
      [...contents.matchAll(/^\s+name:\s+(CI Gate|E2E Gate|PR Gate)\s*$/gm)]
        .map((match) => match[1])
    );

    const requiredGateWorkflows = ["ci.yml", "e2e.yml"].map((name) =>
      readFileSync(resolve(workflowDirectory, name), "utf8")
        .replaceAll("\r\n", "\n")
    );

    expect(gateNames).toEqual(["CI Gate", "E2E Gate"]);
    for (const workflow of requiredGateWorkflows) {
      expect(workflow).toMatch(/on:\n(?:[\s\S]*?\n)?  push:\n    branches: \[main\]/);
      expect(workflow).toContain(
        "if: always() && (github.event_name == 'pull_request' || github.event_name == 'push')",
      );
    }
  });

  it("groups GitHub Actions updates into one monthly pull request", () => {
    expect(dependabotConfig).toBe(`version: 2

updates:
  - package-ecosystem: "github-actions"
    directories:
      - "/"
      - "/.github/actions/setup-node-pnpm"
    schedule:
      interval: "monthly"
    groups:
      github-actions:
        patterns:
          - "*"
        update-types:
          - "minor"
          - "patch"
    ignore:
      - dependency-name: "*"
        update-types:
          - "version-update:semver-major"`);
  });

  it("pins every approved external action to an immutable commit on an approved major", () => {
    const references = externalActionReferences();

    expect(new Set(references.map(({ action }) => action))).toEqual(
      new Set(approvedActionMajors.keys()),
    );
    expect(
      references.filter(({ action, reference, versionComment }) => {
        const approvedMajor = approvedActionMajors.get(action);
        return !approvedMajor ||
          !/^[0-9a-f]{40}$/i.test(reference) ||
          versionComment !== approvedMajor;
      }),
    ).toEqual([]);
  });

  it("runs project commands on Node.js 24", () => {
    const configuredVersions = automationFiles.flatMap(({ contents }) =>
      [...contents.matchAll(/node-version:\s*['"]?(\d+)/g)]
        .map((match) => match[1])
    );

    expect(configuredVersions).not.toHaveLength(0);
    expect(new Set(configuredVersions)).toEqual(new Set(["24"]));
  });

  it("keeps the anonymous Household Runway E2E project independent of auth setup", () => {
    const workflow = readFileSync(
      resolve(workflowDirectory, "e2e.yml"),
      "utf8",
    ).replaceAll("\r\n", "\n");

    expect(workflow).toContain(
      "pnpm exec playwright test e2e/financial-cushion.spec.ts --project=runway-public-desktop --no-deps",
    );
    expect(workflow).toContain(
      "# Household Runway has a dedicated anonymous project. Do not pull",
    );
  });

  it("keeps github-script v9 blocks compatible with its injected context", () => {
    const incompatiblePatterns = automationFiles.flatMap(({ name, contents }) =>
      [
        /require\(\s*['"]@actions\/github['"]\s*\)/g,
        /\b(?:const|let)\s+getOctokit\b/g,
      ].flatMap((pattern) =>
        [...contents.matchAll(pattern)].map((match) => ({
          workflow: name,
          declaration: match[0],
        }))
      )
    );

    expect(incompatiblePatterns).toEqual([]);
  });

  it("keeps controlled production deployment gated and dormant during rollout", () => {
    const workflow = readFileSync(
      resolve(workflowDirectory, "vercel-production-deploy.yml"),
      "utf8",
    ).replaceAll("\r\n", "\n");

    expect(workflow).toContain("workflows: [Database Migration]");
    expect(workflow).toContain("github.event.workflow_run.event == 'workflow_run'");
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(workflow).toContain("vars.VERCEL_CI_DEPLOY_ENABLED == 'true'");
    expect(workflow).toContain("checks: write");
    expect(workflow).toContain("secrets.VERCEL_TOKEN");
    expect(workflow).toContain("vars.VERCEL_ORG_ID");
    expect(workflow).toContain("vars.VERCEL_PROJECT_ID");
    expect(workflow).toContain("Deploy through Vercel remote build");
    expect(workflow).not.toContain("--prebuilt");
    expect(workflow).toContain("Could not classify deployment paths; deploying after prerequisites");
    expect(workflow).toContain("node scripts/ci/production-smoke.mjs --probe");
    expect(workflow).toContain("allow_fork_preview");
    expect(workflow).toContain("name: 'Vercel Preview'");
    expect(workflow).toContain("checked_out_sha=\"$(git rev-parse HEAD)\"");
    expect(workflow).toContain("inputs.commit_sha || github.event.workflow_run.head_sha || github.sha");
    expect(workflow).toContain(
      "group: vercel-${{ inputs.target || 'production' }}-${{ (inputs.target || 'production') == 'preview' && (inputs.commit_sha || github.event.workflow_run.head_sha || github.sha) || 'shared' }}",
    );
    expect(workflow).toContain(
      "summary: `The exact commit ${process.env.DEPLOY_SHA} was used for the preview deployment.`,",
    );
    expect(workflow).toContain(
      "if: github.event_name == 'workflow_dispatch' && inputs.target == 'production'",
    );

    const migrationWorkflow = readFileSync(
      resolve(workflowDirectory, "db-migrate.yml"),
      "utf8",
    ).replaceAll("\r\n", "\n");
    expect(migrationWorkflow).toContain("workflows: [CI]");
    expect(migrationWorkflow).toContain("github.event.workflow_run.event == 'push'");
    expect(migrationWorkflow).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(migrationWorkflow).toContain("No migration changes; completing the prerequisite");

    const ciWorkflow = readFileSync(
      resolve(workflowDirectory, "ci.yml"),
      "utf8",
    ).replaceAll("\r\n", "\n");
    expect(ciWorkflow).toContain("name: deployment-policy");
    expect(ciWorkflow).toContain(
      "node --test scripts/ci/production-deployment-policy.policy.mjs",
    );
    expect(ciWorkflow).toContain("preview-policy:");
    expect(ciWorkflow).toContain("Vercel preview policy");

    const legacySmokeWorkflow = readFileSync(
      resolve(workflowDirectory, "production-smoke.yml"),
      "utf8",
    );
    expect(legacySmokeWorkflow).toContain(
      "if: vars.VERCEL_CI_DEPLOY_ENABLED != 'true'",
    );
  });

  it("creates Vercel previews only through explicit manual dispatch", () => {
    const workflow = readFileSync(
      resolve(workflowDirectory, "vercel-production-deploy.yml"),
      "utf8",
    ).replaceAll("\r\n", "\n");

    expect(workflow).toMatch(/on:\n  workflow_run:/);
    expect(workflow).toMatch(/\n  workflow_dispatch:/);
    expect(workflow).not.toMatch(/\n  (?:push|pull_request):/);
    expect(workflow).toContain("- preview");
    expect(workflow).toContain("- production");
    expect(workflow).toContain("secrets.VERCEL_TOKEN");
    expect(workflow).toContain("vars.VERCEL_ORG_ID");
    expect(workflow).toContain("vars.VERCEL_PROJECT_ID");
    expect(workflow).toContain("Force explicit manual deployment");
  });

  it("uses the shared dependency setup action in every JavaScript job", () => {
    const sharedSetupPattern =
      /uses:\s*\.\/\.github\/actions\/setup-node-pnpm(?:\s|$)/g;
    const directSetupPattern =
      /(?:uses:\s*(?:pnpm\/action-setup|actions\/setup-node)@[^\s#]+|run:\s*pnpm install --frozen-lockfile)/g;

    const sharedConsumers = workflowFiles.flatMap(({ name, contents }) =>
      [...contents.matchAll(sharedSetupPattern)].map(() => name)
    );
    const directSetup = workflowFiles.flatMap(({ name, contents }) =>
      [...contents.matchAll(directSetupPattern)].map((match) => ({
        workflow: name,
        declaration: match[0],
      }))
    );

    expect({ sharedConsumers, directSetup }).toEqual({
      sharedConsumers: [
        "workflows/ci.yml",
        "workflows/ci.yml",
        "workflows/ci.yml",
        "workflows/cross-browser-smoke.yml",
        "workflows/e2e.yml",
        "workflows/mutation-testing.yml",
        "workflows/mutation-testing.yml",
        "workflows/performance.yml",
        "workflows/update-snapshots.yml",
        "workflows/vercel-production-deploy.yml",
      ],
      directSetup: [],
    });
  });

  it("keeps scheduled mutation runs observable within their runtime budget", () => {
    const mutationWorkflow = workflowFiles.find(
      ({ name }) => name === "workflows/mutation-testing.yml",
    )?.contents;

    expect(mutationWorkflow).toBeDefined();
    expect(mutationWorkflow).toMatch(
      /concurrency:[\s\S]*?group: mutation-testing-\$\{\{ github\.event_name \}\}-\$\{\{ github\.ref \}\}[\s\S]*?cancel-in-progress: false/,
    );
    expect(mutationWorkflow).toMatch(
      /mutation-full:[\s\S]*?timeout-minutes: 60[\s\S]*?id: full-mutation[\s\S]*?timeout-minutes: 52[\s\S]*?timeout --signal=TERM --kill-after=30s 50m pnpm mutation-test[\s\S]*?conclusion="timed_out"[\s\S]*?name: Publish full mutation diagnostic/,
    );
    expect(mutationWorkflow).toContain(
      "run: node scripts/ci/scheduled-workflow-diagnostic.mjs",
    );
  });
});
