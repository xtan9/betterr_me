import { describe, expect, it } from "vitest";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";
import {
  EMPTY_HOUSEHOLD_RUNWAY_PLAN_ADJUSTMENT,
  createHouseholdRunwayInterview,
  dispatchHouseholdRunwayInterview,
  type HouseholdRunwayInterviewCommand,
  type HouseholdRunwayInterviewCommandInput,
  type HouseholdRunwayInterviewState,
} from "@/lib/finance/household-runway-interview";

const occurredAt = "2026-08-02T15:00:00.000Z";

function validAnswers(): HouseholdRunwayAnswers {
  const defaults = createDefaultRunwayAnswers(new Date(occurredAt));
  return {
    ...defaults,
    region: "CA",
    mine: {
      ...defaults.mine,
      employment: "unemployed",
      confidence: "confirmed",
      take_home_source: "user_confirmed",
    },
    available_cash: { cents: 3_000_000, confidence: "confirmed" },
    expense_mode: "quick",
    quick_expenses: {
      current_monthly_cents: 600_000,
      interruption_monthly_cents: 400_000,
      confidence: "confirmed",
    },
    updated_at: occurredAt,
  };
}

function command(
  input: HouseholdRunwayInterviewCommandInput,
  commandId: string,
): HouseholdRunwayInterviewCommand {
  return { ...input, commandId, occurredAt } as HouseholdRunwayInterviewCommand;
}

function dispatch(
  state: HouseholdRunwayInterviewState,
  input: HouseholdRunwayInterviewCommandInput,
  commandId: string,
  capabilities?: { planPersistence?: "available" | "unavailable" },
) {
  return dispatchHouseholdRunwayInterview(
    state,
    command(input, commandId),
    capabilities,
  );
}

function completedPlanState() {
  return createHouseholdRunwayInterview({
    revision: 7,
    inputs: validAnswers(),
  });
}

describe("provisional Plan Adjustment and completed-Plan lifecycle", () => {
  it("previews an adjustment without changing the baseline or Scenario selection", () => {
    const original = completedPlanState();
    const baseline = original.assessment;
    const result = dispatch(
      original,
      { type: "set_plan_adjustment", patch: { added_cash_cents: 1_000_000 } },
      "adjust",
    );

    expect(result.state.committedPlan?.inputs.available_cash.cents).toBe(3_000_000);
    expect(result.state.planInputs?.available_cash.cents).toBe(3_000_000);
    expect(result.state.draft.planAdjustment).toMatchObject({
      ...EMPTY_HOUSEHOLD_RUNWAY_PLAN_ADJUSTMENT,
      added_cash_cents: 1_000_000,
    });
    expect(result.state.draft.selectedScenario).toBe(
      original.draft.selectedScenario,
    );
    expect(result.state.assessment?.firstScenario.baseline.starting_resources_cents).toBe(
      baseline?.firstScenario.baseline.starting_resources_cents,
    );
    expect(result.state.assessment?.firstScenario.adjusted.starting_resources_cents).toBe(
      (baseline?.firstScenario.adjusted.starting_resources_cents ?? 0) + 1_000_000,
    );
  });

  it("Reset clears only the provisional overlay and restores the baseline assessment", () => {
    const original = completedPlanState();
    const adjusted = dispatch(
      original,
      { type: "set_plan_adjustment", patch: { added_cash_cents: 1_000_000 } },
      "adjust",
    ).state;
    const reset = dispatch(adjusted, { type: "reset_plan_adjustment" }, "reset");

    expect(reset.state.draft.planAdjustment).toEqual(
      EMPTY_HOUSEHOLD_RUNWAY_PLAN_ADJUSTMENT,
    );
    expect(reset.state.committedPlan).toEqual(original.committedPlan);
    expect(reset.state.assessment).toEqual(original.assessment);
    expect(reset.events[0]).toMatchObject({ type: "plan_adjustment_reset" });
  });

  it("Apply changes the working Draft inputs, clears the overlay, and leaves the committed Plan untouched", () => {
    const original = completedPlanState();
    const adjusted = dispatch(
      original,
      {
        type: "set_plan_adjustment",
        patch: { added_cash_cents: 1_000_000, added_monthly_income_cents: 50_000 },
      },
      "adjust",
    ).state;
    const applied = dispatch(adjusted, { type: "apply_plan_adjustment" }, "apply");

    expect(applied.state.committedPlan).toEqual(original.committedPlan);
    expect(applied.state.draft.planAdjustment).toEqual(
      EMPTY_HOUSEHOLD_RUNWAY_PLAN_ADJUSTMENT,
    );
    expect(applied.state.planInputs?.available_cash.cents).toBe(4_000_000);
    expect(applied.state.planInputs?.other_income_sources).toHaveLength(1);
    expect(applied.state.operations.planPersistence).toMatchObject({
      status: "dirty",
      sourceRevision: applied.state.draft.revision,
    });
    expect(applied.events[0]).toMatchObject({ type: "plan_adjustment_applied" });
  });

  it("edits a completed Plan as a new Draft and gives Discard the committed Plan back", () => {
    const original = completedPlanState();
    const editing = dispatch(original, { type: "edit_completed_plan" }, "edit");

    expect(editing.state.status).toBe("reviewing");
    expect(editing.state.stage).toBe("review");
    expect(editing.state.committedPlan).toEqual(original.committedPlan);
    expect(editing.state.draft.revision).toBeGreaterThan(original.draft.revision);
    expect(editing.state.draft.stageStatus.review).toBe("pending");
    expect(editing.state.draft.stageStatus.result).not.toBe("completed");

    const changed = dispatch(
      editing.state,
      { type: "update_answers", patch: { available_cash: { cents: 500_000, confidence: "confirmed" } } },
      "change",
    ).state;
    const discarded = dispatch(changed, { type: "discard_draft" }, "discard");

    expect(discarded.state.status).toBe("completed");
    expect(discarded.state.stage).toBe("result");
    expect(discarded.state.draft.answers.available_cash.cents).toBe(3_000_000);
    expect(discarded.state.committedPlan).toEqual(original.committedPlan);
    expect(discarded.effects).toContainEqual({
      type: "history",
      action: "replace",
      destination: "interview",
    });
  });

  it("does not save a completed Plan while its edited Draft still needs review", () => {
    const editing = dispatch(
      completedPlanState(),
      { type: "edit_completed_plan" },
      "edit",
    );
    const result = dispatch(
      editing.state,
      { type: "save_plan" },
      "save-before-review",
      { planPersistence: "available" },
    );

    expect(result.effects).toEqual([]);
    expect(result.events[0]).toMatchObject({
      type: "command_ignored",
      reason: "invalid_stage",
    });
  });

  it("Start New Interview keeps the committed Plan while Discard without one returns to landing", () => {
    const original = completedPlanState();
    const fresh = dispatch(
      original,
      { type: "start_new", interviewId: "new-interview" },
      "start-new",
    );

    expect(fresh.state.status).toBe("collecting");
    expect(fresh.state.stage).toBe("location");
    expect(fresh.state.committedPlan).toEqual(original.committedPlan);
    expect(fresh.state.draft.answers.available_cash.cents).toBe(0);

    const landing = dispatch(
      createHouseholdRunwayInterview(),
      { type: "discard_draft" },
      "discard-empty",
    );
    expect(landing.state.status).toBe("not_started");
    expect(landing.state.committedPlan).toBeNull();
  });
});

describe("typed operation-local effects", () => {
  it("requires Authentication Required for unavailable Plan persistence", () => {
    const result = dispatch(completedPlanState(), { type: "save_plan" }, "save");

    expect(result.effects).toEqual([]);
    expect(result.state.operations.planPersistence).toMatchObject({
      status: "failed",
      error: "authentication_required",
      sourceRevision: result.state.draft.revision,
    });
    expect(result.events[0]).toMatchObject({
      type: "plan_persistence_failed",
      error: "authentication_required",
    });
  });

  it("carries source revision and correlation IDs and rejects stale persistence results", () => {
    const requested = dispatch(
      completedPlanState(),
      { type: "save_plan", idempotencyKey: "save-key" },
      "save",
      { planPersistence: "available" },
    );
    const effect = requested.effects.find(
      (item) => item.type === "plan_persistence_requested",
    );
    expect(effect).toMatchObject({
      type: "plan_persistence_requested",
      sourceRevision: requested.state.draft.revision,
      correlationId: "save",
      idempotencyKey: "save-key",
      expectedPlanRevision: 7,
    });

    const changed = dispatch(
      requested.state,
      { type: "set_plan_adjustment", patch: { added_cash_cents: 1_000_000 } },
      "adjust-after-save",
    ).state;
    const stale = dispatch(
      changed,
      {
        type: "plan_persistence_succeeded",
        sourceRevision: requested.state.draft.revision,
        correlationId: "save",
      },
      "save-result",
      { planPersistence: "available" },
    );

    expect(stale.state.committedPlan?.revision).toBe(7);
    expect(stale.state.operations.planPersistence).toMatchObject({
      status: "failed",
      error: "stale_result",
    });
    expect(stale.events[0]).toMatchObject({
      type: "plan_persistence_failed",
      error: "stale_result",
    });
  });

  it("commits an explicit Plan save without borrowing the Draft-sync operation identity", () => {
    const requested = dispatch(
      completedPlanState(),
      { type: "save_plan" },
      "save",
      { planPersistence: "available" },
    );
    const saved = dispatch(
      requested.state,
      {
        type: "plan_persistence_succeeded",
        sourceRevision: requested.state.draft.revision,
        correlationId: "save",
        planRevision: 8,
      },
      "save-result",
      { planPersistence: "available" },
    );

    expect(saved.state.status).toBe("completed");
    expect(saved.state.committedPlan?.revision).toBe(8);
    expect(saved.state.draft.planAdjustment).toEqual(
      EMPTY_HOUSEHOLD_RUNWAY_PLAN_ADJUSTMENT,
    );
    expect(saved.state.operations.draftSynchronization).toEqual({
      status: "idle",
    });
    expect(saved.state.operations.planPersistence).toMatchObject({
      status: "succeeded",
      correlationId: "save",
      planRevision: 8,
    });
  });

  it("keeps draft sync, report download, and analytics effects independently typed", () => {
    const changed = dispatch(
      completedPlanState(),
      { type: "set_plan_adjustment", patch: { added_cash_cents: 100_000 } },
      "adjust",
    );
    const sync = dispatch(changed.state, { type: "synchronize_draft" }, "sync");
    expect(sync.effects[0]).toMatchObject({
      type: "draft_sync_requested",
      sourceRevision: changed.state.draft.revision,
      correlationId: "sync",
    });

    const report = dispatch(
      changed.state,
      { type: "request_report_download" },
      "download",
    );
    expect(report.effects[0]).toMatchObject({
      type: "report_download_requested",
      sourceRevision: changed.state.draft.revision,
      correlationId: "download",
    });

    const analytics = dispatch(
      changed.state,
      { type: "request_analytics", eventName: "result_interaction", stage: "result" },
      "analytics",
    );
    expect(analytics.effects[0]).toMatchObject({
      type: "analytics_requested",
      sourceRevision: changed.state.draft.revision,
      correlationId: "analytics",
    });
  });
});
