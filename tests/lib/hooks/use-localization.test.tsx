import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocalization } from "@/lib/hooks/use-localization";

type MockPreferenceState =
  | { status: "ready"; value: "sunday" | "monday" }
  | { status: "unavailable"; reason: "sourceUnavailable" };

const { mockSetWeekStart, mockPreference } = vi.hoisted(() => {
  const mockSetWeekStart = vi.fn();
  const unavailable: MockPreferenceState = {
    status: "unavailable",
    reason: "sourceUnavailable",
  };
  const mockPreference: {
    weekStart: MockPreferenceState;
    acceptedWeekStart: MockPreferenceState;
    isPending: boolean;
    setWeekStart: typeof mockSetWeekStart;
  } = {
      weekStart: unavailable,
      acceptedWeekStart: unavailable,
      isPending: false,
      setWeekStart: mockSetWeekStart,
  };
  return {
    mockSetWeekStart,
    mockPreference,
  };
});

vi.mock("@/lib/hooks/use-profile-preferences", () => ({
  useLocalizationPreference: () => mockPreference,
}));

describe("useLocalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPreference.weekStart = {
      status: "unavailable",
      reason: "sourceUnavailable",
    };
    mockPreference.acceptedWeekStart = {
      status: "unavailable",
      reason: "sourceUnavailable",
    };
  });

  it("presents Monday while preserving the unavailable accepted state", () => {
    const { result } = renderHook(() => useLocalization());

    expect(result.current.weekStart).toBe("monday");
    expect(result.current.weekStartPreference).toEqual({
      status: "unavailable",
      reason: "sourceUnavailable",
    });
    expect(result.current.acceptedWeekStart).toEqual({
      status: "unavailable",
      reason: "sourceUnavailable",
    });
  });

  it("presents the accepted Sunday value through the owner hook", () => {
    mockPreference.weekStart = {
      status: "ready",
      value: "sunday",
    };
    mockPreference.acceptedWeekStart = {
      status: "ready",
      value: "sunday",
    };

    const { result } = renderHook(() => useLocalization());

    expect(result.current.weekStart).toBe("sunday");
    expect(result.current.weekStartPreference).toEqual({
      status: "ready",
      value: "sunday",
    });
    expect(result.current.setWeekStart).toBe(mockSetWeekStart);
  });
});
