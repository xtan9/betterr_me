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

describe("Habit Reminder Configuration architecture boundaries", () => {
  it("routes HTTP Habit configuration through HabitWrites", () => {
    const route = source("app/api/reminders/route.ts");
    const habitPost = section(
      route,
      'if (reminderData.source_type === "habit")',
      "    // Generic reminder writes are intentionally unavailable",
    );

    expect(habitPost).toContain("createHabitWrites(supabase).configureReminders");
    expect(habitPost).not.toContain("createReminder");
    expect(habitPost).not.toContain("computeFireAt");
  });

  it("routes HTTP Habit replacement and removal through HabitWrites", () => {
    const route = source("app/api/reminders/[id]/route.ts");
    const habitPatch = section(
      route,
      'if (existing.source_type === "habit" && validation.data.channels !== undefined)',
      "    return transitionReminderDeliveryResponse(",
    );
    const habitDelete = section(
      route,
      'if (existing.source_type === "habit")',
      "    // Generic reminder writes are intentionally unavailable",
    );

    expect(habitPatch).toContain("createHabitWrites(supabase).configureReminders");
    expect(habitPatch).not.toContain("updateReminder");
    expect(habitDelete).toContain("createHabitWrites(supabase).configureReminders");
    expect(habitDelete).not.toContain("deleteReminder");
  });

  it("routes AI Habit configuration and removal through HabitWrites", () => {
    const tools = source("lib/ai/tools/reminders.ts");
    const habitCreate = section(
      tools,
      'if (params.sourceType === "habit")',
      '        return { error: "Unsupported reminder source" };',
    );
    const habitDelete = section(
      tools,
      'if (reminder.source_type === "habit")',
      '        return { error: "Unsupported reminder source" };',
    );

    expect(habitCreate).toContain("createHabitWrites(ctx.supabase).configureReminders");
    expect(habitCreate).not.toContain("createReminder");
    expect(habitDelete).toContain("createHabitWrites(ctx.supabase).configureReminders");
    expect(habitDelete).not.toContain("deleteReminder");
  });

  it("keeps Habit configuration request and outcomes storage-independent", () => {
    const writes = source("lib/habits/writes.ts");
    const requestStart = writes.indexOf("export interface HabitReminderConfigurationRequest");
    const persistenceStart = writes.indexOf("export interface HabitReminderConfigurationPersistence");
    const request = writes.slice(requestStart, persistenceStart);

    expect(request).toContain("userId");
    expect(request).toContain("habitId");
    expect(request).not.toContain("Supabase");
    expect(request).not.toContain("source_type");
    expect(request).not.toContain("user_id");
    expect(writes).toContain('type: "already-applied"');
    expect(writes).toContain('type: "not-found"');
    expect(writes).toContain('type: "conflict"');
    expect(writes).toContain('type: "invalid"');
  });

  it("keeps persistence and lifecycle ownership in the database boundary", () => {
    const migration = source(
      "supabase/migrations/20260802000010_configure_habit_reminders.sql",
    );

    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.configure_habit_reminders");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("ON DELETE CASCADE");
    expect(migration).toContain("betterr_habit_lifecycle");
    expect(migration).toContain("Duplicate reminder configuration");
  });

  it("removes generic configuration write methods from the reminder persistence inventory", () => {
    const reminders = source("lib/db/reminders.ts");
    expect(reminders).not.toMatch(/async createReminder\s*\(/);
    expect(reminders).not.toMatch(/async deleteReminder\s*\(/);
  });
});
