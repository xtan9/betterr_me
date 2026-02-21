import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectsDB } from '@/lib/db/projects';
import { mockSupabaseClient } from '../../setup';
import type { Project, ProjectInsert } from '@/lib/db/types';

describe('ProjectsDB', () => {
  const mockUserId = 'user-123';
  const projectsDB = new ProjectsDB(mockSupabaseClient as any);

  const mockProject: Project = {
    id: 'project-123',
    user_id: mockUserId,
    name: 'My Project',
    section: 'personal',
    color: 'blue',
    status: 'active',
    sort_order: 0,
    created_at: '2026-02-20T10:00:00Z',
    updated_at: '2026-02-20T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserProjects', () => {
    it('should fetch active projects for a user by default', async () => {
      mockSupabaseClient.setMockResponse([mockProject]);

      const projects = await projectsDB.getUserProjects(mockUserId);

      expect(projects).toEqual([mockProject]);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('projects');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('status', 'active');
    });

    it('should filter by section', async () => {
      mockSupabaseClient.setMockResponse([mockProject]);

      await projectsDB.getUserProjects(mockUserId, { section: 'work' });

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('section', 'work');
    });

    it('should filter by status', async () => {
      mockSupabaseClient.setMockResponse([]);

      await projectsDB.getUserProjects(mockUserId, { status: 'archived' });

      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('status', 'archived');
    });

    it('should handle database errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'DB error' });

      await expect(projectsDB.getUserProjects(mockUserId)).rejects.toEqual({
        message: 'DB error',
      });
    });
  });

  describe('getProject', () => {
    it('should fetch a single project by ID', async () => {
      mockSupabaseClient.setMockResponse(mockProject);

      const project = await projectsDB.getProject('project-123', mockUserId);

      expect(project).toEqual(mockProject);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'project-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should return null if project not found', async () => {
      mockSupabaseClient.setMockResponse(null, { code: 'PGRST116' });

      const project = await projectsDB.getProject('nonexistent', mockUserId);

      expect(project).toBeNull();
    });

    it('should throw on other errors', async () => {
      mockSupabaseClient.setMockResponse(null, {
        code: 'OTHER_ERROR',
        message: 'DB error',
      });

      await expect(
        projectsDB.getProject('project-123', mockUserId)
      ).rejects.toEqual({ code: 'OTHER_ERROR', message: 'DB error' });
    });
  });

  describe('createProject', () => {
    it('should create a new project', async () => {
      const newProject: ProjectInsert = {
        user_id: mockUserId,
        name: 'New Project',
        section: 'personal',
        color: 'blue',
        status: 'active',
      };

      mockSupabaseClient.setMockResponse(mockProject);

      const created = await projectsDB.createProject(newProject);

      expect(created).toEqual(mockProject);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith(newProject);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should handle creation errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'Duplicate key' });

      const newProject: ProjectInsert = {
        user_id: mockUserId,
        name: 'Project',
        section: 'personal',
        color: 'blue',
        status: 'active',
      };

      await expect(projectsDB.createProject(newProject)).rejects.toEqual({
        message: 'Duplicate key',
      });
    });
  });

  describe('updateProject', () => {
    it('should update a project', async () => {
      const updates = { name: 'Updated Name', color: 'red' };
      const updatedProject = { ...mockProject, ...updates };

      mockSupabaseClient.setMockResponse(updatedProject);

      const result = await projectsDB.updateProject(
        'project-123',
        mockUserId,
        updates
      );

      expect(result).toEqual(updatedProject);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith(updates);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'project-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });
  });

  describe('archiveProject', () => {
    it('should archive a project by setting status to archived', async () => {
      const archivedProject = { ...mockProject, status: 'archived' as const };
      mockSupabaseClient.setMockResponse(archivedProject);

      const result = await projectsDB.archiveProject('project-123', mockUserId);

      expect(result).toEqual(archivedProject);
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        status: 'archived',
      });
    });
  });

  describe('deleteProject', () => {
    it('should delete a project', async () => {
      mockSupabaseClient.setMockResponse(null);

      await projectsDB.deleteProject('project-123', mockUserId);

      expect(mockSupabaseClient.delete).toHaveBeenCalled();
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', 'project-123');
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', mockUserId);
    });

    it('should handle deletion errors', async () => {
      mockSupabaseClient.setMockResponse(null, { message: 'FK constraint' });

      await expect(
        projectsDB.deleteProject('project-123', mockUserId)
      ).rejects.toEqual({ message: 'FK constraint' });
    });
  });
});
