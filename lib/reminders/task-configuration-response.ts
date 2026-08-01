import { NextResponse } from "next/server";
import {
  toTaskReminderResponse,
  type TaskReminderConfigurationPersistenceOutcome,
} from "@/lib/tasks/writes";

export function taskReminderConfigurationResponse(
  outcome: TaskReminderConfigurationPersistenceOutcome,
  configuredStatus: 200 | 201 = 200,
) {
  if (outcome.type === "not-found") {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (outcome.type === "conflict") {
    return NextResponse.json(
      { error: outcome.reason ?? "Task reminder configuration conflicted" },
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
        ? toTaskReminderResponse(outcome.reminders[0])
        : null,
    },
    { status: outcome.type === "already-applied" ? 200 : configuredStatus },
  );
}
