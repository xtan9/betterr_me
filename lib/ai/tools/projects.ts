import { z } from "zod";
import { ProjectsDB } from "@/lib/db";
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
        const db = new ProjectsDB(ctx.supabase);
        return db.createProject({
          user_id: ctx.userId,
          name: params.name,
          section: params.section ?? "personal",
          color: params.color ?? "#3B82F6",
        });
      },
    },
    {
      name: "updateProject",
      description: "Update a project's name, section, color, or status",
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
      }),
      execute: async (params, ctx: ToolContext) => {
        const db = new ProjectsDB(ctx.supabase);
        const { projectId, ...rest } = params;
        const updates: Record<string, unknown> = { ...rest };
        for (const key of Object.keys(updates)) {
          if (updates[key] === undefined) delete updates[key];
        }
        return db.updateProject(projectId, ctx.userId, updates);
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
        await db.deleteProject(params.projectId, ctx.userId);
        return { success: true };
      },
    },
  ];
}
