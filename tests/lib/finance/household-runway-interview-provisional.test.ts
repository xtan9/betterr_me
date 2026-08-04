import { describe, expect, it } from "vitest";
import {
  createDefaultRunwayAnswers,
  type HouseholdRunwayAnswers,
} from "@/lib/finance/cushion";
import {
  EMPTY_HOUSEHOLD_RUNWAY_PLAN_ADJUSTMENT,
  createHouseholdRunwayInterview,
  dispatchHouseholdRunwayInterview,
  householdRunwayDraftDiffersFromPlan,
  restoreHouseholdRunwayInterview,
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

function richAnswers(): HouseholdRunwayAnswers {
  const answers = validAnswers();
  return {
    ...answers,
    shares_finances: true,
    mine: {
      ...answers.mine,
      employment: "employed",
      monthly_take_home_cents: 500_000,
      entered_amount_cents: 500_000,
      entered_as: "net",
      entered_period: "monthly",
      net_amount_cents: 500_000,
      net_period: "monthly",
      take_home_source: "user_confirmed",
      confidence: "confirmed",
    },
    partner: {
      ...answers.mine,
      employment: "employed",
      monthly_take_home_cents: 400_000,
      entered_amount_cents: 400_000,
      entered_as: "net",
      entered_period: "monthly",
      net_amount_cents: 400_000,
      net_period: "monthly",
      take_home_source: "user_confirmed",
      confidence: "confirmed",
    },
    other_income_sources: [
      {
        id: "side-income",
        type: "other",
        label: "Side income",
        monthly_cents: 25_000,
        confidence: "confirmed",
      },
    ],
    available_cash: { cents: 3_000_000, confidence: "confirmed" },
    assets: {
      liquid_investments: { cents: 500_000, confidence: "confirmed" },
      illiquid_investments: { cents: 600_000, confidence: "confirmed" },
      home_equity: { cents: 700_000, confidence: "confirmed" },
      retirement_tax_deferred: { cents: 800_000, confidence: "confirmed" },
      retirement_tax_free: { cents: 900_000, confidence: "confirmed" },
    },
    housing_tenure: "rent",
    expense_mode: "guided",
    expense_items: [
      {
        id: "rent-1",
        category: "housing",
        type: "rent",
        label: "Rent",
        current_amount_cents: 300_000,
        interruption_amount_cents: 300_000,
        frequency: "monthly",
        confidence: "confirmed",
      },
    ],
    completed_expense_categories: ["housing"],
    expense_category_modes: { housing: "itemized" },
    expense_category_subtotals: {
      utilities: {
        current_monthly_cents: 100_000,
        interruption_monthly_cents: 80_000,
        confidence: "confirmed",
      },
    },
    quick_expenses: {
      current_monthly_cents: 600_000,
      interruption_monthly_cents: 400_000,
      confidence: "confirmed",
    },
    extreme_access: {
      illiquid_investments_cents: 100_000,
      retirement_tax_deferred_cents: 200_000,
      retirement_tax_free_cents: 300_000,
    },
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

  it("counts every monetary source before asking to change currency and retains them when confirmed", () => {
    const original = createHouseholdRunwayInterview({
      revision: 7,
      inputs: richAnswers(),
    });
    const requested = dispatch(
      original,
      { type: "request_currency_change", currency: "CAD" },
      "request-cad",
    );

    expect(requested.state.draft.pendingCurrencyChange).toEqual({
      currency: "CAD",
      monetaryEntryCount: 9,
    });
    expect(requested.events[0]).toMatchObject({
      type: "currency_change_requested",
      monetaryEntryCount: 9,
    });

    const retained = dispatch(
      requested.state,
      { type: "retain_currency_entries" },
      "retain-cad",
    );
    expect(retained.state.draft.location.currency).toBe("CAD");
    expect(retained.state.draft.pendingCurrencyChange).toBeNull();
    expect(retained.state.draft.answers.available_cash.cents).toBe(3_000_000);
    expect(retained.events[0]).toMatchObject({
      type: "currency_entries_retained",
      currency: "CAD",
    });
  });

  it("applies expense, cash, income, and usable-asset adjustments to a rich Plan", () => {
    const original = createHouseholdRunwayInterview({
      revision: 7,
      inputs: richAnswers(),
    });
    const adjusted = dispatch(
      original,
      {
        type: "set_plan_adjustment",
        patch: {
          expense_reduction_cents: 100_000,
          added_cash_cents: 200_000,
          added_monthly_income_cents: 50_000,
          usable_illiquid_investments_cents: 100_000,
          usable_retirement_tax_deferred_cents: 200_000,
          usable_retirement_tax_free_cents: 300_000,
        },
      },
      "rich-adjustment",
    );
    const applied = dispatch(
      adjusted.state,
      { type: "apply_plan_adjustment" },
      "apply-rich-adjustment",
    );

    expect(applied.state.committedPlan).toEqual(original.committedPlan);
    expect(applied.state.draft.planAdjustment).toEqual(
      EMPTY_HOUSEHOLD_RUNWAY_PLAN_ADJUSTMENT,
    );
    expect(applied.state.planInputs?.available_cash).toEqual({
      cents: 3_200_000,
      confidence: "confirmed",
    });
    expect(applied.state.planInputs?.other_income_sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Applied Plan Adjustment",
          monthly_cents: 50_000,
        }),
      ]),
    );
    expect(applied.state.planInputs?.expense_items[0]).toMatchObject({
      interruption_amount_cents: 200_000,
    });
    expect(applied.state.planInputs?.extreme_access).toEqual({
      illiquid_investments_cents: 100_000,
      retirement_tax_deferred_cents: 200_000,
      retirement_tax_free_cents: 300_000,
    });
  });

  it("ignores plan-adjustment commands outside a reviewable lifecycle", () => {
    const fresh = createHouseholdRunwayInterview();
    for (const [input, id] of [
      [{ type: "set_plan_adjustment", patch: { added_cash_cents: 1 } }, "set"],
      [{ type: "reset_plan_adjustment" }, "reset"],
      [{ type: "apply_plan_adjustment" }, "apply"],
    ] as const) {
      const result = dispatch(fresh, input, `fresh-${id}`);
      expect(result.events[0]).toMatchObject({
        type: "command_ignored",
        reason: "plan_adjustment_unavailable",
      });
    }

    const incomplete = restoreHouseholdRunwayInterview({
      version: 2,
      status: "reviewing",
      stage: "review",
      draft: {},
      validationIssue: null,
    });
    const applyWithoutPlan = dispatch(
      incomplete,
      { type: "apply_plan_adjustment" },
      "apply-without-plan",
    );
    expect(applyWithoutPlan.events[0]).toMatchObject({
      type: "command_ignored",
      reason: "plan_adjustment_unavailable",
    });
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
    expect(discarded.state.operations.deviceDraft).toMatchObject({
      status: "pending",
      action: "clear",
      scope: "all",
    });
    expect(discarded.effects).toContainEqual(
      expect.objectContaining({
        type: "draft_device_clear_requested",
        scope: "all",
        sourceRevision: changed.draft.revision,
      }),
    );
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

  it("blocks persistence while a completed result still has a provisional adjustment", () => {
    const adjusted = dispatch(
      completedPlanState(),
      { type: "set_plan_adjustment", patch: { added_cash_cents: 1_000 } },
      "pending-adjustment",
    );
    const blocked = dispatch(
      adjusted.state,
      { type: "save_plan" },
      "save-with-adjustment",
      { planPersistence: "available" },
    );

    expect(blocked.effects).toEqual([]);
    expect(blocked.state.validationIssue).toEqual({
      code: "plan_adjustment_pending",
      stage: "result",
    });
    expect(blocked.events[0]).toMatchObject({ type: "validation_blocked" });
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
      adjustments: EMPTY_HOUSEHOLD_RUNWAY_PLAN_ADJUSTMENT,
      snapshotTrigger: "updated",
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
        planInputs: validAnswers(),
        assessment: requested.state.assessment ?? undefined,
        snapshot: {
          id: "snapshot-a",
          trigger: "updated",
          scenario: "current",
          months_covered: 5,
          sustainable: false,
          model_version: "4.0.0",
          created_at: occurredAt,
        },
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
      idempotencyKey: expect.any(String),
      snapshot: { id: "snapshot-a" },
    });
    expect(saved.state.operations.deviceDraft).toMatchObject({
      status: "pending",
      action: "clear",
      sourceRevision: requested.state.draft.revision,
      correlationId: "save:clear",
    });
    expect(saved.effects).toContainEqual({
      type: "draft_device_clear_requested",
      scope: "all",
      sourceRevision: requested.state.draft.revision,
      correlationId: "save:clear",
    });
  });

  it("reuses the pending commit idempotency key when a failed save is retried", () => {
    const requested = dispatch(
      completedPlanState(),
      { type: "save_plan", idempotencyKey: "save-key" },
      "save",
      { planPersistence: "available" },
    );
    const failed = dispatch(
      requested.state,
      {
        type: "plan_persistence_failed",
        sourceRevision: requested.state.draft.revision,
        correlationId: "save",
        error: "network",
      },
      "save-failed",
      { planPersistence: "available" },
    );
    const retried = dispatch(
      failed.state,
      { type: "save_plan" },
      "save-retry",
      { planPersistence: "available" },
    );
    expect(retried.effects).toContainEqual(
      expect.objectContaining({
        type: "plan_persistence_requested",
        idempotencyKey: "save-key",
        snapshotTrigger: "updated",
        expectedPlanRevision: 7,
      }),
    );
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

  it("keeps an in-flight Draft edit dirty and coalesces the next matching completion", () => {
    const changed = dispatch(
      completedPlanState(),
      { type: "set_plan_adjustment", patch: { added_cash_cents: 100_000 } },
      "adjust-1",
    );
    const first = dispatch(
      changed.state,
      { type: "synchronize_draft" },
      "sync-1",
    );
    const editedWhilePending = dispatch(
      first.state,
      { type: "set_plan_adjustment", patch: { added_cash_cents: 200_000 } },
      "adjust-2",
    );

    expect(first.state.operations.draftSynchronization).toMatchObject({
      status: "pending",
      sourceRevision: changed.state.draft.revision,
      correlationId: "sync-1",
    });
    expect(editedWhilePending.state.operations.draftSynchronization).toEqual({
      status: "dirty",
      sourceRevision: editedWhilePending.state.draft.revision,
    });

    const stale = dispatch(
      editedWhilePending.state,
      {
        type: "draft_synchronization_succeeded",
        sourceRevision: first.state.draft.revision,
        correlationId: "sync-1",
      },
      "sync-1-result",
    );
    expect(stale.state.operations.draftSynchronization).toEqual({
      status: "dirty",
      sourceRevision: editedWhilePending.state.draft.revision,
    });
    expect(stale.events[0]).toMatchObject({
      type: "command_ignored",
      reason: "operation_not_pending",
    });

    const latest = dispatch(
      stale.state,
      { type: "synchronize_draft" },
      "sync-2",
    );
    const completed = dispatch(
      latest.state,
      {
        type: "draft_synchronization_succeeded",
        sourceRevision: latest.state.draft.revision,
        correlationId: "sync-2",
      },
      "sync-2-result",
    );
    expect(completed.state.operations.draftSynchronization).toEqual({
      status: "succeeded",
      sourceRevision: latest.state.draft.revision,
      correlationId: "sync-2",
    });
  });

  it("returns typed device clear effects and ignores out-of-order device completions", () => {
    const requested = dispatch(
      completedPlanState(),
      { type: "clear_device_draft" },
      "clear-device",
    );

    expect(requested.effects).toContainEqual({
      type: "draft_device_clear_requested",
      scope: "device",
      sourceRevision: requested.state.draft.revision,
      correlationId: "clear-device",
    });

    const stale = dispatch(
      requested.state,
      {
        type: "draft_device_operation_succeeded",
        action: "clear",
        sourceRevision: requested.state.draft.revision + 1,
        correlationId: "clear-device",
      },
      "clear-device-stale",
    );
    expect(stale.state.operations.deviceDraft).toMatchObject({
      status: "pending",
      action: "clear",
    });

    const completed = dispatch(
      requested.state,
      {
        type: "draft_device_operation_succeeded",
        action: "clear",
        sourceRevision: requested.state.draft.revision,
        correlationId: "clear-device",
      },
      "clear-device-result",
    );
    expect(completed.state.operations.deviceDraft).toEqual({
      status: "succeeded",
      action: "clear",
      sourceRevision: requested.state.draft.revision,
      correlationId: "clear-device",
    });
    expect(completed.events[0]).toMatchObject({
      type: "draft_device_operation_succeeded",
      action: "clear",
    });
  });

  it("ignores persistence completions that are not pending or lose their derived inputs", () => {
    const notPending = dispatch(
      completedPlanState(),
      {
        type: "plan_persistence_succeeded",
        sourceRevision: 7,
        correlationId: "not-pending",
      },
      "not-pending-result",
    );
    expect(notPending.events[0]).toMatchObject({
      type: "command_ignored",
      reason: "operation_not_pending",
    });

    const requested = dispatch(
      completedPlanState(),
      { type: "save_plan" },
      "missing-derived-inputs",
      { planPersistence: "available" },
    );
    const broken = {
      ...requested.state,
      planInputs: null,
      assessment: null,
    } as HouseholdRunwayInterviewState;
    const invalid = dispatch(
      broken,
      {
        type: "plan_persistence_succeeded",
        sourceRevision: requested.state.draft.revision,
        correlationId: "missing-derived-inputs",
      },
      "missing-derived-inputs-result",
      { planPersistence: "available" },
    );
    expect(invalid.events[0]).toMatchObject({
      type: "command_ignored",
      reason: "invalid_stage",
    });
  });

  it("marks a matching device completion stale when the Draft changed in flight", () => {
    const requested = dispatch(
      completedPlanState(),
      { type: "clear_device_draft" },
      "clear-stale",
    );
    const changed = dispatch(
      requested.state,
      {
        type: "update_answers",
        patch: { available_cash: { cents: 3_100_000, confidence: "confirmed" } },
      },
      "edit-during-clear",
    );
    const stale = dispatch(
      changed.state,
      {
        type: "draft_device_operation_succeeded",
        action: "clear",
        sourceRevision: requested.state.draft.revision,
        correlationId: "clear-stale",
      },
      "clear-stale-result",
    );

    expect(stale.state.operations.deviceDraft).toMatchObject({
      status: "failed",
      error: "stale_result",
    });
    expect(stale.events[0]).toMatchObject({
      type: "draft_device_operation_failed",
      error: "stale_result",
    });
  });

  it("completes failed Draft sync and remember/import device operations independently", () => {
    const syncRequested = dispatch(
      completedPlanState(),
      { type: "synchronize_draft" },
      "sync-failed",
    );
    const syncFailed = dispatch(
      syncRequested.state,
      {
        type: "draft_synchronization_failed",
        sourceRevision: syncRequested.state.draft.revision,
        correlationId: "sync-failed",
        error: "storage_unavailable",
      },
      "sync-failed-result",
    );
    expect(syncFailed.state.operations.draftSynchronization).toMatchObject({
      status: "failed",
      error: "storage_unavailable",
    });

    const rememberRequested = dispatch(
      completedPlanState(),
      { type: "remember_draft" },
      "remember",
    );
    const remembered = dispatch(
      rememberRequested.state,
      {
        type: "draft_device_operation_succeeded",
        action: "remember",
        sourceRevision: rememberRequested.state.draft.revision,
        correlationId: "remember",
      },
      "remember-result",
    );
    expect(remembered.state.operations.deviceDraft).toMatchObject({
      status: "succeeded",
      action: "remember",
    });

    const importRequested = dispatch(
      completedPlanState(),
      { type: "import_draft" },
      "import",
    );
    const importFailed = dispatch(
      importRequested.state,
      {
        type: "draft_device_operation_failed",
        action: "import",
        sourceRevision: importRequested.state.draft.revision,
        correlationId: "import",
        error: "storage_unavailable",
      },
      "import-result",
    );
    expect(importFailed.state.operations.deviceDraft).toMatchObject({
      status: "failed",
      action: "import",
      error: "storage_unavailable",
    });
  });

  it("records report and analytics success, failure, and stale-result outcomes", () => {
    const reportRequested = dispatch(
      completedPlanState(),
      { type: "request_report_download" },
      "report",
    );
    const reportSucceeded = dispatch(
      reportRequested.state,
      {
        type: "report_download_succeeded",
        sourceRevision: reportRequested.state.draft.revision,
        correlationId: "report",
      },
      "report-success",
    );
    expect(reportSucceeded.state.operations.reportDownload).toMatchObject({
      status: "succeeded",
    });

    const reportFailedRequest = dispatch(
      completedPlanState(),
      { type: "request_report_download" },
      "report-failed",
    );
    const reportFailed = dispatch(
      reportFailedRequest.state,
      {
        type: "report_download_failed",
        sourceRevision: reportFailedRequest.state.draft.revision,
        correlationId: "report-failed",
        error: "download_failed",
      },
      "report-failed-result",
    );
    expect(reportFailed.state.operations.reportDownload).toMatchObject({
      status: "failed",
      error: "download_failed",
    });

    const reportStaleRequest = dispatch(
      completedPlanState(),
      { type: "request_report_download" },
      "report-stale",
    );
    const reportEdited = dispatch(
      reportStaleRequest.state,
      { type: "set_plan_adjustment", patch: { added_cash_cents: 1 } },
      "report-edit",
    );
    const reportStale = dispatch(
      reportEdited.state,
      {
        type: "report_download_succeeded",
        sourceRevision: reportStaleRequest.state.draft.revision,
        correlationId: "report-stale",
      },
      "report-stale-result",
    );
    expect(reportStale.state.operations.reportDownload).toMatchObject({
      status: "failed",
      error: "stale_result",
    });

    const analyticsRequested = dispatch(
      completedPlanState(),
      { type: "request_analytics", eventName: "completed", stage: "result" },
      "analytics-success",
    );
    const analyticsSucceeded = dispatch(
      analyticsRequested.state,
      {
        type: "analytics_succeeded",
        sourceRevision: analyticsRequested.state.draft.revision,
        correlationId: "analytics-success",
      },
      "analytics-success-result",
    );
    expect(analyticsSucceeded.state.operations.analytics).toMatchObject({
      status: "succeeded",
    });

    const analyticsFailedRequest = dispatch(
      completedPlanState(),
      { type: "request_analytics", eventName: "result_interaction" },
      "analytics-failed",
    );
    const analyticsFailed = dispatch(
      analyticsFailedRequest.state,
      {
        type: "analytics_failed",
        sourceRevision: analyticsFailedRequest.state.draft.revision,
        correlationId: "analytics-failed",
      },
      "analytics-failed-result",
    );
    expect(analyticsFailed.state.operations.analytics).toMatchObject({
      status: "failed",
      error: "analytics_failed",
    });

    const reportNotPending = dispatch(
      completedPlanState(),
      {
        type: "report_download_succeeded",
        sourceRevision: 7,
        correlationId: "missing-report",
      },
      "report-not-pending",
    );
    expect(reportNotPending.events[0]).toMatchObject({
      type: "command_ignored",
      reason: "operation_not_pending",
    });

    const analyticsNotPending = dispatch(
      completedPlanState(),
      {
        type: "analytics_succeeded",
        sourceRevision: 7,
        correlationId: "missing-analytics",
      },
      "analytics-not-pending",
    );
    expect(analyticsNotPending.events[0]).toMatchObject({
      type: "command_ignored",
      reason: "operation_not_pending",
    });
  });

  it("compares a normalized Draft with its committed Plan across lifecycle differences", () => {
    const original = completedPlanState();
    const plan = original.committedPlan!;

    expect(
      householdRunwayDraftDiffersFromPlan(original.draft, plan, "completed", "result"),
    ).toBe(false);
    expect(householdRunwayDraftDiffersFromPlan(original.draft, plan)).toBe(true);

    const adjusted = { ...original.draft, planAdjustment: { ...original.draft.planAdjustment, added_cash_cents: 1 } };
    expect(householdRunwayDraftDiffersFromPlan(adjusted, plan, "completed", "result")).toBe(true);

    const revised = { ...original.draft, revision: plan.revision + 1 };
    expect(householdRunwayDraftDiffersFromPlan(revised, plan, "completed", "result")).toBe(true);

    const changed = {
      ...original.draft,
      answers: {
        ...original.draft.answers,
        available_cash: { cents: 1, confidence: "confirmed" as const },
      },
    };
    expect(householdRunwayDraftDiffersFromPlan(changed, plan, "completed", "result")).toBe(true);

    expect(
      householdRunwayDraftDiffersFromPlan(
        { ...original.draft, location: { ...original.draft.location, region: null } },
        plan,
        "completed",
        "result",
      ),
    ).toBe(true);

    const rich = createHouseholdRunwayInterview({
      revision: 7,
      inputs: richAnswers(),
    });
    expect(
      householdRunwayDraftDiffersFromPlan(
        rich.draft,
        rich.committedPlan!,
        "completed",
        "result",
      ),
    ).toBe(false);
  });

  it("requires an explicit resume choice when a differing device Draft accompanies a Plan", () => {
    const committed = completedPlanState();
    const editedDraft = dispatch(
      committed,
      { type: "edit_completed_plan" },
      "edit-device-draft",
    ).state;
    const choice = dispatchHouseholdRunwayInterview(
      restoreHouseholdRunwayInterview({
        version: 2,
        status: "not_started",
        stage: null,
        draft: editedDraft.draft,
        committedPlan: committed.committedPlan,
        resumeChoice: {
          draftStatus: editedDraft.status,
          draftStage: editedDraft.stage,
          recommended: "draft",
        },
        validationIssue: null,
      }),
      command({ type: "resume_draft", interviewId: "resume-device" }, "choose-draft"),
    );

    expect(choice.state.renderModel).toMatchObject({
      kind: "review",
    });
    expect(choice.state.committedPlan).toEqual(committed.committedPlan);
    expect(choice.effects).toContainEqual(
      expect.objectContaining({
        type: "draft_device_import_requested",
        sourceRevision: editedDraft.draft.revision,
        correlationId: "choose-draft",
      }),
    );

    const planChoice = dispatchHouseholdRunwayInterview(
      restoreHouseholdRunwayInterview({
        version: 2,
        status: "not_started",
        stage: null,
        draft: editedDraft.draft,
        committedPlan: committed.committedPlan,
        resumeChoice: {
          draftStatus: editedDraft.status,
          draftStage: editedDraft.stage,
          recommended: "draft",
        },
        validationIssue: null,
      }),
      command({ type: "resume_committed_plan" }, "choose-plan"),
    );
    expect(planChoice.state.renderModel).toMatchObject({ kind: "stage", stage: "result" });
    expect(planChoice.state.draft.answers).toEqual(committed.committedPlan?.inputs);
    expect(planChoice.state.draft).not.toEqual(editedDraft.draft);
  });

  it("starts a collecting Interview when the chosen Draft has no saved stage yet", () => {
    const committed = completedPlanState();
    const choice = dispatchHouseholdRunwayInterview(
      restoreHouseholdRunwayInterview({
        version: 2,
        status: "not_started",
        stage: null,
        draft: committed.draft,
        committedPlan: committed.committedPlan,
        resumeChoice: {
          draftStatus: "not_started",
          draftStage: null,
          recommended: "draft",
        },
        validationIssue: null,
      }),
      command({ type: "resume_draft", interviewId: "resume-empty" }, "choose-empty"),
    );

    expect(choice.state.status).toBe("collecting");
    expect(choice.state.stage).toBe("location");
    expect(choice.state.renderModel.kind).toBe("location");
  });
});
