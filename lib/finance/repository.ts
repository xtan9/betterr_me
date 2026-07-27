import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FINANCE_CUSHION_COLUMNS,
  RUNWAY_MODEL_VERSION,
  toFinanceCushionView,
  type FinanceCushionRecord,
  type FinanceCushionView,
  type HouseholdRunwayAnswers,
  type RunwaySimulation,
  type RunwaySnapshotSummary,
} from "@/lib/finance/cushion";

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
    answers: HouseholdRunwayAnswers;
    result: RunwaySimulation;
    status: "in_progress" | "completed";
    attribution: Record<string, string | undefined>;
  },
): Promise<FinanceCushionView> {
  const legacy = {
    liquid_resources_cents: input.result.starting_resources_cents,
    monthly_essential_expenses_cents: Math.max(
      1,
      input.result.interruption_expenses_cents,
    ),
    monthly_continuing_income_cents:
      input.result.continuing_monthly_income_cents,
  };
  const { data, error } = await supabase
    .from("finance_cushions")
    .upsert(
      {
        user_id: userId,
        ...legacy,
        answers: input.answers,
        latest_result: input.result,
        model_version: RUNWAY_MODEL_VERSION,
        status: input.status,
        country: input.answers.country,
        region: input.answers.region,
        currency: input.answers.currency,
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
    result: RunwaySimulation;
  },
) {
  const { error } = await supabase.from("finance_cushion_snapshots").upsert(
    {
      plan_id: input.planId,
      user_id: input.userId,
      action_id: input.actionId,
      trigger: input.trigger,
      scenario: input.result.scenario,
      months_covered: input.result.months_covered,
      sustainable: input.result.sustainable,
      result: input.result,
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
