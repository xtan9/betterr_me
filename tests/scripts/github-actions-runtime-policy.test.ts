import { readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflowDirectory = resolve(".github/workflows");
const workflowFiles = readdirSync(workflowDirectory)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({
    name: basename(file),
    contents: readFileSync(resolve(workflowDirectory, file), "utf8"),
  }));

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

  return workflowFiles.flatMap(({ name, contents }) =>
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
    const configuredVersions = workflowFiles.flatMap(({ contents }) =>
      [...contents.matchAll(/node-version:\s*['"]?(\d+)/g)]
        .map((match) => match[1])
    );

    expect(configuredVersions).not.toHaveLength(0);
    expect(new Set(configuredVersions)).toEqual(new Set(["24"]));
  });
});
