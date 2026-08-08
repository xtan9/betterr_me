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

describe("Occurrence adapter architecture boundaries", () => {
  it("routes HTTP occurrence edits through the adapter and state through Task Commands", () => {
    const route = source("app/api/tasks/[id]/route.ts");
    const toggleRoute = source("app/api/tasks/[id]/toggle/route.ts");

    expect(route).toContain("createSupabaseOccurrenceAdapter(supabase)");
    expect(route).toContain("createAuthenticatedTaskCommands(");
    expect(route).toContain("taskCommandTypeFromUpdate");
    expect(route).toContain("occurrenceHttpFailure(outcome)");
    expect(route).not.toContain('message.includes("not found")');
    expect(toggleRoute).toContain("createSupabaseLegacyTaskToggle(supabase)");
    expect(toggleRoute).toContain("taskCommandHttpFailure(outcome)");
    expect(toggleRoute).not.toContain("createSupabaseOccurrenceAdapter");
    expect(toggleRoute).not.toContain("createSupabaseRecurringTaskLifecycle");
    expect(toggleRoute).not.toContain("message.includes");
  });

  it("routes AI occurrence edits through the adapter and state through Task Commands", () => {
    const tools = source("lib/ai/tools/tasks.ts");
    const toggle = section(tools, 'name: "toggleTask"', 'name: "updateTask"');
    const update = section(tools, 'name: "updateTask"', 'name: "deleteTask"');
    const deletion = section(tools, 'name: "deleteTask"', 'name: "getRecurringTasks"');

    expect(toggle).toContain("createSupabaseLegacyTaskToggle(ctx.supabase)");
    expect(toggle).toContain("taskCommandErrorMessage(outcome)");
    expect(toggle).not.toContain("createSupabaseOccurrenceAdapter(ctx.supabase)");
    expect(update).toContain("createTaskCommandsForUser(");
    expect(update).toContain("createSupabaseOccurrenceAdapter(ctx.supabase)");
    expect(update).toContain("taskCommandErrorMessage(outcome)");
    expect(deletion).toContain("createTaskCommandsForUser(");
    expect(deletion).toContain("createTaskWrites(ctx.supabase,");
    expect(deletion).toContain(".execute({");
    expect(deletion).toContain(".delete({");
    expect(deletion).toMatch(/taskDeletionErrorMessage\(\s*outcome/);
    expect(deletion).not.toContain("createSupabaseOccurrenceAdapter(ctx.supabase)");
    expect(deletion).not.toContain("occurrenceErrorMessage(outcome)");
    expect(deletion).toContain("Always confirm with the user first");
    expect(toggle).not.toContain("createTaskWrites");
    expect(update).not.toContain("createTaskWrites");
    expect(deletion).not.toMatch(/deleteInstanceWithScope|createSupabaseSeriesStateAdapter/);
  });

  it("keeps direct storage writes outside the lifecycle adapter boundary", () => {
    const lifecycleAdapter = source("lib/recurring-tasks/occurrence-adapter.ts");

    expect(lifecycleAdapter).not.toMatch(/TasksDB|RecurringTasksDB/);
    expect(lifecycleAdapter).not.toMatch(/\.from\(|\.updateTask\(|\.deleteTask\(/);
    expect(lifecycleAdapter).toContain("lifecycle.editOccurrence");
    expect(lifecycleAdapter).toContain("completeOccurrence");
    expect(lifecycleAdapter).toContain("reopenOccurrence");
  });

  it("activates lifecycle routing in the production adapter factory", () => {
    const factory = source("lib/recurring-tasks/supabase-occurrence-adapter.ts");

    expect(factory).toContain("createActivatedRecurringTaskLifecycle(supabase)");
    expect(factory).toContain("return new OccurrenceAdapter(persistence, { lifecycle })");
    expect(factory).toContain("lifecycle?: OccurrenceLifecyclePort");
    expect(factory).toContain("standalone:");
    expect(factory).toContain("createTaskWrites(supabase)");
    expect(factory).not.toMatch(/RecurringTasksDB|updateInstanceWithScope|ensureRecurringInstances/);
  });
});
