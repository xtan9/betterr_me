import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FINANCE_CUSHION_COLUMNS,
  RUNWAY_MODEL_VERSION,
  toFinanceCushionView,
  type FinanceCushionRecord,
  type FinanceCushionView,
  type RunwaySnapshotSummary,
} from "@/lib/finance/cushion";
import type {
  SuccessfulHouseholdRunwayAssessment,
} from "@/lib/finance/household-runway-assessment";

export async function getFinanceCushion(
  supabase: SupabaseClient,
  userId: string,
): Promise<FinanceCushionView | null> {
  const { data, error } = await supabase
    .from("finance_cushions")
    .select(FINANCE_CUSHION_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? toFinanceCushionView(data as FinanceCushionRecord) : null;
}

export async function saveHouseholdRunwayPlan(
  supabase: SupabaseClient,
  userId: string,
  input: {
    assessment: SuccessfulHouseholdRunwayAssessment;
    status: "in_progress" | "completed";
    attribution: Record<string, string | undefined>;
  },
): Promise<FinanceCushionView> {
  const { answers } = input.assessment;
  const baselineResult = input.assessment.firstScenario.baseline;
  const requiredCushionColumns = {
    liquid_resources_cents: baselineResult.starting_resources_cents,
    monthly_essential_expenses_cents: Math.max(
      1,
      baselineResult.interruption_expenses_cents,
    ),
    monthly_continuing_income_cents:
      baselineResult.continuing_monthly_income_cents,
  };
  const { data, error } = await supabase
    .from("finance_cushions")
    .upsert(
      {
        user_id: userId,
        ...requiredCushionColumns,
        answers,
        latest_result: input.assessment,
        model_version: RUNWAY_MODEL_VERSION,
        status: input.status,
        country: answers.country,
        region: answers.region,
        currency: answers.currency,
        attribution: input.attribution,
        completed_at:
          input.status === "completed" ? new Date().toISOString() : null,
      },
      { onConflict: "user_id" },
    )
    .select(FINANCE_CUSHION_COLUMNS)
    .single();
  if (error) throw error;
  return toFinanceCushionView(data as FinanceCushionRecord);
}

export async function appendRunwaySnapshot(
  supabase: SupabaseClient,
  input: {
    planId: string;
    userId: string;
    actionId: string;
    trigger: "completed" | "updated" | "imported";
    assessment: SuccessfulHouseholdRunwayAssessment;
  },
) {
  const baselineResult = input.assessment.firstScenario.baseline;
  const { error } = await supabase.from("finance_cushion_snapshots").upsert(
    {
      plan_id: input.planId,
      user_id: input.userId,
      action_id: input.actionId,
      trigger: input.trigger,
      scenario: baselineResult.scenario,
      months_covered: baselineResult.months_covered,
      sustainable: baselineResult.sustainable,
      result: input.assessment,
      model_version: RUNWAY_MODEL_VERSION,
    },
    { onConflict: "plan_id,action_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function getRunwaySnapshots(
  supabase: SupabaseClient,
  userId: string,
): Promise<RunwaySnapshotSummary[]> {
  const { data, error } = await supabase
    .from("finance_cushion_snapshots")
    .select(
      "id, trigger, scenario, months_covered, sustainable, model_version, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(24);
  if (error) throw error;
  return (data ?? []) as RunwaySnapshotSummary[];
}
