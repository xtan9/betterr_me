import { describe, expect, it, vi } from "vitest";
import {
  createHouseholdRunwayInterviewRuntime,
  type HouseholdRunwayInterviewRuntimePlanResult,
  type HouseholdRunwayInterviewRuntimeSnapshot,
} from "@/lib/finance/household-runway-interview-runtime";
import { createHouseholdRunwayInterview } from "@/lib/finance/household-runway-interview";

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
      type: "request_analytics",
      eventName: "interview_started",
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
