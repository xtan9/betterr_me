/** Project commands, production composition, and delivery response mapping. */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ProjectMutationPersistence,
  ProjectCreationRequest,
  ProjectCreationOutcome,
  ProjectUpdateRequest,
  ProjectUpdateOutcome,
  ProjectDeletionRequest,
  ProjectDeletionOutcome,
  ProjectMutationRecord,
} from "./write-contract";

import { normalizeRequest, normalizeUpdateRequest } from "./write-validation";

import { SupabaseProjectMutationPersistence } from "./project-persistence";

export {
  type ProjectSection,
  type ProjectStatus,
  DEFAULT_PROJECT_SECTION,
  DEFAULT_PROJECT_COLOR,
  DEFAULT_PROJECT_STATUS,
  type ProjectCreationRequest,
  type ProjectCreationRecord,
  type ProjectMutationRecord,
  type CreatedProject,
  type ProjectCreationPersistenceOutcome,
  type ProjectCreationPersistence,
  type ProjectCreationOutcome,
  type ProjectUpdateRequest,
  type ProjectUpdateChanges,
  type ProjectUpdatePersistenceOutcome,
  type ProjectUpdatePersistence,
  type ProjectDeletionRequest,
  type ProjectDeletionPersistenceOutcome,
  type ProjectDeletionPersistence,
  type ProjectMutationPersistence,
  type ProjectUpdateOutcome,
  type ProjectDeletionOutcome,
} from "./write-contract";

export {
  SupabaseProjectMutationPersistence,
  SupabaseProjectCreationPersistence,
} from "./project-persistence";

export class ProjectWrites {
  constructor(private readonly persistence: ProjectMutationPersistence) {}

  async create(request: ProjectCreationRequest): Promise<ProjectCreationOutcome> {
    const normalized = normalizeRequest(request);
    if (!normalized.ok) {
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }

    if (!this.persistence.createProject) {
      throw new Error("Project creation persistence is not configured");
    }
    return this.persistence.createProject(normalized.record);
  }

  async update(request: ProjectUpdateRequest): Promise<ProjectUpdateOutcome> {
    const normalized = normalizeUpdateRequest(request);
    if (!normalized.ok) {
      return {
        type: "invalid",
        field: normalized.field,
        message: normalized.message,
      };
    }

    if (!this.persistence.updateProject) {
      throw new Error("Project updates are not supported by this persistence");
    }

    return this.persistence.updateProject(
      normalized.projectId,
      normalized.userId,
      normalized.changes,
    );
  }

  async delete(
    request: ProjectDeletionRequest,
  ): Promise<ProjectDeletionOutcome> {
    if (!this.persistence.deleteProject) {
      throw new Error("Project deletion persistence is not configured");
    }

    return this.persistence.deleteProject(request);
  }
}

export function createProjectWrites(supabase: SupabaseClient): ProjectWrites {
  return new ProjectWrites(new SupabaseProjectMutationPersistence(supabase));
}

export function toProjectResponse(project: ProjectMutationRecord) {
  return {
    id: project.id,
    user_id: project.userId,
    name: project.name,
    section: project.section,
    color: project.color,
    status: project.status,
    sort_order: project.sortOrder,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}
