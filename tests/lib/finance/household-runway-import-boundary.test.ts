import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const sourceRoots = ["app", "components", "lib"];
const supportedOrInternalFiles = new Set([
  "lib/finance/household-runway-browser-adapter.ts",
  "lib/finance/household-runway-interview-runtime.ts",
  "lib/finance/household-runway-react-adapter.ts",
  "lib/finance/household-runway-runtime-environment.ts",
  "lib/finance/runway-draft-client.ts",
]);

describe("Household Runway Runtime import boundary", () => {
  it("retires the legacy public protocol modules", () => {
    expect(
      existsSync(resolve(root, "lib/finance/household-runway-interview.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(root, "lib/finance/household-runway-draft-codec.ts")),
    ).toBe(false);
    expect(
      existsSync(resolve(root, "lib/finance/internal/household-runway-interview.ts")),
    ).toBe(true);
    expect(
      existsSync(resolve(root, "lib/finance/internal/household-runway-draft-codec.ts")),
    ).toBe(true);
  });

  it("keeps production callers on the Runtime or supported adapters", () => {
    const legacyImport = /@\/lib\/finance\/household-runway-(?:interview|draft-codec)"/;
    const violations: string[] = [];

    for (const directory of sourceRoots) {
      const files = walk(resolve(root, directory));
      for (const file of files) {
        const relative = file.slice(root.length + 1).replaceAll("\\", "/");
        if (supportedOrInternalFiles.has(relative)) continue;
        if (legacyImport.test(readFileSync(file, "utf8"))) violations.push(relative);
      }
    }

    expect(violations).toEqual([]);
  });
});

function walk(directory: string): string[] {
  const entries = readdirSync(directory, { withFileTypes: true }) as Array<{
    name: string;
    isDirectory: () => boolean;
  }>;
  return entries.flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
