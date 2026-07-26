import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ReminderDefaultsDB } from "@/lib/db";
import { validateRequestBody } from "@/lib/validations/api";
import { log } from "@/lib/logger";
import { z } from "zod";

const reminderDefaultUpsertSchema = z.object({
  source_type: z.enum(["calendar_event", "task", "habit"]),
  relative_minutes: z.number().int().positive("relative_minutes must be positive"),
  channels: z.array(z.enum(["push", "email"])).min(1, "At least one channel is required"),
});

/**
 * GET /api/reminder-defaults
 * Get all reminder defaults for the authenticated user.
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const defaultsDB = new ReminderDefaultsDB(supabase);
    const defaults = await defaultsDB.getDefaults(user.id);

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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, reminderDefaultUpsertSchema);
    if (!validation.success) return validation.response;

    const defaultsDB = new ReminderDefaultsDB(supabase);
    const result = await defaultsDB.upsertDefault(user.id, validation.data);

    return NextResponse.json({ default: result });
  } catch (error) {
    log.error("PUT /api/reminder-defaults error", error);
    return NextResponse.json(
      { error: "Failed to upsert reminder default" },
      { status: 500 }
    );
  }
}
