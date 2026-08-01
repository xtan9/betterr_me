import { NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { PushSubscriptionsDB } from "@/lib/db/push-subscriptions";
import { log } from "@/lib/logger";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * GET /api/push/subscriptions
 * Returns the count of active push subscriptions for the current user.
 * Used by NotificationSettings to show "Subscribed on N devices".
 */
export async function GET(request: Request = new Request("http://localhost")) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { principal: { userId }, client: supabase } = auth;

    const db = new PushSubscriptionsDB(supabase);
    const subscriptions = await db.getSubscriptions(userId);

    return NextResponse.json({ count: subscriptions.length });
  } catch (error) {
    log.error("GET /api/push/subscriptions error", error);
    return NextResponse.json(
      { error: "Failed to get subscriptions" },
      { status: 500 }
    );
  }
}
