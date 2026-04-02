import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PushSubscriptionsDB } from "@/lib/db/push-subscriptions";
import { validateRequestBody } from "@/lib/validations/api";
import { pushSubscribeSchema } from "@/lib/validations/push";
import { log } from "@/lib/logger";

/**
 * POST /api/push/subscribe
 * Register or update a push notification subscription for the current device.
 * Body: { endpoint: string, p256dh: string, auth: string, user_agent?: string | null }
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
    const validation = validateRequestBody(body, pushSubscribeSchema);
    if (!validation.success) return validation.response;

    const db = new PushSubscriptionsDB(supabase);
    const subscription = await db.upsertSubscription(user.id, {
      endpoint: validation.data.endpoint,
      p256dh: validation.data.p256dh,
      auth: validation.data.auth,
      user_agent: validation.data.user_agent ?? null,
    });

    return NextResponse.json({ subscription }, { status: 201 });
  } catch (error) {
    log.error("POST /api/push/subscribe error", error);
    return NextResponse.json(
      { error: "Failed to subscribe" },
      { status: 500 }
    );
  }
}
