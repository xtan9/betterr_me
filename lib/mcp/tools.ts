import { createClient } from "@supabase/supabase-js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { log } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Service-role Supabase client (stateless singleton)
// ---------------------------------------------------------------------------

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ---------------------------------------------------------------------------
// Helper: extract userId from MCP extra context
// ---------------------------------------------------------------------------

function getUserId(extra: Record<string, unknown>): string | null {
  const authInfo = extra.authInfo as
    | { extra?: { userId?: string } }
    | undefined;
  return authInfo?.extra?.userId ?? null;
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

function errorResponse(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}

function jsonResponse(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

// ---------------------------------------------------------------------------
// Register all MCP tools
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  // Cast to avoid "Type instantiation is excessively deep" errors caused by
  // the deeply nested generics in McpServer.registerTool combined with Zod.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const register = server.registerTool.bind(server) as any;

  // -------------------------------------------------------------------------
  // 1. list-projects
  // -------------------------------------------------------------------------
  register(
    "list-projects",
    {
      description:
        "List projects for the authenticated user, optionally filtered by section and status.",
      inputSchema: z.object({
        section: z
          .enum(["personal", "work"])
          .optional()
          .describe("Filter by section: personal or work"),
        status: z
          .enum(["active", "archived"])
          .optional()
          .describe("Filter by status (defaults to active)"),
      }),
    },
    async (params: { section?: string; status?: string }, extra: unknown) => {
      const userId = getUserId(extra as Record<string, unknown>);
      if (!userId) return errorResponse("Authentication required");

      let query = supabase
        .from("projects")
        .select(
          "id, name, section, color, status, sort_order, created_at",
        )
        .eq("user_id", userId)
        .order("sort_order");

      if (params.section) {
        query = query.eq("section", params.section);
      }
      query = query.eq("status", params.status ?? "active");

      const { data, error } = await query;
      if (error) {
        log.error("MCP list-projects failed", error);
        return errorResponse(error.message);
      }
      return jsonResponse(data);
    },
  );

  // -------------------------------------------------------------------------
  // 2. get-project-tasks
  // -------------------------------------------------------------------------
  register(
    "get-project-tasks",
    {
      description:
        "List tasks in a project, optionally filtered by status and priority.",
      inputSchema: z.object({
        projectId: z.string().describe("The project ID"),
        status: z.string().optional().describe("Filter by task status"),
        priority: z.number().optional().describe("Filter by priority level"),
      }),
    },
    async (
      params: { projectId: string; status?: string; priority?: number },
      extra: unknown,
    ) => {
      const userId = getUserId(extra as Record<string, unknown>);
      if (!userId) return errorResponse("Authentication required");

      let query = supabase
        .from("tasks")
        .select(
          "id, title, description, status, priority, due_date, due_time, section, sort_order, is_completed, category_id, project_id, created_at",
        )
        .eq("project_id", params.projectId)
        .eq("user_id", userId)
        .order("priority", { ascending: false })
        .order("sort_order");

      if (params.status) {
        query = query.eq("status", params.status);
      }
      if (params.priority !== undefined) {
        query = query.eq("priority", params.priority);
      }

      const { data, error } = await query;
      if (error) {
        log.error("MCP tool query failed", error);
        return errorResponse(error.message);
      }
      return jsonResponse(data);
    },
  );

  // -------------------------------------------------------------------------
  // 3. get-task
  // -------------------------------------------------------------------------
  register(
    "get-task",
    {
      description: "Get a single task by ID.",
      inputSchema: z.object({
        taskId: z.string().describe("The task ID"),
      }),
    },
    async (params: { taskId: string }, extra: unknown) => {
      const userId = getUserId(extra as Record<string, unknown>);
      if (!userId) return errorResponse("Authentication required");

      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", params.taskId)
        .eq("user_id", userId)
        .single();

      if (error) {
        log.error("MCP tool query failed", error);
        return errorResponse(error.message);
      }
      return jsonResponse(data);
    },
  );

  // -------------------------------------------------------------------------
  // 4. create-task
  // -------------------------------------------------------------------------
  register(
    "create-task",
    {
      description: "Create a new task in a project.",
      inputSchema: z.object({
        projectId: z.string().describe("The project ID"),
        title: z.string().describe("Task title"),
        description: z.string().optional().describe("Task description"),
        status: z.string().optional().describe("Task status (default: todo)"),
        priority: z
          .number()
          .optional()
          .describe("Priority level (default: 0)"),
        section: z.string().optional().describe("Task section"),
        due_date: z
          .string()
          .optional()
          .describe("Due date in YYYY-MM-DD format"),
      }),
    },
    async (
      params: {
        projectId: string;
        title: string;
        description?: string;
        status?: string;
        priority?: number;
        section?: string;
        due_date?: string;
      },
      extra: unknown,
    ) => {
      const userId = getUserId(extra as Record<string, unknown>);
      if (!userId) return errorResponse("Authentication required");

      const status = params.status ?? "todo";
      const isCompleted = status === "done";

      // Calculate sort_order: max existing + 65536
      const { data: maxRow } = await supabase
        .from("tasks")
        .select("sort_order")
        .eq("project_id", params.projectId)
        .eq("user_id", userId)
        .eq("status", status)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      const sortOrder = (maxRow?.sort_order ?? 0) + 65536;

      const { data, error } = await supabase
        .from("tasks")
        .insert({
          user_id: userId,
          project_id: params.projectId,
          title: params.title,
          description: params.description ?? null,
          status,
          priority: params.priority ?? 0,
          section: params.section ?? null,
          due_date: params.due_date ?? null,
          sort_order: sortOrder,
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (error) {
        log.error("MCP tool query failed", error);
        return errorResponse(error.message);
      }
      return jsonResponse(data);
    },
  );

  // -------------------------------------------------------------------------
  // 5. update-task
  // -------------------------------------------------------------------------
  register(
    "update-task",
    {
      description: "Update an existing task.",
      inputSchema: z.object({
        taskId: z.string().describe("The task ID"),
        title: z.string().optional().describe("New title"),
        description: z.string().optional().describe("New description"),
        status: z.string().optional().describe("New status"),
        priority: z.number().optional().describe("New priority"),
        section: z.string().optional().describe("New section"),
        due_date: z
          .string()
          .optional()
          .describe("New due date in YYYY-MM-DD format"),
        project_id: z
          .string()
          .optional()
          .describe("Move to a different project"),
      }),
    },
    async (
      params: {
        taskId: string;
        title?: string;
        description?: string;
        status?: string;
        priority?: number;
        section?: string;
        due_date?: string;
        project_id?: string;
      },
      extra: unknown,
    ) => {
      const userId = getUserId(extra as Record<string, unknown>);
      if (!userId) return errorResponse("Authentication required");

      const updates: Record<string, unknown> = {};

      if (params.title !== undefined) updates.title = params.title;
      if (params.description !== undefined)
        updates.description = params.description;
      if (params.priority !== undefined) updates.priority = params.priority;
      if (params.section !== undefined) updates.section = params.section;
      if (params.due_date !== undefined) updates.due_date = params.due_date;
      if (params.project_id !== undefined)
        updates.project_id = params.project_id;

      if (params.status !== undefined) {
        updates.status = params.status;
        const isCompleted = params.status === "done";
        updates.is_completed = isCompleted;
        updates.completed_at = isCompleted ? new Date().toISOString() : null;
      }

      if (Object.keys(updates).length === 0) {
        return errorResponse("No fields to update");
      }

      const { data, error } = await supabase
        .from("tasks")
        .update(updates)
        .eq("id", params.taskId)
        .eq("user_id", userId)
        .select()
        .single();

      if (error) {
        log.error("MCP tool query failed", error);
        return errorResponse(error.message);
      }
      return jsonResponse(data);
    },
  );

  // -------------------------------------------------------------------------
  // 6. delete-task
  // -------------------------------------------------------------------------
  register(
    "delete-task",
    {
      description: "Delete a task by ID.",
      inputSchema: z.object({
        taskId: z.string().describe("The task ID"),
      }),
    },
    async (params: { taskId: string }, extra: unknown) => {
      const userId = getUserId(extra as Record<string, unknown>);
      if (!userId) return errorResponse("Authentication required");

      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", params.taskId)
        .eq("user_id", userId);

      if (error) {
        log.error("MCP tool query failed", error);
        return errorResponse(error.message);
      }
      return jsonResponse({ success: true });
    },
  );
}
