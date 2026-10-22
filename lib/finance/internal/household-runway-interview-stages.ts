/** Owns stage applicability, ordering, and completion status. */

import {
  HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS,
  type HouseholdRunwayInterviewAnswers,
  type HouseholdRunwayInterviewStageStatusMap,
  type HouseholdRunwayInterviewStage,
  type HouseholdRunwayInterviewState,
  type HouseholdRunwayInterviewDraft,
  type HouseholdRunwayInterviewStageStatus,
  type HouseholdRunwayInterviewStatus,
} from "./household-runway-interview-model";

import { isWorking, clearIncomeMoney, emptyMoney } from "./household-runway-interview-answers";

export const NON_RESULT_STAGES = HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS.filter(
  (stage) => stage !== "result",
);

function freshStageStatus(
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewStageStatusMap {
  return Object.fromEntries(
    HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS.map((stage) => [
      stage,
      isStageApplicable(stage, answers) ? "pending" : "inapplicable",
    ]),
  ) as HouseholdRunwayInterviewStageStatusMap;
}

export function isStageApplicable(
  stage: HouseholdRunwayInterviewStage,
  answers: HouseholdRunwayInterviewAnswers,
): boolean {
  switch (stage) {
    case "myIncome":
      return isWorking(answers.mine);
    case "partnerIncome":
      return Boolean(answers.shares_finances && isWorking(answers.partner));
    case "result":
      return false;
    default:
      return true;
  }
}

export function applicableHouseholdRunwayInterviewStages(
  stateOrDraft: HouseholdRunwayInterviewState | HouseholdRunwayInterviewDraft,
): HouseholdRunwayInterviewStage[] {
  const draft = "draft" in stateOrDraft ? stateOrDraft.draft : stateOrDraft;
  const stages = NON_RESULT_STAGES.filter((stage) =>
    isStageApplicable(stage, draft.answers),
  );
  if ("status" in stateOrDraft && stateOrDraft.status === "completed") {
    return [...stages, "result"];
  }
  return stages;
}

/** Alias used by adapters that describe the graph as an ordered stage list. */
export const getApplicableHouseholdRunwayInterviewStages =
  applicableHouseholdRunwayInterviewStages;

export function clearStageAnswers(
  stage: HouseholdRunwayInterviewStage,
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewAnswers {
  if (stage === "myIncome") {
    return { ...answers, mine: clearIncomeMoney(answers.mine) };
  }
  if (stage === "partnerIncome") {
    return { ...answers, partner: null };
  }
  if (stage === "otherIncome") {
    return { ...answers, other_income_sources: [] };
  }
  if (stage === "assets") {
    return {
      ...answers,
      assets: {
        liquid_investments: emptyMoney(),
        illiquid_investments: emptyMoney(),
        home_equity: emptyMoney(),
        retirement_tax_deferred: emptyMoney(),
        retirement_tax_free: emptyMoney(),
      },
      extreme_access: {
        illiquid_investments_cents: 0,
        retirement_tax_deferred_cents: 0,
        retirement_tax_free_cents: 0,
      },
    };
  }
  return answers;
}

export function stageIndex(stage: HouseholdRunwayInterviewStage) {
  return HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS.indexOf(stage);
}

function firstApplicableStageAtOrAfter(
  stage: HouseholdRunwayInterviewStage,
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewStage | null {
  const start = stageIndex(stage);
  return (
    HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS.slice(start).find((candidate) =>
      isStageApplicable(candidate, answers),
    ) ?? null
  );
}

export function firstApplicableStageBefore(
  stage: HouseholdRunwayInterviewStage,
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewStage | null {
  const start = stageIndex(stage);
  for (let index = start - 1; index >= 0; index--) {
    const candidate = HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS[index];
    if (isStageApplicable(candidate, answers)) return candidate;
  }
  return null;
}

export function normalizeStageStatus(
  input: Partial<HouseholdRunwayInterviewStageStatusMap> | null | undefined,
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewStageStatusMap {
  const result = freshStageStatus(answers);
  for (const stage of HOUSEHOLD_RUNWAY_INTERVIEW_STAGE_IDS) {
    const value = input?.[stage];
    if (stage === "result" && value === "completed") {
      result[stage] = "completed";
      continue;
    }
    if (["pending", "completed", "skipped"].includes(String(value)) && isStageApplicable(stage, answers)) {
      result[stage] = value as HouseholdRunwayInterviewStageStatus;
    }
  }
  return result;
}

export function repairCurrentStage(
  stage: HouseholdRunwayInterviewStage | null,
  answers: HouseholdRunwayInterviewAnswers,
): HouseholdRunwayInterviewStage {
  if (!stage || isStageApplicable(stage, answers)) return stage ?? "location";
  if (stage === "result") return stage;
  return (
    firstApplicableStageAtOrAfter(stage, answers) ??
    firstApplicableStageBefore(stage, answers) ??
    "location"
  );
}

export function statusForStage(
  stage: HouseholdRunwayInterviewStage,
  priorStatus: HouseholdRunwayInterviewStatus,
): HouseholdRunwayInterviewStatus {
  if (stage === "result") return "completed";
  if (stage === "review") return "reviewing";
  return priorStatus === "not_started" ? "collecting" : "collecting";
}
