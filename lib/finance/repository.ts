import type { SupabaseClient } from "@supabase/supabase-js";

import {
  FINANCE_CUSHION_COLUMNS,
  toFinanceCushionView,
  type FinanceCushionRecord,
  type FinanceCushionView,
  type RunwayAdjustments,
  type RunwaySnapshotSummary,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";
import type {
  SuccessfulHouseholdRunwayAssessment,
} from "@/lib/finance/household-runway-assessment";

export type HouseholdRunwaySnapshotTrigger =
  | "completed"
  | "imported"
  | "updated";

export interface HouseholdRunwayAtomicCommitInput {
  answers: HouseholdRunwayAnswers;
  adjustments: RunwayAdjustments;
  status: "completed";
  attribution: Record<string, string | undefined>;
  idempotencyKey: string;
  expectedRevision: number;
  snapshotActionId: string;
  snapshotTrigger: HouseholdRunwaySnapshotTrigger;
  /** Derived by the server before entering this persistence boundary. */
  assessment: SuccessfulHouseholdRunwayAssessment;
}

export type HouseholdRunwayAtomicCommitResult =
  | {
      success: true;
      replayed: boolean;
      revision: number;
      plan: FinanceCushionView;
      assessment: SuccessfulHouseholdRunwayAssessment;
      snapshot: RunwaySnapshotSummary;
      snapshots: RunwaySnapshotSummary[];
    }
  | {
      success: false;
      kind: "stale_revision";
      expectedRevision: number;
      currentRevision: number;
    }
  | {
      success: false;
      kind: "idempotency_conflict";
    }
  | {
      success: false;
      kind: "invalid_trigger";
      message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function integerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

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

/**
 * The only Household Runway Plan write authority. The database function owns
 * the transaction and derives ownership from auth.uid(); this adapter never
 * exposes the database client to the Interview boundary.
 */
export async function commitHouseholdRunwayPlan(
  supabase: SupabaseClient,
  input: HouseholdRunwayAtomicCommitInput,
): Promise<HouseholdRunwayAtomicCommitResult> {
  const { data, error } = await supabase.rpc(
    "commit_household_runway_plan",
    {
      p_request: {
        answers: input.answers,
        adjustments: input.adjustments,
        status: input.status,
        attribution: input.attribution,
        idempotency_key: input.idempotencyKey,
        expected_revision: input.expectedRevision,
        snapshot_action_id: input.snapshotActionId,
        snapshot_trigger: input.snapshotTrigger,
        assessment: input.assessment,
      },
    },
  );
  if (error) throw error;
  if (!isRecord(data)) {
    throw new Error("Household Runway commit returned an invalid outcome");
  }

  if (data.status === "conflict" && data.type === "stale_revision_conflict") {
    const currentRevision = integerValue(data.current_revision);
    const expectedRevision = integerValue(data.expected_revision);
    if (currentRevision === null || expectedRevision === null) {
      throw new Error("Household Runway commit returned an invalid conflict");
    }
    return {
      success: false,
      kind: "stale_revision",
      currentRevision,
      expectedRevision,
    };
  }

  if (data.status === "conflict" && data.type === "idempotency_conflict") {
    return { success: false, kind: "idempotency_conflict" };
  }

  if (data.status === "invalid" && data.type === "invalid_trigger") {
    return {
      success: false,
      kind: "invalid_trigger",
      message:
        typeof data.message === "string"
          ? data.message
          : "Snapshot trigger does not match the current Plan state",
    };
  }

  const revision = integerValue(data.revision);
  const plan = data.plan;
  const assessment = data.assessment;
  const snapshot = data.snapshot;
  const snapshots = data.snapshots;
  if (
    data.status !== "committed" ||
    revision === null ||
    !isRecord(plan) ||
    !isRecord(assessment) ||
    !isRecord(snapshot) ||
    !Array.isArray(snapshots)
  ) {
    throw new Error("Household Runway commit returned an invalid success");
  }

  return {
    success: true,
    replayed: data.type === "already-applied" || data.replayed === true,
    revision,
    plan: toFinanceCushionView(plan as unknown as FinanceCushionRecord),
    assessment: assessment as SuccessfulHouseholdRunwayAssessment,
    snapshot: snapshot as unknown as RunwaySnapshotSummary,
    snapshots: snapshots as unknown as RunwaySnapshotSummary[],
  };
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
