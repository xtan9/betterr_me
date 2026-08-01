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

describe("Task Reminder Configuration architecture boundaries", () => {
  it("routes HTTP Task configuration through TaskWrites", () => {
    const route = source("app/api/reminders/route.ts");
    const taskPost = section(
      route,
      'if (reminderData.source_type === "task")',
      "    const fireAt",
    );

    expect(taskPost).toContain("createTaskWrites(supabase).configureReminders");
    expect(taskPost).not.toContain("createReminder");
    expect(taskPost).not.toContain("computeFireAt");
  });

  it("routes HTTP replacement and removal through TaskWrites", () => {
    const route = source("app/api/reminders/[id]/route.ts");
    const taskPatch = section(
      route,
      'if (existing.source_type === "task" && validation.data.channels !== undefined)',
      "    // Status, fire_at, and sent_at",
    );
    const taskDelete = section(
      route,
      'if (existing.source_type === "task")',
      "    await remindersDB.deleteReminder",
    );

    expect(taskPatch).toContain("createTaskWrites(supabase).configureReminders");
    expect(taskPatch).not.toContain("updateReminder");
    expect(taskDelete).toContain("createTaskWrites(supabase).configureReminders");
    expect(taskDelete).not.toContain("deleteReminder");
  });

  it("routes AI Task configuration and removal through TaskWrites", () => {
    const tools = source("lib/ai/tools/reminders.ts");
    const taskCreate = section(
      tools,
      'if (params.sourceType === "task")',
      '        const db = new RemindersDB',
    );
    const taskDelete = section(
      tools,
      'if (reminder.source_type === "task")',
      "        await db.deleteReminder",
    );

    expect(taskCreate).toContain("createTaskWrites(ctx.supabase).configureReminders");
    expect(taskCreate).not.toContain("createReminder");
    expect(taskDelete).toContain("createTaskWrites(ctx.supabase).configureReminders");
    expect(taskDelete).not.toContain("deleteReminder");
  });

  it("keeps Task configuration request and outcomes storage-independent", () => {
    const writes = source("lib/tasks/writes.ts");
    const requestStart = writes.indexOf("export interface TaskReminderConfigurationRequest");
    const persistenceStart = writes.indexOf("export interface TaskReminderConfigurationPersistence");
    const request = writes.slice(requestStart, persistenceStart);

    expect(request).toContain("userId");
    expect(request).toContain("taskId");
    expect(request).not.toContain("Supabase");
    expect(request).not.toContain("source_type");
    expect(request).not.toContain("user_id");
    expect(writes).toContain("type: 'already-applied'");
    expect(writes).toContain("type: 'not-found'");
    expect(writes).toContain("type: 'conflict'");
    expect(writes).toContain("type: 'invalid'");
  });

  it("keeps persistence and lifecycle ownership in the database boundary", () => {
    const migration = source(
      "supabase/migrations/20260802000009_configure_task_reminders.sql",
    );

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.configure_task_reminders");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("ON DELETE CASCADE");
    expect(migration).toContain("betterr_task_lifecycle");
    expect(migration).toContain("Duplicate reminder configuration");
  });
});
