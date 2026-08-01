import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const lifecycleBoundarySources = [
  "app/api/tasks/route.ts",
  "app/api/tasks/[id]/route.ts",
  "app/api/tasks/[id]/toggle/route.ts",
  "app/api/recurring-tasks/route.ts",
  "app/api/recurring-tasks/[id]/route.ts",
  "app/api/cron/prewarm-recurring-tasks/route.ts",
  "app/api/sidebar/counts/route.ts",
  "app/api/calendar/feed/route.ts",
  "lib/ai/tools/tasks.ts",
  "lib/recurring-tasks/creation.ts",
  "lib/recurring-tasks/supabase-occurrence-adapter.ts",
  "lib/recurring-tasks/supabase-series-state-adapter.ts",
  "lib/recurring-tasks/activation.ts",
  "lib/dashboard/dashboard-snapshot.ts",
  "lib/dashboard/supabase-dashboard-snapshot.ts",
  "lib/db/tasks.ts",
  "lib/recurring-tasks/coverage.ts",
];

describe("recurring lifecycle import boundary", () => {
  it("keeps date-bounded delivery and read modules off legacy writes and materialization", () => {
    for (const relativePath of lifecycleBoundarySources) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      expect(source, relativePath).not.toMatch(/ensureRecurringInstances|instance-generator/);
      expect(source, relativePath).not.toMatch(
        /(?:create|update|pause|resume|archive|delete)RecurringTask\s*\(/,
      );
      expect(source, relativePath).not.toMatch(/updateInstanceWithScope\s*\(/);
      expect(source, relativePath).not.toMatch(/\.from\(\s*["']recurring_tasks["']\s*\)/);
    }
  });

  it("does not allow a production caller to select the legacy RecurringTasksDB default", () => {
    for (const relativePath of lifecycleBoundarySources) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");
      expect(source, relativePath).not.toMatch(
        /new RecurringTasksDB\(\s*(?:supabase|ctx\.supabase)\s*\)/,
      );
    }
  });
});
