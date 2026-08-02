import type {
  RunwayCountry,
  RunwayCurrency,
} from "@/lib/finance/cushion";

/**
 * The first framework-independent slice of the Household Runway Interview.
 *
 * This module deliberately owns no browser, React, clock, random, storage, or
 * network concerns. Adapters create command metadata and interpret the typed
 * effects returned by `dispatchHouseholdRunwayInterview`.
 */

export const HOUSEHOLD_RUNWAY_INTERVIEW_VERSION = 1 as const;

export const HOUSEHOLD_RUNWAY_COUNTRIES = ["US", "CA", "CN", "TW"] as const;
export const HOUSEHOLD_RUNWAY_CURRENCIES = [
  "USD",
  "CAD",
  "CNY",
  "TWD",
] as const;

type Country = (typeof HOUSEHOLD_RUNWAY_COUNTRIES)[number];
type Currency = (typeof HOUSEHOLD_RUNWAY_CURRENCIES)[number];

const CURRENCY_FOR_COUNTRY: Record<Country, Currency> = {
  US: "USD",
  CA: "CAD",
  CN: "CNY",
  TW: "TWD",
};

export type HouseholdRunwayInterviewStage = "location" | "household";
export type HouseholdRunwayInterviewStatus = "not_started" | "collecting";
export type HouseholdRunwayCurrencySelection =
  | "unset"
  | "proposed"
  | "explicit";

export interface HouseholdRunwayInterviewLocation {
  country: RunwayCountry | null;
  region: string | null;
  /** The currency a person explicitly selected; proposals remain null here. */
  currency: RunwayCurrency | null;
  proposedCurrency: RunwayCurrency | null;
  currencySelection: HouseholdRunwayCurrencySelection;
}

export interface HouseholdRunwayInterviewDraft {
  revision: number;
  interviewId: string | null;
  startedAt: string | null;
  location: HouseholdRunwayInterviewLocation;
}

export type HouseholdRunwayValidationIssueCode =
  | "country_required"
  | "region_required"
  | "currency_required";

export interface HouseholdRunwayValidationIssue {
  code: HouseholdRunwayValidationIssueCode;
}

export type HouseholdRunwayInterviewRenderModel =
  | HouseholdRunwayLandingRenderModel
  | HouseholdRunwayLocationRenderModel
  | HouseholdRunwayHouseholdRenderModel;

export interface HouseholdRunwayLandingRenderModel {
  kind: "landing";
  stage: null;
  location: null;
}

export interface HouseholdRunwayLocationRenderModel {
  kind: "location";
  stage: "location";
  country: RunwayCountry | null;
  region: string | null;
  currency: RunwayCurrency | null;
  currencyProposal: RunwayCurrency | null;
  currencySelection: HouseholdRunwayCurrencySelection;
  availableCountries: readonly RunwayCountry[];
  availableCurrencies: readonly RunwayCurrency[];
  canContinue: boolean;
  blockingIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayHouseholdRenderModel {
  kind: "household";
  stage: "household";
  location: {
    country: RunwayCountry | null;
    region: string | null;
    currency: RunwayCurrency | null;
  };
}

interface HouseholdRunwayInterviewStateBase {
  version: typeof HOUSEHOLD_RUNWAY_INTERVIEW_VERSION;
  status: HouseholdRunwayInterviewStatus;
  stage: HouseholdRunwayInterviewStage | null;
  draft: HouseholdRunwayInterviewDraft;
  validationIssue: HouseholdRunwayValidationIssue | null;
  renderModel: HouseholdRunwayInterviewRenderModel;
  /** Alias retained as a convenient public boundary vocabulary. */
  render: HouseholdRunwayInterviewRenderModel;
}

export interface HouseholdRunwayNotStartedState
  extends HouseholdRunwayInterviewStateBase {
  status: "not_started";
  stage: null;
  renderModel: HouseholdRunwayLandingRenderModel;
  render: HouseholdRunwayLandingRenderModel;
}

export interface HouseholdRunwayCollectingState
  extends HouseholdRunwayInterviewStateBase {
  status: "collecting";
  stage: HouseholdRunwayInterviewStage;
  renderModel:
    | HouseholdRunwayLocationRenderModel
    | HouseholdRunwayHouseholdRenderModel;
  render:
    | HouseholdRunwayLocationRenderModel
    | HouseholdRunwayHouseholdRenderModel;
}

export type HouseholdRunwayInterviewState =
  | HouseholdRunwayNotStartedState
  | HouseholdRunwayCollectingState;

export interface HouseholdRunwayInterviewSnapshot {
  version: typeof HOUSEHOLD_RUNWAY_INTERVIEW_VERSION;
  status: HouseholdRunwayInterviewStatus;
  stage: HouseholdRunwayInterviewStage | null;
  draft: HouseholdRunwayInterviewDraft;
  validationIssue: HouseholdRunwayValidationIssue | null;
}

export interface HouseholdRunwayInterviewCommandMetadata {
  commandId: string;
  occurredAt: string;
}

export type HouseholdRunwayInterviewCommandInput =
  | {
      type: "start";
      interviewId: string;
    }
  | {
      type: "start_new";
      interviewId: string;
    }
  | {
      type: "select_country";
      country: RunwayCountry;
    }
  | {
      type: "select_region";
      region: string;
    }
  | {
      type: "select_currency";
      currency: RunwayCurrency;
    }
  | {
      type: "continue";
    }
  | {
      type: "exit";
    }
  | {
      type: "discard_draft";
    };

export type HouseholdRunwayInterviewCommand =
  HouseholdRunwayInterviewCommandMetadata &
    HouseholdRunwayInterviewCommandInput;

export type HouseholdRunwayInterviewEvent =
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "interview_started";
      interviewId: string;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "interview_restarted";
      interviewId: string;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "country_selected";
      country: RunwayCountry;
      proposedCurrency: RunwayCurrency;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "region_selected";
      region: string | null;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "currency_selected";
      currency: RunwayCurrency;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "validation_blocked";
      stage: HouseholdRunwayInterviewStage;
      issue: HouseholdRunwayValidationIssue;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "location_completed";
      country: RunwayCountry;
      region: string;
      currency: RunwayCurrency;
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "interview_exited";
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "draft_discarded";
    })
  | (HouseholdRunwayInterviewCommandMetadata & {
      type: "command_ignored";
      command: HouseholdRunwayInterviewCommand["type"];
      reason: "invalid_stage" | "already_started" | "already_not_started";
    });

export type HouseholdRunwayInterviewEffect =
  | {
      type: "history";
      action: "push" | "replace" | "back";
      destination: "landing" | "interview";
    }
  | {
      type: "focus";
      stage: HouseholdRunwayInterviewStage;
    };

export interface HouseholdRunwayInterviewTransition {
  state: HouseholdRunwayInterviewState;
  /** Alias for consumers that name the returned state by transition direction. */
  nextState: HouseholdRunwayInterviewState;
  renderModel: HouseholdRunwayInterviewRenderModel;
  events: readonly HouseholdRunwayInterviewEvent[];
  effects: readonly HouseholdRunwayInterviewEffect[];
}

function freshDraft(): HouseholdRunwayInterviewDraft {
  return {
    revision: 0,
    interviewId: null,
    startedAt: null,
    location: {
      country: null,
      region: null,
      currency: null,
      proposedCurrency: null,
      currencySelection: "unset",
    },
  };
}

function isCountry(value: unknown): value is RunwayCountry {
  return (
    typeof value === "string" &&
    (HOUSEHOLD_RUNWAY_COUNTRIES as readonly string[]).includes(value)
  );
}

function isCurrency(value: unknown): value is RunwayCurrency {
  return (
    typeof value === "string" &&
    (HOUSEHOLD_RUNWAY_CURRENCIES as readonly string[]).includes(value)
  );
}

function proposedCurrencyFor(country: RunwayCountry | null) {
  return country ? CURRENCY_FOR_COUNTRY[country] : null;
}

function normalizeLocation(
  input: HouseholdRunwayInterviewLocation,
): HouseholdRunwayInterviewLocation {
  const country = isCountry(input.country) ? input.country : null;
  const countryProposal = proposedCurrencyFor(country);
  const proposedCurrency = isCurrency(input.proposedCurrency)
    ? input.proposedCurrency
    : countryProposal;
  const region = typeof input.region === "string" && input.region ? input.region : null;
  const currency = isCurrency(input.currency) ? input.currency : null;
  const currencySelection =
    currency && input.currencySelection !== "proposed"
      ? "explicit"
      : currency
        ? "explicit"
        : proposedCurrency
          ? "proposed"
          : "unset";

  return {
    country,
    region,
    currency: currencySelection === "explicit" ? currency : null,
    proposedCurrency,
    currencySelection,
  };
}

function renderFor(
  status: "not_started",
  stage: null,
  draft: HouseholdRunwayInterviewDraft,
  validationIssue: HouseholdRunwayValidationIssue | null,
): HouseholdRunwayLandingRenderModel;
function renderFor(
  status: "collecting",
  stage: HouseholdRunwayInterviewStage,
  draft: HouseholdRunwayInterviewDraft,
  validationIssue: HouseholdRunwayValidationIssue | null,
): HouseholdRunwayLocationRenderModel | HouseholdRunwayHouseholdRenderModel;
function renderFor(
  status: HouseholdRunwayInterviewStatus,
  stage: HouseholdRunwayInterviewStage | null,
  draft: HouseholdRunwayInterviewDraft,
  validationIssue: HouseholdRunwayValidationIssue | null,
): HouseholdRunwayInterviewRenderModel {
  if (status === "not_started") {
    return { kind: "landing", stage: null, location: null };
  }

  if (stage === "household") {
    return {
      kind: "household",
      stage: "household",
      location: {
        country: draft.location.country,
        region: draft.location.region,
        currency: draft.location.currency,
      },
    };
  }

  return {
    kind: "location",
    stage: "location",
    country: draft.location.country,
    region: draft.location.region,
    currency: draft.location.currency,
    currencyProposal: draft.location.proposedCurrency,
    currencySelection: draft.location.currencySelection,
    availableCountries: HOUSEHOLD_RUNWAY_COUNTRIES,
    availableCurrencies: HOUSEHOLD_RUNWAY_CURRENCIES,
    canContinue: Boolean(
      draft.location.country &&
        draft.location.region &&
        draft.location.currency,
    ),
    blockingIssue: validationIssue,
  };
}

function stateFrom(
  snapshot: HouseholdRunwayInterviewSnapshot,
): HouseholdRunwayInterviewState {
  const status = snapshot.status;
  const stage = status === "not_started" ? null : snapshot.stage ?? "location";
  const draft: HouseholdRunwayInterviewDraft = {
    revision: Number.isInteger(snapshot.draft.revision)
      ? snapshot.draft.revision
      : 0,
    interviewId: snapshot.draft.interviewId ?? null,
    startedAt: snapshot.draft.startedAt ?? null,
    location: normalizeLocation(snapshot.draft.location),
  };
  const validationIssue = snapshot.validationIssue ?? null;

  if (status === "not_started") {
    const renderModel = renderFor(status, null, draft, validationIssue);
    return {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status,
      stage: null,
      draft,
      validationIssue,
      renderModel,
      render: renderModel,
    };
  }

  const collectingStage = stage ?? "location";
  const renderModel = renderFor(
    status,
    collectingStage,
    draft,
    validationIssue,
  );
  return {
    version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
    status,
    stage: collectingStage,
    draft,
    validationIssue,
    renderModel,
    render: renderModel,
  };
}

function snapshotOf(state: HouseholdRunwayInterviewState): HouseholdRunwayInterviewSnapshot {
  return {
    version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
    status: state.status,
    stage: state.stage,
    draft: state.draft,
    validationIssue: state.validationIssue,
  };
}

function transition(
  state: HouseholdRunwayInterviewState,
  next: HouseholdRunwayInterviewSnapshot,
  events: readonly HouseholdRunwayInterviewEvent[],
  effects: readonly HouseholdRunwayInterviewEffect[],
): HouseholdRunwayInterviewTransition {
  const nextState = stateFrom(next);
  return {
    state: nextState,
    nextState,
    renderModel: nextState.renderModel,
    events,
    effects,
  };
}

function ignored(
  state: HouseholdRunwayInterviewState,
  command: HouseholdRunwayInterviewCommand,
  reason: Extract<HouseholdRunwayInterviewEvent, { type: "command_ignored" }>["reason"],
): HouseholdRunwayInterviewTransition {
  return transition(
    state,
    snapshotOf(state),
    [
      {
        type: "command_ignored",
        command: command.type,
        reason,
        commandId: command.commandId,
        occurredAt: command.occurredAt,
      },
    ],
    [],
  );
}

function startState(
  state: HouseholdRunwayInterviewState,
  command: Extract<HouseholdRunwayInterviewCommand, { type: "start" | "start_new" }>,
  restarted: boolean,
): HouseholdRunwayInterviewTransition {
  const draft = restarted
    ? freshDraft()
    : {
        ...state.draft,
        location: { ...state.draft.location },
      };
  draft.revision = state.draft.revision + 1;
  draft.interviewId = command.interviewId;
  draft.startedAt = command.occurredAt;
  const event = {
    type: restarted ? ("interview_restarted" as const) : ("interview_started" as const),
    interviewId: command.interviewId,
    commandId: command.commandId,
    occurredAt: command.occurredAt,
  };
  return transition(
    state,
    {
      version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
      status: "collecting",
      stage: "location",
      draft,
      validationIssue: null,
    },
    [event],
    [
      { type: "history", action: "push", destination: "interview" },
      { type: "focus", stage: "location" },
    ],
  );
}

export function createHouseholdRunwayInterview(): HouseholdRunwayInterviewState {
  return stateFrom({
    version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
    status: "not_started",
    stage: null,
    draft: freshDraft(),
    validationIssue: null,
  });
}

export function restoreHouseholdRunwayInterview(
  supplied: HouseholdRunwayInterviewState | HouseholdRunwayInterviewSnapshot,
): HouseholdRunwayInterviewState {
  return stateFrom(
    "renderModel" in supplied
      ? snapshotOf(supplied)
      : {
          ...supplied,
          version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        },
  );
}

export function dispatchHouseholdRunwayInterview(
  state: HouseholdRunwayInterviewState,
  command: HouseholdRunwayInterviewCommand,
): HouseholdRunwayInterviewTransition {
  if (command.type === "start") {
    return state.status === "not_started"
      ? startState(state, command, false)
      : ignored(state, command, "already_started");
  }

  if (command.type === "start_new") {
    return startState(state, command, true);
  }

  if (command.type === "exit") {
    if (state.status === "not_started") {
      return ignored(state, command, "already_not_started");
    }
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: "not_started",
        stage: null,
        draft: freshDraft(),
        validationIssue: null,
      },
      [
        {
          type: "interview_exited",
          commandId: command.commandId,
          occurredAt: command.occurredAt,
        },
      ],
      [{ type: "history", action: "back", destination: "landing" }],
    );
  }

  if (command.type === "discard_draft") {
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: "not_started",
        stage: null,
        draft: freshDraft(),
        validationIssue: null,
      },
      [
        {
          type: "draft_discarded",
          commandId: command.commandId,
          occurredAt: command.occurredAt,
        },
      ],
      [{ type: "history", action: "replace", destination: "landing" }],
    );
  }

  if (state.status !== "collecting" || state.stage !== "location") {
    return ignored(state, command, "invalid_stage");
  }

  if (command.type === "select_country") {
    const sameCountry = state.draft.location.country === command.country;
    const explicitCurrency =
      state.draft.location.currencySelection === "explicit"
        ? state.draft.location.currency
        : null;
    const location: HouseholdRunwayInterviewLocation = {
      country: command.country,
      region: sameCountry ? state.draft.location.region : null,
      currency: explicitCurrency,
      proposedCurrency: proposedCurrencyFor(command.country),
      currencySelection: explicitCurrency ? "explicit" : "proposed",
    };
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: "collecting",
        stage: "location",
        draft: {
          ...state.draft,
          revision: state.draft.revision + 1,
          location,
        },
        validationIssue: null,
      },
      [
        {
          type: "country_selected",
          country: command.country,
          proposedCurrency: proposedCurrencyFor(command.country)!,
          commandId: command.commandId,
          occurredAt: command.occurredAt,
        },
      ],
      [],
    );
  }

  if (command.type === "select_region") {
    const region = command.region.trim() || null;
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: "collecting",
        stage: "location",
        draft: {
          ...state.draft,
          revision: state.draft.revision + 1,
          location: { ...state.draft.location, region },
        },
        validationIssue: null,
      },
      [
        {
          type: "region_selected",
          region,
          commandId: command.commandId,
          occurredAt: command.occurredAt,
        },
      ],
      [],
    );
  }

  if (command.type === "select_currency") {
    const location = {
      ...state.draft.location,
      currency: command.currency,
      currencySelection: "explicit" as const,
    };
    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: "collecting",
        stage: "location",
        draft: {
          ...state.draft,
          revision: state.draft.revision + 1,
          location,
        },
        validationIssue: null,
      },
      [
        {
          type: "currency_selected",
          currency: command.currency,
          commandId: command.commandId,
          occurredAt: command.occurredAt,
        },
      ],
      [],
    );
  }

  if (command.type === "continue") {
    const issue: HouseholdRunwayValidationIssue | null =
      !state.draft.location.country
        ? { code: "country_required" }
        : !state.draft.location.region
          ? { code: "region_required" }
          : !state.draft.location.currency
            ? { code: "currency_required" }
            : null;

    if (issue) {
      return transition(
        state,
        {
          version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
          status: "collecting",
          stage: "location",
          draft: state.draft,
          validationIssue: issue,
        },
        [
          {
            type: "validation_blocked",
            stage: "location",
            issue,
            commandId: command.commandId,
            occurredAt: command.occurredAt,
          },
        ],
        [],
      );
    }

    return transition(
      state,
      {
        version: HOUSEHOLD_RUNWAY_INTERVIEW_VERSION,
        status: "collecting",
        stage: "household",
        draft: {
          ...state.draft,
          revision: state.draft.revision + 1,
        },
        validationIssue: null,
      },
      [
        {
          type: "location_completed",
          country: state.draft.location.country!,
          region: state.draft.location.region!,
          currency: state.draft.location.currency!,
          commandId: command.commandId,
          occurredAt: command.occurredAt,
        },
      ],
      [{ type: "focus", stage: "household" }],
    );
  }

  return ignored(state, command, "invalid_stage");
}

/** A shorter alias for adapters that call the boundary a transition function. */
export const transitionHouseholdRunwayInterview =
  dispatchHouseholdRunwayInterview;
