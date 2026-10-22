/** Maps Project commands to atomic Supabase operations and decodes stored records. */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ProjectMutationPersistence,
  ProjectCreationRecord,
  ProjectCreationPersistenceOutcome,
  ProjectUpdateChanges,
  ProjectUpdatePersistenceOutcome,
  ProjectDeletionRequest,
  ProjectDeletionPersistenceOutcome,
  ProjectSection,
  ProjectStatus,
  ProjectMutationRecord,
} from "./write-contract";

import { isRecord } from "./write-validation";

export class SupabaseProjectMutationPersistence
  implements ProjectMutationPersistence
{
  constructor(private readonly supabase: SupabaseClient) {}

  async createProject(
    record: ProjectCreationRecord,
  ): Promise<ProjectCreationPersistenceOutcome> {
    const { data, error } = await this.supabase.rpc(
      "create_project_atomically",
      {
        p_user_id: record.userId,
        p_name: record.name,
        p_section: record.section,
        p_color: record.color,
        p_status: record.status,
        p_sort_order: record.sortOrder,
      },
    );

    if (error) {
      if (isConflictError(error)) return { type: "conflict" };
      throw error;
    }
    return mapStoredProjectCreationOutcome(data);
  }

  async updateProject(
    projectId: string,
    userId: string,
    changes: ProjectUpdateChanges,
  ): Promise<ProjectUpdatePersistenceOutcome> {
    const { data, error } = await this.supabase.rpc(
      "update_project_atomically",
      {
        p_project_id: projectId,
        p_user_id: userId,
        p_changes: toStoredProjectUpdateChanges(changes),
      },
    );

    if (error) {
      if (isConflictError(error)) return { type: "conflict" };
      throw error;
    }
    return mapStoredProjectUpdateOutcome(data);
  }

  async deleteProject(
    request: ProjectDeletionRequest,
  ): Promise<ProjectDeletionPersistenceOutcome> {
    const { data, error } = await this.supabase.rpc(
      "delete_project_atomically",
      {
        p_project_id: request.projectId,
        p_user_id: request.userId,
      },
    );

    if (error) throw error;
    return mapStoredProjectDeletionOutcome(data);
  }
}

/** Backwards-compatible name for callers that only use project creation. */
export class SupabaseProjectCreationPersistence
  extends SupabaseProjectMutationPersistence {}

function toStoredProjectUpdateChanges(
  changes: ProjectUpdateChanges,
): Record<string, unknown> {
  return {
    ...(changes.name === undefined ? {} : { name: changes.name }),
    ...(changes.section === undefined ? {} : { section: changes.section }),
    ...(changes.color === undefined ? {} : { color: changes.color }),
    ...(changes.status === undefined ? {} : { status: changes.status }),
    ...(changes.sortOrder === undefined ? {} : { sort_order: changes.sortOrder }),
  };
}

function isConflictError(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}

function isProjectSection(value: unknown): value is ProjectSection {
  return value === "personal" || value === "work";
}

function isProjectStatus(value: unknown): value is ProjectStatus {
  return value === "active" || value === "archived";
}

function toProjectMutationRecord(value: unknown): ProjectMutationRecord {
  if (!isRecord(value)) {
    throw new Error("Invalid project returned by the database");
  }

  if (
    typeof value.id !== "string" ||
    typeof value.user_id !== "string" ||
    typeof value.name !== "string" ||
    !isProjectSection(value.section) ||
    typeof value.color !== "string" ||
    !isProjectStatus(value.status) ||
    typeof value.sort_order !== "number" ||
    !Number.isFinite(value.sort_order) ||
    typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string"
  ) {
    throw new Error("Invalid project returned by the database");
  }

  return {
    id: value.id,
    userId: value.user_id,
    name: value.name,
    section: value.section,
    color: value.color,
    status: value.status,
    sortOrder: value.sort_order,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

function mapStoredProjectCreationOutcome(
  value: unknown,
): ProjectCreationPersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid project creation outcome returned by the database");
  }

  if (value.type === "conflict") return { type: "conflict" };

  if (
    value.type === "invalid" &&
    typeof value.field === "string" &&
    typeof value.message === "string"
  ) {
    return {
      type: "invalid",
      field: value.field,
      message: value.message,
    };
  }

  if (value.type === "created") {
    return {
      type: "created",
      project: toProjectMutationRecord(value.project),
    };
  }

  throw new Error("Invalid project creation outcome returned by the database");
}

function mapStoredProjectUpdateOutcome(
  value: unknown,
): ProjectUpdatePersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid project update outcome returned by the database");
  }

  if (value.type === "not-found" || value.type === "conflict") {
    return { type: value.type };
  }

  if (
    value.type === "invalid" &&
    typeof value.field === "string" &&
    typeof value.message === "string"
  ) {
    return {
      type: "invalid",
      field: value.field,
      message: value.message,
    };
  }

  if (
    (value.type === "updated" || value.type === "already-applied") &&
    isRecord(value.project)
  ) {
    return {
      type: value.type,
      project: toProjectMutationRecord(value.project),
    };
  }

  throw new Error("Invalid project update outcome returned by the database");
}

function mapStoredProjectDeletionOutcome(
  value: unknown,
): ProjectDeletionPersistenceOutcome {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("Invalid project deletion outcome returned by the database");
  }

  if (value.type === "deleted" || value.type === "not-found") {
    return { type: value.type };
  }

  throw new Error("Invalid project deletion outcome returned by the database");
}
