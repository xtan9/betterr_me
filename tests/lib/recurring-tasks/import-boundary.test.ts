import { existsSync, readFileSync } from "node:fs";
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
  "app/api/calendar/overlay-feed/route.ts",
  "lib/calendar/overlay-feed.ts",
  "lib/calendar/supabase-overlay-feed.ts",
  "lib/calendar/display.ts",
  "lib/ai/tools/tasks.ts",
  "lib/recurring-tasks/supabase-occurrence-adapter.ts",
  "lib/recurring-tasks/supabase-series-state-adapter.ts",
  "lib/recurring-tasks/activation.ts",
  "lib/dashboard/dashboard-snapshot.ts",
  "lib/dashboard/supabase-dashboard-snapshot.ts",
  "lib/sidebar/query.ts",
  "lib/sidebar/supabase-query.ts",
  "lib/db/tasks.ts",
  "lib/recurring-tasks/coverage.ts",
];

describe("recurring lifecycle import boundary", () => {
  it("retires the obsolete unified calendar feed without a compatibility alias", () => {
    expect(existsSync(resolve(process.cwd(), "app/api/calendar/feed/route.ts"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "lib/calendar/feed-aggregation.ts"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "lib/calendar/feed-types.ts"))).toBe(false);
  });

  it("retires the best-effort materializer instead of leaving a compatibility entry point", () => {
    expect(
      existsSync(resolve(process.cwd(), "lib/recurring-tasks/instance-generator.ts")),
    ).toBe(false);
    expect(readFileSync(resolve(process.cwd(), "lib/recurring-tasks/index.ts"), "utf8"))
      .not.toContain("instance-generator");
    expect(
      existsSync(resolve(process.cwd(), "lib/db/recurring-tasks.ts")),
    ).toBe(false);
    expect(readFileSync(resolve(process.cwd(), "lib/db/index.ts"), "utf8"))
      .not.toContain("recurring-tasks");
  });

  it("retires the obsolete creation adapter after the capability cutover", () => {
    expect(
      existsSync(resolve(process.cwd(), "lib/recurring-tasks/creation.ts")),
    ).toBe(false);
  });

  it("confines transport translation to the declared compatibility adapter", () => {
    const compatibility = readFileSync(
      resolve(process.cwd(), "lib/recurring-tasks/compatibility.ts"),
      "utf8",
    );
    const http = readFileSync(
      resolve(process.cwd(), "app/api/recurring-tasks/route.ts"),
      "utf8",
    );
    const ai = readFileSync(
      resolve(process.cwd(), "lib/ai/tools/tasks.ts"),
      "utf8",
    );

    expect(compatibility).toContain("toRecurringTaskResponse");
    expect(compatibility).toContain("toCreateSeriesCommand");
    expect(compatibility).toContain("toLifecycleRecurrenceDates");
    expect(compatibility).toContain("start_date");
    expect(compatibility).toContain("version");
    expect(http).toContain("toLifecycleRecurrenceDates");
    expect(ai).toContain("toLifecycleRecurrenceDates");
    expect(http).toContain("createAuthenticatedRecurringTaskCapabilities");
    expect(ai).toContain("createAuthenticatedRecurringTaskCapabilities");
    expect(http).not.toContain("recurring-tasks/creation");
    expect(ai).not.toContain("recurring-tasks/creation");
  });

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

  it("keeps ordinary task queries task-model-only after coverage", () => {
    const taskQueries = readFileSync(
      resolve(process.cwd(), "lib/db/tasks.ts"),
      "utf8",
    );
    const dashboard = readFileSync(
      resolve(process.cwd(), "lib/dashboard/dashboard-snapshot.ts"),
      "utf8",
    );

    expect(taskQueries).toMatch(/\.from\(["']tasks["']\)/);
    expect(taskQueries).not.toMatch(/recurring_task_series|virtual|expand/i);
    expect(dashboard).toContain("ensureRecurringCoverage");
    expect(dashboard).not.toMatch(/generateRecurringTasks|ensureRecurringInstances/);
  });

  it("routes date-bounded Task API and AI reads through the focused query", () => {
    const taskApi = readFileSync(
      resolve(process.cwd(), "app/api/tasks/route.ts"),
      "utf8",
    );
    const aiTasks = readFileSync(
      resolve(process.cwd(), "lib/ai/tools/tasks.ts"),
      "utf8",
    );

    expect(taskApi).toContain("createSupabaseTaskQuery");
    expect(aiTasks).toContain("createSupabaseTaskQuery");
    for (const source of [taskApi, aiTasks]) {
      expect(source).not.toMatch(
        /ensureRecurringTaskCoverage|ensureRecurringTaskCoverageThrough|taskReadCoverageRange/,
      );
    }
  });

  it("routes sidebar counts through the authenticated focused query", () => {
    const sidebarRoute = readFileSync(
      resolve(process.cwd(), "app/api/sidebar/counts/route.ts"),
      "utf8",
    );
    const sidebarQuery = readFileSync(
      resolve(process.cwd(), "lib/sidebar/query.ts"),
      "utf8",
    );
    const sidebarComposition = readFileSync(
      resolve(process.cwd(), "lib/sidebar/supabase-query.ts"),
      "utf8",
    );

    expect(sidebarRoute).toContain("createSupabaseSidebarCountsQuery");
    expect(sidebarRoute).not.toMatch(
      /ensureRecurringTaskCoverage|ensureRecurringTaskCoverageThrough|recurringCoverageWarning/,
    );
    expect(sidebarRoute).not.toMatch(/new (?:HabitsDB|TasksDB)\s*\(/);
    expect(sidebarRoute).not.toMatch(/\buserId\b/);
    expect(sidebarRoute).not.toContain("createAuthenticatedRecurringTaskCapabilities");
    expect(sidebarQuery).toContain("createSidebarCountsQuery");
    expect(sidebarQuery).toContain('status: "failed"');
    expect(sidebarComposition).toContain(
      "createAuthenticatedRecurringTaskCapabilities",
    );
    expect(sidebarComposition).toContain("createSidebarCountsQuery");
  });
});
