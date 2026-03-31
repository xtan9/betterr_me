import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

describe("useTimezoneDetection", () => {
  let localStorageStore: Record<string, string> = {};

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
  });

  it("should not fetch when profileTimezone is already set", async () => {
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection("America/New_York"));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should not fetch when localStorage flag is set", async () => {
    localStorageStore["betterrme_tz_detected"] = "1";
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection(null));

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should PATCH /api/profile with detected timezone when timezone is null", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection(null));

    // Wait for the async effect
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("timezone"),
      });
    });
  });

  it("should set localStorage flag on successful PATCH", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection(null));

    await vi.waitFor(() => {
      expect(localStorage.setItem).toHaveBeenCalledWith(
        "betterrme_tz_detected",
        "1"
      );
    });
  });

  it("should not set localStorage flag on failed PATCH", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection(null));

    // Give effect time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("should not set localStorage flag on fetch error (allows retry)", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    const { useTimezoneDetection } = await import(
      "@/lib/hooks/use-timezone-detection"
    );
    renderHook(() => useTimezoneDetection(null));

    // Give effect time to run
    await new Promise((r) => setTimeout(r, 50));

    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
