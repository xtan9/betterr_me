import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Reminder Delivery architecture", () => {
  it("keeps the transition policy storage-independent", () => {
    const domain = read("lib/reminders/delivery.ts");

    expect(domain).not.toMatch(/@supabase|supabase|\.from\(|\.rpc\(/i);
    expect(domain).toContain("ReminderDeliveryPersistence");
    expect(domain).toContain('type: "already-applied"');
    expect(domain).toContain('type: "not-found"');
    expect(domain).toContain('type: "conflict"');
    expect(domain).toContain('type: "invalid-transition"');
  });

  it("routes HTTP, AI, and operational completion through one authority", () => {
    const http = read("app/api/reminders/[id]/route.ts");
    const ai = read("lib/ai/tools/reminders.ts");
    const cron = read("app/api/cron/dispatch-reminders/route.ts");

    for (const source of [http, ai, cron]) {
      expect(source).toContain("createReminderDelivery");
      expect(source).not.toMatch(/updateReminderStatus|transitionCalendarEventReminder/);
    }
    expect(http).toContain("userReminderDeliveryContext");
    expect(ai).toContain("userReminderDeliveryContext");
    expect(cron).toContain("trustedOperationalDispatchContext");
    expect(cron).toContain('type: "stale"');
    expect(cron).toContain('type: "retire-unsupported-source"');
  });

  it("keeps configuration writes at source lifecycle boundaries", () => {
    const domain = read("lib/reminders/delivery.ts");
    const adapter = read("lib/reminders/delivery-adapter.ts");
    const http = read("app/api/reminders/[id]/route.ts");

    expect(domain).toContain(
      "Reminder Configuration changes must use the source lifecycle boundary",
    );
    expect(adapter).toContain("channels");
    expect(http).toContain("createTaskWrites");
    expect(http).toContain("createHabitWrites");
    expect(http).toContain("Task reminder configuration cannot be combined");
    expect(http).toContain("Habit reminder configuration cannot be combined");
  });

  it("keeps persistence atomic and database policy explicit", () => {
    const persistence = read("lib/reminders/delivery-persistence.ts");
    const migration = read(
      "supabase/migrations/20260802000012_centralize_reminder_delivery.sql",
    );

    expect(persistence).toContain('rpc("transition_reminder_delivery"');
    expect(persistence).toContain("p_expected_status");
    expect(persistence).toContain("p_expected_fire_at");
    expect(persistence).toContain("p_expected_sent_at");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).toMatch(
      /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.reminders FROM (?:PUBLIC, )?authenticated/,
    );
    expect(migration).toContain('CREATE POLICY "Reminder Delivery updates owned reminders"');
    expect(migration).toContain("p_expected_status");
  });
});
