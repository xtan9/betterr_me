import { describe, expect, it, vi } from "vitest";
import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import {
  applyHouseholdRunwayBrowserEffect,
  createHouseholdRunwayBrowserAdapter,
  executeHouseholdRunwayBrowserEffect,
  householdRunwayHistoryProjectionCommand,
  readHouseholdRunwayBrowserStorage,
  restoreHouseholdRunwayBrowserRuntime,
  type HouseholdRunwayBrowserEnvironment,
} from "@/lib/finance/household-runway-browser-adapter";
import { createHouseholdRunwayInterview } from "@/lib/finance/household-runway-interview";
import { createDefaultRunwayAnswers } from "@/lib/finance/cushion";
import { rememberHouseholdRunwayDraft } from "@/lib/finance/runway-draft-client";

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

function createAdapterEnvironment(href = "https://betterr.me/finance/cushion?start=1") {
  const listeners = new Map<string, Set<() => void>>();
  const frames = new Map<number, () => void>();
  let nextFrame = 1;
  const environment: HouseholdRunwayBrowserEnvironment = {
    location: { href },
    history: {
      back: vi.fn(),
      pushState: vi.fn((_data, _unused, url) => {
        if (url) environment.location.href = new URL(String(url), environment.location.href).href;
      }),
      replaceState: vi.fn((_data, _unused, url) => {
        if (url) environment.location.href = new URL(String(url), environment.location.href).href;
      }),
    },
    document: { getElementById: vi.fn(() => ({ focus: vi.fn() })) },
    requestAnimationFrame: vi.fn((callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    }),
    cancelAnimationFrame: vi.fn((id) => frames.delete(id)),
    addEventListener: vi.fn((type, listener) => {
      const current = listeners.get(type) ?? new Set<() => void>();
      current.add(listener);
      listeners.set(type, current);
    }),
    removeEventListener: vi.fn((type, listener) => {
      listeners.get(type)?.delete(listener);
    }),
  };
  return {
    environment,
    emit(type: string) {
      listeners.get(type)?.forEach((listener) => listener());
    },
    runFrames() {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback();
      }
    },
    listeners,
    frames,
  };
}

describe("Household Runway browser adapter", () => {
  it("projects the initial destination and repairs an impossible requested stage", () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion?stage=expenses",
    );
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
    });

    adapter.start();

    expect(adapter.getSnapshot()).toMatchObject({
      interviewStatus: "not_started",
      stage: null,
      screen: { kind: "landing" },
    });
    expect(browser.environment.history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/finance/cushion",
    );
    adapter.dispose();
  });

  it("keeps an anonymous landing screen until the public start intent is sent", async () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion",
    );
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      authenticated: false,
      autoStart: false,
      createId: () => "interview-1",
      synchronizeDraft: () => true,
    });

    adapter.start();

    expect(adapter.getSnapshot()).toMatchObject({
      interviewStatus: "not_started",
      screen: { kind: "landing" },
    });
    expect(browser.environment.history.pushState).not.toHaveBeenCalled();

    adapter.send({ type: "start" });
    await Promise.resolve();

    expect(adapter.getSnapshot().screen.kind).toBe("location");
    expect(browser.environment.history.pushState).toHaveBeenCalledWith(
      {},
      "",
      "/finance/cushion?start=1",
    );
    adapter.dispose();
  });

  it("imports a restored device Draft when the URL starts the anonymous Interview", async () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion?start=1",
    );
    const restored = createHouseholdRunwayInterview();
    restored.draft.revision = 1;
    restored.draft.interviewId = "stored-interview";
    sessionStorage.clear();
    localStorage.clear();
    rememberHouseholdRunwayDraft({
      status: "collecting",
      stage: "location",
      draft: restored.draft,
    });
    sessionStorage.clear();
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      authenticated: false,
      autoStart: false,
      createId: () => "interview-1",
      restore: restoreHouseholdRunwayBrowserRuntime,
    });

    adapter.start();
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await Promise.resolve();
    }

    expect(adapter.getSnapshot().screen.kind).toBe("location");
    expect(adapter.getSnapshot().operations.deviceDraft).toEqual({
      status: "succeeded",
    });
    expect(localStorage.getItem("betterr.household-runway.interview.v2")).toBeNull();
    adapter.dispose();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("keeps a destructive navigation command ahead of URL reconciliation", async () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion?start=1",
    );
    const confirm = vi.fn(() => true);
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      authenticated: false,
      autoStart: false,
      confirm,
      clearDraft: () => true,
      createId: () => "interview-1",
      synchronizeDraft: () => true,
    });

    adapter.start();
    adapter.send({ type: "start" });
    adapter.send({ type: "discard_draft" });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await Promise.resolve();
    }

    expect(confirm).toHaveBeenCalledWith({ action: "discard_draft" });
    expect(adapter.getSnapshot()).toMatchObject({
      interviewStatus: "not_started",
      screen: { kind: "landing" },
    });
    expect(browser.environment.location.href).toBe(
      "https://betterr.me/finance/cushion",
    );
    adapter.dispose();
  });

  it("auto-starts authenticated Runtime state and repairs the URL once", () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion",
    );
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      authenticated: true,
      createId: () => "interview-1",
    });

    adapter.start();

    expect(adapter.getSnapshot().screen.kind).toBe("location");
    expect(browser.environment.location.href).toBe(
      "https://betterr.me/finance/cushion?start=1",
    );
    expect(browser.environment.history.pushState).toHaveBeenCalledTimes(1);
    adapter.dispose();
  });

  it("repairs an invalid requested stage even when the URL starts the interview", () => {
    const browser = createAdapterEnvironment(
      "https://betterr.me/finance/cushion?start=1&stage=not-a-stage",
    );
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
    });

    adapter.start();

    expect(adapter.getSnapshot().interviewStatus).toBe("collecting");
    expect(browser.environment.history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/finance/cushion?start=1",
    );
    adapter.dispose();
  });

  it("validates Back and Forward through Runtime state instead of browser state", () => {
    const browser = createAdapterEnvironment();
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
    });
    adapter.start();

    expect(adapter.getSnapshot().interviewStatus).toBe("collecting");
    browser.environment.location.href = "https://betterr.me/finance/cushion";
    browser.emit("popstate");
    expect(adapter.getSnapshot().interviewStatus).toBe("not_started");

    browser.environment.location.href = "https://betterr.me/finance/cushion?start=1";
    browser.emit("popstate");
    expect(adapter.getSnapshot().interviewStatus).toBe("collecting");
    adapter.dispose();
  });

  it("uses the latest browser destination when history changes during startup", async () => {
    const browser = createAdapterEnvironment();
    let restore: ((value: unknown) => void) | undefined;
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
      restore: () => new Promise((resolve) => { restore = resolve; }),
    });

    adapter.start();
    browser.environment.location.href = "https://betterr.me/finance/cushion";
    browser.emit("popstate");
    restore?.({ session: { status: "missing" }, device: { status: "missing" } });
    await Promise.resolve();
    await Promise.resolve();

    expect(adapter.getSnapshot().interviewStatus).toBe("not_started");
    adapter.dispose();
  });

  it("flushes the latest eligible Draft synchronously on locale change", () => {
    const browser = createAdapterEnvironment();
    const synchronizeDraft = vi.fn(() => true);
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
      synchronizeDraft,
    });
    adapter.start();
    adapter.send({ type: "select_country", country: "US" });

    browser.emit("betterr:before-locale-change");

    expect(synchronizeDraft).toHaveBeenCalledWith({
      status: "collecting",
      stage: "location",
      answers: expect.objectContaining({ country: "US" }),
    });
    expect(adapter.getSnapshot().operations.draftSynchronization).toEqual({
      status: "succeeded",
    });
    adapter.dispose();
  });

  it("keeps a failed locale flush failed and ignores its late completion after disposal", async () => {
    const browser = createAdapterEnvironment();
    let resolveSync: ((value: boolean) => void) | undefined;
    const synchronizeDraft = vi.fn(
      () => new Promise<boolean>((resolve) => { resolveSync = resolve; }),
    );
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "interview-1",
      synchronizeDraft,
    });
    adapter.start();
    adapter.send({ type: "select_country", country: "US" });
    browser.emit("betterr:before-locale-change");

    expect(adapter.getSnapshot().operations.draftSynchronization).toEqual({
      status: "pending",
    });
    adapter.dispose();
    resolveSync?.(false);
    await Promise.resolve();
    expect(adapter.getSnapshot().operations.draftSynchronization).toEqual({
      status: "pending",
    });
  });

  it("removes subscriptions and cancellable focus work, allowing an independent remount", () => {
    const browser = createAdapterEnvironment();
    const first = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "first",
      schedule: (task) => task(),
    });
    first.start();
    expect(browser.listeners.get("popstate")?.size).toBe(1);
    expect(browser.listeners.get("betterr:before-locale-change")?.size).toBe(1);
    first.dispose();
    expect(browser.listeners.get("popstate")?.size).toBe(0);
    expect(browser.listeners.get("betterr:before-locale-change")?.size).toBe(0);

    const second = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      createId: () => "second",
    });
    second.start();
    expect(browser.listeners.get("popstate")?.size).toBe(1);
    expect(browser.listeners.get("betterr:before-locale-change")?.size).toBe(1);
    second.dispose();
  });

  it("maps subscription failures to typed outcomes without throwing", () => {
    const outcomes: unknown[] = [];
    const browser = createAdapterEnvironment();
    browser.environment.addEventListener = () => {
      throw new Error("subscription unavailable");
    };
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      onOutcome: (outcome) => outcomes.push(outcome),
    });

    expect(() => adapter.start()).not.toThrow();
    expect(outcomes).toContainEqual({
      type: "subscription",
      event: "history",
      outcome: "unavailable",
    });
    expect(outcomes).toContainEqual({
      type: "subscription",
      event: "locale",
      outcome: "unavailable",
    });
    adapter.dispose();
  });

  it("maps scheduling failures to typed outcomes without leaking the exception", async () => {
    const outcomes: unknown[] = [];
    const browser = createAdapterEnvironment();
    const adapter = createHouseholdRunwayBrowserAdapter({
      environment: browser.environment,
      schedule: () => {
        throw new Error("scheduler unavailable");
      },
      onOutcome: (outcome) => outcomes.push(outcome),
    });

    expect(() => adapter.start()).not.toThrow();
    await Promise.resolve();
    expect(outcomes).toContainEqual({
      type: "schedule",
      outcome: "unavailable",
    });
    adapter.dispose();
  });

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

    const synchronized = await executeHouseholdRunwayBrowserEffect({
      type: "draft_sync_requested",
      draft: state.draft,
      status: state.status,
      stage: state.stage,
      sourceRevision: state.draft.revision,
      correlationId: "post-import-sync",
    });
    expect(synchronized.command.type).toBe("draft_synchronization_succeeded");
    expect(localStorage.getItem("betterr.household-runway.interview.v2")).toBeNull();

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
