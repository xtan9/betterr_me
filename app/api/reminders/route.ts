import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { RemindersDB } from "@/lib/db";
import { reminderCreateSchema } from "@/lib/validations/reminders";
import { validateRequestBody } from "@/lib/validations/api";
import { computeFireAt } from "@/lib/reminders/fire-at";
import {
  CALENDAR_EVENT_REMINDER_LIFECYCLE_ERROR,
  isCalendarEventReminder,
} from "@/lib/reminders/lifecycle-policy";
import { log } from "@/lib/logger";
import { z } from "zod";

/**
 * Extended schema that includes event_start_time for fire_at computation.
 */
const createWithStartTimeSchema = reminderCreateSchema.and(
  z.object({
    event_start_time: z.string().datetime("event_start_time must be a valid ISO datetime"),
  })
);

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/reminders
 * List reminders for a given source (source_type + source_id required).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const { searchParams } = new URL(request.url);
    const source_type = searchParams.get("source_type");
    const source_id = searchParams.get("source_id");

    const validSourceTypes = ["calendar_event", "task", "habit"] as const;

    if (!source_type || !source_id) {
      return NextResponse.json(
        { error: "source_type and source_id are required" },
        { status: 400 }
      );
    }

    if (!validSourceTypes.includes(source_type as typeof validSourceTypes[number])) {
      return NextResponse.json(
        { error: "Invalid source_type" },
        { status: 400 }
      );
    }

    const remindersDB = new RemindersDB(supabase);
    const reminders = await remindersDB.getRemindersBySource(
      userId,
      source_type as typeof validSourceTypes[number],
      source_id
    );

    return NextResponse.json({ reminders });
  } catch (error) {
    log.error("GET /api/reminders error", error);
    return NextResponse.json(
      { error: "Failed to fetch reminders" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reminders
 * Create a new reminder. Requires event_start_time for fire_at computation.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const body = await request.json();
    const validation = validateRequestBody(body, createWithStartTimeSchema);
    if (!validation.success) return validation.response;

    const { event_start_time, ...reminderData } = validation.data;

    if (isCalendarEventReminder(reminderData.source_type)) {
      return NextResponse.json(
        { error: CALENDAR_EVENT_REMINDER_LIFECYCLE_ERROR },
        { status: 409 },
      );
    }

    const fireAt = computeFireAt(
      {
        reminder_type: reminderData.reminder_type,
        relative_minutes: reminderData.relative_minutes ?? null,
        absolute_time: reminderData.absolute_time ?? null,
      },
      event_start_time
    );

    const remindersDB = new RemindersDB(supabase);
    const reminder = await remindersDB.createReminder(userId, {
      ...reminderData,
      relative_minutes: reminderData.relative_minutes ?? null,
      absolute_time: reminderData.absolute_time ?? null,
      fire_at: fireAt,
    });

    return NextResponse.json({ reminder }, { status: 201 });
  } catch (error) {
    log.error("POST /api/reminders error", error);
    return NextResponse.json(
      { error: "Failed to create reminder" },
      { status: 500 }
    );
  }
}
