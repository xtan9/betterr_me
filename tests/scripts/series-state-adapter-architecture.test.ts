import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

describe("Series capability architecture boundaries", () => {
  it("removes the obsolete Series State adapters", () => {
    for (const path of [
      "lib/recurring-tasks/series-state-adapter.ts",
      "lib/recurring-tasks/supabase-series-state-adapter.ts",
    ]) {
      expect(existsSync(path), path).toBe(false);
    }
  });

  it("routes product Series mutations through the supported boundaries", () => {
    const recurringRoute = source("app/api/recurring-tasks/[id]/route.ts");
    const taskRoute = source("app/api/tasks/[id]/route.ts");
    const tools = source("lib/ai/tools/tasks.ts");

    expect(recurringRoute).toContain(
      "createAuthenticatedRecurringTaskCapabilities",
    );
    expect(recurringRoute).toContain("seriesCommands");
    expect(taskRoute).toContain("createAuthenticatedTaskCommands(");
    expect(tools).toContain("recurringTaskCapabilities(ctx).seriesCommands");
    for (const delivery of [recurringRoute, taskRoute, tools]) {
      expect(delivery).not.toContain("createSupabaseSeriesStateAdapter");
      expect(delivery).not.toContain("createSupabaseRecurringTaskLifecycle");
      expect(delivery).not.toContain("new RecurringTasksDB");
    }
  });

  it("keeps the public package facade free of legacy writer exports", () => {
    const facade = source("lib/recurring-tasks/index.ts");

    expect(facade).toContain("createAuthenticatedRecurringTaskCapabilities");
    expect(facade).not.toContain("createRecurringTaskCapabilities");
    expect(facade).not.toContain("OccurrenceAdapter");
    expect(facade).not.toContain("SeriesStateAdapter");
    expect(facade).not.toContain("SupabaseRecurringTaskLifecycle");
  });
});
