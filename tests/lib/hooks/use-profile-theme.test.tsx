import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppearance } from "@/lib/hooks/use-appearance";

type MockThemeState =
  | { status: "ready"; value: "system" | "light" | "dark" }
  | { status: "unavailable"; reason: "invalidStoredValue" };

const { mockSetTheme, mockSelectTheme, mockAppearance } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockSelectTheme: vi.fn(),
  mockAppearance: {
    theme: {
      status: "unavailable",
      reason: "invalidStoredValue",
    } as MockThemeState,
    acceptedTheme: {
      status: "unavailable",
      reason: "invalidStoredValue",
    } as MockThemeState,
    selectTheme: vi.fn(),
    isPending: false,
    data: undefined,
    currentProfile: undefined,
    status: "unavailable",
    error: undefined,
  },
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "chartreuse",
    setTheme: mockSetTheme,
    resolvedTheme: "light",
  }),
}));

vi.mock("@/lib/hooks/use-profile-preferences", () => ({
  useAppearancePreference: () => ({
    ...mockAppearance,
    selectTheme: mockSelectTheme,
  }),
}));

describe("useAppearance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAppearance.theme = {
      status: "unavailable",
      reason: "invalidStoredValue",
    };
    mockAppearance.acceptedTheme = {
      status: "unavailable",
      reason: "invalidStoredValue",
    };
    mockSelectTheme.mockResolvedValue({
      theme: "dark",
      preferenceRevision: 4,
      changed: true,
    });
  });

  it("keeps unavailable accepted state while presenting the assigned default", () => {
    const { result } = renderHook(() => useAppearance());

    expect(result.current.theme).toBe("system");
    expect(result.current.themePreference).toEqual({
      status: "unavailable",
      reason: "invalidStoredValue",
    });
    expect(result.current.acceptedTheme).toEqual({
      status: "unavailable",
      reason: "invalidStoredValue",
    });
  });

  it("does not expose Current Profile transport or cache controls to consumers", () => {
    const { result } = renderHook(() => useAppearance());

    expect(result.current).not.toHaveProperty("data");
    expect(result.current).not.toHaveProperty("mutate");
    expect(result.current).not.toHaveProperty("runCommand");
    expect(result.current).not.toHaveProperty("pendingIntents");
  });

  it("applies accepted Current Profile theme instead of stale local theme", async () => {
    mockAppearance.theme = { status: "ready", value: "dark" };
    mockAppearance.acceptedTheme = { status: "ready", value: "dark" };

    renderHook(() => useAppearance());

    await waitFor(() => expect(mockSetTheme).toHaveBeenCalledWith("dark"));
  });

  it("rolls back a rejected selection to the accepted presentation", async () => {
    mockAppearance.theme = { status: "ready", value: "dark" };
    mockAppearance.acceptedTheme = { status: "ready", value: "dark" };
    mockSelectTheme.mockRejectedValueOnce(new Error("rejected"));

    const { result } = renderHook(() => useAppearance());
    mockSetTheme.mockClear();

    await act(async () => {
      await result.current.selectTheme("light");
    });

    await waitFor(() => {
      expect(mockSetTheme).toHaveBeenNthCalledWith(1, "light");
      expect(mockSetTheme).toHaveBeenLastCalledWith("dark");
    });
  });
});
