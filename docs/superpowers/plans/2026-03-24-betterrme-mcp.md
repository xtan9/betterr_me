# betterrme-mcp Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone npm-publishable MCP server that gives Claude Code full CRUD access to BetterR.Me kanban tasks/projects, authenticated as a real Supabase user.

**Architecture:** Single-file MCP server using `@modelcontextprotocol/sdk` with stdio transport. Connects directly to Supabase via `@supabase/supabase-js`, authenticates with email/password on startup, and exposes 6 tools for project/task operations. Published to npm as `betterrme-mcp` with a `bin` entry so `npx betterrme-mcp` just works.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `@supabase/supabase-js`, `zod`, `tsup` (bundler)

---

## File Structure

```
~/code/betterrme-mcp/
├── src/
│   └── index.ts          ← server, auth, all 6 tools (~250 lines)
├── package.json          ← bin entry, npm publish config
├── tsconfig.json         ← strict TS config
├── tsup.config.ts        ← bundle to single dist/index.js
├── .gitignore
├── .npmignore
├── LICENSE
└── README.md
```

Single source file — 6 tools is not enough to warrant splitting.

---

## Chunk 1: Project Scaffold + Auth

### Task 1: Initialize the project

**Files:**
- Create: `~/code/betterrme-mcp/package.json`
- Create: `~/code/betterrme-mcp/tsconfig.json`
- Create: `~/code/betterrme-mcp/tsup.config.ts`
- Create: `~/code/betterrme-mcp/.gitignore`
- Create: `~/code/betterrme-mcp/.npmignore`

- [ ] **Step 1: Create the project directory and initialize**

```bash
mkdir -p ~/code/betterrme-mcp/src
cd ~/code/betterrme-mcp
git init
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "betterrme-mcp",
  "version": "0.1.0",
  "description": "MCP server for BetterR.Me task/project management — gives Claude Code access to your kanban board",
  "type": "module",
  "bin": {
    "betterrme-mcp": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "prepublishOnly": "npm run build"
  },
  "keywords": ["mcp", "claude", "betterrme", "kanban", "tasks"],
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "@supabase/supabase-js": "^2.49.4",
    "zod": "^3.25.28"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create tsup.config.ts**

```ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.env
```

- [ ] **Step 6: Create .npmignore**

```
src/
tsconfig.json
tsup.config.ts
.gitignore
.env
```

- [ ] **Step 7: Install dependencies**

```bash
cd ~/code/betterrme-mcp
npm install
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold betterrme-mcp project"
```

---

### Task 2: Server entry + Supabase auth

**Files:**
- Create: `~/code/betterrme-mcp/src/index.ts`

- [ ] **Step 1: Write the server skeleton with auth**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

function getEnvOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

async function authenticate(): Promise<SupabaseClient> {
  const supabaseUrl = getEnvOrThrow("SUPABASE_URL");
  const supabaseAnonKey = getEnvOrThrow("SUPABASE_ANON_KEY");
  const email = getEnvOrThrow("BETTERRME_EMAIL");
  const password = getEnvOrThrow("BETTERRME_PASSWORD");

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error(`Auth failed: ${error.message}`);
    process.exit(1);
  }

  console.error("Authenticated with BetterR.Me");
  return supabase;
}

async function main() {
  const supabase = await authenticate();

  const server = new McpServer({
    name: "betterrme",
    version: "0.1.0",
  });

  // Tools will be registered here (Tasks 3-5)

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("betterrme-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Build and verify it compiles**

```bash
cd ~/code/betterrme-mcp
npm run build
```

Expected: `dist/index.js` created with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: server entry with Supabase user auth"
```

---

## Chunk 2: Project Tools

### Task 3: list-projects tool

**Files:**
- Modify: `~/code/betterrme-mcp/src/index.ts`

- [ ] **Step 1: Add the list-projects tool** (after the `// Tools will be registered here` comment)

```ts
import { z } from "zod";

// --- Inside main(), after server creation ---

server.registerTool(
  "list-projects",
  {
    title: "List Projects",
    description:
      "List all BetterR.Me projects. Returns project name, section (personal/work), color, status, and ID. Use this to find the project ID before fetching tasks.",
    inputSchema: z.object({
      section: z
        .enum(["personal", "work"])
        .optional()
        .describe("Filter by section"),
      status: z
        .enum(["active", "archived"])
        .optional()
        .describe("Filter by status (default: active)"),
    }),
  },
  async ({ section, status }) => {
    let query = supabase
      .from("projects")
      .select("id, name, section, color, status, sort_order, created_at")
      .order("sort_order", { ascending: true });

    if (section) query = query.eq("section", section);
    query = query.eq("status", status ?? "active");

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add list-projects tool"
```

---

## Chunk 3: Task Tools (Read)

### Task 4: get-project-tasks tool

**Files:**
- Modify: `~/code/betterrme-mcp/src/index.ts`

- [ ] **Step 1: Add get-project-tasks tool**

```ts
server.registerTool(
  "get-project-tasks",
  {
    title: "Get Project Tasks",
    description:
      "Get tasks for a project, optionally filtered by status and/or priority. Always tell the user which project you are looking at. Returns task ID, title, description, status, priority (0=none,1=low,2=medium,3=high), due_date, section, and sort_order.",
    inputSchema: z.object({
      projectId: z.string().describe("Project UUID"),
      status: z
        .enum(["backlog", "todo", "in_progress", "done"])
        .optional()
        .describe("Filter by kanban status"),
      priority: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe("Filter by priority: 0=none, 1=low, 2=medium, 3=high"),
    }),
  },
  async ({ projectId, status, priority }) => {
    let query = supabase
      .from("tasks")
      .select(
        "id, title, description, status, priority, due_date, due_time, section, sort_order, is_completed, category_id, project_id, created_at"
      )
      .eq("project_id", projectId)
      .order("priority", { ascending: false })
      .order("sort_order", { ascending: true });

    if (status) query = query.eq("status", status);
    if (priority !== undefined) query = query.eq("priority", priority);

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add get-project-tasks tool"
```

---

### Task 5: get-task tool

**Files:**
- Modify: `~/code/betterrme-mcp/src/index.ts`

- [ ] **Step 1: Add get-task tool**

```ts
server.registerTool(
  "get-task",
  {
    title: "Get Task Details",
    description:
      "Get full details of a single task by ID. Returns all fields including description, priority, due date/time, status, section, and project.",
    inputSchema: z.object({
      taskId: z.string().describe("Task UUID"),
    }),
  },
  async ({ taskId }) => {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .single();

    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add get-task tool"
```

---

## Chunk 4: Task Tools (Write)

### Task 6: create-task tool

**Files:**
- Modify: `~/code/betterrme-mcp/src/index.ts`

- [ ] **Step 1: Add create-task tool**

```ts
server.registerTool(
  "create-task",
  {
    title: "Create Task",
    description:
      "Create a new task in a project. Title is required. Status defaults to 'todo', section to 'personal', priority to 0 (none).",
    inputSchema: z.object({
      projectId: z.string().describe("Project UUID to add the task to"),
      title: z.string().min(1).max(100).describe("Task title"),
      description: z.string().max(500).optional().describe("Task description"),
      status: z
        .enum(["backlog", "todo", "in_progress", "done"])
        .optional()
        .describe("Initial status (default: todo)"),
      priority: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe("Priority: 0=none, 1=low, 2=medium, 3=high"),
      section: z
        .enum(["personal", "work"])
        .optional()
        .describe("Section (default: personal)"),
      due_date: z.string().optional().describe("Due date in YYYY-MM-DD format"),
    }),
  },
  async ({ projectId, title, description, status, priority, section, due_date }) => {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { content: [{ type: "text", text: "Error: not authenticated" }], isError: true };
    }

    // Calculate sort_order (place at bottom)
    const { data: maxTask } = await supabase
      .from("tasks")
      .select("sort_order")
      .eq("project_id", projectId)
      .eq("status", status ?? "todo")
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    const sort_order = (maxTask?.sort_order ?? 0) + 65536;

    const taskStatus = status ?? "todo";
    const isDone = taskStatus === "done";

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id: user.id,
        title,
        description: description ?? null,
        project_id: projectId,
        status: taskStatus,
        is_completed: isDone,
        completed_at: isDone ? new Date().toISOString() : null,
        priority: priority ?? 0,
        section: section ?? "personal",
        due_date: due_date ?? null,
        sort_order,
      })
      .select()
      .single();

    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add create-task tool"
```

---

### Task 7: update-task tool

**Files:**
- Modify: `~/code/betterrme-mcp/src/index.ts`

- [ ] **Step 1: Add update-task tool**

```ts
server.registerTool(
  "update-task",
  {
    title: "Update Task",
    description:
      "Update a task's fields. Use this to change status (e.g., move to in_progress when starting work, done when finished), title, description, priority, due date, or section. At least one field must be provided.",
    inputSchema: z.object({
      taskId: z.string().describe("Task UUID"),
      title: z.string().min(1).max(100).optional().describe("New title"),
      description: z.string().max(500).optional().nullable().describe("New description"),
      status: z
        .enum(["backlog", "todo", "in_progress", "done"])
        .optional()
        .describe("New kanban status"),
      priority: z
        .number()
        .min(0)
        .max(3)
        .optional()
        .describe("New priority: 0=none, 1=low, 2=medium, 3=high"),
      section: z.enum(["personal", "work"]).optional().describe("New section"),
      due_date: z.string().optional().nullable().describe("New due date (YYYY-MM-DD) or null to clear"),
      project_id: z.string().optional().nullable().describe("Move to different project or null to unassign"),
    }),
  },
  async ({ taskId, title, description, status, priority, section, due_date, project_id }) => {
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (section !== undefined) updates.section = section;
    if (due_date !== undefined) updates.due_date = due_date;
    if (project_id !== undefined) updates.project_id = project_id;

    // Sync status ↔ is_completed (mirrors lib/tasks/sync.ts logic)
    if (status !== undefined) {
      updates.status = status;
      updates.is_completed = status === "done";
      updates.completed_at = status === "done" ? new Date().toISOString() : null;
    }

    if (Object.keys(updates).length === 0) {
      return { content: [{ type: "text", text: "Error: no fields to update" }], isError: true };
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", taskId)
      .select()
      .single();

    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  }
);
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add update-task tool"
```

---

### Task 8: delete-task tool

**Files:**
- Modify: `~/code/betterrme-mcp/src/index.ts`

- [ ] **Step 1: Add delete-task tool**

```ts
server.registerTool(
  "delete-task",
  {
    title: "Delete Task",
    description: "Permanently delete a task by ID. This cannot be undone.",
    inputSchema: z.object({
      taskId: z.string().describe("Task UUID to delete"),
    }),
  },
  async ({ taskId }) => {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId);

    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }

    return {
      content: [{ type: "text", text: `Task ${taskId} deleted.` }],
    };
  }
);
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add delete-task tool"
```

---

## Chunk 5: Publish + Configure

### Task 9: README and LICENSE

**Files:**
- Create: `~/code/betterrme-mcp/README.md`
- Create: `~/code/betterrme-mcp/LICENSE`

- [ ] **Step 1: Write README.md**

The README should cover:
- What it is (MCP server for BetterR.Me)
- Installation: `npx betterrme-mcp`
- Configuration in `~/.claude/settings.json` with env vars
- Available tools table
- Required env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BETTERRME_EMAIL`, `BETTERRME_PASSWORD`

- [ ] **Step 2: Write LICENSE (MIT)**

Standard MIT license file.

- [ ] **Step 3: Commit**

```bash
git add README.md LICENSE
git commit -m "docs: add README and LICENSE"
```

---

### Task 10: Build, test locally, and publish

- [ ] **Step 1: Final build**

```bash
cd ~/code/betterrme-mcp
npm run build
```

- [ ] **Step 2: Test locally with Claude Code**

Add to `~/.claude/settings.json` temporarily:

```json
{
  "mcpServers": {
    "betterrme": {
      "command": "node",
      "args": ["/home/xingdi/code/betterrme-mcp/dist/index.js"],
      "env": {
        "SUPABASE_URL": "https://ugkhvvmjdrshuopgaaje.supabase.co",
        "SUPABASE_ANON_KEY": "...",
        "BETTERRME_EMAIL": "...",
        "BETTERRME_PASSWORD": "..."
      }
    }
  }
}
```

Restart Claude Code and verify tools appear with `/mcp`.

- [ ] **Step 3: Publish to npm**

```bash
npm login
npm publish
```

- [ ] **Step 4: Update Claude Code config to use npx**

Update `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "betterrme": {
      "command": "npx",
      "args": ["-y", "betterrme-mcp"],
      "env": {
        "SUPABASE_URL": "https://ugkhvvmjdrshuopgaaje.supabase.co",
        "SUPABASE_ANON_KEY": "...",
        "BETTERRME_EMAIL": "...",
        "BETTERRME_PASSWORD": "..."
      }
    }
  }
}
```

- [ ] **Step 5: Final commit and push**

```bash
git add -A
git commit -m "chore: ready for v0.1.0"
git remote add origin <github-repo-url>
git push -u origin main
```
