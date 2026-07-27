import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateRequestBody } from "@/lib/validations/api";
import { financeCushionEventSchema } from "@/lib/validations/finance-cushion";
import { log } from "@/lib/logger";
import { hasEnvVars } from "@/lib/utils";

function eventClientKey(request: NextRequest, sessionId: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const trustedIdentifier = forwarded || request.headers.get("x-real-ip") || sessionId;
  const serverSalt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "local-runway-events";
  return createHash("sha256").update(`${serverSalt}:${trustedIdentifier}`).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const validation = validateRequestBody(
      await request.json(),
      financeCushionEventSchema,
    );
    if (!validation.success) return validation.response;
    if (!hasEnvVars) return new NextResponse(null, { status: 204 });

    const supabase = createAdminClient();
    const { data: allowed, error } = await supabase.rpc(
      "record_finance_cushion_event",
      {
        p_client_key: eventClientKey(request, validation.data.session_id),
        p_action_id: validation.data.action_id,
        p_session_id: validation.data.session_id,
        p_event_name: validation.data.event_name,
        p_step_id: validation.data.step_id ?? null,
        p_locale: validation.data.locale ?? null,
        p_attribution: validation.data.attribution ?? {},
      },
    );
    if (error) throw error;
    if (!allowed) {
      return NextResponse.json({ error: "Too many events" }, { status: 429 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("[household-runway] amount-free event failed", error);
    return NextResponse.json(
      { error: "Failed to record event" },
      { status: 500 },
    );
  }
}
