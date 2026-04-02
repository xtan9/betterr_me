import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PushSubscriptionsDB } from "@/lib/db/push-subscriptions";
import { validateRequestBody } from "@/lib/validations/api";
import { pushUnsubscribeSchema } from "@/lib/validations/push";
import { log } from "@/lib/logger";

/**
 * POST /api/push/unsubscribe
 * Remove a push notification subscription for the current device.
 * Body: { endpoint: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateRequestBody(body, pushUnsubscribeSchema);
    if (!validation.success) return validation.response;

    const db = new PushSubscriptionsDB(supabase);
    await db.deleteSubscription(user.id, validation.data.endpoint);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("POST /api/push/unsubscribe error", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
