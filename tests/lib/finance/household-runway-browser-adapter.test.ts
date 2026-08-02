import { describe, expect, it, vi } from "vitest";
import {
  applyHouseholdRunwayBrowserEffect,
  householdRunwayHistoryProjectionCommand,
  type HouseholdRunwayBrowserEnvironment,
} from "@/lib/finance/household-runway-browser-adapter";

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
      }),
    ).toEqual({
      type: "history_projection_changed",
      destination: "interview",
      interviewId: "interview-1",
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
    expect(
      applyHouseholdRunwayBrowserEffect({
        type: "focus",
        stage: "location",
      }),
    ).toEqual({
      type: "focus",
      stage: "location",
      outcome: "unavailable",
    });
  });
});
