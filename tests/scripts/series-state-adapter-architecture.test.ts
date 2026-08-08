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

describe("Series State adapter architecture boundaries", () => {
  it("routes product Series State commands through authenticated Series commands", () => {
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
      "function toSeriesRevisionInput",
    );
    const taskDelete = section(
      taskRoute,
      "export async function DELETE",
      "function toOccurrenceInput",
    );

    expect(recurringPatch).toContain("createAuthenticatedRecurringTaskCapabilities");
    expect(recurringPatch).toContain(".seriesCommands");
    expect(recurringStateActions).toContain("seriesCommands");
    expect(recurringStateActions).toContain("runSeriesStateCommand");
    expect(recurringPatch).toContain("createSupabaseSeriesStateAdapter(supabase)");
    expect(recurringPatch).not.toContain("createSupabaseRecurringTaskLifecycle");
    expect(recurringPatch).not.toContain("new RecurringTasksDB");
    expect(recurringDelete).toContain("createAuthenticatedRecurringTaskCapabilities");
    expect(recurringDelete).toContain(".seriesCommands");
    expect(recurringDelete).toContain("'end'");
    expect(recurringDelete).not.toContain("createTaskWrites(supabase,");
    expect(recurringDelete).not.toContain(".deleteSeries({");
    expect(recurringDelete).not.toContain("createSupabaseSeriesStateAdapter(supabase)");
    expect(taskRoute).toContain("createSupabaseSeriesStateAdapter(supabase)");
    expect(taskRoute).toContain(".editScope");
    expect(taskDelete).toContain("createTaskWrites(supabase,");
    expect(taskDelete).toContain(".delete({");
    expect(taskDelete).toContain("createActivatedRecurringTaskLifecycle(supabase)");
    expect(taskDelete).not.toContain("createSupabaseSeriesStateAdapter(supabase)");
  });

  it("routes AI recurring revisions through the adapter and state changes through Series commands", () => {
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

    for (const operation of [update, recurringUpdate]) {
      expect(operation).toContain("createSupabaseSeriesStateAdapter(");
      expect(operation).toContain("ctx.supabase");
      expect(operation).not.toContain("createSupabaseRecurringTaskLifecycle(ctx.supabase)");
    }
    for (const operation of [pause, resume]) {
      expect(operation).toContain("recurringTaskCapabilities(ctx)");
      expect(operation).toContain("seriesCommands");
      expect(operation).not.toContain("createSupabaseSeriesStateAdapter(");
    }
    expect(deleteTask).toContain("createTaskWrites(ctx.supabase,");
    expect(deleteTask).toContain(".delete({");
    expect(deleteTask).toMatch(/taskDeletionErrorMessage\(\s*outcome/);
    expect(deleteTask).not.toContain("createSupabaseSeriesStateAdapter(");
    expect(end).toContain("recurringTaskCapabilities(ctx)");
    expect(end).toContain("seriesCommands.endSeries");
    expect(end).not.toContain("createTaskWrites(ctx.supabase,");
    expect(end).not.toContain(".deleteSeries({");
    expect(deleteTask).toContain("Always confirm with the user first");
    expect(end).toContain("Always confirm with the user first");
  });

  it("activates lifecycle mode without constructing legacy writers", () => {
    const factory = source("lib/recurring-tasks/supabase-series-state-adapter.ts");

    expect(factory).toContain("createActivatedRecurringTaskLifecycle(supabase)");
    expect(factory).toContain("return new SeriesStateAdapter");
    expect(factory).not.toMatch(/RecurringTasksDB|updateRecurringTask|updateInstanceWithScope|ensureRecurringInstances/);
  });
});
