import { z } from "zod";
import { ProjectsDB } from "@/lib/db";
import { createProjectWrites, toProjectResponse } from "@/lib/projects/writes";
import type { ToolDefinition, ToolContext } from "./types";

export function projectTools(): ToolDefinition[] {
  return [
    {
      name: "getProjects",
      description:
        "List the user's projects, optionally filtered by section and status",
      parameters: z.object({
        section: z
          .enum(["personal", "work"])
          .optional()
          .describe("Filter by section"),
        status: z
          .enum(["active", "archived"])
          .optional()
          .describe("Filter by status (default: active)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new ProjectsDB(ctx.supabase);
        return db.getUserProjects(ctx.userId, {
          section: params.section,
          status: params.status ?? "active",
        });
      },
    },
    {
      name: "getProject",
      description: "Get a single project by ID",
      parameters: z.object({
        projectId: z.string().describe("The project ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new ProjectsDB(ctx.supabase);
        const project = await db.getProject(params.projectId, ctx.userId);
        if (!project) return { error: "Project not found" };
        return project;
      },
    },
    {
      name: "createProject",
      description: "Create a new project",
      parameters: z.object({
        name: z.string().describe("Project name"),
        section: z
          .enum(["personal", "work"])
          .optional()
          .describe("Section (default: personal)"),
        color: z
          .string()
          .optional()
          .describe("Color hex code (e.g., #3B82F6)"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const outcome = await createProjectWrites(ctx.supabase).create({
          userId: ctx.userId,
          name: params.name,
          section: params.section,
          color: params.color,
        });

        if (outcome.type === "created") {
          return toProjectResponse(outcome.project);
        }
        if (outcome.type === "conflict") {
          return { error: "Project creation conflicted" };
        }
        return { error: outcome.message, field: outcome.field };
      },
    },
    {
      name: "updateProject",
      description:
        "Update a project's name, section, color, ordering, or status",
      parameters: z.object({
        projectId: z.string().describe("The project ID"),
        name: z.string().optional().describe("New name"),
        section: z
          .enum(["personal", "work"])
          .optional()
          .describe("New section"),
        color: z.string().optional().describe("New color"),
        status: z
          .enum(["active", "archived"])
          .optional()
          .describe("New status"),
        sortOrder: z.number().optional().describe("New ordering value"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const outcome = await createProjectWrites(ctx.supabase).update({
          userId: ctx.userId,
          projectId: params.projectId,
          ...(params.name !== undefined ? { name: params.name } : {}),
          ...(params.section !== undefined ? { section: params.section } : {}),
          ...(params.color !== undefined ? { color: params.color } : {}),
          ...(params.status !== undefined ? { status: params.status } : {}),
          ...(params.sortOrder !== undefined
            ? { sortOrder: params.sortOrder }
            : {}),
        });

        if (outcome.type === "updated" || outcome.type === "already-applied") {
          return toProjectResponse(outcome.project);
        }
        if (outcome.type === "not-found") {
          return { error: "Project not found" };
        }
        if (outcome.type === "conflict") {
          return { error: "Project update conflict" };
        }
        return { error: outcome.message, field: outcome.field };
      },
    },
    {
      name: "deleteProject",
      description:
        "Delete a project. Tasks in this project will be unassigned. This action cannot be undone. Always confirm with the user first.",
      parameters: z.object({
        projectId: z.string().describe("The project ID"),
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new ProjectsDB(ctx.supabase);
        const project = await db.getProject(params.projectId, ctx.userId);
        if (!project) return { error: "Project not found" };
        await db.deleteProject(params.projectId, ctx.userId);
        return { success: true };
      },
    },
  ];
}
