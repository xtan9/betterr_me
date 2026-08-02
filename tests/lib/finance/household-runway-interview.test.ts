import { describe, expect, it } from "vitest";
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
});
