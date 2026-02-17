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
    it('should mark incomplete task as completed', async () => {
      // First fetch returns incomplete task
      mockSupabaseClient.setMockResponse(mockTask);

      // Mock update response
      const completedTask = {
        ...mockTask,
        is_completed: true,
        completed_at: '2026-01-30T15:00:00Z',
      };
      mockSupabaseClient.setMockResponse(completedTask);

      const result = await tasksDB.toggleTaskCompletion('task-123', mockUserId);

      expect(result.is_completed).toBe(true);
      expect(result.completed_at).toBeTruthy();
    });

    it('should mark completed task as incomplete', async () => {
      const completedTask = {
        ...mockTask,
        is_completed: true,
        completed_at: '2026-01-30T15:00:00Z',
      };

      mockSupabaseClient.setMockResponse(completedTask);

      const incompleteTask = {
        ...mockTask,
        is_completed: false,
        completed_at: null,
      };
      mockSupabaseClient.setMockResponse(incompleteTask);

      const result = await tasksDB.toggleTaskCompletion('task-123', mockUserId);

      expect(result.is_completed).toBe(false);
      expect(result.completed_at).toBeNull();
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
    it('should fetch today and overdue tasks', async () => {
      mockSupabaseClient.setMockResponse([mockTask]);

      const tasks = await tasksDB.getTodayTasks(mockUserId);

      expect(tasks).toEqual([mockTask]);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_completed', false);
      expect(mockSupabaseClient.lte).toHaveBeenCalled(); // due_date <= today
    });
  });

  describe('getUpcomingTasks', () => {
    it('should fetch upcoming tasks within 7 days', async () => {
      mockSupabaseClient.setMockResponse([mockTask]);

      const tasks = await tasksDB.getUpcomingTasks(mockUserId, 7);

      expect(tasks).toEqual([mockTask]);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_completed', false);
    });
  });

  describe('getOverdueTasks', () => {
    it('should fetch overdue tasks', async () => {
      const overdueTask = {
        ...mockTask,
        due_date: '2026-01-15', // Past date
      };

      mockSupabaseClient.setMockResponse([overdueTask]);

      const tasks = await tasksDB.getOverdueTasks(mockUserId);

      expect(tasks).toEqual([overdueTask]);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('is_completed', false);
    });
  });
});
