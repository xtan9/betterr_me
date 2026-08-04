import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
  type RunwayAdjustments,
  type RunwaySnapshotSummary,
} from "@/lib/finance/cushion";
import type {
  SuccessfulHouseholdRunwayAssessment,
} from "@/lib/finance/household-runway-assessment";
import {
  createHouseholdRunwayPlan,
  type HouseholdRunwayPlan,
} from "@/lib/finance/household-runway-plan";
import {
  migrateRunwayAnswers,
  validateCurrentRunwayAnswers,
} from "@/lib/finance/internal/runway-answer-migrations";

export type HouseholdRunwaySnapshotTrigger =
  | "completed"
  | "imported"
  | "updated";

export interface HouseholdRunwayAtomicCommitInput {
  plan: HouseholdRunwayPlan;
  adjustments: RunwayAdjustments;
  status: "completed";
  attribution: Record<string, string | undefined>;
  idempotencyKey: string;
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
      plan: HouseholdRunwayPlan;
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
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonNegativeIntegerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export class HouseholdRunwayPersistenceIntegrityError extends Error {
  readonly code = "persistence_integrity" as const;

  constructor(message: string) {
    super(`Household Runway persistence integrity error: ${message}`);
    this.name = "HouseholdRunwayPersistenceIntegrityError";
  }
}

interface HouseholdRunwayPersistenceRow {
  revision?: unknown;
  answers?: unknown;
  liquid_resources_cents?: unknown;
  monthly_essential_expenses_cents?: unknown;
  monthly_continuing_income_cents?: unknown;
  updated_at?: unknown;
}

const HOUSEHOLD_RUNWAY_PLAN_COLUMNS =
  "revision, answers, liquid_resources_cents, monthly_essential_expenses_cents, monthly_continuing_income_cents, updated_at";

function persistenceError(message: string): never {
  throw new HouseholdRunwayPersistenceIntegrityError(message);
}

function legacyCents(
  row: HouseholdRunwayPersistenceRow,
  field: keyof Pick<
    HouseholdRunwayPersistenceRow,
    | "liquid_resources_cents"
    | "monthly_essential_expenses_cents"
    | "monthly_continuing_income_cents"
  >,
): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return persistenceError(`Legacy scalar ${field} is invalid`);
  }
  return value;
}

function persistedAt(row: HouseholdRunwayPersistenceRow): Date {
  return typeof row.updated_at === "string" && !Number.isNaN(new Date(row.updated_at).getTime())
    ? new Date(row.updated_at)
    : new Date(0);
}

function reconstructLegacyInputs(
  row: HouseholdRunwayPersistenceRow,
): HouseholdRunwayAnswers {
  const answers = createDefaultRunwayAnswers(persistedAt(row));
  answers.available_cash = {
    cents: legacyCents(row, "liquid_resources_cents"),
    confidence: "confirmed",
  };
  const continuingIncome = legacyCents(row, "monthly_continuing_income_cents");
  if (continuingIncome > 0) {
    answers.other_income_sources = [
      {
        id: "retained-continuing-income",
        type: "other",
        label: "Previous continuing income",
        monthly_cents: continuingIncome,
        confidence: "needs_review",
      },
    ];
  }
  answers.mine = {
    ...answers.mine,
    employment: "unemployed",
    monthly_take_home_cents: 0,
    estimated_monthly_take_home_cents: 0,
    entered_amount_cents: 0,
    take_home_source: "user_confirmed",
    confidence: "confirmed",
  };
  const essentialExpenses = legacyCents(
    row,
    "monthly_essential_expenses_cents",
  );
  answers.expense_mode = "quick";
  answers.quick_expenses = {
    current_monthly_cents: essentialExpenses,
    interruption_monthly_cents: essentialExpenses,
    confidence: "confirmed",
  };
  return answers;
}

function mapPersistedPlan(
  value: unknown,
  options: { commitResult?: boolean } = {},
): HouseholdRunwayPlan {
  if (!isRecord(value)) return persistenceError("Plan row is not an object");
  const row = value as HouseholdRunwayPersistenceRow;
  const revision =
    !Object.prototype.hasOwnProperty.call(row, "revision")
      ? 0
      : nonNegativeIntegerValue(row.revision);
  if (revision === null) return persistenceError("Plan revision is invalid");

  let inputs: HouseholdRunwayAnswers | null;
  if (row.answers !== null && row.answers !== undefined) {
    const rawAnswers = isRecord(row.answers) ? row.answers : null;
    inputs =
      rawAnswers?.schema_version === 4
        ? validateCurrentRunwayAnswers(row.answers, false)
        : migrateRunwayAnswers(row.answers, persistedAt(row), {
            allowIncompleteRegion: true,
          });
    if (!inputs) return persistenceError("Plan answers are malformed");
  } else {
    if (options.commitResult) {
      return persistenceError("Committed Plan answers are missing");
    }
    inputs = reconstructLegacyInputs(row);
  }

  const plan = createHouseholdRunwayPlan(
    { revision, inputs },
    { allowIncompleteRegion: !options.commitResult },
  );
  return plan ?? persistenceError("Plan does not satisfy the domain contract");
}

export async function getHouseholdRunwayPlan(
  supabase: SupabaseClient,
  userId: string,
): Promise<HouseholdRunwayPlan | null> {
  const { data, error } = await supabase
    .from("finance_cushions")
    .select(HOUSEHOLD_RUNWAY_PLAN_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPersistedPlan(data) : null;
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
        answers: input.plan.inputs,
        adjustments: input.adjustments,
        status: input.status,
        attribution: input.attribution,
        idempotency_key: input.idempotencyKey,
        expected_revision: input.plan.revision,
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
    const currentRevision = nonNegativeIntegerValue(data.current_revision);
    const expectedRevision = nonNegativeIntegerValue(data.expected_revision);
    if (currentRevision === null || expectedRevision === null) {
      return persistenceError("Household Runway commit returned an invalid conflict");
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

  const revision = nonNegativeIntegerValue(data.revision);
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
    return persistenceError("Household Runway commit returned an invalid success");
  }

  const committedPlan = mapPersistedPlan(plan, { commitResult: true });
  if (committedPlan.revision !== revision) {
    return persistenceError("RPC and committed Plan revisions disagree");
  }

  return {
    success: true,
    replayed: data.type === "already-applied" || data.replayed === true,
    revision,
    plan: committedPlan,
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
