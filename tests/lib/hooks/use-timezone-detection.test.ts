import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

describe("useTimezoneDetection", () => {
  let localStorageStore: Record<string, string> = {};
  const mockSaveTimezone = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorageStore = {};
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageStore[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageStore[key];
      }),
    });
    mockSaveTimezone.mockResolvedValue(undefined);
  });

  it("should not fetch when profileTimezone is already set", async () => {
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection("America/New_York", mockSaveTimezone));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should not fetch when localStorage flag is set", async () => {
    localStorageStore["betterrme_tz_detected"] = "1";
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection(null, mockSaveTimezone));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should issue the explicit timezone command when timezone is null", async () => {
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection(null, mockSaveTimezone));

    // Wait for the async effect
    await vi.waitFor(() => {
      expect(mockSaveTimezone).toHaveBeenCalledWith(expect.any(String));
    });
  });

  it("should set localStorage flag on successful PATCH", async () => {
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection(null, mockSaveTimezone));

    await vi.waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith(
        "betterrme_tz_detected",
        "1"
      );
    });
  });

  it("should not set localStorage flag on failed PATCH", async () => {
    mockSaveTimezone.mockRejectedValueOnce(new Error("server error"));
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection(null, mockSaveTimezone));

    // Give effect time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("should not set localStorage flag on command error (allows retry)", async () => {
    mockSaveTimezone.mockRejectedValueOnce(new Error("Network error"));
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection(null, mockSaveTimezone));

    // Give effect time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
