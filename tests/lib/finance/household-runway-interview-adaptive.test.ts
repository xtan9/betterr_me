import { describe, expect, it } from "vitest";
import {
  createHouseholdRunwayInterview,
  dispatchHouseholdRunwayInterview,
  type HouseholdRunwayInterviewCommand,
  type HouseholdRunwayInterviewCommandInput,
  type HouseholdRunwayInterviewState,
} from "@/lib/finance/internal/household-runway-interview";

const occurredAt = "2026-08-02T15:00:00.000Z";

function dispatch(
  state: HouseholdRunwayInterviewState,
  input: HouseholdRunwayInterviewCommandInput,
  commandId: string,
) {
  return dispatchHouseholdRunwayInterview(state, {
    ...input,
    commandId,
    occurredAt,
  } as HouseholdRunwayInterviewCommand);
}

function startedInterview() {
  return dispatch(
    createHouseholdRunwayInterview(),
    { type: "start", interviewId: "interview-1" },
    "start",
  ).state;
}

function atHousehold() {
  let state = startedInterview();
  state = dispatch(state, { type: "select_country", country: "US" }, "country").state;
  state = dispatch(state, { type: "select_region", region: "CA" }, "region").state;
  state = dispatch(state, { type: "select_currency", currency: "USD" }, "currency").state;
  return dispatch(state, { type: "continue" }, "location-continue").state;
}

function atEmployment(shared = false) {
  let state = atHousehold();
  state = dispatch(
    state,
    { type: "set_household", sharesFinances: shared },
    "household-choice",
  ).state;
  return dispatch(state, { type: "continue" }, "household-continue").state;
}

describe("adaptive Household Runway Interview stages", () => {
  it("derives only applicable income stages and preserves answers when moving backward", () => {
    let state = atEmployment(false);
    expect(state.stage).toBe("employment");

    state = dispatch(
      state,
      { type: "set_employment", person: "mine", employment: "employed" },
      "employment-choice",
    ).state;
    state = dispatch(state, { type: "continue" }, "employment-continue").state;
    expect(state.stage).toBe("myIncome");

    state = dispatch(
      state,
      {
        type: "set_income",
        person: "mine",
        patch: { entered_as: "net", net_amount_cents: 420_000, net_period: "monthly" },
      },
      "income-entry",
    ).state;
    state = dispatch(state, { type: "continue" }, "income-continue").state;
    expect(state.stage).toBe("otherIncome");
    expect(state.draft.stageStatus.partnerIncome).toBe("inapplicable");
    expect(state.draft.answers.mine.monthly_take_home_cents).toBe(420_000);

    state = dispatch(state, { type: "back" }, "back-to-income").state;
    expect(state.stage).toBe("myIncome");
    expect(state.draft.answers.mine.monthly_take_home_cents).toBe(420_000);
  });

  it("clears partner answers and unavailable scenario selections when shared finances become solo", () => {
    let state = atEmployment(true);
    state = dispatch(
      state,
      { type: "set_employment", person: "mine", employment: "employed" },
      "mine-employment",
    ).state;
    state = dispatch(
      state,
      { type: "set_employment", person: "partner", employment: "employed" },
      "partner-employment",
    ).state;
    state = dispatch(state, { type: "continue" }, "employment-continue").state;
    state = dispatch(
      state,
      {
        type: "set_income",
        person: "mine",
        patch: { entered_as: "net", net_amount_cents: 300_000, net_period: "monthly" },
      },
      "mine-income",
    ).state;
    state = dispatch(
      state,
      {
        type: "set_income",
        person: "partner",
        patch: { entered_as: "net", net_amount_cents: 250_000, net_period: "monthly" },
      },
      "partner-income",
    ).state;
    state = dispatch(
      state,
      { type: "select_scenario", scenario: "partner_stops" },
      "scenario",
    ).state;

    const changed = dispatch(
      state,
      { type: "set_household", sharesFinances: false },
      "household-solo",
    );

    expect(changed.state.draft.answers.partner).toBeNull();
    expect(changed.state.draft.stageStatus.partnerIncome).toBe("inapplicable");
    expect(changed.state.draft.selectedScenario).toBe("mine_stops");
    expect(changed.state.draft.availableScenarios.map((item) => item.id)).toEqual([
      "mine_stops",
    ]);
    expect(changed.events.some((event) => event.type === "answers_cleared")).toBe(true);
  });

  it("clears an income answer when employment makes its stage inapplicable", () => {
    let state = atEmployment(false);
    state = dispatch(
      state,
      { type: "set_employment", person: "mine", employment: "employed" },
      "employment",
    ).state;
    state = dispatch(state, { type: "continue" }, "employment-next").state;
    state = dispatch(
      state,
      {
        type: "set_income",
        person: "mine",
        patch: { entered_as: "net", net_amount_cents: 100_000, net_period: "monthly" },
      },
      "income",
    ).state;
    const changed = dispatch(
      state,
      { type: "set_employment", person: "mine", employment: "unemployed" },
      "employment-unemployed",
    );

    expect(changed.state.draft.answers.mine.monthly_take_home_cents).toBe(0);
    expect(changed.state.draft.answers.mine.net_amount_cents).toBe(0);
    expect(changed.state.draft.stageStatus.myIncome).toBe("inapplicable");
    expect(changed.state.validationIssue).toBeNull();
  });

  it("distinguishes an explicit other-income skip from automatic inapplicability and clears values", () => {
    let state = atEmployment(false);
    state = dispatch(
      state,
      { type: "set_employment", person: "mine", employment: "unemployed" },
      "employment-unemployed",
    ).state;
    state = dispatch(state, { type: "continue" }, "employment-next").state;
    expect(state.stage).toBe("otherIncome");
    state = dispatch(
      state,
      {
        type: "set_other_income_sources",
        sources: [
          {
            id: "rental-1",
            type: "rental_net",
            monthly_cents: 75_000,
            confidence: "confirmed",
          },
        ],
      },
      "other-income-entry",
    ).state;

    const skipped = dispatch(state, { type: "skip" }, "other-income-skip");
    expect(skipped.state.draft.answers.other_income_sources).toEqual([]);
    expect(skipped.state.draft.stageStatus.otherIncome).toBe("skipped");
    expect(skipped.events).toContainEqual(
      expect.objectContaining({ type: "stage_skipped", stage: "otherIncome" }),
    );
    expect(skipped.state.stage).toBe("cash");
  });

  it("recomputes estimated take-home for a jurisdiction change but retains confirmed take-home", () => {
    let state = atEmployment(false);
    state = dispatch(
      state,
      { type: "set_employment", person: "mine", employment: "employed" },
      "employment",
    ).state;
    state = dispatch(state, { type: "continue" }, "employment-next").state;
    state = dispatch(
      state,
      {
          type: "set_income",
          person: "mine",
          patch: {
            entered_as: "gross",
          gross_amount_cents: 12_000_000,
            gross_period: "annual",
          },
      },
      "gross-income",
    ).state;
    const estimatedBefore = state.draft.answers.mine.monthly_take_home_cents;

    state = dispatch(state, { type: "back" }, "back-employment").state;
    state = dispatch(state, { type: "back" }, "back-household").state;
    state = dispatch(state, { type: "back" }, "back-location").state;
    const changedRegion = dispatch(
      state,
      { type: "select_region", region: "TX" },
      "region-tx",
    ).state;
    expect(changedRegion.draft.answers.mine.monthly_take_home_cents).not.toBe(
      estimatedBefore,
    );

    const confirmed = dispatch(
      changedRegion,
      {
        type: "set_income",
        person: "mine",
        patch: {
          take_home_source: "user_confirmed",
          monthly_take_home_cents: 500_000,
          confidence: "confirmed",
        },
      },
      "confirm-take-home",
    ).state;
    const retained = dispatch(
      confirmed,
      { type: "select_region", region: "NY" },
      "region-ny",
    ).state;
    expect(retained.draft.answers.mine.monthly_take_home_cents).toBe(500_000);
    expect(retained.draft.answers.mine.estimated_monthly_take_home_cents).not.toBe(
      confirmed.draft.answers.mine.estimated_monthly_take_home_cents,
    );
  });

  it("requires an explicit reset-or-retain command before changing currency after monetary entry", () => {
    let state = atEmployment(false);
    state = dispatch(
      state,
      { type: "set_employment", person: "mine", employment: "employed" },
      "employment",
    ).state;
    state = dispatch(state, { type: "continue" }, "employment-next").state;
    state = dispatch(
      state,
      {
        type: "set_income",
        person: "mine",
        patch: { entered_as: "net", net_amount_cents: 500_000, net_period: "monthly" },
      },
      "income",
    ).state;
    state = dispatch(state, { type: "back" }, "back-employment").state;
    state = dispatch(state, { type: "back" }, "back-household").state;
    state = dispatch(state, { type: "back" }, "back-location").state;

    const pending = dispatch(
      state,
      { type: "request_currency_change", currency: "CAD" },
      "currency-request",
    );
    expect(pending.state.draft.location.currency).toBe("USD");
    expect(pending.state.draft.pendingCurrencyChange).toEqual({
      currency: "CAD",
      monetaryEntryCount: expect.any(Number),
    });
    expect(pending.state.validationIssue?.code).toBe(
      "currency_change_confirmation_required",
    );

    const retained = dispatch(
      pending.state,
      { type: "retain_currency_entries" },
      "currency-retain",
    ).state;
    expect(retained.draft.location.currency).toBe("CAD");
    expect(retained.draft.answers.mine.net_amount_cents).toBe(500_000);
    expect(retained.draft.pendingCurrencyChange).toBeNull();

    const resetPending = dispatch(
      retained,
      { type: "request_currency_change", currency: "CNY" },
      "currency-request-reset",
    ).state;
    const reset = dispatch(
      resetPending,
      { type: "reset_currency_entries" },
      "currency-reset",
    ).state;
    expect(reset.draft.location.currency).toBe("CNY");
    expect(reset.draft.answers.mine.net_amount_cents).toBe(0);
    expect(reset.draft.answers.other_income_sources).toEqual([]);
    expect(reset.draft.pendingCurrencyChange).toBeNull();
  });

  it("returns stable validation codes from the applicable stage", () => {
    let state = atEmployment(false);
    state = dispatch(
      state,
      { type: "set_employment", person: "mine", employment: "employed" },
      "employment",
    ).state;
    state = dispatch(state, { type: "continue" }, "employment-next").state;

    const blocked = dispatch(state, { type: "continue" }, "income-validation");

    expect(blocked.state.stage).toBe("myIncome");
    expect(blocked.state.validationIssue).toEqual({ code: "income_required" });
    expect(blocked.state.draft.validationIssues.myIncome).toEqual({
      code: "income_required",
    });
    expect(blocked.events).toContainEqual(
      expect.objectContaining({
        type: "validation_blocked",
        stage: "myIncome",
        issue: { code: "income_required" },
      }),
    );
  });
});
