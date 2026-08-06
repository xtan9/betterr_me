import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPush = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
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
    routerPush.mockReset();
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

  it.each([
    ["an invalid local date", { items: [taskItem({ date: "2026-02-30" })] }],
    ["an item from an unselected layer", { items: [taskItem({ layer: "habits" })] }],
    ["an item from an unavailable layer", { items: [taskItem()], unavailableLayers: ["tasks"] }],
    ["an action identity mismatch", { items: [taskItem({ taskId: "task-2" })] }],
  ])("fails closed for %s", async (_reason, body) => {
    fetchMock.mockResolvedValue(response(body));

    const { result } = renderHook(() =>
      useCalendarOverlayFeed({ range, layers: ["tasks", "habits"] }),
    );

    await waitFor(() => expect(result.current.state.status).toBe("failed"));
    expect(result.current.state.items).toEqual([]);
    expect(result.current.state.unavailableLayers).toEqual(["tasks", "habits"]);
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

  it("exposes empty selection as idle immediately without retaining prior state", async () => {
    fetchMock.mockResolvedValue(response({ items: [taskItem()] }));

    const { result, rerender } = renderHook<
      ReturnType<typeof useCalendarOverlayFeed>,
      { layers: readonly ("tasks" | "habits")[] }
    >(
      ({ layers }) => useCalendarOverlayFeed({ range, layers }),
      { initialProps: { layers: ["tasks"] } },
    );

    await waitFor(() => expect(result.current.state.status).toBe("complete"));
    rerender({ layers: [] });

    expect(result.current.state).toEqual({
      status: "idle",
      items: [],
      unavailableLayers: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("executes task actions, returns a typed outcome, and invalidates every mounted projection", async () => {
    fetchMock.mockResolvedValue(response({ items: [] }));

    const first = renderHook(() => useCalendarOverlayFeed({
      range,
      layers: ["tasks"],
    }));
    const second = renderHook(() => useCalendarOverlayFeed({
      range: { from: "2026-04-02", to: "2026-04-10" },
      layers: ["tasks", "habits"],
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    let outcome;
    await act(async () => {
      outcome = await first.result.current.executeAction({
        action: { type: "toggle_task_completion", taskId: "task-1" },
        completed: false,
      });
    });

    expect(outcome).toEqual({ status: "success" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-1/toggle", { method: "POST" });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("calendar-events"))).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("overlay-feed"))).toHaveLength(4);

    first.unmount();
    second.unmount();
  });

  it("executes habit actions pessimistically and does not expose server errors", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ error: "private server detail" }, false));

    const { result } = renderHook(() => useCalendarOverlayFeed({
      range,
      layers: ["habits"],
    }));
    await waitFor(() => expect(result.current.state.status).toBe("complete"));

    let failure;
    await act(async () => {
      failure = await result.current.executeAction({
        action: {
          type: "toggle_habit_completion",
          habitId: "habit-1",
          date: "2026-04-02",
        },
        completed: false,
      });
    });

    expect(failure).toEqual({ status: "failure", reason: "request-failed" });
    expect(fetchMock).toHaveBeenCalledWith("/api/habits/habit-1/toggle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-04-02", completed: true }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalidates every mounted projection after a successful habit action", async () => {
    fetchMock.mockResolvedValue(response({ items: [] }));

    const first = renderHook(() => useCalendarOverlayFeed({
      range,
      layers: ["habits"],
    }));
    const second = renderHook(() => useCalendarOverlayFeed({
      range: { from: "2026-04-02", to: "2026-04-10" },
      layers: ["tasks", "habits"],
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    let outcome;
    await act(async () => {
      outcome = await first.result.current.executeAction({
        action: {
          type: "toggle_habit_completion",
          habitId: "habit-1",
          date: "2026-04-02",
        },
        completed: false,
      });
    });

    expect(outcome).toEqual({ status: "success" });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("calendar-events"))).toHaveLength(0);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("overlay-feed"))).toHaveLength(4);

    first.unmount();
    second.unmount();
  });

  it("refreshes the current selection when an action completes after selection changes", async () => {
    const actionRequest = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(response({ items: [taskItem()] }))
      .mockReturnValueOnce(actionRequest.promise)
      .mockResolvedValueOnce(response({ items: [] }))
      .mockResolvedValueOnce(response({ items: [] }));

    const { result, rerender } = renderHook<
      ReturnType<typeof useCalendarOverlayFeed>,
      { selectedRange: { from: string; to: string }; layers: readonly ("tasks" | "habits")[] }
    >(
      ({ selectedRange, layers }) =>
        useCalendarOverlayFeed({ range: selectedRange, layers }),
      {
        initialProps: {
          selectedRange: range,
          layers: ["tasks"] as readonly ("tasks" | "habits")[],
        },
      },
    );

    await waitFor(() => expect(result.current.state.status).toBe("complete"));

    let actionPromise!: Promise<Awaited<ReturnType<typeof result.current.executeAction>>>;
    act(() => {
      actionPromise = result.current.executeAction({
        action: { type: "toggle_task_completion", taskId: "task-1" },
        completed: false,
      });
    });

    rerender({
      selectedRange: { from: "2026-05-01", to: "2026-05-07" },
      layers: ["habits"],
    });
    await waitFor(() => expect(result.current.state.status).toBe("complete"));

    await act(async () => {
      actionRequest.resolve(response({ task: { id: "task-1" } }));
      await actionPromise;
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      "/api/calendar/overlay-feed?start_date=2026-05-01&end_date=2026-05-07&layers=habits&timezone=America%2FLos_Angeles",
    );
    expect(result.current.state).toEqual({
      status: "complete",
      items: [],
      unavailableLayers: [],
    });
  });

  it("ignores a failed action refresh from the previous selection", async () => {
    const staleRefresh = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(response({ items: [taskItem()] }))
      .mockResolvedValueOnce(response({ task: { id: "task-1" } }))
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce(response({ items: [] }));

    const { result, rerender } = renderHook<
      ReturnType<typeof useCalendarOverlayFeed>,
      { selectedRange: { from: string; to: string }; layers: readonly ("tasks" | "habits")[] }
    >(
      ({ selectedRange, layers }) =>
        useCalendarOverlayFeed({ range: selectedRange, layers }),
      {
        initialProps: {
          selectedRange: range,
          layers: ["tasks"] as readonly ("tasks" | "habits")[],
        },
      },
    );

    await waitFor(() => expect(result.current.state.status).toBe("complete"));

    await act(async () => {
      await result.current.executeAction({
        action: { type: "toggle_task_completion", taskId: "task-1" },
        completed: false,
      });
    });
    expect(result.current.state.status).toBe("loading");

    rerender({
      selectedRange: { from: "2026-05-01", to: "2026-05-07" },
      layers: ["habits"],
    });
    await waitFor(() => expect(result.current.state.status).toBe("complete"));

    await act(async () => {
      staleRefresh.resolve(response({}, false));
    });

    expect(result.current.state).toEqual({
      status: "complete",
      items: [],
      unavailableLayers: [],
    });
  });

  it("navigates workouts without invalidating either data family", async () => {
    fetchMock.mockResolvedValue(response({ items: [] }));

    const { result } = renderHook(() => useCalendarOverlayFeed({
      range,
      layers: ["workouts"],
    }));
    await waitFor(() => expect(result.current.state.status).toBe("complete"));

    let outcome;
    await act(async () => {
      outcome = await result.current.executeAction({
        action: { type: "navigate_workout", workoutId: "workout-1" },
        completed: false,
      });
    });

    expect(outcome).toEqual({ status: "success" });
    expect(routerPush).toHaveBeenCalledWith("/workouts/workout-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
