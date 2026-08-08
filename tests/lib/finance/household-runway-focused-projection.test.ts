import { describe, expect, it } from "vitest";
import type { RunwaySnapshotSummary } from "@/lib/finance/cushion";
import { createHouseholdRunwayInterviewRuntimeComposition } from "@/lib/finance/internal/household-runway-interview-runtime";
import {
  projectHouseholdRunwayActions,
  projectHouseholdRunwayDraftFacts,
  projectHouseholdRunwayOperation,
  projectHouseholdRunwayOperations,
  projectHouseholdRunwayPlanFacts,
  projectHouseholdRunwayAssessmentSnapshotHistory,
  type HouseholdRunwayActionContext,
  type HouseholdRunwayOperationProjectionInput,
} from "@/lib/finance/internal/household-runway-focused-projection";

const createdAt = "2026-08-07T15:00:00.000Z";

function snapshot(
  overrides: Partial<RunwaySnapshotSummary> = {},
): RunwaySnapshotSummary {
  return {
    id: "newer",
    trigger: "updated",
    scenario: "current",
    months_covered: 6,
    sustainable: false,
    model_version: "4.0.0",
    created_at: createdAt,
    ...overrides,
  };
}

describe("focused Household Runway Assessment Snapshot projection", () => {
  it.each([
    ["no previous", snapshot(), undefined, { kind: "noPrevious" }],
    [
      "Scenario changed",
      snapshot({ scenario: "mine_stops" }),
      snapshot({ id: "older", scenario: "current" }),
      { kind: "incomparable", reason: "scenarioChanged" },
    ],
    [
      "model changed",
      snapshot({ model_version: "5.0.0" }),
      snapshot({ id: "older" }),
      { kind: "incomparable", reason: "modelChanged" },
    ],
    [
      "Scenario and model changed",
      snapshot({ scenario: "mine_stops", model_version: "5.0.0" }),
      snapshot({ id: "older" }),
      { kind: "incomparable", reason: "scenarioAndModelChanged" },
    ],
    [
      "both sustainable",
      snapshot({ sustainable: true, months_covered: null }),
      snapshot({ id: "older", sustainable: true, months_covered: null }),
      { kind: "unchanged" },
    ],
    [
      "became sustainable",
      snapshot({ sustainable: true, months_covered: null }),
      snapshot({ id: "older" }),
      { kind: "becameSustainable" },
    ],
    [
      "left sustainable",
      snapshot(),
      snapshot({ id: "older", sustainable: true, months_covered: null }),
      { kind: "leftSustainable" },
    ],
    [
      "equal finite months",
      snapshot({ months_covered: 6 }),
      snapshot({ id: "older", months_covered: 6 }),
      { kind: "unchanged" },
    ],
    [
      "finite numeric change",
      snapshot({ months_covered: 8.5 }),
      snapshot({ id: "older", months_covered: 6 }),
      { kind: "monthsChanged", deltaMonths: 2.5 },
    ],
  ] as const)("projects %s with exact precedence", (_name, newer, older, comparison) => {
    const facts = projectHouseholdRunwayAssessmentSnapshotHistory(
      older ? [newer, older] : [newer],
    );

    expect(facts[0]?.comparisonToPrevious).toEqual(comparison);
  });

  it("projects the complete newest-first list with semantic outcomes", () => {
    const facts = projectHouseholdRunwayAssessmentSnapshotHistory([
      snapshot({ sustainable: true, months_covered: null }),
      snapshot({
        id: "older",
        sustainable: false,
        months_covered: 3.25,
        scenario: "current",
        model_version: "4.0.0",
        created_at: "2026-07-07T15:00:00.000Z",
      }),
    ]);

    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({
      id: "newer",
      scenario: "current",
      modelVersion: "4.0.0",
      createdAt,
      outcome: { kind: "sustainable" },
      comparisonToPrevious: { kind: "becameSustainable" },
    });
    expect(facts[1]).toMatchObject({
      id: "older",
      outcome: { kind: "depletes", monthsCovered: 3.25 },
      comparisonToPrevious: { kind: "noPrevious" },
    });
  });
});

function actionContext(
  overrides: Partial<HouseholdRunwayActionContext> = {},
): HouseholdRunwayActionContext {
  return {
    lifecycle: "ready",
    status: "not_started",
    screen: { kind: "landing", hasDraft: false },
    planAvailable: false,
    draft: {
      current: false,
      stored: false,
      session: false,
      device: false,
      deviceStorageConsent: false,
    },
    ...overrides,
  };
}

describe("focused Household Runway action applicability", () => {
  it("projects every canonical action as an explicit applicability fact", () => {
    const actions = projectHouseholdRunwayActions(actionContext());

    expect(Object.keys(actions)).toEqual([
      "start",
      "startNew",
      "resumeDraft",
      "resumePlan",
      "importDraft",
      "continue",
      "back",
      "skip",
      "discardDraft",
      "rememberDraft",
      "clearDeviceDraft",
      "editCompletedPlan",
      "selectScenario",
      "setPlanAdjustment",
      "applyPlanAdjustment",
      "resetPlanAdjustment",
      "savePlan",
      "downloadReport",
    ]);
    expect(Object.values(actions).every((action) =>
      Object.keys(action).length === 1 && "applicable" in action,
    )).toBe(true);
    expect(actions).toMatchObject({
      start: { applicable: true },
      startNew: { applicable: false },
      continue: { applicable: false },
      savePlan: { applicable: false },
    });
  });

  it.each([
    [
      "resume choice",
      actionContext({
        screen: {
          kind: "resume_choice",
          draftAvailable: true,
          planAvailable: true,
        },
        planAvailable: true,
        draft: {
          current: true,
          stored: true,
          session: true,
          device: false,
          deviceStorageConsent: false,
        },
      }),
      {
        startNew: true,
        resumeDraft: true,
        resumePlan: true,
        discardDraft: true,
      },
    ],
    [
      "optional other-income stage",
      actionContext({
        status: "collecting",
        screen: { kind: "collecting", stage: "otherIncome" },
        planAvailable: false,
        draft: {
          current: true,
          stored: false,
          session: true,
          device: false,
          deviceStorageConsent: false,
        },
      }),
      {
        continue: true,
        back: true,
        skip: true,
        discardDraft: true,
        rememberDraft: true,
      },
    ],
    [
      "optional assets stage",
      actionContext({
        status: "collecting",
        screen: { kind: "collecting", stage: "assets" },
        draft: {
          current: true,
          stored: false,
          session: true,
          device: false,
          deviceStorageConsent: false,
        },
      }),
      { continue: true, back: true, skip: true },
    ],
    [
      "anonymous device Draft in an active flow",
      actionContext({
        status: "collecting",
        screen: { kind: "collecting", stage: "location" },
        draft: {
          current: true,
          stored: true,
          session: false,
          device: true,
          deviceStorageConsent: true,
        },
      }),
      { importDraft: true, clearDeviceDraft: true },
    ],
    [
      "ready result",
      actionContext({
        status: "completed",
        screen: { kind: "result", readiness: "ready" },
        planAvailable: true,
        draft: {
          current: true,
          stored: true,
          session: true,
          device: false,
          deviceStorageConsent: false,
        },
      }),
      {
        startNew: true,
        discardDraft: true,
        editCompletedPlan: true,
        selectScenario: true,
        setPlanAdjustment: true,
        applyPlanAdjustment: true,
        resetPlanAdjustment: true,
        savePlan: true,
        downloadReport: true,
      },
    ],
  ] as const)("supports %s without operation-state inference", (_name, context, expected) => {
    const actions = projectHouseholdRunwayActions(context);

    for (const [name, applicable] of Object.entries(expected)) {
      expect(actions[name as keyof typeof actions]).toEqual({ applicable });
    }
  });

  it("keeps applicable actions independent from operation status", () => {
    const result = actionContext({
      status: "completed",
      screen: { kind: "result", readiness: "ready" },
      planAvailable: true,
      draft: {
        current: true,
        stored: true,
        session: true,
        device: false,
        deviceStorageConsent: false,
      },
    });

    expect(projectHouseholdRunwayActions(result).savePlan).toEqual({ applicable: true });
    expect(projectHouseholdRunwayActions(result).downloadReport).toEqual({ applicable: true });

    expect(
      projectHouseholdRunwayActions({
        ...result,
        draft: { ...result.draft, device: true, deviceStorageConsent: true },
      }),
    ).toMatchObject({
      clearDeviceDraft: { applicable: true },
    });
  });

  it("allows a fresh start only when a committed Plan is absent", () => {
    expect(
      projectHouseholdRunwayActions(
        actionContext({ planAvailable: true }),
      ).start,
    ).toEqual({ applicable: false });
    expect(
      projectHouseholdRunwayActions(
        actionContext({ planAvailable: true }),
      ).startNew,
    ).toEqual({ applicable: true });
  });

  it("makes every action inapplicable before the Runtime is ready", () => {
    const actions = projectHouseholdRunwayActions(
      actionContext({ lifecycle: "initializing" }),
    );

    expect(Object.values(actions)).toEqual(
      Object.keys(actions).map(() => ({ applicable: false })),
    );
  });
});

function operation(
  status: HouseholdRunwayOperationProjectionInput["status"],
  error?: Extract<
    HouseholdRunwayOperationProjectionInput,
    { status: "failed" }
  >["error"],
): HouseholdRunwayOperationProjectionInput {
  if (status === "failed") {
    return { status, error: error ?? "network" };
  }
  return {
    status: status as "idle" | "dirty" | "pending" | "succeeded",
  };
}

describe("focused Household Runway operation and durable fact projection", () => {
  it.each([
    ["idle", operation("idle"), { status: "idle" }],
    ["dirty", operation("dirty"), { status: "idle" }],
    ["pending", operation("pending"), { status: "pending" }],
    ["succeeded", operation("succeeded"), { status: "succeeded" }],
    [
      "failed",
      operation("failed", "network"),
      { status: "failed", error: "network" },
    ],
    [
      "stale result",
      operation("failed", "stale_result"),
      { status: "idle" },
    ],
  ] as const)("projects %s without a generic dirty state", (_name, source, expected) => {
    expect(projectHouseholdRunwayOperation(source)).toEqual(expected);
  });

  it("projects all operation outcomes independently", () => {
    expect(
      projectHouseholdRunwayOperations({
        draftSynchronization: operation("dirty"),
        deviceDraft: operation("pending"),
        planPersistence: operation("succeeded"),
        reportDownload: operation("failed", "download_failed"),
        analytics: operation("idle"),
      }),
    ).toEqual({
      draftSynchronization: { status: "idle" },
      deviceDraft: { status: "pending" },
      planPersistence: { status: "succeeded" },
      reportDownload: { status: "failed", error: "download_failed" },
      analytics: { status: "idle" },
    });
  });

  it.each([
    ["idle", "idle", true],
    ["dirty", "idle", false],
    ["pending", "pending", false],
    ["succeeded", "succeeded", true],
    ["failed", "failed", false],
  ] as const)("projects %s Draft synchronization as %s and %s", (sourceStatus, operationStatus, synchronized) => {
    expect(
      projectHouseholdRunwayDraftFacts({
        current: true,
        stored: true,
        session: true,
        device: false,
        deviceStorageConsent: false,
        synchronization: operation(sourceStatus),
      }),
    ).toEqual({
      current: true,
      stored: true,
      session: true,
      device: false,
      deviceStorageConsent: false,
      synchronized,
    });
    expect(projectHouseholdRunwayOperation(operation(sourceStatus))).toEqual(
      sourceStatus === "dirty"
        ? { status: "idle" }
        : sourceStatus === "failed"
          ? { status: "failed", error: "network" }
          : { status: operationStatus },
    );
  });

  it("keeps Plan freshness independent from the last persistence operation", () => {
    expect(projectHouseholdRunwayPlanFacts({ exists: true, current: false })).toEqual({
      exists: true,
      current: false,
    });
    expect(projectHouseholdRunwayPlanFacts({ exists: true, current: true })).toEqual({
      exists: true,
      current: true,
    });
  });
});

function driveRuntimeToResult(
  runtime: ReturnType<
    typeof createHouseholdRunwayInterviewRuntimeComposition
  >["runtime"],
) {
  runtime.start();
  runtime.send({ type: "select_country", country: "US" });
  runtime.send({ type: "select_region", region: "CA" });
  runtime.send({ type: "select_currency", currency: "USD" });
  runtime.send({ type: "continue" });
  runtime.send({ type: "set_household", sharesFinances: false });
  runtime.send({ type: "continue" });
  runtime.send({
    type: "set_employment",
    person: "mine",
    employment: "unemployed",
  });
  runtime.send({ type: "continue" });
  runtime.send({ type: "skip" });
  runtime.send({
    type: "set_cash",
    value: { cents: 3_000_000, confidence: "confirmed" },
  });
  runtime.send({ type: "continue" });
  runtime.send({ type: "skip" });
  runtime.send({ type: "set_expense_mode", mode: "quick" });
  runtime.send({
    type: "set_quick_expenses",
    patch: { current_monthly_cents: 600_000 },
  });
  runtime.send({ type: "continue" });
  runtime.send({
    type: "set_reduction",
    target: { kind: "quick" },
    interruptionMonthlyCents: 400_000,
  });
  runtime.send({ type: "continue" });
  runtime.send({ type: "continue" });
}

describe("focused Household Runway Runtime projection", () => {
  it("keeps the focused result private while projecting history and durable states", () => {
    const history = snapshot({ id: "older", months_covered: 4 });
    const composition = createHouseholdRunwayInterviewRuntimeComposition({
      createId: () => "interview-1",
      initialSnapshots: [history],
    });

    driveRuntimeToResult(composition.runtime);

    const focused = composition.getFocusedSnapshot();
    expect(focused.screen).toMatchObject({
      kind: "result",
      readiness: "ready",
      history: [
        {
          id: "older",
          outcome: { kind: "depletes", monthsCovered: 4 },
          comparisonToPrevious: { kind: "noPrevious" },
        },
      ],
    });
    expect(focused.screen).not.toHaveProperty("planInputs");
    expect(focused.screen).not.toHaveProperty("assessment");
    expect(focused.actions).toMatchObject({
      startNew: { applicable: true },
      selectScenario: { applicable: true },
      setPlanAdjustment: { applicable: true },
      applyPlanAdjustment: { applicable: true },
      resetPlanAdjustment: { applicable: true },
      savePlan: { applicable: true },
      downloadReport: { applicable: true },
    });
    expect(focused.operations.draftSynchronization).toEqual({ status: "idle" });
    expect(focused.draft.synchronized).toBe(false);
    expect(focused.plan).toEqual({ exists: false, current: false });

    const supported = composition.runtime.getSnapshot();
    expect(supported).not.toHaveProperty("assessmentHistory");
    expect(supported).not.toHaveProperty("affordances");
    expect(supported).toHaveProperty("actions");
    expect(supported).not.toHaveProperty("focused");
  });

  it("keeps result actions applicable through pending and failed operations", async () => {
    const composition = createHouseholdRunwayInterviewRuntimeComposition({
      createId: () => "interview-1",
    });
    driveRuntimeToResult(composition.runtime);

    composition.runtime.send({ type: "save_plan" });
    expect(composition.getFocusedSnapshot()).toMatchObject({
      operations: { planPersistence: { status: "pending" } },
      actions: { savePlan: { applicable: true } },
    });

    composition.runtime.send({ type: "request_report_download" });
    await Promise.resolve();
    await Promise.resolve();
    expect(composition.getFocusedSnapshot()).toMatchObject({
      operations: {
        reportDownload: { status: "failed", error: "capability_unavailable" },
      },
      actions: { downloadReport: { applicable: true } },
    });
  });
});
