import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFitness } from "@/lib/hooks/use-fitness";

const { mockUseFitnessPreference, mockPreference } = vi.hoisted(() => ({
  mockUseFitnessPreference: vi.fn(),
  mockPreference: {
    weightUnit: { status: "ready", value: "kg" } as
      | { status: "ready"; value: "kg" | "lbs" }
      | { status: "pending"; value: "kg" | "lbs" }
      | { status: "unavailable"; reason: "invalidStoredValue" },
    acceptedWeightUnit: { status: "ready", value: "kg" } as
      | { status: "ready"; value: "kg" | "lbs" }
      | { status: "unavailable"; reason: "invalidStoredValue" },
    isPending: false,
  },
}));

vi.mock("@/lib/hooks/use-profile-preferences", () => ({
  useFitnessPreference: mockUseFitnessPreference,
}));

describe("useFitness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFitnessPreference.mockReturnValue(mockPreference);
    mockPreference.weightUnit = { status: "ready", value: "kg" };
    mockPreference.acceptedWeightUnit = { status: "ready", value: "kg" };
    mockPreference.isPending = false;
  });

  it("presents the accepted Fitness Weight Unit from Current Profile", () => {
    mockPreference.weightUnit = { status: "ready", value: "lbs" };
    mockPreference.acceptedWeightUnit = { status: "ready", value: "lbs" };

    const { result } = renderHook(() => useFitness());

    expect(result.current.weightUnit).toBe("lbs");
    expect(result.current.weightUnitPreference).toEqual({
      status: "ready",
      value: "lbs",
    });
  });

  it("keeps an unavailable preference explicit while presenting canonical kilograms", () => {
    mockPreference.weightUnit = {
      status: "unavailable",
      reason: "invalidStoredValue",
    };
    mockPreference.acceptedWeightUnit = {
      status: "unavailable",
      reason: "invalidStoredValue",
    };

    const { result } = renderHook(() => useFitness());

    expect(result.current.weightUnit).toBe("kg");
    expect(result.current.weightUnitPreference).toEqual({
      status: "unavailable",
      reason: "invalidStoredValue",
    });
    expect(result.current.acceptedWeightUnit).toEqual({
      status: "unavailable",
      reason: "invalidStoredValue",
    });
  });

  it("presents a pending Weight Unit intent immediately", () => {
    mockPreference.weightUnit = { status: "pending", value: "lbs" };
    mockPreference.acceptedWeightUnit = { status: "ready", value: "kg" };
    mockPreference.isPending = true;

    const { result } = renderHook(() => useFitness());

    expect(result.current.weightUnit).toBe("lbs");
    expect(result.current.weightUnitPreference).toEqual({
      status: "pending",
      value: "lbs",
    });
    expect(result.current.isPending).toBe(true);
  });
});
