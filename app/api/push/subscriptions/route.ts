import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PushSubscriptionsDB } from "@/lib/db/push-subscriptions";
import { log } from "@/lib/logger";

/**
 * GET /api/push/subscriptions
 * Returns the count of active push subscriptions for the current user.
 * Used by NotificationSettings to show "Subscribed on N devices".
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = new PushSubscriptionsDB(supabase);
    const subscriptions = await db.getSubscriptions(user.id);

    return NextResponse.json({ count: subscriptions.length });
  } catch (error) {
    log.error("GET /api/push/subscriptions error", error);
    return NextResponse.json(
      { error: "Failed to get subscriptions" },
      { status: 500 }
    );
  }
}
