import { existsSync, readFileSync } from "node:fs";
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

describe("Task occurrence architecture boundaries", () => {
  it("removes the obsolete occurrence adapters", () => {
    for (const path of [
      "lib/recurring-tasks/occurrence-adapter.ts",
      "lib/recurring-tasks/supabase-occurrence-adapter.ts",
    ]) {
      expect(existsSync(path), path).toBe(false);
    }
  });

  it("routes HTTP and AI Task occurrence commands through Task Commands", () => {
    const route = source("app/api/tasks/[id]/route.ts");
    const toggleRoute = source("app/api/tasks/[id]/toggle/route.ts");
    const tools = source("lib/ai/tools/tasks.ts");
    const toggle = section(tools, 'name: "toggleTask"', 'name: "updateTask"');
    const update = section(tools, 'name: "updateTask"', 'name: "deleteTask"');
    const deletion = section(tools, 'name: "deleteTask"', 'name: "getRecurringTasks"');

    expect(route).toContain("createAuthenticatedTaskCommands(");
    expect(route).toContain("taskCommandTypeFromUpdate");
    expect(route).toContain("taskCommandHttpFailure(outcome)");
    expect(toggleRoute).toContain("createSupabaseLegacyTaskToggle(supabase)");
    expect(tools).toContain("createTaskCommandsForUser(");
    for (const delivery of [route, toggleRoute, toggle, update, deletion]) {
      expect(delivery).not.toContain("createSupabaseOccurrenceAdapter");
      expect(delivery).not.toContain("createSupabaseSeriesStateAdapter");
      expect(delivery).not.toContain("createTaskWrites");
    }
  });

  it("keeps the lifecycle port private to the Task Commands composition", () => {
    const commands = source("lib/tasks/commands.ts");
    const writes = source("lib/tasks/writes.ts");

    expect(commands).toContain("createActivatedRecurringTaskLifecycle");
    expect(commands).toContain("RecurringTaskLifecycle");
    expect(writes).not.toContain("RecurringTaskLifecycle");
    expect(writes).not.toContain("TaskDeletion");
    expect(writes).not.toContain("deleteSeries");
    expect(writes).toContain("Scoped task updates must use Task Commands");
  });
});
