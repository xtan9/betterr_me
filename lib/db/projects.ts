import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, ProjectInsert, ProjectUpdate, ProjectSection, ProjectStatus } from './types';

export class ProjectsDB {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all projects for a user with optional filtering by section and status.
   * Defaults to status='active' if not specified.
   */
  async getUserProjects(
    userId: string,
    filters?: { section?: ProjectSection; status?: ProjectStatus }
  ): Promise<Project[]> {
    let query = this.supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });

    const status = filters?.status ?? 'active';
    query = query.eq('status', status);

    if (filters?.section) {
      query = query.eq('section', filters.section);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  /**
   * Get a single project by ID
   */
  async getProject(projectId: string, userId: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    return data;
  }

  /**
   * Create a new project
   */
  async createProject(project: ProjectInsert): Promise<Project> {
    const { data, error } = await this.supabase
      .from('projects')
      .insert(project)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Update a project
   */
  async updateProject(
    projectId: string,
    userId: string,
    updates: ProjectUpdate
  ): Promise<Project> {
    const { data, error } = await this.supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Archive a project (shorthand for status update)
   */
  async archiveProject(projectId: string, userId: string): Promise<Project> {
    return this.updateProject(projectId, userId, { status: 'archived' });
  }

  /**
   * Delete a project. Tasks with this project_id get SET NULL via FK constraint.
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    const { error } = await this.supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) throw error;
  }
}
