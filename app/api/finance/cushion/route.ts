import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  appendRunwaySnapshot,
  getFinanceCushion,
  getRunwaySnapshots,
  saveHouseholdRunwayPlan,
} from "@/lib/finance/repository";
import {
  availableScenarios,
  simulateHouseholdRunway,
} from "@/lib/finance/cushion";
import { validateRequestBody } from "@/lib/validations/api";
import { financeCushionPlanSchema } from "@/lib/validations/finance-cushion";
import { log } from "@/lib/logger";

async function authenticated() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, user } : null;
}

export async function GET() {
  try {
    const context = await authenticated();
    if (!context)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [cushion, snapshots] = await Promise.all([
      getFinanceCushion(context.supabase, context.user.id),
      getRunwaySnapshots(context.supabase, context.user.id),
    ]);
    return NextResponse.json({ cushion, snapshots });
  } catch (error) {
    log.error("[household-runway] GET failed", error);
    return NextResponse.json(
      { error: "Failed to fetch runway" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await authenticated();
    if (!context)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const validation = validateRequestBody(
      await request.json(),
      financeCushionPlanSchema,
    );
    if (!validation.success) return validation.response;
    const scenario = availableScenarios(validation.data.answers)[0].id;
    const result = simulateHouseholdRunway(validation.data.answers, scenario);
    const cushion = await saveHouseholdRunwayPlan(
      context.supabase,
      context.user.id,
      {
        answers: validation.data.answers,
        result,
        status: validation.data.status,
        attribution: validation.data.attribution ?? {},
      },
    );
    if (
      validation.data.create_snapshot &&
      validation.data.snapshot_action_id &&
      validation.data.snapshot_trigger
    ) {
      await appendRunwaySnapshot(context.supabase, {
        planId: cushion.id,
        userId: context.user.id,
        actionId: validation.data.snapshot_action_id,
        trigger: validation.data.snapshot_trigger,
        result,
      });
    }
    const snapshots = await getRunwaySnapshots(context.supabase, context.user.id);
    return NextResponse.json({ cushion, snapshots });
  } catch (error) {
    log.error("[household-runway] PUT failed", error);
    return NextResponse.json(
      { error: "Failed to save runway" },
      { status: 500 },
    );
  }
}

export const POST = PUT;
