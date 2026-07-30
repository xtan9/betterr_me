import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflowDirectory = resolve(".github/workflows");
const actionDirectory = resolve(".github/actions");

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

const approvedActionRevisions = new Map([
  [
    "actions/cache",
    { version: "v6", commit: "55cc8345863c7cc4c66a329aec7e433d2d1c52a9" },
  ],
  [
    "actions/checkout",
    { version: "v7", commit: "3d3c42e5aac5ba805825da76410c181273ba90b1" },
  ],
  [
    "actions/github-script",
    { version: "v7", commit: "f28e40c7f34bde8b3046d885e986cb6290c5673b" },
  ],
  [
    "actions/setup-node",
    { version: "v7", commit: "820762786026740c76f36085b0efc47a31fe5020" },
  ],
  [
    "actions/upload-artifact",
    { version: "v7", commit: "043fb46d1a93c77aae656e7c1c64a875d1fc6a0a" },
  ],
  [
    "pnpm/action-setup",
    { version: "v6", commit: "0ebf47130e4866e96fce0953f49152a61190b271" },
  ],
  [
    "supabase/setup-cli",
    { version: "v3", commit: "46f7f98c7f948ad727d22c1e67fab04c223a0520" },
  ],
  [
    "treosh/lighthouse-ci-action",
    { version: "v12", commit: "3e7e23fb74242897f95c0ba9cabad3d0227b9b18" },
  ],
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
  it("pins every external action to an approved immutable commit", () => {
    const references = externalActionReferences();

    expect(new Set(references.map(({ action }) => action))).toEqual(
      new Set(approvedActionRevisions.keys()),
    );
    expect(
      references.filter(({ action, reference, versionComment }) => {
        const approved = approvedActionRevisions.get(action);
        return !approved ||
          reference !== approved.commit ||
          versionComment !== approved.version;
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
