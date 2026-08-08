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
    const recurringDelete = section(
      recurringRoute,
      "export async function DELETE",
      "type SeriesCommandResult",
    );
    const taskDelete = section(
      taskRoute,
      "export async function DELETE",
      "function toOccurrenceInput",
    );

    expect(recurringPatch).toContain("createAuthenticatedRecurringTaskCapabilities");
    expect(recurringPatch).toContain("seriesCommands");
    expect(recurringPatch).toContain("toReviseSeriesCommand");
    expect(recurringPatch).not.toContain("createSupabaseSeriesStateAdapter");
    expect(recurringPatch).not.toContain("createSupabaseRecurringTaskLifecycle");
    expect(recurringPatch).not.toContain("new RecurringTasksDB");
    expect(recurringDelete).toContain("createAuthenticatedRecurringTaskCapabilities");
    expect(recurringDelete).toContain(".seriesCommands.endSeries(");
    expect(recurringDelete).toContain("toSeriesStateCommand");
    expect(recurringDelete).not.toContain("createTaskWrites(supabase,");
    expect(recurringDelete).not.toContain("createSupabaseSeriesStateAdapter(supabase)");
    expect(taskRoute).toContain("createSupabaseSeriesStateAdapter(supabase)");
    expect(taskRoute).toContain(".editScope");
    expect(taskDelete).toContain("createTaskWrites(supabase,");
    expect(taskDelete).toContain(".delete({");
    expect(taskDelete).toContain("createActivatedRecurringTaskLifecycle(supabase)");
    expect(taskDelete).not.toContain("createSupabaseSeriesStateAdapter(supabase)");
  });

  it("keeps task-scoped compatibility private while routing AI Series mutations through capabilities", () => {
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

    expect(update).toContain("createSupabaseSeriesStateAdapter(");
    expect(update).toContain("ctx.supabase");
    expect(update).not.toContain("createSupabaseRecurringTaskLifecycle(ctx.supabase)");
    for (const operation of [recurringUpdate, pause, resume]) {
      expect(operation).toContain("recurringTaskCapabilities(ctx).seriesCommands");
      expect(operation).not.toContain("createSupabaseSeriesStateAdapter(");
      expect(operation).not.toContain("createTaskWrites(");
    }
    expect(recurringUpdate).toContain("toReviseSeriesCommand");
    expect(pause).toContain("toSeriesStateCommand");
    expect(resume).toContain("toSeriesStateCommand");
    expect(end).toContain("recurringTaskCapabilities(ctx).seriesCommands.endSeries");
    expect(end).toContain("toSeriesStateCommand");
    expect(end).not.toContain("createTaskWrites(");
    expect(end).not.toContain("createSupabaseSeriesStateAdapter(");
    expect(end).toContain("Always confirm with the user first");
    expect(deleteTask).toContain("Always confirm with the user first");
    for (const operation of [recurringUpdate, pause, resume, end]) {
      expect(operation).not.toContain("createSupabaseRecurringTaskLifecycle(ctx.supabase)");
    }
    /*
     * The generic task commands intentionally retain their compatibility
     * boundary until the task-scoped command contract is delivered.
     */
    for (const operation of [update]) {
      expect(operation).toContain("createSupabaseSeriesStateAdapter(");
      expect(operation).toContain("ctx.supabase");
      expect(operation).not.toContain("createSupabaseRecurringTaskLifecycle(ctx.supabase)");
    }
    expect(deleteTask).toContain("createTaskWrites(ctx.supabase,");
    expect(deleteTask).toContain(".delete({");
    expect(deleteTask).toMatch(/taskDeletionErrorMessage\(\s*outcome/);
    expect(deleteTask).not.toContain("createSupabaseSeriesStateAdapter(");
  });

  it("activates lifecycle mode without constructing legacy writers", () => {
    const factory = source("lib/recurring-tasks/supabase-series-state-adapter.ts");

    expect(factory).toContain("createActivatedRecurringTaskLifecycle(supabase)");
    expect(factory).toContain("return new SeriesStateAdapter");
    expect(factory).not.toMatch(/RecurringTasksDB|updateRecurringTask|updateInstanceWithScope|ensureRecurringInstances/);
  });
});
