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
  it("routes HTTP occurrence edits and commands through the adapter", () => {
    const route = source("app/api/tasks/[id]/route.ts");
    const toggleRoute = source("app/api/tasks/[id]/toggle/route.ts");

    expect(route).toContain("createSupabaseOccurrenceAdapter(supabase)");
    expect(route).toContain("occurrenceHttpFailure(outcome)");
    expect(route).not.toContain('message.includes("not found")');
    expect(toggleRoute).toContain("createSupabaseOccurrenceAdapter(supabase)");
    expect(toggleRoute).toContain("occurrenceHttpFailure(outcome)");
    expect(toggleRoute).not.toContain("createSupabaseRecurringTaskLifecycle");
    expect(toggleRoute).not.toContain("message.includes");
  });

  it("routes AI occurrence edits through the adapter and deletion through Task Writes", () => {
    const tools = source("lib/ai/tools/tasks.ts");
    const toggle = section(tools, 'name: "toggleTask"', 'name: "updateTask"');
    const update = section(tools, 'name: "updateTask"', 'name: "deleteTask"');
    const deletion = section(tools, 'name: "deleteTask"', 'name: "getRecurringTasks"');

    for (const operation of [toggle, update]) {
      expect(operation).toContain("createSupabaseOccurrenceAdapter(ctx.supabase)");
      expect(operation).toContain("occurrenceErrorMessage(outcome)");
    }
    expect(deletion).toContain("createTaskWrites(ctx.supabase,");
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

  it("keeps lifecycle routing opt-in for the production adapters", () => {
    const httpRoute = source("app/api/tasks/[id]/route.ts");
    const toggleRoute = source("app/api/tasks/[id]/toggle/route.ts");
    const tools = source("lib/ai/tools/tasks.ts");
    const factory = source("lib/recurring-tasks/supabase-occurrence-adapter.ts");

    expect(httpRoute).not.toMatch(/createSupabaseOccurrenceAdapter\([^)]*,\s*\{/);
    expect(toggleRoute).not.toMatch(/createSupabaseOccurrenceAdapter\([^)]*,\s*\{/);
    expect(tools).not.toMatch(/createSupabaseOccurrenceAdapter\([^)]*,\s*\{/);
    expect(factory).toContain("return new OccurrenceAdapter(persistence, options)");
    expect(factory).toContain("lifecycle?: OccurrenceLifecyclePort");
    const lifecycleFactory = section(
      factory,
      "if (options.lifecycle)",
      "const taskWrites = createTaskWrites(supabase)",
    );
    expect(lifecycleFactory).not.toMatch(/createTaskWrites|RecurringTasksDB/);
  });
});
