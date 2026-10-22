/** Normalizes Project creation and detail changes before persistence. */

import { PROJECT_COLORS } from "./colors";

import {
  type ProjectCreationRecord,
  type ProjectUpdateChanges,
  type ProjectSection,
  DEFAULT_PROJECT_SECTION,
  DEFAULT_PROJECT_COLOR,
  type ProjectStatus,
  DEFAULT_PROJECT_STATUS,
  type ProjectCreationRequest,
  type ProjectUpdateRequest,
} from "./write-contract";

type NormalizedRequest =
  | { ok: true; record: ProjectCreationRecord }
  | { ok: false; field: string; message: string };

type NormalizedUpdateRequest =
  | {
      ok: true;
      userId: string;
      projectId: string;
      changes: ProjectUpdateChanges;
    }
  | { ok: false; field: string; message: string };

const PROJECT_COLOR_KEYS = new Set(PROJECT_COLORS.map((color) => color.key));

const HEX_COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(field: string, message: string): NormalizedRequest {
  return { ok: false, field, message };
}

function normalizeIdentity(value: unknown):
  | { ok: true; value: string }
  | { ok: false; field: string; message: string } {
  return normalizeRequiredIdentity(
    value,
    "userId",
    "User identity is required",
  );
}

function normalizeRequiredIdentity(
  value: unknown,
  field: string,
  message: string,
): { ok: true; value: string } | { ok: false; field: string; message: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, field, message };
  }
  return { ok: true, value: value.trim() };
}

function hasValue(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function normalizeName(value: unknown):
  | { ok: true; value: string }
  | { ok: false; message: string } {
  if (typeof value !== "string") return { ok: false, message: "Name is required" };

  const name = value.trim();
  if (!name) return { ok: false, message: "Name is required" };
  if (name.length > 50) {
    return { ok: false, message: "Name must be 50 characters or less" };
  }
  return { ok: true, value: name };
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

export function normalizeRequest(request: ProjectCreationRequest): NormalizedRequest {
  if (!isRecord(request)) return invalid("request", "Project request is required");

  const userId = normalizeIdentity(request.userId);
  if (!userId.ok) return userId;

  const name = normalizeName(request.name);
  if (!name.ok) return invalid("name", name.message);

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
      name: name.value,
      section: section.value,
      color: color.value,
      status: status.value,
      sortOrder: sortOrder.value,
    },
  };
}

export function normalizeUpdateRequest(
  request: ProjectUpdateRequest,
): NormalizedUpdateRequest {
  if (!isRecord(request)) {
    return { ok: false, field: "request", message: "Project request is required" };
  }

  const userId = normalizeRequiredIdentity(
    request.userId,
    "userId",
    "User identity is required",
  );
  if (!userId.ok) return userId;

  const projectId = normalizeRequiredIdentity(
    request.projectId,
    "projectId",
    "Project identity is required",
  );
  if (!projectId.ok) return projectId;

  const changes: ProjectUpdateChanges = {};

  if (hasValue(request, "name") && request.name !== undefined) {
    const name = normalizeName(request.name);
    if (!name.ok) return { ok: false, field: "name", message: name.message };
    changes.name = name.value;
  }

  if (hasValue(request, "section") && request.section !== undefined) {
    if (request.section === null) {
      return { ok: false, field: "section", message: "Section is invalid" };
    }
    const section = normalizeSection(request.section);
    if (!section.ok) return { ok: false, field: "section", message: section.message };
    changes.section = section.value;
  }

  if (hasValue(request, "color") && request.color !== undefined) {
    if (request.color === null) {
      return { ok: false, field: "color", message: "Color is invalid" };
    }
    const color = normalizeColor(request.color);
    if (!color.ok) return { ok: false, field: "color", message: color.message };
    changes.color = color.value;
  }

  if (hasValue(request, "status") && request.status !== undefined) {
    if (request.status === null) {
      return { ok: false, field: "status", message: "Status is invalid" };
    }
    const status = normalizeStatus(request.status);
    if (!status.ok) return { ok: false, field: "status", message: status.message };
    changes.status = status.value;
  }

  if (hasValue(request, "sortOrder") && request.sortOrder !== undefined) {
    if (request.sortOrder === null) {
      return {
        ok: false,
        field: "sortOrder",
        message: "Sort order must be a non-negative finite number",
      };
    }
    const sortOrder = normalizeSortOrder(request.sortOrder);
    if (!sortOrder.ok || sortOrder.value === null) {
      return {
        ok: false,
        field: "sortOrder",
        message: sortOrder.ok
          ? "Sort order must be a non-negative finite number"
          : sortOrder.message,
      };
    }
    changes.sortOrder = sortOrder.value;
  }

  if (Object.keys(changes).length === 0) {
    return {
      ok: false,
      field: "changes",
      message: "At least one project field must be provided",
    };
  }

  return {
    ok: true,
    userId: userId.value,
    projectId: projectId.value,
    changes,
  };
}
