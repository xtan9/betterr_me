import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const lifecycleBoundarySources = [
  "app/api/tasks/route.ts",
  "app/api/tasks/[id]/route.ts",
  "app/api/tasks/[id]/toggle/route.ts",
  "app/api/recurring-tasks/route.ts",
  "app/api/recurring-tasks/[id]/route.ts",
  "app/api/sidebar/counts/route.ts",
  "lib/ai/tools/tasks.ts",
  "lib/dashboard/dashboard-snapshot.ts",
  "lib/dashboard/supabase-dashboard-snapshot.ts",
  "lib/db/tasks.ts",
  "lib/recurring-tasks/coverage.ts",
];

describe("recurring lifecycle import boundary", () => {
  it("keeps date-bounded delivery and read modules off the legacy generator", () => {
    for (const relativePath of lifecycleBoundarySources) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      expect(source, relativePath).not.toMatch(
        /ensureRecurringInstances|instance-generator/,
      );
    }
  });
});
