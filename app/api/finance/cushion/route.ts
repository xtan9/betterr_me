import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinanceCushion, saveFinanceCushion } from "@/lib/finance/repository";
import { validateRequestBody } from "@/lib/validations/api";
import { financeCushionInputSchema } from "@/lib/validations/finance-cushion";
import { log } from "@/lib/logger";

async function getAuthenticatedContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user ? { supabase, user } : null;
}

/** GET /api/finance/cushion — read only the signed-in user's saved inputs. */
export async function GET() {
  try {
    const context = await getAuthenticatedContext();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cushion = await getFinanceCushion(
      context.supabase,
      context.user.id,
    );
    return NextResponse.json({ cushion });
  } catch (error) {
    log.error("GET /api/finance/cushion error", error);
    return NextResponse.json(
      { error: "Failed to fetch cushion" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/finance/cushion — create or replace the signed-in user's inputs.
 * The user id always comes from the verified session; it is not an input.
 */
export async function POST(request: NextRequest) {
  try {
    const context = await getAuthenticatedContext();
    if (!context) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const validation = validateRequestBody(
      await request.json(),
      financeCushionInputSchema,
    );
    if (!validation.success) return validation.response;

    const input = {
      ...validation.data,
      monthly_continuing_income_cents:
        validation.data.monthly_continuing_income_cents ?? 0,
    };

    const cushion = await saveFinanceCushion(
      context.supabase,
      context.user.id,
      input,
    );
    return NextResponse.json({ cushion });
  } catch (error) {
    log.error("POST /api/finance/cushion error", error);
    return NextResponse.json(
      { error: "Failed to save cushion" },
      { status: 500 },
    );
  }
}

// Keep the resource idempotent for clients that use HTTP PUT semantics.
export const PUT = POST;
