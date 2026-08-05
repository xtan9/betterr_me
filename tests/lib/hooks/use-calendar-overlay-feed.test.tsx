import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { useCalendarOverlayFeed } from "@/lib/hooks/use-calendar-overlay-feed";

const range = { from: "2026-04-01", to: "2026-04-07" } as const;

function taskItem(overrides: Record<string, unknown> = {}) {
  return {
    layer: "tasks",
    kind: "task",
    id: "tasks:task-1",
    taskId: "task-1",
    title: "Task",
    date: "2026-04-02",
    startTime: null,
    endTime: null,
    allDay: true,
    completed: false,
    action: { type: "toggle_task_completion", taskId: "task-1" },
    ...overrides,
  };
}

function response(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useCalendarOverlayFeed", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      locale: "en-US",
      calendar: "gregory",
      numberingSystem: "latn",
      timeZone: "America/Los_Angeles",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("is idle and makes no request when no overlay layer is selected", () => {
    const { result } = renderHook(() => useCalendarOverlayFeed({ range, layers: [] }));

    expect(result.current.state).toEqual({
      status: "idle",
      items: [],
      unavailableLayers: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("constructs one timezone-aware request and projects a complete response", async () => {
    fetchMock.mockResolvedValue(response({ items: [taskItem()] }));

    const { result } = renderHook(() =>
      useCalendarOverlayFeed({ range, layers: ["tasks", "habits"] }),
    );

    await waitFor(() => expect(result.current.state.status).toBe("complete"));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/calendar/overlay-feed?start_date=2026-04-01&end_date=2026-04-07&layers=tasks,habits&timezone=America%2FLos_Angeles",
    );
    expect(result.current.state).toEqual({
      status: "complete",
      unavailableLayers: [],
      items: [{
        kind: "overlay",
        id: "tasks:task-1",
        title: "Task",
        start_date: "2026-04-02",
        end_date: "2026-04-02",
        start_time: null,
        end_time: null,
        color: null,
        layer: "tasks",
        completed: false,
        action: { type: "toggle_task_completion", taskId: "task-1" },
      }],
    });
  });

  it("preserves trustworthy items and selected unavailable diagnostics when degraded", async () => {
    fetchMock.mockResolvedValue(response({
      items: [taskItem()],
      unavailableLayers: ["habits"],
    }));

    const { result } = renderHook(() =>
      useCalendarOverlayFeed({ range, layers: ["tasks", "habits"] }),
    );

    await waitFor(() => expect(result.current.state.status).toBe("degraded"));
    expect(result.current.state.unavailableLayers).toEqual(["habits"]);
    expect(result.current.state.items).toHaveLength(1);
  });

  it("fails closed for transport and malformed responses", async () => {
    fetchMock.mockResolvedValueOnce(response({}, false));
    const first = renderHook(() =>
      useCalendarOverlayFeed({ range, layers: ["tasks", "workouts"] }),
    );

    await waitFor(() => expect(first.result.current.state.status).toBe("failed"));
    expect(first.result.current.state.items).toEqual([]);
    expect(first.result.current.state.unavailableLayers).toEqual(["tasks", "workouts"]);
    first.unmount();

    fetchMock.mockResolvedValueOnce(response({ items: [{ layer: "tasks" }] }));
    const second = renderHook(() =>
      useCalendarOverlayFeed({ range, layers: ["tasks", "workouts"] }),
    );

    await waitFor(() => expect(second.result.current.state.status).toBe("failed"));
    expect(second.result.current.state.items).toEqual([]);
    expect(second.result.current.state.unavailableLayers).toEqual(["tasks", "workouts"]);
  });

  it("retains only prior items in the current range and selected layers while loading", async () => {
    const nextRequest = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(response({ items: [
        taskItem(),
        taskItem({ id: "tasks:outside", date: "2026-05-01" }),
        taskItem({ id: "tasks:task-2", date: "2026-04-03" }),
      ] }))
      .mockReturnValueOnce(nextRequest.promise);

    const { result, rerender } = renderHook<
      ReturnType<typeof useCalendarOverlayFeed>,
      { selectedRange: { from: string; to: string }; layers: readonly ("tasks" | "habits")[] }
    >(
      ({ selectedRange, layers }) =>
        useCalendarOverlayFeed({ range: selectedRange, layers }),
      {
        initialProps: {
          selectedRange: { from: range.from, to: range.to },
          layers: ["tasks", "habits"] as readonly ("tasks" | "habits")[],
        },
      },
    );

    await waitFor(() => expect(result.current.state.status).toBe("complete"));
    rerender({
      selectedRange: { from: "2026-04-02", to: "2026-04-03" },
      layers: ["tasks"],
    });

    await waitFor(() => expect(result.current.state.status).toBe("loading"));
    expect(result.current.state.items.map((item) => item.id)).toEqual([
      "tasks:task-1",
      "tasks:task-2",
    ]);
    expect(result.current.state.items.every((item) => item.start_date >= "2026-04-02" && item.start_date <= "2026-04-03")).toBe(true);

    await act(async () => {
      nextRequest.resolve(response({ items: [] }));
    });
    await waitFor(() => expect(result.current.state.status).toBe("complete"));
  });

  it("allows only one retry request in flight", async () => {
    fetchMock.mockResolvedValueOnce(response({ items: [taskItem()] }));
    const retryRequest = deferred<Response>();
    fetchMock.mockReturnValueOnce(retryRequest.promise);

    const { result } = renderHook(() =>
      useCalendarOverlayFeed({ range, layers: ["tasks"] }),
    );
    await waitFor(() => expect(result.current.state.status).toBe("complete"));

    await act(async () => {
      void result.current.retry();
      void result.current.retry();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.isRetrying).toBe(true);

    await act(async () => {
      retryRequest.resolve(response({ items: [] }));
    });
    await waitFor(() => expect(result.current.state.status).toBe("complete"));
    expect(result.current.isRetrying).toBe(false);
  });
});
