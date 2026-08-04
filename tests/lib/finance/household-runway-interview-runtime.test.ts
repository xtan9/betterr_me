import { describe, expect, it, vi } from "vitest";
import {
  createHouseholdRunwayInterviewRuntime,
  type HouseholdRunwayInterviewRuntimePlanResult,
  type HouseholdRunwayInterviewRuntimeSnapshot,
} from "@/lib/finance/household-runway-interview-runtime";
import { createHouseholdRunwayInterview } from "@/lib/finance/household-runway-interview";
import type { RunwaySnapshotSummary } from "@/lib/finance/cushion";

const now = "2026-08-03T15:00:00.000Z";

async function settle(scheduled: (() => void)[]) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await Promise.resolve();
    const tasks = scheduled.splice(0);
    tasks.forEach((task) => task());
  }
}

function storedDraft(revision: number, stage: "location" | "result" = "location") {
  const fresh = createHouseholdRunwayInterview();
  return {
    status: stage === "result" ? ("completed" as const) : ("collecting" as const),
    stage,
    draft: {
      ...fresh.draft,
      revision,
      interviewId: `stored-${revision}`,
      startedAt: now,
      ...(stage === "result"
        ? { stageStatus: { ...fresh.draft.stageStatus, result: "completed" as const } }
        : {}),
    },
  };
}

function driveToReview(runtime: ReturnType<typeof createHouseholdRunwayInterviewRuntime>) {
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
}

describe("Household Runway Interview Runtime", () => {
  it("has side-effect-free construction and publishes initializing then usable startup", async () => {
    const scheduled: (() => void)[] = [];
    const focus = vi.fn();
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      focus,
    });
    const initial = runtime.getSnapshot();
    const snapshots: HouseholdRunwayInterviewRuntimeSnapshot[] = [];
    runtime.subscribe(() => snapshots.push(runtime.getSnapshot()));

    expect(initial.lifecycle).toBe("idle");
    expect(initial.screen.kind).toBe("landing");
    expect(scheduled).toHaveLength(0);

    runtime.start();
    runtime.start();

    expect(snapshots.map((snapshot) => snapshot.lifecycle)).toEqual([
      "initializing",
      "ready",
    ]);
    expect(runtime.getSnapshot().screen.kind).toBe("location");
    expect(scheduled).toHaveLength(0);
    expect(focus).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(scheduled).toHaveLength(1);
    scheduled.shift()?.();
    expect(focus).toHaveBeenCalledWith("location");
  });

  it("keeps interview IDs and protocol-only commands private to the Runtime", () => {
    let nextId = 0;
    const createId = vi.fn(() => `interview-${++nextId}`);
    const runtime = createHouseholdRunwayInterviewRuntime({ createId });

    runtime.start();
    runtime.send({ type: "start_new" });

    expect(runtime.getSnapshot().screen.kind).toBe("location");
    expect(createId).toHaveBeenCalledTimes(3);

    const snapshot = runtime.getSnapshot();
    runtime.send({ type: "request_plan_persistence" } as never);
    runtime.send({
      type: "analytics_succeeded",
      sourceRevision: 1,
      correlationId: "private",
    } as never);
    expect(runtime.getSnapshot()).toBe(snapshot);
  });

  it("exposes only frozen screen facts, derived facts, issues, and affordances", () => {
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
    });
    runtime.start();
    const snapshot = runtime.getSnapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.screen)).toBe(true);
    expect(snapshot.screen).toMatchObject({
      kind: "location",
      country: null,
      currency: null,
      canContinue: false,
    });
    expect(snapshot.derived).toEqual({ planInputs: null, assessment: null });
    expect(snapshot.plan).toEqual({ exists: false, revision: null });
    expect(snapshot.draft).toEqual({
      current: true,
      stored: false,
      session: false,
      device: false,
      deviceStorageConsent: false,
    });
    expect(snapshot.confirmation).toEqual({ status: "idle" });
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.operations).toEqual({
      draftSynchronization: { status: "dirty" },
      deviceDraft: { status: "idle" },
      planPersistence: { status: "idle" },
      reportDownload: { status: "idle" },
      analytics: { status: "idle" },
    });
    expect(snapshot.affordances).toMatchObject({
      continue: true,
      back: true,
      skip: false,
      startNew: false,
    });
    expect(snapshot).not.toHaveProperty("events");
    expect(snapshot).not.toHaveProperty("effects");
    expect(snapshot).not.toHaveProperty("transition");
    expect(snapshot).not.toHaveProperty("correlationId");
    expect(snapshot.operations).not.toHaveProperty("sourceRevision");
    expect(snapshot.operations).not.toHaveProperty("idempotencyKey");
  });

  it("publishes a typed validation issue and treats repeated blocked intents as no-ops", () => {
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
    });
    runtime.start();
    const published = vi.fn();
    runtime.subscribe(published);

    runtime.send({ type: "select_country", country: "US" });
    runtime.send({ type: "continue" });
    const blocked = runtime.getSnapshot();
    const publicationCount = published.mock.calls.length;

    expect(blocked.issues).toEqual([
      { code: "region_required" },
    ]);
    expect(blocked.screen).toMatchObject({
      kind: "location",
      blockingIssue: { code: "region_required" },
    });

    runtime.send({ type: "continue" });
    expect(published).toHaveBeenCalledTimes(publicationCount);
    expect(runtime.getSnapshot()).toEqual(blocked);
  });

  it("drives a fresh anonymous Interview through public intents to a review Assessment", () => {
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
    });
    runtime.start();

    driveToReview(runtime);
    const snapshot = runtime.getSnapshot();

    expect(snapshot.lifecycle).toBe("ready");
    expect(snapshot.interviewStatus).toBe("reviewing");
    expect(snapshot.screen).toMatchObject({
      kind: "review",
      ready: true,
      planInputs: {
        country: "US",
        region: "CA",
        currency: "USD",
        available_cash: { cents: 3_000_000, confidence: "confirmed" },
      },
    });
    expect(snapshot.derived.planInputs).not.toBeNull();
    expect(snapshot.derived.assessment).toMatchObject({
      answers: snapshot.derived.planInputs,
    });
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.affordances).toMatchObject({
      continue: true,
      back: true,
      savePlan: false,
      downloadReport: false,
    });
  });

  it("drives the review Assessment to a completed result and back into editing", () => {
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });

    expect(runtime.getSnapshot()).toMatchObject({
      interviewStatus: "completed",
      stage: "result",
      screen: {
        kind: "stage",
        stage: "result",
        assessment: expect.any(Object),
      },
      derived: {
        assessment: expect.any(Object),
      },
    });

    runtime.send({ type: "edit_completed_plan" });
    expect(runtime.getSnapshot()).toMatchObject({
      interviewStatus: "reviewing",
      stage: "review",
      screen: { kind: "review" },
    });
  });

  it("publishes report pending before deferred locale-aware work and preserves the Assessment", async () => {
    const scheduled: (() => void)[] = [];
    const downloadReport = vi.fn(() => true);
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      locale: "zh-TW",
      schedule: (task) => scheduled.push(task),
      downloadReport,
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    await settle(scheduled);

    const assessment = runtime.getSnapshot().derived.assessment;
    if (!assessment) throw new Error("expected a successful Assessment");
    const published = vi.fn();
    runtime.subscribe(published);

    runtime.send({ type: "request_report_download" });

    expect(runtime.getSnapshot().operations.reportDownload).toEqual({
      status: "pending",
    });
    expect(downloadReport).not.toHaveBeenCalled();
    expect(published).toHaveBeenCalledWith();

    await settle(scheduled);

    expect(downloadReport).toHaveBeenCalledWith({
      assessment,
      locale: "zh-TW",
    });
    expect(runtime.getSnapshot().operations.reportDownload).toEqual({
      status: "succeeded",
    });
    expect(runtime.getSnapshot().derived.assessment).toEqual(assessment);
  });

  const throwingReport = (): never => {
    throw new Error("report infrastructure detail");
  };
  const failedReport = (): boolean => false;

  it.each([
    ["unavailable", undefined, "capability_unavailable"],
    ["throws", throwingReport, "exception"],
    ["returns a failure", failedReport, "download_failed"],
  ] as const)("maps report capability %s to a typed operation outcome", async (_label, downloadReport, error) => {
    const scheduled: (() => void)[] = [];
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      ...(downloadReport ? { downloadReport } : {}),
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    await settle(scheduled);
    const assessment = runtime.getSnapshot().derived.assessment;

    runtime.send({ type: "request_report_download" });
    await settle(scheduled);

    expect(runtime.getSnapshot().operations.reportDownload).toEqual({
      status: "failed",
      error,
    });
    expect(runtime.getSnapshot().derived.assessment).toEqual(assessment);
  });

  it("retries a failed report only after another explicit download intent", async () => {
    const scheduled: (() => void)[] = [];
    const downloadReport = vi
      .fn<() => boolean>()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      downloadReport,
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    await settle(scheduled);

    runtime.send({ type: "request_report_download" });
    await Promise.resolve();
    expect(downloadReport).not.toHaveBeenCalled();
    await settle(scheduled);
    expect(runtime.getSnapshot().operations.reportDownload).toMatchObject({
      status: "failed",
      error: "download_failed",
    });

    runtime.send({ type: "request_report_download" });
    expect(runtime.getSnapshot().operations.reportDownload).toEqual({
      status: "pending",
    });
    await settle(scheduled);

    expect(downloadReport).toHaveBeenCalledTimes(2);
    expect(runtime.getSnapshot().operations.reportDownload).toEqual({
      status: "succeeded",
    });
  });

  it("keeps analytics best-effort and independent from report work", async () => {
    const scheduled: (() => void)[] = [];
    let rejectAnalytics: (() => void) | undefined;
    const trackAnalytics = vi.fn(
      () =>
        new Promise<boolean>((_, reject) => {
          rejectAnalytics = () => reject(new Error("telemetry unavailable"));
        }),
    );
    const downloadReport = vi.fn(() => true);
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      trackAnalytics,
      downloadReport,
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    await settle(scheduled);
    const assessment = runtime.getSnapshot().derived.assessment;
    if (!assessment) throw new Error("expected a successful Assessment");

    runtime.send({
      type: "request_analytics",
      eventName: "completed",
      stage: "result",
    });
    runtime.send({ type: "request_report_download" });
    expect(runtime.getSnapshot().operations).toMatchObject({
      analytics: { status: "pending" },
      reportDownload: { status: "pending" },
    });

    await settle(scheduled);
    expect(trackAnalytics).toHaveBeenCalledWith({
      eventName: "completed",
      stage: "result",
    });
    expect(downloadReport).toHaveBeenCalledWith({
      assessment,
      locale: "en",
    });
    expect(runtime.getSnapshot().operations.reportDownload).toEqual({
      status: "succeeded",
    });
    expect(runtime.getSnapshot().issues).toEqual([]);

    rejectAnalytics?.();
    await settle(scheduled);

    expect(runtime.getSnapshot().operations.analytics).toEqual({
      status: "failed",
      error: "analytics_failed",
    });
    expect(runtime.getSnapshot().derived.assessment).toEqual(assessment);
    expect(runtime.getSnapshot().operations.reportDownload).toEqual({
      status: "succeeded",
    });
  });

  it("ignores a late report result after the Assessment has changed and after disposal", async () => {
    const scheduled: (() => void)[] = [];
    let resolveReport: ((value: boolean) => void) | undefined;
    const downloadReport = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveReport = resolve;
        }),
    );
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      downloadReport,
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    await settle(scheduled);
    runtime.send({ type: "request_report_download" });
    await settle(scheduled);
    expect(downloadReport).toHaveBeenCalledOnce();

    runtime.send({ type: "edit_completed_plan" });
    const afterEdit = runtime.getSnapshot();
    runtime.dispose();
    resolveReport?.(true);
    await settle(scheduled);

    expect(runtime.getSnapshot().lifecycle).toBe("disposed");
    expect(runtime.getSnapshot().derived.assessment).toEqual(afterEdit.derived.assessment);
    expect(runtime.getSnapshot().operations.reportDownload).toEqual({
      status: "pending",
    });
  });

  it("supports public stage navigation without exposing a reducer transition", () => {
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
    });
    runtime.start();
    runtime.send({ type: "select_country", country: "US" });
    runtime.send({ type: "select_region", region: "CA" });
    runtime.send({ type: "select_currency", currency: "USD" });
    runtime.send({ type: "continue" });

    expect(runtime.getSnapshot().stage).toBe("household");
    runtime.send({ type: "back" });
    expect(runtime.getSnapshot()).toMatchObject({
      interviewStatus: "collecting",
      stage: "location",
      screen: { kind: "location" },
    });
  });

  it("does not publish or run deferred capability work after disposal", () => {
    const scheduled: (() => void)[] = [];
    const focus = vi.fn();
    const published = vi.fn();
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      focus,
    });
    runtime.subscribe(published);
    runtime.start();
    runtime.dispose();
    runtime.dispose();
    const publicationCount = published.mock.calls.length;

    scheduled.shift()?.();
    runtime.send({ type: "select_country", country: "US" });

    expect(focus).not.toHaveBeenCalled();
    expect(published).toHaveBeenCalledTimes(publicationCount);
    expect(runtime.getSnapshot().lifecycle).toBe("disposed");
  });

  it("starts capability requests after publication and ignores a late Plan outcome", async () => {
    const scheduled: (() => void)[] = [];
    let resolvePlan:
      | ((value: HouseholdRunwayInterviewRuntimePlanResult) => void)
      | undefined;
    const persistPlan = vi.fn(
      () =>
        new Promise<HouseholdRunwayInterviewRuntimePlanResult>((resolve) => {
          resolvePlan = resolve;
        }),
    );
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      persistPlan,
    });
    const published = vi.fn();
    runtime.subscribe(published);
    runtime.start();
    await Promise.resolve();
    while (scheduled.length > 0) scheduled.shift()?.();
    driveToReview(runtime);
    await Promise.resolve();
    while (scheduled.length > 0) scheduled.shift()?.();
    runtime.send({ type: "continue" });
    runtime.send({ type: "save_plan" });

    expect(persistPlan).not.toHaveBeenCalled();
    const publicationCount = published.mock.calls.length;
    await Promise.resolve();
    scheduled.shift()?.();
    scheduled.shift()?.();
    expect(persistPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: expect.objectContaining({ country: "US", region: "CA" }),
        expectedPlanRevision: 0,
      }),
    );

    runtime.dispose();
    const result = runtime.getSnapshot().derived;
    if (!resolvePlan || !result.planInputs || !result.assessment) {
      throw new Error("expected a pending plan result");
    }
    resolvePlan({
      planRevision: 1,
      planInputs: result.planInputs as HouseholdRunwayInterviewRuntimePlanResult["planInputs"],
      assessment: result.assessment as HouseholdRunwayInterviewRuntimePlanResult["assessment"],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(published).toHaveBeenCalledTimes(publicationCount);
    expect(runtime.getSnapshot().lifecycle).toBe("disposed");
  });
  it("projects operation status without exposing protocol or retry metadata", async () => {
    const scheduled: (() => void)[] = [];
    const persistPlan = vi.fn(
      () =>
        new Promise<HouseholdRunwayInterviewRuntimePlanResult>(() => {
          // Keep the capability pending so the public status is observable.
        }),
    );
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      persistPlan,
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    runtime.send({ type: "save_plan" });

    expect(runtime.getSnapshot().operations.planPersistence).toEqual({
      status: "pending",
    });
    expect(runtime.getSnapshot().operations.planPersistence).not.toHaveProperty(
      "correlationId",
    );
    expect(runtime.getSnapshot().operations.planPersistence).not.toHaveProperty(
      "idempotencyKey",
    );

    await Promise.resolve();
    scheduled.splice(0).forEach((task) => task());
    expect(persistPlan).toHaveBeenCalledTimes(1);
  });

  it("treats repeated public save intents as an idempotent no-op while the operation is pending", async () => {
    const scheduled: (() => void)[] = [];
    const persistPlan = vi.fn(
      () =>
        new Promise<HouseholdRunwayInterviewRuntimePlanResult>(() => {
          // Keep the capability pending.
        }),
    );
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      persistPlan,
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    runtime.send({ type: "save_plan" });
    runtime.send({ type: "save_plan" });

    await Promise.resolve();
    scheduled.splice(0).forEach((task) => task());
    expect(persistPlan).toHaveBeenCalledTimes(1);
  });

  it("ignores a stale capability result without suppressing later public transitions", async () => {
    const scheduled: (() => void)[] = [];
    let resolvePlan:
      | ((value: HouseholdRunwayInterviewRuntimePlanResult) => void)
      | undefined;
    const persistPlan = vi.fn(
      () =>
        new Promise<HouseholdRunwayInterviewRuntimePlanResult>((resolve) => {
          resolvePlan = resolve;
        }),
    );
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      persistPlan,
    });
    const published = vi.fn();
    runtime.subscribe(published);
    runtime.start();
    await Promise.resolve();
    scheduled.splice(0).forEach((task) => task());
    driveToReview(runtime);
    await Promise.resolve();
    scheduled.splice(0).forEach((task) => task());
    runtime.send({ type: "continue" });
    runtime.send({ type: "save_plan" });
    await Promise.resolve();
    scheduled.splice(0).forEach((task) => task());

    const pending = runtime.getSnapshot().derived;
    if (!resolvePlan || !pending.planInputs || !pending.assessment) {
      throw new Error("expected a pending plan result");
    }
    runtime.send({
      type: "set_plan_adjustment",
      patch: { expense_reduction_cents: 100 },
    });
    const afterEdit = published.mock.calls.length;
    resolvePlan({
      planRevision: 1,
      planInputs:
        pending.planInputs as HouseholdRunwayInterviewRuntimePlanResult["planInputs"],
      assessment:
        pending.assessment as HouseholdRunwayInterviewRuntimePlanResult["assessment"],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(published).toHaveBeenCalledTimes(afterEdit);
    runtime.send({ type: "reset_plan_adjustment" });
    expect(published).toHaveBeenCalledTimes(afterEdit + 1);
  });

  it("publishes each synchronous transition before the capability scheduler is entered", async () => {
    const order: string[] = [];
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => {
        order.push("schedule");
        task();
      },
      focus: () => order.push("focus"),
    });
    runtime.subscribe(() => order.push(runtime.getSnapshot().lifecycle));

    runtime.start();

    expect(order).toEqual(["initializing", "ready"]);
    await Promise.resolve();
    expect(order).toEqual(["initializing", "ready", "schedule", "focus"]);
  });

  it("holds initialization behind restoration and deterministically selects the newer stored Draft", async () => {
    const scheduled: (() => void)[] = [];
    let resolveRestore: ((value: unknown) => void) | undefined;
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      restore: () =>
        new Promise((resolve) => {
          resolveRestore = resolve;
        }),
    });
    const published: HouseholdRunwayInterviewRuntimeSnapshot[] = [];
    runtime.subscribe(() => published.push(runtime.getSnapshot()));

    runtime.start();
    runtime.send({ type: "select_country", country: "US" });
    expect(runtime.getSnapshot().lifecycle).toBe("initializing");
    expect(runtime.getSnapshot().screen.kind).toBe("landing");

    await Promise.resolve();
    scheduled.shift()?.();
    resolveRestore?.({
      session: { status: "restored", state: storedDraft(2) },
      device: { status: "restored", state: storedDraft(3) },
      deviceStorageConsent: true,
    });
    await settle(scheduled);

    expect(runtime.getSnapshot().lifecycle).toBe("ready");
    expect(runtime.getSnapshot().screen.kind).toBe("location");
    expect(runtime.getSnapshot().draft).toEqual({
      current: true,
      stored: true,
      session: true,
      device: true,
      deviceStorageConsent: true,
    });
    expect(published.map((snapshot) => snapshot.lifecycle)).toEqual([
      "initializing",
      "ready",
    ]);
  });

  it("recovers from rejected restoration without blocking a usable Interview", async () => {
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      restore: async () => ({
        session: { status: "rejected", code: "expired" },
        device: { status: "missing" },
      }),
    });

    runtime.start();
    await settle([]);

    expect(runtime.getSnapshot()).toMatchObject({
      lifecycle: "ready",
      screen: { kind: "location" },
      issues: [{ code: "draft_recovery" }],
      draft: { stored: false },
    });
  });

  it("exposes a resume choice when the selected Draft differs from the committed Plan", async () => {
    const source = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "source",
    });
    source.start();
    driveToReview(source);
    const planInputs = source.getSnapshot().derived.planInputs as
      | HouseholdRunwayInterviewRuntimePlanResult["planInputs"]
      | null;
    if (!planInputs) throw new Error("expected plan inputs");

    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      initialPlan: { revision: 1, inputs: planInputs },
      restore: async () => ({
        device: { status: "restored", state: storedDraft(4) },
        deviceStorageConsent: true,
      }),
    });
    runtime.start();
    await settle([]);

    expect(runtime.getSnapshot()).toMatchObject({
      lifecycle: "ready",
      interviewStatus: "not_started",
      screen: { kind: "resume_choice", recommended: "draft" },
      draft: { device: true, deviceStorageConsent: true },
    });

    runtime.send({ type: "resume_committed_plan" });
    expect(runtime.getSnapshot()).toMatchObject({
      interviewStatus: "completed",
      screen: { kind: "stage", stage: "result" },
    });
  });

  it("holds authenticated Plan bootstrap behind initialization and publishes committed history", async () => {
    const source = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "source",
    });
    source.start();
    driveToReview(source);
    source.send({ type: "continue" });
    const planInputs = source.getSnapshot().derived.planInputs as
      | HouseholdRunwayInterviewRuntimePlanResult["planInputs"]
      | null;
    if (!planInputs) throw new Error("expected committed Plan inputs");

    const scheduled: (() => void)[] = [];
    let resolvePlan:
      | ((value: {
          plan: {
            revision: number;
            inputs: HouseholdRunwayInterviewRuntimePlanResult["planInputs"];
          };
          snapshots: RunwaySnapshotSummary[];
        }) => void)
      | undefined;
    const history = {
      id: "snapshot-1",
      trigger: "completed" as const,
      scenario: "current" as const,
      months_covered: 4,
      sustainable: false,
      model_version: "4.0.0",
      created_at: now,
    };
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      restore: async () => ({
        session: { status: "missing" as const },
        device: { status: "missing" as const },
      }),
      restorePlan: () =>
        new Promise((resolve) => {
          resolvePlan = resolve;
        }),
    });

    runtime.start();
    await Promise.resolve();
    scheduled.splice(0).forEach((task) => task());
    expect(runtime.getSnapshot().lifecycle).toBe("initializing");

    resolvePlan?.({ plan: { revision: 7, inputs: planInputs }, snapshots: [history] });
    await settle(scheduled);

    expect(runtime.getSnapshot()).toMatchObject({
      lifecycle: "ready",
      interviewStatus: "completed",
      plan: { exists: true, revision: 7, inputs: planInputs },
      assessmentHistory: [history],
    });
  });

  it("lets authenticated Plan bootstrap replace or clear a stale initial Plan", async () => {
    const source = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "source",
    });
    source.start();
    driveToReview(source);
    source.send({ type: "continue" });
    const inputs = source.getSnapshot().derived.planInputs as
      | HouseholdRunwayInterviewRuntimePlanResult["planInputs"]
      | null;
    if (!inputs) throw new Error("expected Plan inputs");

    const scheduled: (() => void)[] = [];
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      initialPlan: { revision: 1, inputs },
      schedule: (task) => scheduled.push(task),
      restorePlan: async () => ({
        plan: { revision: 4, inputs },
        snapshots: [],
      }),
    });
    runtime.start();
    await settle(scheduled);
    expect(runtime.getSnapshot().plan.revision).toBe(4);

    const cleared = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-2",
      initialPlan: { revision: 1, inputs },
      restorePlan: async () => ({ plan: null, snapshots: [] }),
    });
    cleared.start();
    await settle([]);
    expect(cleared.getSnapshot().plan).toEqual({ exists: false, revision: null });
  });

  it("publishes a successful Plan save with authoritative Plan and Assessment history", async () => {
    const scheduled: (() => void)[] = [];
    const history = {
      id: "snapshot-2",
      trigger: "updated" as const,
      scenario: "current" as const,
      months_covered: 6,
      sustainable: true,
      model_version: "4.0.0",
      created_at: now,
    };
    const requests: unknown[] = [];
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      persistPlan: (request) => {
        requests.push(request);
        return Promise.resolve({
          planRevision: 3,
          planInputs: request.inputs,
          assessment: request.assessment,
          snapshot: history,
          snapshots: [history],
        });
      },
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    runtime.send({ type: "save_plan" });

    expect(requests).toHaveLength(0);
    await settle(scheduled);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      expectedPlanRevision: 0,
      idempotencyKey: expect.any(String),
      snapshotActionId: expect.any(String),
    });
    expect((requests[0] as { idempotencyKey: string }).idempotencyKey).toBe(
      (requests[0] as { snapshotActionId: string }).snapshotActionId,
    );
    expect(runtime.getSnapshot()).toMatchObject({
      plan: { exists: true, revision: 3 },
      assessmentHistory: [history],
      operations: { planPersistence: { status: "succeeded" } },
    });
    expect(runtime.getSnapshot().draft.current).toBe(true);
  });

  it.each([
    ["authentication_required", undefined],
    ["conflict", 8],
  ] as const)("preserves the active Draft for a recoverable %s save failure", async (error, currentPlanRevision) => {
    const scheduled: (() => void)[] = [];
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      persistPlan: () => ({
        success: false,
        error,
        ...(currentPlanRevision === undefined ? {} : { currentPlanRevision }),
      }),
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    runtime.send({ type: "save_plan" });
    await settle(scheduled);

    expect(runtime.getSnapshot()).toMatchObject({
      operations: {
        planPersistence: {
          status: "failed",
          error,
          ...(currentPlanRevision === undefined ? {} : { currentPlanRevision }),
        },
      },
      draft: { current: true },
    });
  });

  it("publishes a typed unavailable outcome when Plan persistence is not supplied", async () => {
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    runtime.send({ type: "save_plan" });
    await settle([]);

    expect(runtime.getSnapshot().operations.planPersistence).toEqual({
      status: "failed",
      error: "capability_unavailable",
    });
    expect(runtime.getSnapshot().draft.current).toBe(true);
  });

  it("maps thrown Plan persistence failures to a typed recoverable issue", async () => {
    const scheduled: (() => void)[] = [];
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      persistPlan: () => {
        throw new Error("persistence exploded");
      },
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    runtime.send({ type: "save_plan" });
    await settle(scheduled);

    expect(runtime.getSnapshot().operations.planPersistence).toEqual({
      status: "failed",
      error: "exception",
    });
    expect(runtime.getSnapshot().draft.current).toBe(true);
  });

  it("reuses Plan idempotency for an ambiguous revision and changes it for a new revision", async () => {
    const scheduled: (() => void)[] = [];
    const requests: Array<{ idempotencyKey: string }> = [];
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: (() => {
        let count = 0;
        return () => `id-${++count}`;
      })(),
      schedule: (task) => scheduled.push(task),
      persistPlan: (request) => {
        requests.push(request);
        return { success: false as const, error: "network" as const };
      },
    });
    runtime.start();
    driveToReview(runtime);
    runtime.send({ type: "continue" });
    runtime.send({ type: "save_plan" });
    await settle(scheduled);
    runtime.send({ type: "save_plan" });
    await settle(scheduled);

    expect(requests).toHaveLength(2);
    expect(requests[1]?.idempotencyKey).toBe(requests[0]?.idempotencyKey);

    runtime.send({ type: "set_plan_adjustment", patch: { expense_reduction_cents: 100 } });
    runtime.send({ type: "apply_plan_adjustment" });
    runtime.send({ type: "save_plan" });
    await settle(scheduled);

    expect(requests).toHaveLength(3);
    expect(requests[2]?.idempotencyKey).not.toBe(requests[0]?.idempotencyKey);
  });

  it("coalesces autosave to the latest revision and retries a failed sync on the next intent", async () => {
    const scheduled: (() => void)[] = [];
    const completions: Array<(value: boolean) => void> = [];
    const synchronizeDraft = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          completions.push(resolve);
        }),
    );
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      synchronizeDraft,
    });
    runtime.start();
    await settle(scheduled);
    driveToReview(runtime);
    await settle(scheduled);

    expect(synchronizeDraft).toHaveBeenCalledTimes(1);
    runtime.send({ type: "continue" });
    runtime.send({
      type: "set_plan_adjustment",
      patch: { expense_reduction_cents: 100 },
    });
    await settle(scheduled);
    expect(synchronizeDraft).toHaveBeenCalledTimes(2);

    completions[0]?.(true);
    await settle(scheduled);
    expect(runtime.getSnapshot().operations.draftSynchronization.status).toBe("pending");
    completions[1]?.(false);
    await settle(scheduled);
    expect(runtime.getSnapshot().operations.draftSynchronization.status).toBe("failed");

    runtime.send({ type: "back" });
    await settle(scheduled);
    expect(synchronizeDraft).toHaveBeenCalledTimes(3);
    completions[2]?.(true);
    await settle(scheduled);
    expect(runtime.getSnapshot().operations.draftSynchronization.status).toBe("succeeded");
  });

  it("keeps a Draft unchanged when destructive confirmation is refused and clears only after acceptance", async () => {
    const scheduled: (() => void)[] = [];
    const confirmationResolvers: Array<(value: boolean) => void> = [];
    const confirm = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          confirmationResolvers.push(resolve);
        }),
    );
    const clearDraft = vi.fn(() => true);
    const runtime = createHouseholdRunwayInterviewRuntime({
      now: () => now,
      createId: () => "interview-1",
      schedule: (task) => scheduled.push(task),
      confirm,
      clearDraft,
    });
    runtime.start();
    driveToReview(runtime);
    const before = runtime.getSnapshot();

    runtime.send({ type: "discard_draft" });
    expect(runtime.getSnapshot().confirmation).toEqual({
      status: "pending",
      action: "discard_draft",
    });
    expect(runtime.getSnapshot().interviewStatus).toBe(before.interviewStatus);
    expect(clearDraft).not.toHaveBeenCalled();

    await Promise.resolve();
    confirmationResolvers.shift()?.(false);
    await settle(scheduled);
    expect(runtime.getSnapshot().confirmation).toEqual({ status: "idle" });
    expect(runtime.getSnapshot().interviewStatus).toBe("reviewing");
    expect(clearDraft).not.toHaveBeenCalled();

    runtime.send({ type: "discard_draft" });
    await Promise.resolve();
    confirmationResolvers.shift()?.(true);
    await settle(scheduled);
    expect(clearDraft).toHaveBeenCalledWith({ scope: "all" });
    expect(runtime.getSnapshot().interviewStatus).toBe("not_started");
  });
});
