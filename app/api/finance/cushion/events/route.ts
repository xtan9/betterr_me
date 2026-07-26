import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateRequestBody } from "@/lib/validations/api";
import { financeCushionEventSchema } from "@/lib/validations/finance-cushion";
import { log } from "@/lib/logger";
import { hasEnvVars } from "@/lib/utils";

export async function POST(request: NextRequest) {
  try {
    const validation = validateRequestBody(
      await request.json(),
      financeCushionEventSchema,
    );
    if (!validation.success) return validation.response;
    if (!hasEnvVars) return new NextResponse(null, { status: 204 });

    const supabase = await createClient();
    const { error } = await supabase.from("finance_cushion_events").upsert(
      {
        ...validation.data,
        attribution: validation.data.attribution ?? {},
      },
      { onConflict: "action_id", ignoreDuplicates: true },
    );
    if (error) throw error;

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    log.error("[household-runway] amount-free event failed", error);
    return NextResponse.json(
      { error: "Failed to record event" },
      { status: 500 },
    );
  }
}
