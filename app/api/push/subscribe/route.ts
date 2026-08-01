import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, cookieRouteErrorMessage } from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { PushSubscriptionsDB } from "@/lib/db/push-subscriptions";
import { validateRequestBody } from "@/lib/validations/api";
import { pushSubscribeSchema } from "@/lib/validations/push";
import { log } from "@/lib/logger";

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

/**
 * POST /api/push/subscribe
 * Register or update a push notification subscription for the current device.
 * Body: { endpoint: string, p256dh: string, auth: string, user_agent?: string | null }
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
    const validation = validateRequestBody(body, pushSubscribeSchema);
    if (!validation.success) return validation.response;

    const db = new PushSubscriptionsDB(supabase);
    const subscription = await db.upsertSubscription(userId, {
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
