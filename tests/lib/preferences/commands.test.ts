import { describe, expect, it } from "vitest";
import {
  notificationPreferenceIntentSchema,
  reminderEmailIntentSchema,
} from "@/lib/preferences/commands";

describe("Notifications Preference commands", () => {
  it("accepts the discriminated Reminder Email Intent", () => {
    expect(
      reminderEmailIntentSchema.parse({
        type: "setReminderEmail",
        enabled: false,
      }),
    ).toEqual({ type: "setReminderEmail", enabled: false });

    expect(
      notificationPreferenceIntentSchema.parse({
        type: "setReminderEmail",
        enabled: true,
      }),
    ).toEqual({ type: "setReminderEmail", enabled: true });
  });

  it("rejects Reminder Email fields outside the owner command", () => {
    expect(
      reminderEmailIntentSchema.safeParse({
        type: "setReminderEmail",
        enabled: true,
        email: "invented@example.test",
      }).success,
    ).toBe(false);
  });
});
