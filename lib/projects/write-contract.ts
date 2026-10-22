/** Transport-neutral Project commands, defaults, and persistence contracts. */

export type ProjectSection = "personal" | "work";

export type ProjectStatus = "active" | "archived";

export const DEFAULT_PROJECT_SECTION: ProjectSection = "personal";

export const DEFAULT_PROJECT_COLOR = "blue";

export const DEFAULT_PROJECT_STATUS: ProjectStatus = "active";

/**
 * Transport-neutral project creation intent. Ownership is represented only by
 * the trusted identity supplied by an authenticated adapter.
 */
export interface ProjectCreationRequest {
  userId: string;
  name: string;
  section?: ProjectSection | string | null;
  color?: string | null;
  status?: ProjectStatus | string | null;
  /** Null means append at the bottom of the owner's section. */
  sortOrder?: number | null;
}

/** Normalized creation record passed to the persistence capability. */
export interface ProjectCreationRecord {
  userId: string;
  name: string;
  section: ProjectSection;
  color: string;
  status: ProjectStatus;
  sortOrder: number | null;
}

export interface ProjectMutationRecord {
  id: string;
  userId: string;
  name: string;
  section: ProjectSection;
  color: string;
  status: ProjectStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type CreatedProject = ProjectMutationRecord;

export type ProjectCreationPersistenceOutcome =
  | { type: "created"; project: ProjectMutationRecord }
  | { type: "conflict" }
  | { type: "invalid"; field: string; message: string };

export interface ProjectCreationPersistence {
  createProject(
    record: ProjectCreationRecord,
  ): Promise<ProjectCreationPersistenceOutcome>;
}

export type ProjectCreationOutcome = ProjectCreationPersistenceOutcome;

/**
 * Transport-neutral project detail change intent. The adapter supplies the
 * trusted owner identity; all mutable values are normalized below.
 */
export interface ProjectUpdateRequest {
  userId: string;
  projectId: string;
  name?: string | null;
  section?: ProjectSection | string | null;
  color?: string | null;
  status?: ProjectStatus | string | null;
  sortOrder?: number | null;
}

export interface ProjectUpdateChanges {
  name?: string;
  section?: ProjectSection;
  color?: string;
  status?: ProjectStatus;
  sortOrder?: number;
}

export type ProjectUpdatePersistenceOutcome =
  | { type: "updated"; project: ProjectMutationRecord }
  | { type: "already-applied"; project: ProjectMutationRecord }
  | { type: "not-found" }
  | { type: "conflict" }
  | { type: "invalid"; field: string; message: string };

export interface ProjectUpdatePersistence {
  updateProject(
    projectId: string,
    userId: string,
    changes: ProjectUpdateChanges,
  ): Promise<ProjectUpdatePersistenceOutcome>;
}

export interface ProjectDeletionRequest {
  userId: string;
  projectId: string;
}

export type ProjectDeletionPersistenceOutcome =
  | { type: "deleted" }
  | { type: "not-found" };

export interface ProjectDeletionPersistence {
  deleteProject(
    request: ProjectDeletionRequest,
  ): Promise<ProjectDeletionPersistenceOutcome>;
}

export type ProjectMutationPersistence = Partial<
  ProjectCreationPersistence &
    ProjectUpdatePersistence &
    ProjectDeletionPersistence
>;

export type ProjectUpdateOutcome = ProjectUpdatePersistenceOutcome;

export type ProjectDeletionOutcome = ProjectDeletionPersistenceOutcome;
