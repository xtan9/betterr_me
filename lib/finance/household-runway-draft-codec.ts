import {
  availableScenarios,
  RUNWAY_STEP_IDS,
  type HouseholdRunwayAnswers,
  type RunwayScenario,
} from "@/lib/finance/cushion";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "@/lib/finance/runway-expenses";
import { migrateRunwayAnswers } from "@/lib/finance/runway-answer-migrations";
import { runwayAdjustmentsSchema } from "@/lib/validations/finance-cushion";
import {
  HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS,
  applicableHouseholdRunwayInterviewStages,
  createHouseholdRunwayInterview,
  normalizeHouseholdRunwayDraft,
  restoreHouseholdRunwayInterview,
  type HouseholdRunwayInterviewAnswers,
  type HouseholdRunwayInterviewDraft,
  type HouseholdRunwayInterviewStage,
  type HouseholdRunwayInterviewStageStatus,
  type HouseholdRunwayInterviewState,
  type HouseholdRunwayInterviewStatus,
} from "@/lib/finance/household-runway-interview";

export const HOUSEHOLD_RUNWAY_DRAFT_CODEC_VERSION = 1 as const;
export const HOUSEHOLD_RUNWAY_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const HOUSEHOLD_RUNWAY_DRAFT_STORAGE_KEY =
  "betterr.household-runway.interview.v2";
export const HOUSEHOLD_RUNWAY_DRAFT_DEVICE_CONSENT_KEY =
  "betterr.household-runway.interview.device-consent.v1";

const LEGACY_STEP_IDS = [
  "welcome",
  ...RUNWAY_STEP_IDS.filter((step) => step !== "reductions"),
] as const;

type PersistableDraft = Omit<HouseholdRunwayInterviewDraft, "availableScenarios">;

export interface HouseholdRunwayDraftState {
  status: HouseholdRunwayInterviewStatus;
  stage: HouseholdRunwayInterviewStage | null;
  draft: HouseholdRunwayInterviewDraft;
}

export interface HouseholdRunwayDraftEnvelope {
  schema_version: typeof HOUSEHOLD_RUNWAY_DRAFT_CODEC_VERSION;
  expires_at: string;
  status: HouseholdRunwayInterviewStatus;
  stage: HouseholdRunwayInterviewStage | null;
  draft: PersistableDraft;
}

export type HouseholdRunwayDraftCodecErrorCode =
  | "malformed"
  | "unsupported_version"
  | "expired"
  | "invalid_draft"
  | "invalid_stage"
  | "invalid_nested_progress"
  | "invalid_scenario"
  | "incomplete_completion";

export type HouseholdRunwayDraftDecodeResult =
  | {
      success: true;
      state: HouseholdRunwayDraftState;
      schemaVersion: number;
      expiresAt: string;
    }
  | {
      success: false;
      code: HouseholdRunwayDraftCodecErrorCode;
      cleanup: true;
      schemaVersion?: number;
    };

export class HouseholdRunwayDraftCodecError extends Error {
  readonly code: HouseholdRunwayDraftCodecErrorCode;

  constructor(code: HouseholdRunwayDraftCodecErrorCode) {
    super(`Invalid Household Runway Draft: ${code}`);
    this.name = "HouseholdRunwayDraftCodecError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isInteger(value: unknown, minimum = 0): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum;
}

function isStage(value: unknown): value is HouseholdRunwayInterviewStage {
  return (
    typeof value === "string" &&
    (HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS as readonly string[]).includes(value)
  );
}

function isStatus(value: unknown): value is HouseholdRunwayInterviewStatus {
  return ["not_started", "collecting", "reviewing", "completed"].includes(
    String(value),
  );
}

function isStageStatus(value: unknown): value is HouseholdRunwayInterviewStageStatus {
  return ["pending", "completed", "skipped", "inapplicable"].includes(
    String(value),
  );
}

function isScenario(value: unknown): value is RunwayScenario {
  return ["current", "mine_stops", "partner_stops", "both_stop"].includes(
    String(value),
  );
}

function isCategory(value: unknown): value is ExpenseCategory {
  return (
    typeof value === "string" &&
    (EXPENSE_CATEGORIES as readonly string[]).includes(value)
  );
}

function failure(
  code: HouseholdRunwayDraftCodecErrorCode,
  schemaVersion?: number,
): HouseholdRunwayDraftDecodeResult {
  return { success: false, code, cleanup: true, schemaVersion };
}

function toText(raw: string | Uint8Array): string | null {
  if (typeof raw === "string") return raw;
  try {
    return new TextDecoder().decode(raw);
  } catch {
    return null;
  }
}

function fallbackRegion(country: string | null): string {
  return country === "US"
    ? "AL"
    : country === "CA"
      ? "AB"
      : country === "CN"
        ? "BJ"
        : "TPE";
}

function validInterviewAnswers(
  value: unknown,
  now: Date,
): value is HouseholdRunwayInterviewAnswers {
  if (!isRecord(value)) return false;
  if (
    value.schema_version !== 4 ||
    (value.country !== null && !["US", "CA", "CN", "TW"].includes(String(value.country))) ||
    (value.region !== null && typeof value.region !== "string") ||
    (value.currency !== null && !["USD", "CAD", "CNY", "TWD"].includes(String(value.currency))) ||
    (value.updated_at !== null && !isDate(value.updated_at))
  ) {
    return false;
  }

  const candidateCountry = (value.country ?? "US") as string;
  const candidate = {
    ...value,
    country: candidateCountry,
    region: value.region || fallbackRegion(candidateCountry),
    currency: value.currency ?? "USD",
    updated_at: value.updated_at ?? new Date(0).toISOString(),
  };
  return migrateRunwayAnswers(candidate, now, {
    allowIncompleteRegion: true,
  }) !== null;
}

function validLocation(
  draft: Record<string, unknown>,
): draft is Record<string, unknown> & {
  location: HouseholdRunwayInterviewDraft["location"];
} {
  const location = draft.location;
  if (!isRecord(location)) return false;
  const country = location.country;
  const region = location.region;
  const currency = location.currency;
  const proposedCurrency = location.proposedCurrency;
  const selection = location.currencySelection;
  if (
    country !== null && !["US", "CA", "CN", "TW"].includes(String(country))
  ) return false;
  if (region !== null && typeof region !== "string") return false;
  if (
    currency !== null &&
    !["USD", "CAD", "CNY", "TWD"].includes(String(currency))
  ) return false;
  if (
    proposedCurrency !== null &&
    !["USD", "CAD", "CNY", "TWD"].includes(String(proposedCurrency))
  ) return false;
  if (!["unset", "proposed", "explicit"].includes(String(selection))) {
    return false;
  }
  if (country === null && (region !== null || currency !== null || proposedCurrency !== null || selection !== "unset")) {
    return false;
  }
  if (selection === "unset" && (currency !== null || proposedCurrency !== null)) {
    return false;
  }
  if (selection === "proposed" && (currency !== null || proposedCurrency === null)) {
    return false;
  }
  if (selection === "explicit" && currency === null) return false;
  return true;
}

function validValidationIssues(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const validCodes = new Set([
    "country_required",
    "region_required",
    "region_invalid",
    "currency_required",
    "currency_change_confirmation_required",
    "income_required",
    "expenses_current_required",
    "expenses_interruption_required",
    "draft_timestamp_required",
    "plan_input_invalid",
    "assessment_required",
    "plan_adjustment_pending",
  ]);
  for (const [stage, issue] of Object.entries(value)) {
    if (!isStage(stage) || issue === null) continue;
    if (!isRecord(issue) || !validCodes.has(String(issue.code))) return false;
    if (issue.stage !== undefined && !isStage(issue.stage)) return false;
    if (
      issue.path !== undefined &&
      (!Array.isArray(issue.path) ||
        issue.path.some((part) => typeof part !== "string" && typeof part !== "number"))
    ) return false;
  }
  return true;
}

function validateDraft(
  value: unknown,
  status: HouseholdRunwayInterviewStatus,
  stage: HouseholdRunwayInterviewStage | null,
  now: Date,
): HouseholdRunwayDraftCodecErrorCode | null {
  if (!isRecord(value)) return "invalid_draft";
  if (
    !isInteger(value.revision) ||
    (value.interviewId !== null && typeof value.interviewId !== "string") ||
    (value.startedAt !== null && !isDate(value.startedAt)) ||
    !validLocation(value) ||
    !validInterviewAnswers(value.answers, now) ||
    !isRecord(value.stageStatus) ||
    !validValidationIssues(value.validationIssues) ||
    !isScenario(value.selectedScenario) ||
    !isRecord(value.planAdjustment) ||
    runwayAdjustmentsSchema.safeParse(value.planAdjustment).success === false ||
    (value.pendingCurrencyChange !== null && !isRecord(value.pendingCurrencyChange))
  ) {
    return status === "completed" ? "incomplete_completion" : "invalid_draft";
  }

  const answers = value.answers as HouseholdRunwayInterviewAnswers;
  const location = value.location as HouseholdRunwayInterviewDraft["location"];
  if (
    answers.country !== location.country ||
    answers.region !== location.region ||
    answers.currency !== location.currency
  ) {
    return "invalid_draft";
  }

  for (const candidate of HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS) {
    if (!Object.prototype.hasOwnProperty.call(value.stageStatus, candidate)) {
      return "invalid_draft";
    }
    if (!isStageStatus(value.stageStatus[candidate])) return "invalid_draft";
  }
  const completedCategories = answers.completed_expense_categories;
  if (new Set(completedCategories).size !== completedCategories.length) {
    return "invalid_nested_progress";
  }
  if (value.activeExpenseCategory !== null && !isCategory(value.activeExpenseCategory)) {
    return "invalid_nested_progress";
  }
  if (value.activeExpenseCategory !== null && stage !== "expenses") {
    return "invalid_nested_progress";
  }
  if (
    value.pendingCurrencyChange !== null &&
    (!isScenarioCurrency(value.pendingCurrencyChange.currency) ||
      !isInteger(value.pendingCurrencyChange.monetaryEntryCount))
  ) {
    return "invalid_nested_progress";
  }

  const applicable = new Set(
    applicableHouseholdRunwayInterviewStages({
      revision: value.revision,
      interviewId: value.interviewId as string | null,
      startedAt: value.startedAt as string | null,
      location,
      answers,
      stageStatus: value.stageStatus as HouseholdRunwayInterviewDraft["stageStatus"],
      validationIssues: value.validationIssues as HouseholdRunwayInterviewDraft["validationIssues"],
      selectedScenario: value.selectedScenario as RunwayScenario,
      availableScenarios: [],
      planAdjustment: value.planAdjustment as unknown as HouseholdRunwayInterviewDraft["planAdjustment"],
      pendingCurrencyChange: value.pendingCurrencyChange as HouseholdRunwayInterviewDraft["pendingCurrencyChange"],
      activeExpenseCategory: value.activeExpenseCategory as ExpenseCategory | null,
    }),
  );
  if (stage !== null && stage !== "result" && !applicable.has(stage)) {
    return "invalid_stage";
  }
  for (const candidate of HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS) {
    const stageValue = value.stageStatus[candidate];
    if (candidate === "result") {
      if (stageValue !== "inapplicable" && stageValue !== "completed") {
        return "invalid_stage";
      }
      continue;
    }
    if (applicable.has(candidate) !== (stageValue !== "inapplicable")) {
      return "invalid_stage";
    }
  }
  if (
    status === "not_started" && stage !== null ||
    status === "collecting" && (stage === null || stage === "result") ||
    status === "reviewing" && stage !== "review" ||
    status === "completed" && stage !== "result"
  ) {
    return "invalid_stage";
  }
  const available = availableScenarios({
    ...answers,
    country: answers.country ?? "US",
    region: answers.region ?? fallbackRegion(answers.country),
    currency: answers.currency ?? "USD",
    updated_at: answers.updated_at ?? new Date(0).toISOString(),
  } as HouseholdRunwayAnswers);
  if (!available.some((candidate) => candidate.id === value.selectedScenario)) {
    return "invalid_scenario";
  }
  if (status === "completed") {
    const normalized = normalizeHouseholdRunwayDraft(value as unknown as HouseholdRunwayInterviewDraft);
    if (
      value.stageStatus.result !== "completed" ||
      !normalized.success
    ) return "incomplete_completion";
  }
  return null;
}

function isScenarioCurrency(value: unknown): boolean {
  return ["USD", "CAD", "CNY", "TWD"].includes(String(value));
}

function persistableDraft(draft: HouseholdRunwayInterviewDraft): PersistableDraft {
  return {
    revision: draft.revision,
    interviewId: draft.interviewId,
    startedAt: draft.startedAt,
    location: draft.location,
    answers: draft.answers,
    stageStatus: draft.stageStatus,
    validationIssues: draft.validationIssues,
    selectedScenario: draft.selectedScenario,
    planAdjustment: draft.planAdjustment,
    pendingCurrencyChange: draft.pendingCurrencyChange,
    activeExpenseCategory: draft.activeExpenseCategory,
  };
}

function inputState(
  input: HouseholdRunwayDraftState | HouseholdRunwayInterviewState,
): HouseholdRunwayDraftState {
  return {
    status: input.status,
    stage: input.stage,
    draft: input.draft,
  };
}

export function encodeHouseholdRunwayDraft(
  input: HouseholdRunwayDraftState | HouseholdRunwayInterviewState,
  now: Date,
): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new HouseholdRunwayDraftCodecError("malformed");
  }
  const state = inputState(input);
  const validation = validateDraft(state.draft, state.status, state.stage, now);
  if (validation) throw new HouseholdRunwayDraftCodecError(validation);
  const envelope: HouseholdRunwayDraftEnvelope = {
    schema_version: HOUSEHOLD_RUNWAY_DRAFT_CODEC_VERSION,
    expires_at: new Date(now.getTime() + HOUSEHOLD_RUNWAY_DRAFT_TTL_MS).toISOString(),
    status: state.status,
    stage: state.stage,
    draft: persistableDraft(state.draft),
  };
  return JSON.stringify(envelope);
}

function legacyStage(value: unknown): HouseholdRunwayInterviewStage | null {
  const raw = String(value);
  if (raw === "confirmedFunds") return "assets";
  if (raw === "temporaryIncome") return "review";
  if ((RUNWAY_STEP_IDS as readonly string[]).includes(raw)) {
    return raw as HouseholdRunwayInterviewStage;
  }
  return null;
}

function derivedLegacyStage(draft: HouseholdRunwayInterviewDraft): HouseholdRunwayInterviewStage {
  if (draft.stageStatus.result === "completed") return "result";
  if (draft.activeExpenseCategory !== null) return "expenses";
  const applicable = applicableHouseholdRunwayInterviewStages(draft);
  return (
    applicable.find((candidate) => draft.stageStatus[candidate] !== "completed" && draft.stageStatus[candidate] !== "skipped") ??
    "review"
  );
}

function draftFromLegacyAnswers(
  answers: HouseholdRunwayAnswers,
  stage: HouseholdRunwayInterviewStage,
  completed: boolean,
): HouseholdRunwayDraftState {
  const applicable = applicableHouseholdRunwayInterviewStages({
    revision: 0,
    interviewId: null,
    startedAt: null,
    location: {
      country: answers.country,
      region: answers.region,
      currency: answers.currency,
      proposedCurrency: answers.currency,
      currencySelection: "explicit",
    },
    answers: answers as HouseholdRunwayInterviewAnswers,
    stageStatus: {} as HouseholdRunwayInterviewDraft["stageStatus"],
    validationIssues: {},
    selectedScenario: null,
    availableScenarios: [],
    planAdjustment: {
      expense_reduction_cents: 0,
      added_cash_cents: 0,
      added_monthly_income_cents: 0,
      expected_unconfirmed_funds_cents: 0,
      usable_illiquid_investments_cents: 0,
      usable_retirement_tax_deferred_cents: 0,
      usable_retirement_tax_free_cents: 0,
    },
    pendingCurrencyChange: null,
    activeExpenseCategory: null,
  });
  const statuses = Object.fromEntries(
    HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS.map((candidate) => [
      candidate,
      !applicable.includes(candidate)
        ? "inapplicable"
        : completed || candidate === "result"
          ? "completed"
          : applicable.indexOf(candidate) < applicable.indexOf(stage)
            ? "completed"
            : "pending",
    ]),
  ) as HouseholdRunwayInterviewDraft["stageStatus"];
  const restored = createHouseholdRunwayInterview({
    status: completed ? "completed" : "collecting",
    stage: completed ? "result" : stage,
    draft: {
      answers: answers as HouseholdRunwayInterviewAnswers,
      location: {
        country: answers.country,
        region: answers.region,
        currency: answers.currency,
        proposedCurrency: answers.currency,
        currencySelection: "explicit",
      },
      stageStatus: statuses,
    },
  });
  return {
    status: restored.status,
    stage: restored.stage,
    draft: {
      ...restored.draft,
      stageStatus: {
        ...restored.draft.stageStatus,
        ...(completed ? { result: "completed" as const } : {}),
      },
    },
  };
}

function migrateLegacyEnvelope(
  parsed: Record<string, unknown>,
  now: Date,
): HouseholdRunwayDraftState | HouseholdRunwayDraftCodecErrorCode {
  if (parsed.version === 1 && isRecord(parsed.draft)) {
    const oldDraft = parsed.draft as Partial<HouseholdRunwayInterviewDraft>;
    if (!validInterviewAnswers(oldDraft.answers, now) || !validLocation(oldDraft as Record<string, unknown>)) {
      return "invalid_draft";
    }
    const restored = createHouseholdRunwayInterview({ draft: oldDraft });
    const stage = derivedLegacyStage(restored.draft);
    const completed = Boolean(restored.draft.stageStatus.result === "completed");
    return {
      status: completed ? "completed" : "collecting",
      stage: completed ? "result" : stage,
      draft: restored.draft,
    };
  }
  if (![2, 3, 4].includes(Number(parsed.version))) return "unsupported_version";
  const answers = migrateRunwayAnswers(parsed.answers, now, {
    allowIncompleteRegion: true,
  });
  if (!answers) return "invalid_draft";
  const step =
    parsed.version === 2
      ? LEGACY_STEP_IDS[Math.min(Math.max(Number(parsed.step) || 0, 0), LEGACY_STEP_IDS.length - 1)]
      : parsed.step_id;
  const stage = legacyStage(step);
  if (!stage) return "invalid_stage";
  return draftFromLegacyAnswers(answers, stage, parsed.completed === true);
}

export function decodeHouseholdRunwayDraft(
  raw: string | Uint8Array | null | undefined,
  now: Date,
): HouseholdRunwayDraftDecodeResult {
  if (!(now instanceof Date) || Number.isNaN(now.getTime()) || raw === null || raw === undefined) {
    return failure("malformed");
  }
  const text = toText(raw);
  if (!text) return failure("malformed");
  let parsed: Record<string, unknown>;
  try {
    const candidate: unknown = JSON.parse(text);
    if (!isRecord(candidate)) return failure("malformed");
    parsed = candidate;
  } catch {
    return failure("malformed");
  }
  if (!isDate(parsed.expires_at)) return failure("malformed");
  const expiresAt = parsed.expires_at;
  if (new Date(expiresAt).getTime() <= now.getTime()) return failure("expired");

  if (parsed.schema_version === HOUSEHOLD_RUNWAY_DRAFT_CODEC_VERSION) {
    if (!isStatus(parsed.status) || (parsed.stage !== null && !isStage(parsed.stage))) {
      return failure("invalid_stage", Number(parsed.schema_version));
    }
    const validation = validateDraft(
      parsed.draft,
      parsed.status,
      parsed.stage as HouseholdRunwayInterviewStage | null,
      now,
    );
    if (validation) return failure(validation, Number(parsed.schema_version));
    const restored = restoreHouseholdRunwayInterview({
      version: 2,
      status: parsed.status,
      stage: parsed.stage as HouseholdRunwayInterviewStage | null,
      draft: parsed.draft as Partial<HouseholdRunwayInterviewDraft>,
      validationIssue: null,
    });
    return {
      success: true,
      state: {
        status: restored.status,
        stage: restored.stage,
        draft: restored.draft,
      },
      schemaVersion: HOUSEHOLD_RUNWAY_DRAFT_CODEC_VERSION,
      expiresAt,
    };
  }

  const historicalVersion = typeof parsed.version === "number" ? parsed.version : undefined;
  if (historicalVersion === undefined) return failure("unsupported_version");
  const migrated = migrateLegacyEnvelope(parsed, now);
  if (typeof migrated === "string") return failure(migrated, historicalVersion);
  const validation = validateDraft(migrated.draft, migrated.status, migrated.stage, now);
  if (validation) return failure(validation, historicalVersion);
  return {
    success: true,
    state: migrated,
    schemaVersion: historicalVersion,
    expiresAt,
  };
}

// Friendly aliases for adapters that describe the boundary as serialization
// and parsing rather than encoding and decoding.
export const serializeHouseholdRunwayDraft = encodeHouseholdRunwayDraft;
export const parseHouseholdRunwayDraft = decodeHouseholdRunwayDraft;
