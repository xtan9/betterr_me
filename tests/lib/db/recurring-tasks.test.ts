import { describe, it, expect, vi, beforeEach } from "vitest";
import { RecurringTasksDB } from "@/lib/db/recurring-tasks";
import { mockSupabaseClient } from "../../setup";
import type { RecurringTask, RecurringTaskInsert } from "@/lib/db/types";

// Mock external dependencies used by RecurringTasksDB
const { mockEnsureRecurringInstances, mockGetNextOccurrence } = vi.hoisted(
  () => ({
    mockEnsureRecurringInstances: vi.fn(),
    mockGetNextOccurrence: vi.fn(),
  }),
);

vi.mock("@/lib/recurring-tasks", () => ({
  ensureRecurringInstances: mockEnsureRecurringInstances,
}));

vi.mock("@/lib/recurring-tasks/recurrence", () => ({
  getNextOccurrence: mockGetNextOccurrence,
}));

const db = new RecurringTasksDB(mockSupabaseClient as any);
const mockUserId = "user-123";

const mockTemplate: RecurringTask = {
  id: "rt-1",
  user_id: mockUserId,
  title: "Daily standup",
  description: "Morning standup meeting",
  priority: 1,
  category: "productivity",
  due_time: "09:00",
  recurrence_rule: { frequency: "daily", interval: 1 },
  start_date: "2026-01-01",
  end_type: "never",
  end_date: null,
  end_count: null,
  status: "active",
  next_generate_date: "2026-01-15",
  instances_generated: 14,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-15T00:00:00Z",
};

describe("RecurringTasksDB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getUserRecurringTasks", () => {
    it("should fetch all recurring tasks for a user", async () => {
      mockSupabaseClient.setMockResponse([mockTemplate]);

      const result = await db.getUserRecurringTasks(mockUserId);

      expect(result).toEqual([mockTemplate]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("recurring_tasks");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", mockUserId);
      expect(mockSupabaseClient.order).toHaveBeenCalledWith("created_at", {
        ascending: false,
      });
    });

    it("should filter by status when provided", async () => {
      mockSupabaseClient.setMockResponse([mockTemplate]);

      await db.getUserRecurringTasks(mockUserId, { status: "paused" });

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("status", "paused");
    });

    it("should handle database errors", async () => {
      mockSupabaseClient.setMockResponse(null, { message: "DB error" });

      await expect(db.getUserRecurringTasks(mockUserId)).rejects.toEqual({
        message: "DB error",
      });
    });

    it("should return empty array when no data", async () => {
      mockSupabaseClient.setMockResponse(null);

      const result = await db.getUserRecurringTasks(mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe("getRecurringTask", () => {
    it("should fetch a single recurring task by ID", async () => {
      mockSupabaseClient.setMockResponse(mockTemplate);

      const result = await db.getRecurringTask("rt-1", mockUserId);

      expect(result).toEqual(mockTemplate);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "rt-1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", mockUserId);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it("should return null on PGRST116 (not found)", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      const result = await db.getRecurringTask("nonexistent", mockUserId);

      expect(result).toBeNull();
    });

    it("should throw on other errors", async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: "OTHER",
        message: "DB error",
      });

      await expect(db.getRecurringTask("rt-1", mockUserId)).rejects.toEqual({
        code: "OTHER",
        message: "DB error",
      });
    });
  });

  describe("createRecurringTask", () => {
    it("should insert data and call ensureRecurringInstances", async () => {
      const insertData: RecurringTaskInsert = {
        user_id: mockUserId,
        title: "New task",
        description: null,
              priority: 0,
        category: null,
        due_time: null,
        recurrence_rule: { frequency: "daily", interval: 1 },
        start_date: "2026-02-01",
        end_type: "never",
        end_date: null,
        end_count: null,
        status: "active",
      };

      mockSupabaseClient.setMockResponse(mockTemplate);
      mockEnsureRecurringInstances.mockResolvedValue(undefined);

      const result = await db.createRecurringTask(insertData, "2026-02-08");

      expect(result).toEqual(mockTemplate);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        ...insertData,
        next_generate_date: "2026-02-01",
        instances_generated: 0,
      });
      expect(mockSupabaseClient.single).toHaveBeenCalled();
      expect(mockEnsureRecurringInstances).toHaveBeenCalledWith(
        mockSupabaseClient,
        mockUserId,
        "2026-02-08",
      );
    });

    it("should throw on insert error", async () => {
      const insertData: RecurringTaskInsert = {
        user_id: mockUserId,
        title: "Fail",
        description: null,
              priority: 0,
        category: null,
        due_time: null,
        recurrence_rule: { frequency: "daily", interval: 1 },
        start_date: "2026-02-01",
        end_type: "never",
        end_date: null,
        end_count: null,
        status: "active",
      };

      mockSupabaseClient.setMockResponse(null, { message: "Insert failed" });

      await expect(
        db.createRecurringTask(insertData, "2026-02-08"),
      ).rejects.toEqual({
        message: "Insert failed",
      });
    });
  });

  describe("updateRecurringTask", () => {
    it("should update with given fields", async () => {
      const updated = { ...mockTemplate, title: "Updated" };
      mockSupabaseClient.setMockResponse(updated);

      const result = await db.updateRecurringTask("rt-1", mockUserId, {
        title: "Updated",
      });

      expect(result).toEqual(updated);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        title: "Updated",
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "rt-1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", mockUserId);
    });

    it("should throw on error", async () => {
      mockSupabaseClient.setMockResponse(null, { message: "Update failed" });

      await expect(
        db.updateRecurringTask("rt-1", mockUserId, { title: "X" }),
      ).rejects.toEqual({
        message: "Update failed",
      });
    });
  });

  describe("archiveRecurringTask", () => {
    it("should set status to archived", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.archiveRecurringTask("rt-1", mockUserId);

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: "archived",
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "rt-1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", mockUserId);
    });

    it("should throw on error", async () => {
      mockSupabaseClient.setMockResponse(null, { message: "Archive failed" });

      await expect(db.archiveRecurringTask("rt-1", mockUserId)).rejects.toEqual(
        {
          message: "Archive failed",
        },
      );
    });
  });

  describe("deleteRecurringTask", () => {
    it("should delete incomplete instances then delete template", async () => {
      mockSupabaseClient.setMockResponse(null);

      await db.deleteRecurringTask("rt-1", mockUserId);

      // First delete call: incomplete instances from 'tasks' table
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "recurring_task_id",
        "rt-1",
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("is_completed", false);
      // Second delete call: template from 'recurring_tasks' table
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("tasks");
      expect(mockSupabaseClient.from).toHaveBeenCalledWith("recurring_tasks");
    });

    it("should throw if instance deletion fails", async () => {
      mockSupabaseClient.setMockResponse(null, {
        message: "Delete instances failed",
      });

      await expect(db.deleteRecurringTask("rt-1", mockUserId)).rejects.toEqual({
        message: "Delete instances failed",
      });
    });
  });

  describe("pauseRecurringTask", () => {
    it("should delegate to updateRecurringTask with status paused", async () => {
      const paused = { ...mockTemplate, status: "paused" as const };
      mockSupabaseClient.setMockResponse(paused);

      const result = await db.pauseRecurringTask("rt-1", mockUserId);

      expect(result.status).toBe("paused");
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: "paused",
      });
    });
  });

  describe("resumeRecurringTask", () => {
    it("should compute next occurrence, update status, and generate instances", async () => {
      // First call: getRecurringTask (single)
      // Second call: update (single)
      mockSupabaseClient.setMockResponse(mockTemplate);
      mockGetNextOccurrence.mockReturnValue("2026-02-22");
      mockEnsureRecurringInstances.mockResolvedValue(undefined);

      const result = await db.resumeRecurringTask(
        "rt-1",
        mockUserId,
        "2026-02-21",
        "2026-02-28",
      );

      expect(mockGetNextOccurrence).toHaveBeenCalledWith(
        mockTemplate.recurrence_rule,
        mockTemplate.start_date,
        "2026-02-21",
      );
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: "active",
        next_generate_date: "2026-02-22",
      });
      expect(mockEnsureRecurringInstances).toHaveBeenCalledWith(
        mockSupabaseClient,
        mockUserId,
        "2026-02-28",
      );
      expect(result).toEqual(mockTemplate);
    });

    it("should throw if template not found", async () => {
      // getRecurringTask returns null (PGRST116)
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      await expect(
        db.resumeRecurringTask(
          "nonexistent",
          mockUserId,
          "2026-02-21",
          "2026-02-28",
        ),
      ).rejects.toThrow("Recurring task not found");
    });
  });

  describe("updateInstanceWithScope", () => {
    const mockTask = {
      id: "task-1",
      user_id: mockUserId,
      recurring_task_id: "rt-1",
      original_date: "2026-02-15",
      is_completed: false,
      is_exception: false,
      recurring_tasks: mockTemplate,
    };

    it("scope=this: should update single instance and mark as exception", async () => {
      mockSupabaseClient.setMockResponse(mockTask);

      await db.updateInstanceWithScope("task-1", mockUserId, "this", {
        title: "Modified",
      });

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        title: "Modified",
        is_exception: true,
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "task-1");
    });

    it("scope=following: should update template and future instances", async () => {
      mockSupabaseClient.setMockResponse(mockTask);

      await db.updateInstanceWithScope("task-1", mockUserId, "following", {
        title: "New Title",
        priority: 2,
      });

      // Template update
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        title: "New Title",
        priority: 2,
      });
      // Future instances update
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "recurring_task_id",
        "rt-1",
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("is_completed", false);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("is_exception", false);
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith(
        "original_date",
        "2026-02-15",
      );
    });

    it("scope=all: should update template and all future non-exception instances", async () => {
      mockSupabaseClient.setMockResponse(mockTask);

      await db.updateInstanceWithScope("task-1", mockUserId, "all", {
        title: "All Updated",
      });

      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        title: "All Updated",
      });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "recurring_task_id",
        "rt-1",
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("is_completed", false);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("is_exception", false);
    });

    it("should throw if task not found", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      await expect(
        db.updateInstanceWithScope("nonexistent", mockUserId, "this", {
          title: "X",
        }),
      ).rejects.toThrow("Task not found or not part of a recurring series");
    });

    it("should throw if task has no recurring_task_id", async () => {
      mockSupabaseClient.setMockResponse({
        ...mockTask,
        recurring_task_id: null,
      });

      await expect(
        db.updateInstanceWithScope("task-1", mockUserId, "this", {
          title: "X",
        }),
      ).rejects.toThrow("Task not found or not part of a recurring series");
    });
  });

  describe("deleteInstanceWithScope", () => {
    const mockTask = {
      id: "task-1",
      user_id: mockUserId,
      recurring_task_id: "rt-1",
      original_date: "2026-02-15",
      is_completed: false,
    };

    it("scope=this: should delete just the one instance", async () => {
      mockSupabaseClient.setMockResponse(mockTask);

      await db.deleteInstanceWithScope("task-1", mockUserId, "this");

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("id", "task-1");
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("user_id", mockUserId);
    });

    it("scope=following: should delete future instances and set template end_date", async () => {
      mockSupabaseClient.setMockResponse(mockTask);

      await db.deleteInstanceWithScope("task-1", mockUserId, "following");

      // Delete future instances
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "recurring_task_id",
        "rt-1",
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("is_completed", false);
      expect(mockSupabaseClient.gte).toHaveBeenCalledWith(
        "original_date",
        "2026-02-15",
      );
      // Update template with end_date (day before: 2026-02-14)
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        end_type: "on_date",
        end_date: "2026-02-14",
      });
    });

    it("scope=following: should throw if task has no original_date", async () => {
      mockSupabaseClient.setMockResponse({ ...mockTask, original_date: null });

      await expect(
        db.deleteInstanceWithScope("task-1", mockUserId, "following"),
      ).rejects.toThrow(
        "Cannot delete following instances: task has no original_date",
      );
    });

    it("scope=all: should delete all incomplete instances and archive template", async () => {
      mockSupabaseClient.setMockResponse(mockTask);

      await db.deleteInstanceWithScope("task-1", mockUserId, "all");

      // Delete all incomplete instances
      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith(
        "recurring_task_id",
        "rt-1",
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith("is_completed", false);
      // Archive template
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: "archived",
      });
    });

    it("should throw if task not found", async () => {
      mockSupabaseClient.setMockResponse(null, { code: "PGRST116" });

      await expect(
        db.deleteInstanceWithScope("nonexistent", mockUserId, "this"),
      ).rejects.toThrow("Task not found or not part of a recurring series");
    });
  });
});
