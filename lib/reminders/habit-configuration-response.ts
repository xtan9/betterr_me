import { NextResponse } from "next/server";
import {
  toHabitReminderResponse,
  type HabitReminderConfigurationPersistenceOutcome,
} from "@/lib/habits/writes";

export function habitReminderConfigurationResponse(
  outcome: HabitReminderConfigurationPersistenceOutcome,
  configuredStatus: 200 | 201 = 200,
) {
  if (outcome.type === "not-found") {
    return NextResponse.json({ error: "Habit not found" }, { status: 404 });
  }
  if (outcome.type === "conflict") {
    return NextResponse.json(
      { error: outcome.reason ?? "Habit reminder configuration conflicted" },
      { status: 409 },
    );
  }
  if (outcome.type === "invalid") {
    return NextResponse.json(
      { error: outcome.message, field: outcome.field },
      { status: 400 },
    );
  }
  if (outcome.type === "removed") {
    return NextResponse.json({ success: true }, { status: 200 });
  }
  if (outcome.type === "already-applied" && outcome.reminders.length === 0) {
    return NextResponse.json({ success: true }, { status: 200 });
  }
  return NextResponse.json(
    {
      reminder: outcome.reminders[0]
        ? toHabitReminderResponse(outcome.reminders[0])
        : null,
    },
    { status: outcome.type === "already-applied" ? 200 : configuredStatus },
  );
}
