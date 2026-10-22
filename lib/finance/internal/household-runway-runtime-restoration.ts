/** Validates restored Drafts, Plans, and assessment history. */

import type { RunwaySnapshotSummary } from "@/lib/finance/cushion";

import type { HouseholdRunwayPlan } from "@/lib/finance/internal/household-runway-interview";

import type {
  HouseholdRunwayDraftState,
} from "@/lib/finance/internal/household-runway-draft-codec";

export type RuntimeStoredDraft = {
  state: HouseholdRunwayDraftState;
  expiresAt?: string;
  source: "session" | "device";
};

type RuntimeRestorePayload = {
  session?:
    | { status: "missing" }
    | {
        status: "restored";
        state: HouseholdRunwayDraftState;
        expiresAt?: string;
        source?: "session" | "device";
      }
    | { status: "rejected"; code?: string };
  device?:
    | { status: "missing" }
    | {
        status: "restored";
        state: HouseholdRunwayDraftState;
        expiresAt?: string;
        source?: "session" | "device";
      }
    | { status: "rejected"; code?: string };
  deviceStorageConsent?: boolean;
  plan?:
    | { status: "missing" }
    | {
        status: "restored";
        plan: HouseholdRunwayPlan;
        snapshots?: readonly RunwaySnapshotSummary[];
      }
    | { status: "rejected"; code?: string };
  committedPlan?: HouseholdRunwayPlan | null;
  snapshots?: readonly RunwaySnapshotSummary[];
  assessmentHistory?: readonly RunwaySnapshotSummary[];
};

const RUNWAY_SCENARIOS = new Set([
  "current",
  "mine_stops",
  "partner_stops",
  "both_stop",
]);

const RUNWAY_SNAPSHOT_TRIGGERS = new Set([
  "completed",
  "updated",
  "imported",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidRunwaySnapshotSummary(
  value: unknown,
): value is RunwaySnapshotSummary {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (typeof value.trigger !== "string" || !RUNWAY_SNAPSHOT_TRIGGERS.has(value.trigger)) {
    return false;
  }
  if (
    typeof value.scenario !== "string" ||
    !RUNWAY_SCENARIOS.has(value.scenario) ||
    !isNonEmptyString(value.model_version) ||
    !isNonEmptyString(value.created_at) ||
    Number.isNaN(Date.parse(value.created_at)) ||
    typeof value.sustainable !== "boolean"
  ) {
    return false;
  }

  return value.sustainable
    ? value.months_covered === null
    : typeof value.months_covered === "number" &&
        Number.isFinite(value.months_covered) &&
        value.months_covered >= 0;
}

export function validatedRunwaySnapshotHistory(
  value: unknown,
): RunwaySnapshotSummary[] | null {
  if (!Array.isArray(value)) return null;
  const ids = new Set<string>();
  const history: RunwaySnapshotSummary[] = [];
  for (const entry of value) {
    if (!isValidRunwaySnapshotSummary(entry) || ids.has(entry.id)) return null;
    ids.add(entry.id);
    history.push(entry);
  }
  return history;
}

function isDraftState(value: unknown): value is HouseholdRunwayDraftState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HouseholdRunwayDraftState>;
  return Boolean(
    candidate.draft &&
      typeof candidate.draft === "object" &&
      (candidate.status === "not_started" ||
        candidate.status === "collecting" ||
        candidate.status === "reviewing" ||
        candidate.status === "completed") &&
      (candidate.stage === null || typeof candidate.stage === "string"),
  );
}

export function storedDraftFrom(
  value: RuntimeRestorePayload["session"] | RuntimeRestorePayload["device"] | undefined,
  fallbackSource: "session" | "device",
): RuntimeStoredDraft | null {
  return value?.status === "restored" && isDraftState(value.state)
    ? {
        state: value.state,
        source: value.source ?? fallbackSource,
        ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}),
      }
    : null;
}

export function restorePayloadFrom(value: unknown): RuntimeRestorePayload {
  if (!value || typeof value !== "object") return {};
  return value as RuntimeRestorePayload;
}

export function restoredHistoryFrom(
  restored: RuntimeRestorePayload,
): { present: boolean; value: unknown } {
  if (restored.plan?.status === "restored" && "snapshots" in restored.plan) {
    return { present: true, value: restored.plan.snapshots };
  }
  if (Object.prototype.hasOwnProperty.call(restored, "assessmentHistory")) {
    return { present: true, value: restored.assessmentHistory };
  }
  if (Object.prototype.hasOwnProperty.call(restored, "snapshots")) {
    return { present: true, value: restored.snapshots };
  }
  return { present: false, value: undefined };
}

export function directPlanFrom(value: unknown): HouseholdRunwayPlan | null | undefined {
  if (value === null) return null;
  if (
    value &&
    typeof value === "object" &&
    "revision" in value &&
    "inputs" in value
  ) {
    return value as HouseholdRunwayPlan;
  }
  return undefined;
}

function hasRestorationStatus(
  value: unknown,
): value is { status: "missing" | "restored" | "rejected" } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "status" in value &&
      (value.status === "missing" ||
        value.status === "restored" ||
        value.status === "rejected"),
  );
}

export function restorationNeedsRecovery(value: unknown): boolean {
  if (value === undefined) return false;
  if (!hasRestorationStatus(value)) return true;
  if (value.status !== "restored") return value.status === "rejected";
  return !isDraftState((value as { state?: unknown }).state);
}
