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

const supportedActionMajors = new Map([
  ["actions/cache", "v6"],
  ["actions/checkout", "v7"],
  ["actions/setup-node", "v7"],
  ["actions/upload-artifact", "v7"],
  ["pnpm/action-setup", "v6"],
  ["supabase/setup-cli", "v3"],
]);

function actionReferences(action: string) {
  const pattern = new RegExp(
    `uses:\\s*${action.replace("/", "\\/")}@([^\\s#]+)`,
    "g",
  );

  return automationFiles.flatMap(({ name, contents }) =>
    [...contents.matchAll(pattern)].map((match) => ({
      workflow: name,
      reference: match[1],
    }))
  );
}

describe("GitHub Actions runtime policy", () => {
  it.each([...supportedActionMajors])(
    "uses %s at supported major %s",
    (action, supportedMajor) => {
      const references = actionReferences(action);
      expect(references, `${action} must remain covered by this policy`)
        .not.toHaveLength(0);
      expect(
        references.filter(({ reference }) => reference !== supportedMajor),
      ).toEqual([]);
    },
  );

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
