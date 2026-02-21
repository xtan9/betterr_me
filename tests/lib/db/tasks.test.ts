import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tasksDB } from '@/lib/db/tasks';
import { mockSupabaseClient } from '../../setup';
import type { Task, TaskInsert } from '@/lib/db/types';

describe('TasksDB', () => {
  const mockUserId = 'user-123';
  const mockTask: Task = {
    id: 'task-123',
    user_id: mockUserId,
    title: 'Buy groceries',
    description: 'Milk, eggs, bread',
    is_completed: false,
    priority: 2,
    category: null,
    due_date: '2026-01-31',
    due_time: '14:00:00',
    completed_at: null,
    status: 'todo',
    section: 'personal',
    sort_order: 65536.0,
    recurring_task_id: null,
    is_exception: false,
    original_date: null,
    created_at: '2026-01-30T10:00:00Z',
    updated_at: '2026-01-30T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserTasks', () => {
    it('should fetch all tasks for a user', async () => {
      mockSupabaseClient.setMockResponse([mockTask]);

      const tasks = await tasksDB.getUserTasks(mockUserId);

      expect(tasks).toEqual([mockTask]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('tasks');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should filter by completion status', async () => {
      mockSupabaseClient.setMockResponse([mockTask]);

      await tasksDB.getUserTasks(mockUserId, { is_completed: false });

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_completed', false);
    });

    it('should filter by priority', async () => {
      mockSupabaseClient.setMockResponse([mockTask]);

      await tasksDB.getUserTasks(mockUserId, { priority: 2 });

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('priority', 2);
    });

    it('should filter by due date', async () => {
      mockSupabaseClient.setMockResponse([mockTask]);

      await tasksDB.getUserTasks(mockUserId, { due_date: '2026-01-31' });

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('due_date', '2026-01-31');
    });

    it('should handle database errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(tasksDB.getUserTasks(mockUserId)).rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('getTaskCount', () => {
    it('should count all tasks for a user', async () => {
      mockSupabaseClient.setMockResponse(null, null, 5);

      const count = await tasksDB.getTaskCount(mockUserId);

      expect(count).toBe(5);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('tasks');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should count with is_completed filter', async () => {
      mockSupabaseClient.setMockResponse(null, null, 3);

      const count = await tasksDB.getTaskCount(mockUserId, { is_completed: true });

      expect(count).toBe(3);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_completed', true);
    });

    it('should count with due_date filter', async () => {
      mockSupabaseClient.setMockResponse(null, null, 2);

      const count = await tasksDB.getTaskCount(mockUserId, { due_date: '2026-01-31' });

      expect(count).toBe(2);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('due_date', '2026-01-31');
    });

    it('should return 0 when count is null', async () => {
      mockSupabaseClient.setMockResponse(null, null, null);

      const count = await tasksDB.getTaskCount(mockUserId);

      expect(count).toBe(0);
    });

    it('should handle database errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(tasksDB.getTaskCount(mockUserId)).rejects.toEqual({ message: 'DB error' });
    });
  });

  describe('getTask', () => {
    it('should fetch a single task by ID', async () => {
      mockSupabaseClient.setMockResponse(mockTask);

      const task = await tasksDB.getTask('task-123', mockUserId);

      expect(task).toEqual(mockTask);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'task-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should return null if task not found', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'PGRST116' });

      const task = await tasksDB.getTask('nonexistent', mockUserId);

      expect(task).toBeNull();
    });

    it('should throw on other errors', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'OTHER_ERROR', message: 'DB error' });

      await expect(tasksDB.getTask('task-123', mockUserId)).rejects.toEqual({
        code: 'OTHER_ERROR',
        message: 'DB error',
      });
    });
  });

  describe('createTask', () => {
    it('should create a new task', async () => {
      const newTask: TaskInsert = {
        user_id: mockUserId,
        title: 'New task',
        description: null,
        is_completed: false,
        priority: 1,
        due_date: null,
        due_time: null,
      };

      mockSupabaseClient.setMockResponse(mockTask);

      const created = await tasksDB.createTask(newTask);

      expect(created).toEqual(mockTask);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(newTask);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should handle creation errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Duplicate key' });

      const newTask: TaskInsert = {
        user_id: mockUserId,
        title: 'Task',
        description: null,
        is_completed: false,
        priority: 0,
        due_date: null,
        due_time: null,
      };

      await expect(tasksDB.createTask(newTask)).rejects.toEqual({ message: 'Duplicate key' });
    });
  });

  describe('updateTask', () => {
    it('should update a task', async () => {
      const updates = { title: 'Updated title', priority: 3 as const };
      const updatedTask = { ...mockTask, ...updates };

      mockSupabaseClient.setMockResponse(updatedTask);

      const result = await tasksDB.updateTask('task-123', mockUserId, updates);

      expect(result).toEqual(updatedTask);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(updates);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'task-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });
  });

  describe('toggleTaskCompletion', () => {
    it('should mark incomplete task as completed with status=done', async () => {
      // Mock single() to return incomplete task first (getTask), then completed task (updateTask)
      const completedTask = {
        ...mockTask,
        is_completed: true,
        status: 'done' as const,
        completed_at: '2026-01-30T15:00:00Z',
      };
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: mockTask, error: null })
        .mockResolvedValueOnce({ data: completedTask, error: null });

      const result = await tasksDB.toggleTaskCompletion('task-123', mockUserId);

      expect(result.is_completed).toBe(true);
      expect(result.completed_at).toBeTruthy();
      // Verify syncTaskUpdate was applied: update includes status
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_completed: true,
          status: 'done',
          completed_at: expect.any(String),
        })
      );
    });

    it('should mark completed task as incomplete with status=todo', async () => {
      const completedTask = {
        ...mockTask,
        is_completed: true,
        status: 'done' as const,
        completed_at: '2026-01-30T15:00:00Z',
      };
      const incompleteTask = {
        ...mockTask,
        is_completed: false,
        status: 'todo' as const,
        completed_at: null,
      };

      // Mock single() to return completed task first (getTask), then incomplete task (updateTask)
      mockSupabaseClient.single
        .mockResolvedValueOnce({ data: completedTask, error: null })
        .mockResolvedValueOnce({ data: incompleteTask, error: null });

      const result = await tasksDB.toggleTaskCompletion('task-123', mockUserId);

      expect(result.is_completed).toBe(false);
      expect(result.completed_at).toBeNull();
      // Verify syncTaskUpdate was applied: update includes status
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_completed: false,
          status: 'todo',
          completed_at: null,
        })
      );
    });
  });

  describe('deleteTask', () => {
    it('should delete a task', async () => {
      mockSupabaseClient.setMockResponse(null);

      await tasksDB.deleteTask('task-123', mockUserId);

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'task-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });
  });

  describe('getTodayTasks', () => {
    it('should fetch today and overdue tasks using the provided date', async () => {
      mockSupabaseClient.setMockResponse([mockTask]);

      const tasks = await tasksDB.getTodayTasks(mockUserId, '2026-01-31');

      expect(tasks).toEqual([mockTask]);
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith('due_date', '2026-01-31');
      expect(mockSupabaseClient.eq).not.toHaveBeenCalledWith('is_completed', false);
    });

    it('should use the provided date parameter instead of server time', async () => {
      mockSupabaseClient.setMockResponse([]);

      await tasksDB.getTodayTasks(mockUserId, '2026-06-15');

      expect(mockSupabaseClient.lte).toHaveBeenCalledWith('due_date', '2026-06-15');
    });

    it('should handle database errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(tasksDB.getTodayTasks(mockUserId, '2026-01-31'))
        .rejects.toEqual({ message: 'DB error' });
    });

    it('should return both completed and incomplete tasks', async () => {
      const completedTask: Task = {
        ...mockTask,
        id: 'task-completed',
        is_completed: true,
        status: 'done',
        completed_at: '2026-01-31T12:00:00Z',
      };
      const incompleteTask: Task = {
        ...mockTask,
        id: 'task-incomplete',
        is_completed: false,
      };
      mockSupabaseClient.setMockResponse([completedTask, incompleteTask]);

      const tasks = await tasksDB.getTodayTasks(mockUserId, '2026-01-31');

      expect(tasks).toHaveLength(2);
      expect(tasks).toContainEqual(completedTask);
      expect(tasks).toContainEqual(incompleteTask);
    });
  });

  describe('getUpcomingTasks', () => {
    it('should fetch upcoming tasks within 7 days', async () => {
      mockSupabaseClient.setMockResponse([mockTask]);

      const tasks = await tasksDB.getUpcomingTasks(mockUserId, '2026-01-31', 7);

      expect(tasks).toEqual([mockTask]);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_completed', false);
      expect(mockSupabaseClient.gt).toHaveBeenCalledWith('due_date', '2026-01-31');
    });

    it('should use the provided date parameter', async () => {
      mockSupabaseClient.setMockResponse([]);

      await tasksDB.getUpcomingTasks(mockUserId, '2026-06-15', 7);

      expect(mockSupabaseClient.gt).toHaveBeenCalledWith('due_date', '2026-06-15');
    });
  });

  describe('getOverdueTasks', () => {
    it('should fetch overdue tasks', async () => {
      const overdueTask = {
        ...mockTask,
        due_date: '2026-01-15', // Past date
      };

      mockSupabaseClient.setMockResponse([overdueTask]);

      const tasks = await tasksDB.getOverdueTasks(mockUserId, '2026-01-31');

      expect(tasks).toEqual([overdueTask]);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_completed', false);
      expect(mockSupabaseClient.lt).toHaveBeenCalledWith('due_date', '2026-01-31');
    });

    it('should use the provided date parameter', async () => {
      mockSupabaseClient.setMockResponse([]);

      await tasksDB.getOverdueTasks(mockUserId, '2026-06-15');

      expect(mockSupabaseClient.lt).toHaveBeenCalledWith('due_date', '2026-06-15');
    });
  });
});
