import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTasksRealtime } from "@/lib/hooks/use-tasks-realtime";
import type { Task } from "@/lib/db/types";

// Mock Supabase client
const mockSubscribe = vi.fn().mockReturnValue({ id: "test-channel" });
const mockRemoveChannel = vi.fn();

let channelCallbacks: Record<string, (payload: unknown) => void> = {};

const mockOn = vi.fn().mockImplementation((_event, opts, callback) => {
  const key = `${opts.event}:${opts.table}`;
  channelCallbacks[key] = callback;
  return { on: mockOn, subscribe: mockSubscribe };
});

const mockChannel = vi.fn().mockReturnValue({
  on: mockOn,
  subscribe: mockSubscribe,
});

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  }),
}));

const mockTask: Task = {
  id: "task-1",
  user_id: "user-1",
  title: "Test Task",
  description: null,
  is_completed: false,
  priority: 2,
  due_date: null,
  due_time: null,
  completed_at: null,
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
  completion_difficulty: null,
  recurring_task_id: null,
  is_exception: false,
  original_date: null,
  status: "todo" as const,
  section: "work" as const,
  sort_order: 0,
  project_id: "proj-1",
  category_id: null,
};

describe("useTasksRealtime", () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    channelCallbacks = {};
  });

  it("subscribes to realtime channel on mount", () => {
    renderHook(() =>
      useTasksRealtime({ projectId: "proj-1", mutate: mockMutate })
    );

    expect(mockChannel).toHaveBeenCalledWith("tasks:project:proj-1");
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it("cleans up channel on unmount", () => {
    const { unmount } = renderHook(() =>
      useTasksRealtime({ projectId: "proj-1", mutate: mockMutate })
    );

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it("listens for INSERT, UPDATE, and DELETE events", () => {
    renderHook(() =>
      useTasksRealtime({ projectId: "proj-1", mutate: mockMutate })
    );

    // mockOn is called 3 times: INSERT, UPDATE, DELETE
    const eventTypes = mockOn.mock.calls.map(
      (call: [string, { event: string }]) => call[1].event
    );
    expect(eventTypes).toContain("INSERT");
    expect(eventTypes).toContain("UPDATE");
    expect(eventTypes).toContain("DELETE");
  });

  it("filters by project_id", () => {
    renderHook(() =>
      useTasksRealtime({ projectId: "proj-1", mutate: mockMutate })
    );

    const filters = mockOn.mock.calls.map(
      (call: [string, { filter: string }]) => call[1].filter
    );
    expect(filters).toEqual([
      "project_id=eq.proj-1",
      "project_id=eq.proj-1",
      "project_id=eq.proj-1",
    ]);
  });

  it("calls mutate with new task on INSERT", () => {
    renderHook(() =>
      useTasksRealtime({ projectId: "proj-1", mutate: mockMutate })
    );

    const insertCallback = channelCallbacks["INSERT:tasks"];
    expect(insertCallback).toBeDefined();

    insertCallback({ new: mockTask });

    expect(mockMutate).toHaveBeenCalled();
    const mutateArg = mockMutate.mock.calls[0][0];
    // The mutate arg is a function — call it with existing data
    const result = mutateArg({ tasks: [] });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe("task-1");
  });

  it("does not duplicate tasks on INSERT if already exists", () => {
    renderHook(() =>
      useTasksRealtime({ projectId: "proj-1", mutate: mockMutate })
    );

    const insertCallback = channelCallbacks["INSERT:tasks"];
    insertCallback({ new: mockTask });

    const mutateArg = mockMutate.mock.calls[0][0];
    const result = mutateArg({ tasks: [mockTask] });
    // Should not duplicate
    expect(result.tasks).toHaveLength(1);
  });

  it("calls mutate with updated task on UPDATE", () => {
    renderHook(() =>
      useTasksRealtime({ projectId: "proj-1", mutate: mockMutate })
    );

    const updateCallback = channelCallbacks["UPDATE:tasks"];
    const updatedTask = { ...mockTask, status: "done" as const };
    updateCallback({ new: updatedTask });

    expect(mockMutate).toHaveBeenCalled();
    const mutateArg = mockMutate.mock.calls[0][0];
    const result = mutateArg({ tasks: [mockTask] });
    expect(result.tasks[0].status).toBe("done");
  });

  it("removes task from cache on DELETE", () => {
    renderHook(() =>
      useTasksRealtime({ projectId: "proj-1", mutate: mockMutate })
    );

    const deleteCallback = channelCallbacks["DELETE:tasks"];
    deleteCallback({ old: { id: "task-1" } });

    expect(mockMutate).toHaveBeenCalled();
    const mutateArg = mockMutate.mock.calls[0][0];
    const result = mutateArg({ tasks: [mockTask] });
    expect(result.tasks).toHaveLength(0);
  });
});
