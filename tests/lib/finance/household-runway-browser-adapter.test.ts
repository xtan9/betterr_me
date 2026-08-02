import { describe, expect, it, vi } from "vitest";
import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import {
  applyHouseholdRunwayBrowserEffect,
  executeHouseholdRunwayBrowserEffect,
  householdRunwayHistoryProjectionCommand,
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
});
