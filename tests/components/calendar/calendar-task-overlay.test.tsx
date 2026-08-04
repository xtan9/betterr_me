import { describe, expect, it } from "vitest";

import { taskOverlayItemsToExpandedEvents } from "@/lib/calendar/feed-aggregation";

describe("calendar task overlay adapter", () => {
  it("preserves task identity and completion action while leaving event fields editable", () => {
    const [event] = taskOverlayItemsToExpandedEvents([{
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
    }]);

    expect(event).toMatchObject({
      id: "tasks:task-1",
      _domain: "tasks",
      _taskAction: { type: "toggle_task_completion", taskId: "task-1" },
      is_virtual: true,
    });
    expect(event._actions).toBeUndefined();
  });
});
