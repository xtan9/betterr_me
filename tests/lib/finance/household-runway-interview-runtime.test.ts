import { describe, expect, it, vi } from "vitest";
import {
  createHouseholdRunwayInterviewRuntime,
  type HouseholdRunwayInterviewRuntimePlanResult,
  type HouseholdRunwayInterviewRuntimeSnapshot,
} from "@/lib/finance/household-runway-interview-runtime";

const now = "2026-08-03T15:00:00.000Z";

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
    expect(snapshot).not.toHaveProperty("draft");
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
});
