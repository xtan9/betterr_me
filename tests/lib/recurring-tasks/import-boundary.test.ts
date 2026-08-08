import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const lifecycleBoundarySources = [
  "app/api/dashboard/route.ts",
  "app/api/tasks/route.ts",
  "app/api/tasks/[id]/route.ts",
  "app/api/tasks/[id]/toggle/route.ts",
  "app/api/recurring-tasks/route.ts",
  "app/api/recurring-tasks/[id]/route.ts",
  "app/api/cron/prewarm-recurring-tasks/route.ts",
  "app/api/sidebar/counts/route.ts",
  "app/api/calendar/overlay-feed/route.ts",
  "lib/calendar/overlay-feed.ts",
  "lib/calendar/query.ts",
  "lib/calendar/supabase-query.ts",
  "lib/calendar/display.ts",
  "lib/ai/tools/tasks.ts",
  "lib/dashboard/dashboard-snapshot.ts",
  "lib/dashboard/query.ts",
  "lib/dashboard/supabase-query.ts",
  "lib/sidebar/query.ts",
  "lib/sidebar/supabase-query.ts",
  "lib/db/tasks.ts",
  "lib/recurring-tasks/internal/coverage.ts",
  "lib/tasks/commands.ts",
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

  it("keeps compatibility execution on the narrow authenticated command port", () => {
    const compatibility = readFileSync(
      resolve(process.cwd(), "lib/recurring-tasks/compatibility.ts"),
      "utf8",
    );
    const http = readFileSync(
      resolve(process.cwd(), "app/api/recurring-tasks/[id]/route.ts"),
      "utf8",
    );
    const ai = readFileSync(
      resolve(process.cwd(), "lib/ai/tools/tasks.ts"),
      "utf8",
    );
    const compatibilityImports = compatibility.slice(
      0,
      compatibility.indexOf("/** Supported"),
    );

    expect(compatibility).toContain("SeriesCompatibilityCommandPort");
    expect(compatibility).toContain("executeSeriesCompatibilityIntent");
    expect(compatibility).toContain("return commands.reviseSeries(intent.command)");
    expect(compatibility).not.toContain("toSeriesRevisionExecutionCommand");
    expect(http).toContain("command: toReviseSeriesCommand({");
    expect(ai).toContain("command: toReviseSeriesCommand({");
    expect(compatibilityImports).not.toMatch(
      /(?:Supabase|NextRequest|NextResponse|authenticate|AuthenticatedPrincipal|SeriesQueries|logger|persistence|lifecycle)/i,
    );
    expect(http).not.toMatch(/seriesCommands\.(?:pause|resume|end)Series\s*\(/);
    expect(ai).not.toMatch(/seriesCommands\.(?:pause|resume|end)Series\s*\(/);
    expect(http).not.toMatch(/seriesCommands\.reviseSeries\s*\(/);
    expect(ai).not.toMatch(/seriesCommands\.reviseSeries\s*\(/);
    expect(http).not.toContain("addLocalDays(");
    expect(ai).not.toContain("addLocalDays(");
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
      resolve(process.cwd(), "lib/dashboard/query.ts"),
      "utf8",
    );

    expect(taskQueries).toMatch(/\.from\(["']tasks["']\)/);
    expect(taskQueries).not.toMatch(/recurring_task_series|virtual|expand/i);
    expect(dashboard).toContain("dependencies.coverage.ensure");
    expect(dashboard).toContain("dependencies.snapshot.load");
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

  it("routes dashboard delivery through the authenticated focused query", () => {
    const dashboardRoute = readFileSync(
      resolve(process.cwd(), "app/api/dashboard/route.ts"),
      "utf8",
    );

    expect(dashboardRoute).toContain("createSupabaseDashboardQuery");
    expect(dashboardRoute).toContain("onIncomplete: 'return-available'");
    expect(dashboardRoute).not.toMatch(
      /ensureRecurringTaskCoverage|ensureRecurringTaskCoverageThrough|createSupabaseDashboardSnapshot/,
    );
    expect(dashboardRoute).not.toMatch(/new\s+\w+DB\s*\(|\buserId\b/);
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

  it("routes Calendar Task overlays through the authenticated focused query", () => {
    const route = readFileSync(
      resolve(process.cwd(), "app/api/calendar/overlay-feed/route.ts"),
      "utf8",
    );
    const query = readFileSync(
      resolve(process.cwd(), "lib/calendar/query.ts"),
      "utf8",
    );
    const supabaseQuery = readFileSync(
      resolve(process.cwd(), "lib/calendar/supabase-query.ts"),
      "utf8",
    );

    expect(route).toContain("createSupabaseCalendarQuery");
    expect(route).not.toMatch(
      /ensureRecurringTaskCoverage|ensureRecurringTaskCoverageThrough/,
    );
    expect(query).toContain("createCalendarQuery");
    expect(supabaseQuery).toContain("createCoverageRead");
    expect(supabaseQuery).toContain('source: "calendar"');
    expect(supabaseQuery).not.toContain(
      "createAuthenticatedRecurringTaskCapabilities",
    );
    for (const source of [query, supabaseQuery]) {
      expect(source).not.toMatch(
        /ensureRecurringTaskCoverage|ensureRecurringTaskCoverageThrough/,
      );
    }
  });

  it("keeps Calendar Event recurrence on the supported scheduling subpath", () => {
    const calendarRecurrence = readFileSync(
      resolve(process.cwd(), "lib/calendar/recurrence.ts"),
      "utf8",
    );
    expect(calendarRecurrence).toContain(
      "@/lib/recurring-tasks/scheduling",
    );
    expect(calendarRecurrence).not.toContain(
      "@/lib/recurring-tasks/recurrence",
    );
  });
});
