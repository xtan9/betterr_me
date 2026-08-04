import { describe, expect, it, vi } from "vitest";
import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import {
  applyHouseholdRunwayBrowserEffect,
  executeHouseholdRunwayBrowserEffect,
  householdRunwayHistoryProjectionCommand,
  readHouseholdRunwayBrowserStorage,
  type HouseholdRunwayBrowserEnvironment,
} from "@/lib/finance/household-runway-browser-adapter";
import { createHouseholdRunwayInterview } from "@/lib/finance/household-runway-interview";
import { createDefaultRunwayAnswers } from "@/lib/finance/cushion";

function createEnvironment() {
  const history = {
    back: vi.fn(),
    pushState: vi.fn(),
    replaceState: vi.fn(),
  };
  const heading = { focus: vi.fn() };
  const environment: HouseholdRunwayBrowserEnvironment = {
    location: {
      href: "https://betterr.me/finance/cushion?campaign=launch#runway",
    },
    history,
    document: {
      getElementById: vi.fn(() => heading),
    },
    requestAnimationFrame: (callback) => {
      callback();
      return 0;
    },
  };
  return { environment, history, heading };
}

function successfulAssessment() {
  const answers = createDefaultRunwayAnswers(
    new Date("2026-08-02T00:00:00.000Z"),
  );
  answers.region = "CA";
  const outcome = assessHouseholdRunway({ answers });
  if (!outcome.success) throw new Error("fixture assessment failed");
  return outcome;
}

describe("Household Runway browser adapter", () => {
  it("translates URL projections into typed semantic commands", () => {
    expect(
      householdRunwayHistoryProjectionCommand({
        href: "https://betterr.me/finance/cushion?campaign=launch",
        interviewStarted: true,
        interviewId: "interview-1",
      }),
    ).toEqual({
      type: "history_projection_changed",
      destination: "landing",
    });

    expect(
      householdRunwayHistoryProjectionCommand({
        href: "https://betterr.me/finance/cushion?start=1&campaign=launch",
        interviewStarted: false,
        interviewId: "interview-1",
        stage: "household",
      }),
    ).toEqual({
      type: "history_projection_changed",
      destination: "interview",
      interviewId: "interview-1",
      stage: "household",
    });

    expect(
      householdRunwayHistoryProjectionCommand({
        href: "https://betterr.me/finance/cushion?start=1",
        interviewStarted: true,
        interviewId: "interview-1",
      }),
    ).toBeNull();
  });

  it("applies history effects without making URL state a second owner", () => {
    const { environment, history } = createEnvironment();

    expect(
      applyHouseholdRunwayBrowserEffect(
        { type: "history", action: "push", destination: "interview" },
        environment,
      ),
    ).toEqual({ type: "history", outcome: "applied" });
    expect(history.pushState).toHaveBeenCalledWith(
      {},
      "",
      "/finance/cushion?campaign=launch&start=1#runway",
    );

    expect(
      applyHouseholdRunwayBrowserEffect(
        { type: "history", action: "replace", destination: "landing" },
        environment,
      ),
    ).toEqual({ type: "history", outcome: "applied" });
    expect(history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/finance/cushion?campaign=launch#runway",
    );

    expect(
      applyHouseholdRunwayBrowserEffect(
        { type: "history", action: "back", destination: "landing" },
        environment,
      ),
    ).toEqual({ type: "history", outcome: "applied" });
    expect(history.back).toHaveBeenCalledOnce();
  });

  it("returns a typed focus outcome and never touches the DOM in Interview core", () => {
    const { environment, heading } = createEnvironment();

    expect(
      applyHouseholdRunwayBrowserEffect(
        { type: "focus", stage: "expenses" },
        environment,
      ),
    ).toEqual({ type: "focus", stage: "expenses", outcome: "focused" });
    expect(heading.focus).toHaveBeenCalledOnce();
  });

  it("reports unavailable browser capabilities as operation-local outcomes", () => {
    const environment: HouseholdRunwayBrowserEnvironment = {
      location: { href: "https://betterr.me/finance/cushion" },
      history: {
        back: vi.fn(),
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
      document: { getElementById: vi.fn(() => null) },
    };
    expect(
      applyHouseholdRunwayBrowserEffect({
        type: "focus",
        stage: "location",
      }, environment),
    ).toEqual({
      type: "focus",
      stage: "location",
      outcome: "unavailable",
    });

    expect(
      applyHouseholdRunwayBrowserEffect(
        { type: "focus", stage: "location" },
        null as never,
      ),
    ).toEqual({
      type: "focus",
      stage: "location",
      outcome: "unavailable",
    });

    expect(
      applyHouseholdRunwayBrowserEffect(
        { type: "history", action: "push", destination: "interview" },
        null as never,
      ),
    ).toEqual({ type: "history", outcome: "unavailable" });
  });

  it("contains history and focus adapter failures", () => {
    expect(
      applyHouseholdRunwayBrowserEffect(
        { type: "history", action: "push", destination: "interview" },
        {
          ...createEnvironment().environment,
          location: { href: "not-a-url" },
        },
      ),
    ).toEqual({ type: "history", outcome: "unavailable" });

    const historyFailure = createEnvironment().environment;
    historyFailure.history.pushState = vi.fn(() => {
      throw new Error("history unavailable");
    });
    expect(
      applyHouseholdRunwayBrowserEffect(
        { type: "history", action: "push", destination: "interview" },
        historyFailure,
      ),
    ).toEqual({ type: "history", outcome: "unavailable" });

    const focusFailure = createEnvironment().environment;
    focusFailure.requestAnimationFrame = () => {
      throw new Error("animation unavailable");
    };
    expect(
      applyHouseholdRunwayBrowserEffect(
        { type: "focus", stage: "location" },
        focusFailure,
      ),
    ).toEqual({ type: "focus", stage: "location", outcome: "unavailable" });
  });

  it("uses the browser globals when no environment is injected", () => {
    const originalAnimationFrame = window.requestAnimationFrame;
    const pushState = vi
      .spyOn(window.history, "pushState")
      .mockImplementation(() => undefined);
    const replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => undefined);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const heading = document.createElement("h2");
    heading.id = "runway-question-heading";
    document.body.appendChild(heading);
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 0;
    };

    try {
      expect(
        applyHouseholdRunwayBrowserEffect({
          type: "history",
          action: "push",
          destination: "interview",
        }),
      ).toEqual({ type: "history", outcome: "applied" });
      expect(
        applyHouseholdRunwayBrowserEffect({
          type: "history",
          action: "replace",
          destination: "landing",
        }),
      ).toEqual({ type: "history", outcome: "applied" });
      expect(
        applyHouseholdRunwayBrowserEffect({
          type: "history",
          action: "back",
          destination: "landing",
        }),
      ).toEqual({ type: "history", outcome: "applied" });
      expect(
        applyHouseholdRunwayBrowserEffect({ type: "focus", stage: "result" }),
      ).toEqual({ type: "focus", stage: "result", outcome: "focused" });
      expect(pushState).toHaveBeenCalled();
      expect(replaceState).toHaveBeenCalled();
      expect(back).toHaveBeenCalled();
      expect(heading).toBeInTheDocument();
    } finally {
      window.requestAnimationFrame = originalAnimationFrame;
      heading.remove();
      pushState.mockRestore();
      replaceState.mockRestore();
      back.mockRestore();
    }
  });

  it("reports the three browser storage scopes at the adapter boundary", () => {
    expect(readHouseholdRunwayBrowserStorage()).toEqual({
      session: { status: "empty", state: null, source: null },
      device: { status: "empty", state: null, source: null },
      deviceStorageConsent: false,
    });
  });

  it("reports scheduled focus when the browser defers requestAnimationFrame", () => {
    const { environment, heading } = createEnvironment();
    let callback: (() => void) | undefined;
    environment.requestAnimationFrame = (next) => {
      callback = next;
      return 0;
    };

    expect(
      applyHouseholdRunwayBrowserEffect(
        { type: "focus", stage: "household" },
        environment,
      ),
    ).toEqual({ type: "focus", stage: "household", outcome: "scheduled" });
    expect(heading.focus).not.toHaveBeenCalled();
    callback?.();
    expect(heading.focus).toHaveBeenCalledOnce();
  });

  it("turns local storage failure into a typed draft synchronization failure", async () => {
    const state = createHouseholdRunwayInterview();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(
      () => {
        throw new Error("storage unavailable");
      },
    );

    const result = await executeHouseholdRunwayBrowserEffect({
      type: "draft_sync_requested",
      draft: state.draft,
      status: state.status,
      stage: state.stage,
      sourceRevision: state.draft.revision,
      correlationId: "draft-sync",
    });

    expect(result.command).toEqual({
      type: "draft_synchronization_failed",
      sourceRevision: state.draft.revision,
      correlationId: "draft-sync",
      error: "storage_unavailable",
    });
    setItem.mockRestore();
  });

  it("executes remember, import, and clear-all device operations with typed results", async () => {
    const state = createHouseholdRunwayInterview();
    const remember = await executeHouseholdRunwayBrowserEffect({
      type: "draft_device_remember_requested",
      draft: state.draft,
      status: state.status,
      stage: state.stage,
      sourceRevision: state.draft.revision,
      correlationId: "remember",
    });
    expect(remember).toMatchObject({
      command: {
        type: "draft_device_operation_succeeded",
        action: "remember",
      },
      hasLocalDraft: true,
      deviceStorageConsent: true,
    });

    const imported = await executeHouseholdRunwayBrowserEffect({
      type: "draft_device_import_requested",
      draft: state.draft,
      status: state.status,
      stage: state.stage,
      sourceRevision: state.draft.revision,
      correlationId: "import",
    });
    expect(imported).toMatchObject({
      command: {
        type: "draft_device_operation_succeeded",
        action: "import",
      },
      hasLocalDraft: true,
      deviceStorageConsent: true,
    });

    const cleared = await executeHouseholdRunwayBrowserEffect({
      type: "draft_device_clear_requested",
      scope: "all",
      sourceRevision: state.draft.revision,
      correlationId: "clear-all",
    });
    expect(cleared).toMatchObject({
      command: {
        type: "draft_device_operation_succeeded",
        action: "clear",
      },
      hasLocalDraft: false,
      deviceStorageConsent: false,
    });
  });

  it("turns a device operation storage exception into a failed completion", async () => {
    const state = createHouseholdRunwayInterview();
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("device storage unavailable");
    });

    const result = await executeHouseholdRunwayBrowserEffect({
      type: "draft_device_remember_requested",
      draft: state.draft,
      status: state.status,
      stage: state.stage,
      sourceRevision: state.draft.revision,
      correlationId: "remember-failed",
    });

    expect(result).toMatchObject({
      command: {
        type: "draft_device_operation_failed",
        action: "remember",
        error: "storage_unavailable",
      },
      deviceStorageConsent: false,
    });
    setItem.mockRestore();
  });

  it("reports missing report presentation without changing the assessment", async () => {
    const state = createHouseholdRunwayInterview();
    const assessment = successfulAssessment();
    const effect = {
      type: "report_download_requested" as const,
      assessment,
      sourceRevision: state.draft.revision,
      correlationId: "report",
    };

    const result = await executeHouseholdRunwayBrowserEffect(effect);

    expect(result.command).toEqual({
      type: "report_download_failed",
      sourceRevision: state.draft.revision,
      correlationId: "report",
      error: "download_failed",
    });
  });

  it("maps a persistence conflict response to a retryable typed outcome", async () => {
    const assessment = successfulAssessment();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ current_revision: 7 }), { status: 409 }),
      );

    const result = await executeHouseholdRunwayBrowserEffect({
      type: "plan_persistence_requested",
      inputs: assessment.answers,
      assessment,
      sourceRevision: 3,
      correlationId: "plan",
      idempotencyKey: "74a303ae-1ba3-4ab5-beb9-5317eb94c790",
      expectedPlanRevision: 6,
      adjustments: {
        expense_reduction_cents: 0,
        added_cash_cents: 0,
        added_monthly_income_cents: 0,
        expected_unconfirmed_funds_cents: 0,
        usable_illiquid_investments_cents: 0,
        usable_retirement_tax_deferred_cents: 0,
        usable_retirement_tax_free_cents: 0,
      },
      snapshotTrigger: "updated",
    });

    expect(result.command).toEqual({
      type: "plan_persistence_failed",
      sourceRevision: 3,
      correlationId: "plan",
      currentPlanRevision: 7,
      error: "conflict",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });

  it.each([
    [401, "authentication_required"],
    [403, "authentication_required"],
    [422, "invalid"],
    [500, "network"],
  ] as const)("maps persistence status %s to %s", async (status, error) => {
    const assessment = successfulAssessment();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status }));

    const result = await executeHouseholdRunwayBrowserEffect({
      type: "plan_persistence_requested",
      inputs: assessment.answers,
      assessment,
      sourceRevision: 3,
      correlationId: `plan-${status}`,
      idempotencyKey: "plan-key",
      expectedPlanRevision: 6,
      adjustments: {
        expense_reduction_cents: 0,
        added_cash_cents: 0,
        added_monthly_income_cents: 0,
        expected_unconfirmed_funds_cents: 0,
        usable_illiquid_investments_cents: 0,
        usable_retirement_tax_deferred_cents: 0,
        usable_retirement_tax_free_cents: 0,
      },
      snapshotTrigger: "updated",
    });

    expect(result.command).toMatchObject({ type: "plan_persistence_failed", error });
    fetchMock.mockRestore();
  });

  it("returns a committed plan payload and isolates malformed responses", async () => {
    const assessment = successfulAssessment();
    const effect = {
      type: "plan_persistence_requested" as const,
      inputs: assessment.answers,
      assessment,
      sourceRevision: 3,
      correlationId: "plan-success",
      idempotencyKey: "plan-key",
      expectedPlanRevision: 6,
      adjustments: {
        expense_reduction_cents: 0,
        added_cash_cents: 0,
        added_monthly_income_cents: 0,
        expected_unconfirmed_funds_cents: 0,
        usable_illiquid_investments_cents: 0,
        usable_retirement_tax_deferred_cents: 0,
        usable_retirement_tax_free_cents: 0,
      },
      snapshotTrigger: "updated" as const,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          revision: 8,
          plan: { answers: assessment.answers },
          assessment,
          snapshot: {
            id: "snapshot-1",
            trigger: "updated",
            scenario: "current",
            months_covered: 5,
            sustainable: false,
            model_version: "4.0.0",
            created_at: "2026-08-02T00:00:00.000Z",
          },
          snapshots: [],
        }),
        { status: 200 },
      ),
    );
    const saved = await executeHouseholdRunwayBrowserEffect(effect);
    expect(saved).toMatchObject({
      command: {
        type: "plan_persistence_succeeded",
        planRevision: 8,
        planInputs: assessment.answers,
      },
      planExists: true,
      snapshots: [],
    });
    fetchMock.mockRestore();

    const malformedFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ revision: 8 }), { status: 200 }));
    await expect(executeHouseholdRunwayBrowserEffect(effect)).resolves.toMatchObject({
      command: {
        type: "plan_persistence_failed",
        error: "network",
      },
    });
    malformedFetch.mockRestore();

    const invalidJsonFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{", { status: 200 }));
    await expect(executeHouseholdRunwayBrowserEffect(effect)).resolves.toMatchObject({
      command: {
        type: "plan_persistence_failed",
        error: "network",
      },
    });
    invalidJsonFetch.mockRestore();
  });

  it("completes analytics effects through the same typed command seam", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }));
    const effect = {
      type: "analytics_requested" as const,
      eventName: "completed" as const,
      stage: "result" as const,
      sourceRevision: 4,
      correlationId: "analytics",
    };

    await expect(executeHouseholdRunwayBrowserEffect(effect)).resolves.toMatchObject({
      command: {
        type: "analytics_succeeded",
        sourceRevision: 4,
      },
    });
    await expect(executeHouseholdRunwayBrowserEffect(effect)).resolves.toMatchObject({
      command: {
        type: "analytics_failed",
        sourceRevision: 4,
      },
    });
    fetchMock.mockRestore();
  });
});
