import {
  RUNWAY_DRAFT_TTL_MS,
  RUNWAY_DRAFT_STORAGE_KEY,
  createDraftEnvelope,
  parseDraftEnvelope,
  type HouseholdRunwayAnswers,
  type RunwayStepId,
} from "@/lib/finance/cushion";
import type { HouseholdRunwayInterviewDraft } from "@/lib/finance/household-runway-interview";

const HOUSEHOLD_RUNWAY_INTERVIEW_DRAFT_STORAGE_KEY =
  "betterr.household-runway.interview.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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

export function readHouseholdRunwayInterviewDraft(): HouseholdRunwayInterviewDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(
    HOUSEHOLD_RUNWAY_INTERVIEW_DRAFT_STORAGE_KEY,
  );
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const expiresAt = new Date(String(parsed.expires_at));
    const draft = parsed.draft;
    if (
      parsed.version !== 1 ||
      Number.isNaN(expiresAt.getTime()) ||
      expiresAt <= new Date() ||
      !isRecord(draft) ||
      !isRecord(draft.location)
    ) {
      return null;
    }
    return draft as unknown as HouseholdRunwayInterviewDraft;
  } catch {
    return null;
  }
}

export function persistHouseholdRunwayInterviewDraft(
  draft: HouseholdRunwayInterviewDraft,
) {
  if (typeof window === "undefined") return;
  const now = new Date();
  window.localStorage.setItem(
    HOUSEHOLD_RUNWAY_INTERVIEW_DRAFT_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      expires_at: new Date(now.getTime() + RUNWAY_DRAFT_TTL_MS).toISOString(),
      draft,
    }),
  );
}

export function clearHouseholdRunwayInterviewDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(HOUSEHOLD_RUNWAY_INTERVIEW_DRAFT_STORAGE_KEY);
}
