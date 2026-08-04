import { describe, expect, it } from "vitest";
import { createDefaultRunwayAnswers } from "@/lib/finance/cushion";
import {
  createHouseholdRunwayInterview,
  dispatchHouseholdRunwayInterview,
  restoreHouseholdRunwayInterview,
  type HouseholdRunwayInterviewCommand,
} from "@/lib/finance/household-runway-interview";

type CommandPayload =
  | { type: "start"; interviewId: string }
  | { type: "start_new"; interviewId: string }
  | { type: "select_country"; country: "US" | "CA" | "CN" | "TW" }
  | { type: "select_region"; region: string }
  | { type: "select_currency"; currency: "USD" | "CAD" | "CNY" | "TWD" }
  | { type: "continue" }
  | { type: "exit" }
  | { type: "discard_draft" }
  | {
      type: "history_projection_changed";
      destination: "landing" | "interview";
      interviewId?: string;
      stage?: "location" | "household" | "employment" | "myIncome" | "partnerIncome" | "otherIncome" | "cash" | "assets" | "expenses" | "reductions" | "review" | "result";
    };

const meta = (commandId: string, occurredAt = "2026-08-02T15:00:00.000Z") => ({
  commandId,
  occurredAt,
});

function dispatch(
  state: ReturnType<typeof createHouseholdRunwayInterview>,
  command: CommandPayload,
  commandId: string,
) {
  return dispatchHouseholdRunwayInterview(state, {
    ...command,
    ...meta(commandId),
  } as HouseholdRunwayInterviewCommand);
}

function dispatchAny(
  state: ReturnType<typeof createHouseholdRunwayInterview>,
  command: Record<string, unknown>,
  commandId: string,
) {
  return dispatchHouseholdRunwayInterview(state, {
    ...command,
    ...meta(commandId),
  } as unknown as HouseholdRunwayInterviewCommand);
}

function completedState() {
  const inputs = createDefaultRunwayAnswers(new Date("2026-08-02T15:00:00.000Z"));
  inputs.region = "CA";
  inputs.mine = {
    ...inputs.mine,
    employment: "unemployed",
    confidence: "confirmed",
    take_home_source: "user_confirmed",
  };
  inputs.available_cash = { cents: 3_000_000, confidence: "confirmed" };
  inputs.expense_mode = "quick";
  inputs.quick_expenses = {
    current_monthly_cents: 600_000,
    interruption_monthly_cents: 400_000,
    confidence: "confirmed",
  };
  return createHouseholdRunwayInterview({ revision: 1, inputs });
}

describe("Household Runway Interview boundary", () => {
  it("creates a fresh Not Started state with an unset location", () => {
    const state = createHouseholdRunwayInterview();

    expect(state.status).toBe("not_started");
    expect(state.renderModel).toMatchObject({
      kind: "landing",
      stage: null,
    });
    expect(state.draft.location).toEqual({
      country: null,
      region: null,
      currency: null,
      proposedCurrency: null,
      currencySelection: "unset",
    });
  });

  it("starts the Location Interview Stage with explicit event and effects", () => {
    const result = dispatch(
      createHouseholdRunwayInterview(),
      { type: "start", interviewId: "interview-1" },
      "command-start",
    );

    expect(result.state).toMatchObject({
      status: "collecting",
      stage: "location",
      renderModel: {
        kind: "location",
        country: null,
        region: null,
        currency: null,
        currencyProposal: null,
        currencySelection: "unset",
        canContinue: false,
      },
    });
    expect(result.events).toEqual([
      {
        type: "interview_started",
        commandId: "command-start",
        occurredAt: "2026-08-02T15:00:00.000Z",
        interviewId: "interview-1",
      },
    ]);
    expect(result.effects).toEqual([
      { type: "history", action: "push", destination: "interview" },
      { type: "focus", stage: "location" },
    ]);
  });

  it("proposes a country currency without selecting it and preserves an explicit choice", () => {
    const started = dispatch(
      createHouseholdRunwayInterview(),
      { type: "start", interviewId: "interview-1" },
      "command-start",
    ).state;
    const proposed = dispatch(
      started,
      { type: "select_country", country: "CA" },
      "command-country",
    );

    expect(proposed.state.draft.location).toMatchObject({
      country: "CA",
      region: null,
      currency: null,
      proposedCurrency: "CAD",
      currencySelection: "proposed",
    });
    expect(proposed.state.renderModel).toMatchObject({
      kind: "location",
      currency: null,
      currencyProposal: "CAD",
    });

    const explicitlyChosen = dispatch(
      proposed.state,
      { type: "select_currency", currency: "USD" },
      "command-currency",
    ).state;
    const changedCountry = dispatch(
      explicitlyChosen,
      { type: "select_country", country: "TW" },
      "command-country-2",
    ).state;

    expect(changedCountry.draft.location).toMatchObject({
      country: "TW",
      region: null,
      currency: "USD",
      proposedCurrency: "TWD",
      currencySelection: "explicit",
    });
  });

  it("requires an explicit location before advancing to the next applicable stage", () => {
    const started = dispatch(
      createHouseholdRunwayInterview(),
      { type: "start", interviewId: "interview-1" },
      "command-start",
    ).state;
    const country = dispatch(
      started,
      { type: "select_country", country: "US" },
      "command-country",
    ).state;
    const blocked = dispatch(
      country,
      { type: "continue" },
      "command-continue-1",
    );

    expect(blocked.state.status).toBe("collecting");
    expect(blocked.state.stage).toBe("location");
    expect(blocked.state.renderModel).toMatchObject({
      kind: "location",
      blockingIssue: { code: "region_required" },
    });
    expect(blocked.events).toEqual([
      {
        type: "validation_blocked",
        commandId: "command-continue-1",
        occurredAt: "2026-08-02T15:00:00.000Z",
        stage: "location",
        issue: { code: "region_required" },
      },
    ]);

    const region = dispatch(
      blocked.state,
      { type: "select_region", region: "CA" },
      "command-region",
    ).state;
    const stillBlocked = dispatch(
      region,
      { type: "continue" },
      "command-continue-2",
    );
    expect(stillBlocked.state.renderModel).toMatchObject({
      kind: "location",
      blockingIssue: { code: "currency_required" },
    });

    const currency = dispatch(
      stillBlocked.state,
      { type: "select_currency", currency: "USD" },
      "command-currency",
    ).state;
    const next = dispatch(currency, { type: "continue" }, "command-continue-3");

    expect(next.state).toMatchObject({
      status: "collecting",
      stage: "household",
      renderModel: {
        kind: "household",
        stage: "household",
        location: { country: "US", region: "CA", currency: "USD" },
      },
    });
    expect(next.events[0]).toMatchObject({
      type: "location_completed",
      commandId: "command-continue-3",
      occurredAt: "2026-08-02T15:00:00.000Z",
    });
    expect(next.effects).toEqual([{ type: "focus", stage: "household" }]);
  });

  it("restores supplied state and keeps transitions deterministic", () => {
    const started = dispatch(
      createHouseholdRunwayInterview(),
      { type: "start", interviewId: "interview-1" },
      "command-start",
    ).state;
    const restored = restoreHouseholdRunwayInterview(started);
    const command = {
      type: "select_country" as const,
      country: "CN" as const,
      ...meta("command-country"),
    };

    const first = dispatchHouseholdRunwayInterview(restored, command);
    const second = dispatchHouseholdRunwayInterview(restored, command);

    expect(restored).toEqual(started);
    expect(first).toEqual(second);
    expect(first.state.renderModel).toMatchObject({
      kind: "location",
      country: "CN",
      currency: null,
      currencyProposal: "CNY",
    });
  });

  it("has one render projection and treats URL history as a semantic command", () => {
    const started = dispatch(
      createHouseholdRunwayInterview(),
      { type: "start", interviewId: "interview-1" },
      "command-start",
    ).state;

    expect("render" in started).toBe(false);

    const landed = dispatch(
      started,
      { type: "history_projection_changed", destination: "landing" },
      "command-popstate-landing",
    );

    expect(landed.state).toMatchObject({
      status: "not_started",
      stage: null,
      renderModel: { kind: "landing" },
    });
    expect(landed.effects).toEqual([]);

    const returned = dispatch(
      landed.state,
      {
        type: "history_projection_changed",
        destination: "interview",
        interviewId: "interview-1",
      },
      "command-popstate-interview",
    );

    expect(returned.state.status).toBe("collecting");
    expect(returned.state.renderModel.kind).toBe("location");
    expect(returned.effects).toEqual([
      { type: "focus", stage: "location" },
    ]);
    expect(returned.effects.some((effect) => effect.type === "history")).toBe(
      false,
    );
  });

  it("preserves the resumable stage and working revision across URL projection", () => {
    let state = dispatch(
      createHouseholdRunwayInterview(),
      { type: "start", interviewId: "interview-1" },
      "command-start",
    ).state;
    state = dispatch(
      state,
      { type: "select_country", country: "US" },
      "command-country",
    ).state;
    state = dispatch(
      state,
      { type: "select_region", region: "CA" },
      "command-region",
    ).state;
    state = dispatch(
      state,
      { type: "select_currency", currency: "USD" },
      "command-currency",
    ).state;
    state = dispatch(state, { type: "continue" }, "command-continue").state;

    const landed = dispatch(
      state,
      { type: "history_projection_changed", destination: "landing" },
      "command-popstate-landing",
    );
    const returned = dispatchHouseholdRunwayInterview(landed.state, {
      type: "history_projection_changed",
      destination: "interview",
      interviewId: "new-browser-id",
      stage: "household",
      ...meta("command-popstate-interview", "2026-08-03T15:00:00.000Z"),
    });

    expect(returned.state.stage).toBe("household");
    expect(returned.state.draft.revision).toBe(landed.state.draft.revision);
    expect(returned.state.draft.interviewId).toBe(state.draft.interviewId);
    expect(returned.state.draft.startedAt).toBe(state.draft.startedAt);
    expect(returned.effects).toEqual([{ type: "focus", stage: "household" }]);
  });

  it("keeps command guards stable across incomplete, completed, and non-applicable stages", () => {
    const fresh = createHouseholdRunwayInterview();
    expect(dispatchAny(fresh, { type: "continue" }, "fresh-continue").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "invalid_stage",
    });
    expect(dispatchAny(fresh, { type: "exit" }, "fresh-exit").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "already_not_started",
    });
    expect(
      dispatchAny(fresh, { type: "select_country", country: "US" }, "fresh-country").events[0],
    ).toMatchObject({ type: "command_ignored", reason: "invalid_stage" });
    expect(
      dispatchAny(
        fresh,
        { type: "history_projection_changed", destination: "landing" },
        "fresh-landing",
      ).state,
    ).toEqual(fresh);

    let location = dispatch(
      fresh,
      { type: "start", interviewId: "guard-interview" },
      "guard-start",
    ).state;
    location = dispatch(location, { type: "select_region", region: "CA" }, "guard-region").state;
    location = dispatch(location, { type: "select_currency", currency: "USD" }, "guard-currency").state;
    const missingCountry = dispatch(location, { type: "continue" }, "missing-country");
    expect(missingCountry.events[0]).toMatchObject({
      type: "validation_blocked",
      issue: { code: "country_required" },
    });
    location = dispatch(location, { type: "select_country", country: "US" }, "guard-country").state;
    location = dispatch(location, { type: "select_region", region: "CA" }, "guard-region-repair").state;
    expect(dispatchAny(location, { type: "select_currency", currency: "USD" }, "same-currency").events[0]).toMatchObject({
      type: "currency_selected",
      currency: "USD",
    });
    expect(dispatchAny(location, { type: "back" }, "exit-from-location").state.status).toBe("not_started");
    expect(
      dispatchAny(
        location,
        {
          type: "history_projection_changed",
          destination: "interview",
          interviewId: "already-in-interview",
        },
        "already-in-interview",
      ).state,
    ).toEqual(location);

    let pendingLocation = dispatch(
      dispatch(
        dispatch(
          dispatch(
            createHouseholdRunwayInterview(),
            { type: "start", interviewId: "currency-guard" },
            "currency-start",
          ).state,
          { type: "select_country", country: "US" },
          "currency-country",
        ).state,
        { type: "select_region", region: "CA" },
        "currency-region",
      ).state,
      { type: "select_currency", currency: "USD" },
      "currency-usd",
    ).state;
    pendingLocation = dispatchAny(
      pendingLocation,
      { type: "update_answers", patch: { available_cash: { cents: 1, confidence: "confirmed" } } },
      "currency-money",
    ).state;
    pendingLocation = dispatchAny(
      pendingLocation,
      { type: "request_currency_change", currency: "CAD" },
      "currency-request",
    ).state;
    expect(dispatch(pendingLocation, { type: "continue" }, "currency-blocked").events[0]).toMatchObject({
      type: "validation_blocked",
      issue: { code: "currency_change_confirmation_required" },
    });
    expect(dispatchAny(location, { type: "retain_currency_entries" }, "no-pending").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "no_pending_currency_change",
    });

    let myIncome = dispatch(location, { type: "continue" }, "to-household").state;
    myIncome = dispatchAny(myIncome, { type: "set_household", sharesFinances: false }, "solo-household").state;
    myIncome = dispatch(myIncome, { type: "continue" }, "to-employment").state;
    myIncome = dispatchAny(myIncome, { type: "set_employment", person: "mine", employment: "employed" }, "mine-employed").state;
    myIncome = dispatch(myIncome, { type: "continue" }, "to-my-income").state;
    expect(dispatch(myIncome, { type: "continue" }, "missing-mine-income").events[0]).toMatchObject({
      type: "validation_blocked",
      issue: { code: "income_required" },
    });
    expect(dispatchAny(myIncome, { type: "set_employment", person: "partner", employment: "employed" }, "partner-not-applicable").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "partner_not_applicable",
    });
    expect(dispatchAny(myIncome, { type: "set_income", person: "partner", patch: {} }, "partner-income-not-applicable").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "partner_not_applicable",
    });
    const reactivated = dispatchAny(
      myIncome,
      { type: "set_household", sharesFinances: true },
      "reactivate-partner",
    );
    expect(reactivated.state.draft.stageStatus.partnerIncome).toBe("pending");

    const partnerIncome = restoreHouseholdRunwayInterview({
      version: 2,
      status: "collecting",
      stage: "partnerIncome",
      draft: {
        ...completedState().draft,
        answers: {
          ...completedState().draft.answers,
          shares_finances: true,
          partner: {
            ...completedState().draft.answers.mine,
            employment: "employed",
            monthly_take_home_cents: 0,
          },
        },
      },
      validationIssue: null,
    });
    expect(dispatch(partnerIncome, { type: "continue" }, "missing-partner-income").events[0]).toMatchObject({
      type: "validation_blocked",
      issue: { code: "income_required" },
    });

    const completed = completedState();
    expect(dispatchAny(completed, { type: "continue" }, "completed-continue").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "invalid_stage",
    });
    expect(dispatchAny(myIncome, { type: "edit_completed_plan" }, "edit-not-completed").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "invalid_stage",
    });
    expect(dispatchAny(completed, { type: "back" }, "edit-from-back").state.status).toBe("reviewing");
    expect(dispatchAny(completed, { type: "resume_draft", interviewId: "missing-choice" }, "resume-invalid").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "invalid_stage",
    });
    expect(dispatchAny(myIncome, { type: "request_report_download" }, "report-invalid").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "invalid_stage",
    });
    expect(dispatchAny(completed, { type: "select_scenario", scenario: "mine_stops" }, "scenario-invalid").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "scenario_unavailable",
    });
    expect(dispatchAny(completed, { type: "set_active_expense_category", category: "housing" }, "category-invalid").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "invalid_stage",
    });
    expect(dispatchAny(completed, { type: "resume_committed_plan" }, "resume-plan-invalid").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "invalid_stage",
    });
    expect(
      dispatchAny(
        { ...myIncome, stage: null } as ReturnType<typeof createHouseholdRunwayInterview>,
        { type: "back" },
        "back-no-previous",
      ).events[0],
    ).toMatchObject({ type: "command_ignored", reason: "invalid_stage" });
    expect(
      dispatchAny(
        { ...completed, status: "collecting", stage: "result" } as unknown as ReturnType<
          typeof createHouseholdRunwayInterview
        >,
        { type: "continue" },
        "continue-no-next",
      ).events[0],
    ).toMatchObject({ type: "command_ignored", reason: "invalid_stage" });
    expect(dispatchAny(myIncome, { type: "unknown" }, "unknown").events[0]).toMatchObject({
      type: "command_ignored",
      reason: "invalid_stage",
    });
  });
});
