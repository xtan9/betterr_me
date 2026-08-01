import type { SupabaseClient } from "@supabase/supabase-js";
import { PROJECT_COLORS } from "./colors";

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

type NormalizedRequest =
  | { ok: true; record: ProjectCreationRecord }
  | { ok: false; field: string; message: string };

const PROJECT_COLOR_KEYS = new Set(PROJECT_COLORS.map((color) => color.key));
const HEX_COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(field: string, message: string): NormalizedRequest {
  return { ok: false, field, message };
}

function normalizeIdentity(value: unknown):
  | { ok: true; value: string }
  | { ok: false; field: string; message: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, field: "userId", message: "User identity is required" };
  }
  return { ok: true, value: value.trim() };
}

function normalizeSection(value: unknown):
  | { ok: true; value: ProjectSection }
  | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: DEFAULT_PROJECT_SECTION };
  }
  if (typeof value !== "string") return { ok: false, message: "Section is invalid" };

  const section = value.trim();
  if (section === "personal" || section === "work") {
    return { ok: true, value: section };
  }
  return { ok: false, message: "Section is invalid" };
}

function normalizeColor(value: unknown):
  | { ok: true; value: string }
  | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: DEFAULT_PROJECT_COLOR };
  }
  if (typeof value !== "string") return { ok: false, message: "Color is invalid" };

  const color = value.trim();
  if (PROJECT_COLOR_KEYS.has(color) || HEX_COLOR_PATTERN.test(color)) {
    return { ok: true, value: color };
  }
  return { ok: false, message: "Color is invalid" };
}

function normalizeStatus(value: unknown):
  | { ok: true; value: ProjectStatus }
  | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: DEFAULT_PROJECT_STATUS };
  }
  if (typeof value !== "string") return { ok: false, message: "Status is invalid" };

  const status = value.trim();
  if (status === "active" || status === "archived") {
    return { ok: true, value: status };
  }
  return { ok: false, message: "Status is invalid" };
}

function normalizeSortOrder(value: unknown):
  | { ok: true; value: number | null }
  | { ok: false; message: string } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    return {
      ok: false,
      message: "Sort order must be a non-negative finite number",
    };
  }
  return { ok: true, value };
}

function normalizeRequest(request: ProjectCreationRequest): NormalizedRequest {
  if (!isRecord(request)) return invalid("request", "Project request is required");

  const userId = normalizeIdentity(request.userId);
  if (!userId.ok) return userId;

  if (typeof request.name !== "string") return invalid("name", "Name is required");
  const name = request.name.trim();
  if (!name) return invalid("name", "Name is required");
  if (name.length > 50) {
    return invalid("name", "Name must be 50 characters or less");
  }

  const section = normalizeSection(request.section);
  if (!section.ok) return invalid("section", section.message);

  const color = normalizeColor(request.color);
  if (!color.ok) return invalid("color", color.message);

  const status = normalizeStatus(request.status);
  if (!status.ok) return invalid("status", status.message);

  const sortOrder = normalizeSortOrder(request.sortOrder);
  if (!sortOrder.ok) return invalid("sortOrder", sortOrder.message);

  return {
    ok: true,
    record: {
      userId: userId.value,
      name,
      section: section.value,
      color: color.value,
      status: status.value,
      sortOrder: sortOrder.value,
    },
  };
}

export class ProjectWrites {
  constructor(private readonly persistence: ProjectCreationPersistence) {}

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
}

export class SupabaseProjectCreationPersistence
  implements ProjectCreationPersistence
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

export function createProjectWrites(supabase: SupabaseClient): ProjectWrites {
  return new ProjectWrites(new SupabaseProjectCreationPersistence(supabase));
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
