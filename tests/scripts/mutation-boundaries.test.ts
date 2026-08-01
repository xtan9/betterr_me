import { describe, expect, it } from "vitest";
import {
  scanDeliverySource,
  scanDeliverySources,
} from "@/scripts/check-delivery-write-inventory.mjs";

describe("permanent delivery import boundaries", () => {
  it("has no qualifying HTTP, AI, or operational persistence bypasses", () => {
    expect(scanDeliverySources()).toEqual([]);
  });

  it.each([
    ["TasksDB", "getTask", "lib/ai/tools/tasks.ts"],
    ["HabitsDB", "getHabit", "lib/ai/tools/habits.ts"],
    ["WorkoutsDB", "getWorkout", "lib/ai/tools/workouts.ts"],
    ["JournalEntriesDB", "getEntry", "lib/ai/tools/journal.ts"],
    ["ProjectsDB", "getProject", "lib/ai/tools/projects.ts"],
    ["CalendarEventsDB", "getEvent", "lib/ai/tools/calendar.ts"],
    ["RemindersDB", "getReminder", "lib/ai/tools/reminders.ts"],
  ])("allows %s query-only access through %s", (adapter, method, source) => {
    expect(scanDeliverySource(
      source,
      `
        import { ${adapter} } from "@/lib/db";
        const db = new ${adapter}(supabase);
        return db.${method}("resource-id", "trusted-user");
      `,
    )).toEqual([]);
  });

  it("catches a write-capable adapter imported under an alias", () => {
    const findings = scanDeliverySource(
      "lib/ai/tools/projects.ts",
      `
        import { ProjectsDB as Persistence } from "@/lib/db";
        const db = new Persistence(supabase);
        return db.updateProject("project-id", "trusted-user", {});
      `,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        id: "lib/ai/tools/projects.ts#ProjectsDB.updateProject",
        persistence: "database-adapter",
      }),
    ]);
  });

  it("catches a raw mutation that bypasses every domain adapter", () => {
    expect(scanDeliverySource(
      "app/api/reminders/query-fixture/route.ts",
      `return client.from("reminders").update({ status: "sent" });`,
    )).toEqual([
      expect.objectContaining({
        id: "app/api/reminders/query-fixture/route.ts#raw-supabase.update",
        persistence: "raw-supabase",
      }),
    ]);
  });
});
