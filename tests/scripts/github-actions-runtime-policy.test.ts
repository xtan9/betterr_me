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
  it("publishes one unambiguous CI Gate and E2E Gate for pull requests", () => {
    const gateNames = workflowFiles.flatMap(({ contents }) =>
      [...contents.matchAll(/^\s+name:\s+(CI Gate|E2E Gate|PR Gate)\s*$/gm)]
        .map((match) => match[1])
    );

    expect(gateNames).toEqual(["CI Gate", "E2E Gate"]);
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
        "workflows/e2e.yml",
        "workflows/mutation-testing.yml",
        "workflows/mutation-testing.yml",
        "workflows/performance.yml",
        "workflows/update-snapshots.yml",
      ],
      directSetup: [],
    });
  });
});
