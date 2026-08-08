import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

function section(contents: string, start: string, end: string): string {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not find architecture section ${start}`);
  }
  return contents.slice(startIndex, endIndex);
}

describe("Series capability architecture boundaries", () => {
  it("routes product Series mutations through the authenticated capabilities", () => {
    const recurringRoute = source("app/api/recurring-tasks/[id]/route.ts");
    const taskRoute = source("app/api/tasks/[id]/route.ts");

    const recurringPatch = section(
      recurringRoute,
      "export async function PATCH",
      "export async function DELETE",
    );
    const recurringStateActions = section(
      recurringPatch,
      "// Handle quick actions",
      "// Handle general updates",
    );
    const recurringDelete = section(
      recurringRoute,
      "export async function DELETE",
      "type SeriesCommandResult",
    );

    expect(recurringPatch).toContain("createAuthenticatedRecurringTaskCapabilities");
    expect(recurringPatch).toContain("seriesCommands");
    expect(recurringPatch).toContain("toReviseSeriesCommand");
    expect(recurringStateActions).toContain("seriesCommands");
    expect(recurringPatch).not.toContain("createSupabaseSeriesStateAdapter");
    expect(recurringPatch).not.toContain("createSupabaseRecurringTaskLifecycle");
    expect(recurringPatch).not.toContain("new RecurringTasksDB");
    expect(recurringDelete).toContain("createAuthenticatedRecurringTaskCapabilities");
    expect(recurringDelete).toContain(".seriesCommands.endSeries(");
    expect(recurringDelete).toContain("toSeriesStateCommand");
    expect(recurringDelete).not.toContain("createTaskWrites(supabase,");
    expect(recurringDelete).not.toContain("createSupabaseSeriesStateAdapter(supabase)");
    expect(taskRoute).toContain("createAuthenticatedTaskCommands(");
    expect(taskRoute).not.toContain("createSupabaseSeriesStateAdapter(supabase)");
    expect(taskRoute).not.toContain("createTaskWrites(supabase,");
  });

  it("routes Task commands and AI Series mutations through their supported boundaries", () => {
    const tools = source("lib/ai/tools/tasks.ts");
    const update = section(tools, 'name: "updateTask"', 'name: "deleteTask"');
    const deleteTask = section(tools, 'name: "deleteTask"', 'name: "getRecurringTasks"');
    const recurringUpdate = section(
      tools,
      'name: "updateRecurringTask"',
      'name: "pauseRecurringTask"',
    );
    const pause = section(
      tools,
      'name: "pauseRecurringTask"',
      'name: "resumeRecurringTask"',
    );
    const resume = section(
      tools,
      'name: "resumeRecurringTask"',
      'name: "deleteRecurringTask"',
    );
    const end = tools.slice(tools.indexOf('name: "deleteRecurringTask"'));

    expect(update).toContain("createTaskCommandsForUser(");
    expect(update).toContain("taskCommandErrorMessage(commandOutcome)");
    expect(update).not.toContain("createSupabaseSeriesStateAdapter(");
    expect(deleteTask).toContain("createTaskCommandsForUser(");
    expect(deleteTask).toContain("taskCommandErrorMessage(commandOutcome)");
    expect(deleteTask).not.toContain("createTaskWrites(ctx.supabase,");
    expect(deleteTask).not.toContain(".delete({");
    expect(deleteTask).toContain("Always confirm with the user first");

    for (const operation of [recurringUpdate, pause, resume]) {
      expect(operation).toContain("recurringTaskCapabilities(ctx).seriesCommands");
      expect(operation).not.toContain("createSupabaseSeriesStateAdapter(");
      expect(operation).not.toContain("createTaskWrites(");
      expect(operation).not.toContain("createSupabaseRecurringTaskLifecycle(ctx.supabase)");
    }
    expect(recurringUpdate).toContain("toReviseSeriesCommand");
    expect(pause).toContain("toSeriesStateCommand");
    expect(resume).toContain("toSeriesStateCommand");
    expect(end).toContain("recurringTaskCapabilities(ctx).seriesCommands.endSeries");
    expect(end).toContain("toSeriesStateCommand");
    expect(end).not.toContain("createSupabaseSeriesStateAdapter(");
    expect(end).toContain("Always confirm with the user first");
  });

  it("activates lifecycle mode without constructing legacy writers", () => {
    const factory = source("lib/recurring-tasks/supabase-series-state-adapter.ts");

    expect(factory).toContain("createActivatedRecurringTaskLifecycle(supabase)");
    expect(factory).toContain("return new SeriesStateAdapter");
    expect(factory).not.toMatch(/RecurringTasksDB|updateRecurringTask|updateInstanceWithScope|ensureRecurringInstances/);
  });
});
