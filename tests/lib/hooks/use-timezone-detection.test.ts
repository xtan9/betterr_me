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

  it("should not provision when the accepted User Time Zone is resolved", async () => {
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() =>
      useTimezoneDetection(
        { status: "resolved", value: "America/New_York" },
        mockSaveTimezone,
      ),
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should not provision while Current Profile is unavailable", async () => {
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection(undefined, mockSaveTimezone));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockSaveTimezone).not.toHaveBeenCalled();
  });

  it("should not provision when the browser detection flag is set", async () => {
    localStorageStore["betterrme_tz_detected"] = "1";
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() =>
      useTimezoneDetection({ status: "unresolved" }, mockSaveTimezone),
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should issue the explicit User Time Zone command for an unresolved profile", async () => {
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() =>
      useTimezoneDetection({ status: "unresolved" }, mockSaveTimezone),
    );

    // Wait for the async effect
    await vi.waitFor(() => {
      expect(mockSaveTimezone).toHaveBeenCalledWith(expect.any(String));
    });
  });

  it("should set localStorage flag on a successful command", async () => {
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() =>
      useTimezoneDetection({ status: "unresolved" }, mockSaveTimezone),
    );

    await vi.waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith(
        "betterrme_tz_detected",
        "1"
      );
    });
  });

  it("should not set localStorage flag on a failed command", async () => {
    mockSaveTimezone.mockRejectedValueOnce(new Error("server error"));
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() =>
      useTimezoneDetection({ status: "unresolved" }, mockSaveTimezone),
    );

    // Give effect time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("should not set localStorage flag on command error (allows retry)", async () => {
    mockSaveTimezone.mockRejectedValueOnce(new Error("Network error"));
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() =>
      useTimezoneDetection({ status: "unresolved" }, mockSaveTimezone),
    );

    // Give effect time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
