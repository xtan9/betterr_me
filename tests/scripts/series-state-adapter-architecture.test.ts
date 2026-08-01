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
  it("routes product Series State commands through the shared adapter", () => {
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
      "function toSeriesRevisionInput",
    );

    expect(recurringPatch).toContain("createSupabaseSeriesStateAdapter(supabase)");
    expect(recurringPatch).toContain("seriesStateHttpFailure(outcome)");
    expect(recurringPatch).not.toContain("createSupabaseRecurringTaskLifecycle");
    expect(recurringPatch).not.toContain("new RecurringTasksDB");
    expect(recurringDelete).toContain("createSupabaseSeriesStateAdapter(supabase)");
    expect(recurringDelete).toContain("state.end");
    expect(taskRoute).toContain("createSupabaseSeriesStateAdapter(supabase)");
    expect(taskRoute).toContain(".editScope");
    expect(taskRoute).toContain(".deleteScope");
    expect(taskRoute).not.toContain("createSupabaseRecurringTaskLifecycle");
    expect(taskRoute).not.toContain("createTaskWrites");
  });

  it("routes AI following, pause, resume, and end commands through the adapter", () => {
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

    for (const operation of [update, deleteTask, recurringUpdate, pause, resume, end]) {
      expect(operation).toContain("createSupabaseSeriesStateAdapter(");
      expect(operation).toContain("ctx.supabase");
      expect(operation).not.toContain("createSupabaseRecurringTaskLifecycle(ctx.supabase)");
    }
    expect(deleteTask).toContain("Always confirm with the user first");
    expect(end).toContain("Always confirm with the user first");
  });

  it("does not construct legacy writers in lifecycle mode", () => {
    const factory = source("lib/recurring-tasks/supabase-series-state-adapter.ts");
    const lifecycleBranch = section(
      factory,
      "if (options.lifecycle)",
      "const recurringTasksDB",
    );

    expect(lifecycleBranch).toContain("getTask");
    expect(lifecycleBranch).toContain("return new SeriesStateAdapter");
    expect(lifecycleBranch).not.toContain("RecurringTasksDB");
    expect(lifecycleBranch).not.toContain("updateRecurringTask");
    expect(lifecycleBranch).not.toContain("deleteRecurringTask");
  });
});
