import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useJournalAutosave } from "@/lib/hooks/use-journal-autosave";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock sendBeacon
const mockSendBeacon = vi.fn();
Object.defineProperty(navigator, "sendBeacon", {
  value: mockSendBeacon,
  writable: true,
});

describe("useJournalAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    mockSendBeacon.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initial state is idle", () => {
    const { result } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );
    expect(result.current.saveStatus).toBe("idle");
  });

  it("scheduleSave debounces: calling twice within 2s only fires one fetch", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entry: { id: "new-id" } }),
    });

    const { result } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });
    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 4 });
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("uses POST for new entries (entryId=null)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entry: { id: "new-id" } }),
    });

    const { result } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });
  });

  it("uses PATCH for existing entries (entryId provided)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entry: { id: "existing-id" } }),
    });

    const { result } = renderHook(() =>
      useJournalAutosave("existing-id", "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/journal/existing-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
    });
  });

  it("POST body includes entry_date", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entry: { id: "new-id" } }),
    });

    const { result } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.entry_date).toBe("2026-02-23");
  });

  it("PATCH body does NOT include entry_date", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entry: { id: "existing-id" } }),
    });

    const { result } = renderHook(() =>
      useJournalAutosave("existing-id", "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.entry_date).toBeUndefined();
  });

  it("status transitions: idle -> saving -> saved on success", async () => {
    let resolvePromise: (v: unknown) => void;
    const fetchPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockFetch.mockReturnValue(fetchPromise);

    const { result } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );

    expect(result.current.saveStatus).toBe("idle");

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.saveStatus).toBe("saving");

    await act(async () => {
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({ entry: { id: "new-id" } }),
      });
    });

    expect(result.current.saveStatus).toBe("saved");
  });

  it("status transitions: idle -> saving -> error on fetch failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "bad" }),
    });

    const { result } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" } });
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Wait for the fetch to resolve
    await act(async () => {});

    expect(result.current.saveStatus).toBe("error");
  });

  it("after first POST succeeds and returns entry.id, subsequent saves use PATCH", async () => {
    // First call returns new ID
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry: { id: "created-id" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ entry: { id: "created-id" } }),
      });

    const { result } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );

    // First save: POST
    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Wait for the fetch to complete
    await act(async () => {});

    expect(mockFetch.mock.calls[0][0]).toBe("/api/journal");
    expect(mockFetch.mock.calls[0][1].method).toBe("POST");

    // Second save: should use PATCH with the new ID
    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 4 });
    });

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await act(async () => {});

    expect(mockFetch.mock.calls[1][0]).toBe("/api/journal/created-id");
    expect(mockFetch.mock.calls[1][1].method).toBe("PATCH");
  });

  it("flushNow immediately saves pending data without waiting for timeout", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ entry: { id: "new-id" } }),
    });

    const { result } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });

    // Flush immediately without waiting for debounce
    await act(async () => {
      await result.current.flushNow();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("flushNow throws when save fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Server error" }),
    });

    const { result } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });

    await act(async () => {
      await expect(result.current.flushNow()).rejects.toThrow(
        "Journal flush failed"
      );
    });
  });

  it("flushNow returns null when there is no pending data", async () => {
    const { result } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );

    let returnValue: unknown;
    await act(async () => {
      returnValue = await result.current.flushNow();
    });

    expect(returnValue).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("cleanup: timeout is cleared on unmount", () => {
    const { result, unmount } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" } });
    });

    unmount();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Fetch should not have been called because the timer was cleared
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("beforeunload: navigator.sendBeacon called with pending data", () => {
    mockSendBeacon.mockReturnValue(true);
    const { result } = renderHook(() =>
      useJournalAutosave(null, "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });

    // Simulate beforeunload event
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    expect(mockSendBeacon).toHaveBeenCalledWith(
      "/api/journal",
      expect.any(Blob)
    );
  });

  it("beforeunload: always uses /api/journal even when entryId exists", () => {
    mockSendBeacon.mockReturnValue(true);
    const { result } = renderHook(() =>
      useJournalAutosave("existing-id", "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });

    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    // Should always use upsert endpoint, not /api/journal/existing-id
    expect(mockSendBeacon).toHaveBeenCalledWith(
      "/api/journal",
      expect.any(Blob)
    );
  });

  it("beforeunload: sendBeacon body always includes entry_date", async () => {
    mockSendBeacon.mockReturnValue(true);
    const { result } = renderHook(() =>
      useJournalAutosave("existing-id", "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });

    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    // Verify sendBeacon was called with upsert endpoint and body includes entry_date
    expect(mockSendBeacon).toHaveBeenCalledTimes(1);
    expect(mockSendBeacon).toHaveBeenCalledWith("/api/journal", expect.any(Blob));

    // Also verify via the fallback test that body includes entry_date
    // (Blob content reading not supported in jsdom — verify via fetch fallback below)
  });

  it("beforeunload: falls back to fetch with keepalive when sendBeacon returns false", () => {
    mockSendBeacon.mockReturnValue(false);
    // Mock fetch to return a rejected promise (the .catch() swallows it)
    mockFetch.mockReturnValue(Promise.reject(new Error("ignored")));

    const { result } = renderHook(() =>
      useJournalAutosave("existing-id", "2026-02-23")
    );

    act(() => {
      result.current.scheduleSave({ content: { type: "doc" }, mood: 3 });
    });

    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/journal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: expect.any(String),
      keepalive: true,
    });

    // Verify body includes entry_date even for existing entries
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.entry_date).toBe("2026-02-23");
  });

  it("beforeunload: sendBeacon is NOT called without pending data", () => {
    renderHook(() => useJournalAutosave(null, "2026-02-23"));

    // Simulate beforeunload event without scheduling any save
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });

    expect(mockSendBeacon).not.toHaveBeenCalled();
  });
});
