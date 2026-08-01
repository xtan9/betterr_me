import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function trackedSourceFiles(directory: string): string[] {
  return execFileSync("git", ["ls-files", "-z", "--", directory], {
    encoding: "utf8",
  })
    .split("\0")
    .filter((path) => /\.(?:ts|tsx)$/.test(path));
}

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

describe("Current Profile architecture boundaries", () => {
  it("keeps browser profile transport inside the domain hook adapters", () => {
    const browserSources = trackedSourceFiles("components").concat(
      trackedSourceFiles("app"),
    );

    for (const path of browserSources) {
      if (path.startsWith("app/api/")) continue;
      const contents = source(path);
      expect(contents, path).not.toMatch(
        /\/api\/(?:current-profile|preferences\/|profile-details|user-time-zone)/,
      );
      expect(contents, path).not.toMatch(
        /import\s+type\s+\{[\s\S]*?\bProfile\b[\s\S]*?\}\s+from\s+["']@\/lib\/db\/types["']|import\s+\{[\s\S]*?\bProfile\b[\s\S]*?\}\s+from\s+["']@\/lib\/db\/types["']/,
      );
    }
  });

  it("keeps broad ProfileDB reads in compatibility adapters only", () => {
    const serverSources = trackedSourceFiles("app").concat(
      trackedSourceFiles("lib"),
    );
    const broadReaders = serverSources.filter(
      (path) =>
        !path.startsWith("lib/db/profiles.ts") &&
        path !== "app/api/profile/route.ts" &&
        !path.startsWith("tests/"),
    );

    for (const path of broadReaders) {
      expect(source(path), path).not.toMatch(/\.getProfile\(/);
    }
  });
});
