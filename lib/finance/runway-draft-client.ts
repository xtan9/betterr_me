import {
  RUNWAY_DRAFT_STORAGE_KEY,
  createDraftEnvelope,
  parseDraftEnvelope,
  type HouseholdRunwayAnswers,
  type RunwayStepId,
} from "@/lib/finance/cushion";

export function readRunwayDraft() {
  if (typeof window === "undefined") return null;
  return parseDraftEnvelope(window.localStorage.getItem(RUNWAY_DRAFT_STORAGE_KEY));
}

export function persistRunwayDraft(
  answers: HouseholdRunwayAnswers,
  stepId: RunwayStepId,
  completed: boolean,
) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    RUNWAY_DRAFT_STORAGE_KEY,
    JSON.stringify(createDraftEnvelope(answers, stepId, completed)),
  );
}

export function clearRunwayDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RUNWAY_DRAFT_STORAGE_KEY);
}
