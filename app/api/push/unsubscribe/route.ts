import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { PushSubscriptionsDB } from "@/lib/db/push-subscriptions";
import { validateRequestBody } from "@/lib/validations/api";
import { pushUnsubscribeSchema } from "@/lib/validations/push";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * POST /api/push/unsubscribe
 * Remove a push notification subscription for the current device.
 * Body: { endpoint: string }
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
    const validation = validateRequestBody(body, pushUnsubscribeSchema);
    if (!validation.success) return validation.response;

    const db = new PushSubscriptionsDB(supabase);
    await db.deleteSubscription(userId, validation.data.endpoint);

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error("POST /api/push/unsubscribe error", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
