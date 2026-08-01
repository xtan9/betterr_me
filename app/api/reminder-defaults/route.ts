import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { ReminderDefaultsDB } from "@/lib/db";
import { createReminderDefaultWrites } from "@/lib/reminders/default-writes";
import { validateRequestBody } from "@/lib/validations/api";
import { log } from "@/lib/logger";
import { z } from "zod";

const reminderDefaultUpsertSchema = z.object({
  source_type: z.enum(["calendar_event", "task", "habit"]),
  relative_minutes: z.number().int().positive("relative_minutes must be positive"),
  channels: z.array(z.enum(["push", "email"])).min(1, "At least one channel is required"),
});

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/reminder-defaults
 * Get all reminder defaults for the authenticated user.
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await authenticateRequest(_request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const defaultsDB = new ReminderDefaultsDB(supabase);
    const defaults = await defaultsDB.getDefaults(userId);

    return NextResponse.json({ defaults });
  } catch (error) {
    log.error("GET /api/reminder-defaults error", error);
    return NextResponse.json(
      { error: "Failed to fetch reminder defaults" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/reminder-defaults
 * Upsert a reminder default for a given source type.
 */
export async function PUT(request: NextRequest) {
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
    const validation = validateRequestBody(body, reminderDefaultUpsertSchema);
    if (!validation.success) return validation.response;

    const outcome = await createReminderDefaultWrites(supabase).upsert({
      userId,
      default: {
        sourceType: validation.data.source_type,
        relativeMinutes: validation.data.relative_minutes,
        channels: validation.data.channels,
      },
    });

    return NextResponse.json({ default: outcome.default });
  } catch (error) {
    log.error("PUT /api/reminder-defaults error", error);
    return NextResponse.json(
      { error: "Failed to upsert reminder default" },
      { status: 500 }
    );
  }
}
