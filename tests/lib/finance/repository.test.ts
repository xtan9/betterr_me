import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";
import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import { createHouseholdRunwayPlan } from "@/lib/finance/household-runway-plan";
import {
  commitHouseholdRunwayPlan,
  getHouseholdRunwayPlan,
  HouseholdRunwayPersistenceIntegrityError,
  type HouseholdRunwayAtomicCommitInput,
} from "@/lib/finance/repository";

function input(): HouseholdRunwayAtomicCommitInput {
  const answers = createDefaultRunwayAnswers(
    new Date("2026-07-26T00:00:00.000Z"),
  );
  answers.region = "CA";
  answers.mine = {
    ...answers.mine,
    employment: "unemployed",
    entered_as: "net",
    take_home_source: "user_confirmed",
    confidence: "confirmed",
  };
  answers.available_cash = { cents: 3_000_000, confidence: "confirmed" };
  answers.expense_mode = "quick";
  answers.quick_expenses = {
    current_monthly_cents: 600_000,
    interruption_monthly_cents: 600_000,
    confidence: "confirmed",
  };
  const assessment = assessHouseholdRunway({ answers });
  if (!assessment.success) throw new Error("test assessment should be valid");
  const plan = createHouseholdRunwayPlan({ revision: 0, inputs: answers });
  if (!plan) throw new Error("test Plan should be valid");
  return {
    plan,
    adjustments: {
      expense_reduction_cents: 0,
      added_cash_cents: 125_000,
      added_monthly_income_cents: 0,
      expected_unconfirmed_funds_cents: 0,
      usable_illiquid_investments_cents: 0,
      usable_retirement_tax_deferred_cents: 0,
      usable_retirement_tax_free_cents: 0,
    },
    status: "completed",
    attribution: { campaign: "youtube" },
    idempotencyKey: "74a303ae-1ba3-4ab5-beb9-5317eb94c790",
    snapshotActionId: "74a303ae-1ba3-4ab5-beb9-5317eb94c790",
    snapshotTrigger: "completed",
    assessment,
  };
}

function plan(inputValue: HouseholdRunwayAtomicCommitInput, revision = 1) {
  return {
    id: "plan-a",
    user_id: "user-a",
    revision,
    answers: inputValue.plan.inputs,
    liquid_resources_cents: 3_000_000,
    monthly_essential_expenses_cents: 600_000,
    monthly_continuing_income_cents: 0,
    updated_at: "2026-07-26T00:00:00.000Z",
  };
}

function currentRow(answers: HouseholdRunwayAnswers, revision = 3) {
  return {
    revision,
    answers,
    liquid_resources_cents: 3_000_000,
    monthly_essential_expenses_cents: 600_000,
    monthly_continuing_income_cents: 0,
    updated_at: "2026-07-26T00:00:00.000Z",
  };
}

function readClient(row: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from } as unknown as SupabaseClient, from, select, eq };
}

function snapshot() {
  return {
    id: "snapshot-a",
    trigger: "completed" as const,
    scenario: "current" as const,
    months_covered: 5,
    sustainable: false,
    model_version: "4.0.0",
    created_at: "2026-07-26T00:00:00.000Z",
  };
}

describe("household runway atomic repository boundary", () => {
  it("maps a current row to the strict domain Plan and selects only required columns", async () => {
    const answers = input().plan.inputs;
    const reader = readClient(currentRow(answers));

    await expect(getHouseholdRunwayPlan(reader.client, "user-a")).resolves.toEqual({
      revision: 3,
      inputs: answers,
    });
    expect(reader.select).toHaveBeenCalledWith(
      "revision, answers, liquid_resources_cents, monthly_essential_expenses_cents, monthly_continuing_income_cents, updated_at",
    );
  });

  it("reconstructs a genuine legacy scalar row and assigns revision zero only when absent", async () => {
    const reader = readClient({
      answers: null,
      liquid_resources_cents: 900_000,
      monthly_essential_expenses_cents: 300_000,
      monthly_continuing_income_cents: 50_000,
      updated_at: "2026-07-31T00:00:00.000Z",
    });

    await expect(getHouseholdRunwayPlan(reader.client, "user-a")).resolves.toMatchObject({
      revision: 0,
      inputs: {
        schema_version: 4,
        available_cash: { cents: 900_000, confidence: "confirmed" },
        expense_mode: "quick",
        quick_expenses: {
          current_monthly_cents: 300_000,
          interruption_monthly_cents: 300_000,
        },
        other_income_sources: [{ monthly_cents: 50_000 }],
      },
    });

    const presentRevision = readClient({
      ...currentRow(input().plan.inputs, 7),
      answers: null,
    });
    await expect(getHouseholdRunwayPlan(presentRevision.client, "user-a")).resolves.toMatchObject({
      revision: 7,
    });
  });

  it.each([
    { revision: -1, answers: null },
    { revision: 1.5, answers: null },
    { revision: "1", answers: null },
    { revision: undefined, answers: null },
    { revision: 1, answers: { schema_version: 4 } },
    { revision: 1, answers: { ...input().plan.inputs, region: "" } },
  ])("rejects corrupted persisted Plan data: %j", async (corruption) => {
    const reader = readClient({
      ...currentRow(input().plan.inputs),
      ...corruption,
    });

    await expect(getHouseholdRunwayPlan(reader.client, "user-a")).rejects.toBeInstanceOf(
      HouseholdRunwayPersistenceIntegrityError,
    );
  });

  it("calls one authenticated RPC with the complete server assessment", async () => {
    const commit = input();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "committed",
        type: "success",
        revision: 1,
        replayed: false,
        plan: plan(commit),
        assessment: commit.assessment,
        snapshot: snapshot(),
        snapshots: [snapshot()],
      },
      error: null,
    });
    const supabase = { rpc } as unknown as SupabaseClient;

    const result = await commitHouseholdRunwayPlan(supabase, commit);

    expect(result).toMatchObject({
      success: true,
      replayed: false,
      revision: 1,
      snapshot: { id: "snapshot-a", trigger: "completed" },
    });
    expect(rpc).toHaveBeenCalledWith(
      "commit_household_runway_plan",
      expect.objectContaining({
        p_request: expect.objectContaining({
          answers: commit.plan.inputs,
          adjustments: commit.adjustments,
          idempotency_key: commit.idempotencyKey,
          expected_revision: commit.plan.revision,
          snapshot_action_id: commit.snapshotActionId,
          snapshot_trigger: "completed",
          assessment: commit.assessment,
        }),
      }),
    );
  });

  it("maps typed stale revision and idempotency conflicts without fallback writes", async () => {
    const commit = input();
    const staleRpc = vi.fn().mockResolvedValue({
      data: {
        status: "conflict",
        type: "stale_revision_conflict",
        expected_revision: 0,
        current_revision: 4,
      },
      error: null,
    });
    const staleClient = { rpc: staleRpc, from: vi.fn() } as unknown as SupabaseClient;
    await expect(commitHouseholdRunwayPlan(staleClient, commit)).resolves.toEqual({
      success: false,
      kind: "stale_revision",
      expectedRevision: 0,
      currentRevision: 4,
    });
    expect(staleClient.from).not.toHaveBeenCalled();

    const idempotencyRpc = vi.fn().mockResolvedValue({
      data: { status: "conflict", type: "idempotency_conflict" },
      error: null,
    });
    await expect(
      commitHouseholdRunwayPlan(
        { rpc: idempotencyRpc } as unknown as SupabaseClient,
        commit,
      ),
    ).resolves.toEqual({ success: false, kind: "idempotency_conflict" });

    const invalidTriggerRpc = vi.fn().mockResolvedValue({
      data: {
        status: "invalid",
        type: "invalid_trigger",
        message: "Snapshot trigger does not match the current Plan state",
      },
      error: null,
    });
    await expect(
      commitHouseholdRunwayPlan(
        { rpc: invalidTriggerRpc } as unknown as SupabaseClient,
        commit,
      ),
    ).resolves.toEqual({
      success: false,
      kind: "invalid_trigger",
      message: "Snapshot trigger does not match the current Plan state",
    });
  });

  it("returns an already-applied RPC outcome as the authoritative replay", async () => {
    const commit = input();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "committed",
        type: "already-applied",
        revision: 1,
        replayed: true,
        plan: plan(commit),
        assessment: commit.assessment,
        snapshot: snapshot(),
        snapshots: [snapshot()],
      },
      error: null,
    });

    await expect(
      commitHouseholdRunwayPlan(
        { rpc } as unknown as SupabaseClient,
        commit,
      ),
    ).resolves.toMatchObject({ success: true, replayed: true, revision: 1 });
  });

  it("rejects a committed RPC result when its Plan revision disagrees", async () => {
    const commit = input();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        status: "committed",
        type: "success",
        revision: 1,
        plan: plan(commit, 2),
        assessment: commit.assessment,
        snapshot: snapshot(),
        snapshots: [snapshot()],
      },
      error: null,
    });

    await expect(
      commitHouseholdRunwayPlan({ rpc } as unknown as SupabaseClient, commit),
    ).rejects.toBeInstanceOf(HouseholdRunwayPersistenceIntegrityError);
  });
});
