import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8").replaceAll("\r\n", "\n");
}

function section(contents: string, start: string, end: string): string {
  const startIndex = contents.indexOf(start);
  const endIndex = contents.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not find architecture section ${start}`);
  }
  return contents.slice(startIndex, endIndex);
}

describe("Project mutation architecture boundaries", () => {
  it("routes HTTP creation through ProjectWrites without a persistence bypass", () => {
    const route = source("app/api/projects/route.ts");
    const post = section(route, "export async function POST", "\n}");

    expect(post).toContain("createProjectWrites(supabase).create");
    expect(post).not.toMatch(/new ProjectsDB|\.createProject\(/);
  });

  it("routes AI creation through the same ProjectWrites boundary", () => {
    const tools = source("lib/ai/tools/projects.ts");
    const create = section(tools, 'name: "createProject"', 'name: "updateProject"');

    expect(create).toContain("createProjectWrites(ctx.supabase).create");
    expect(create).not.toMatch(/new ProjectsDB|\.createProject\(/);
  });

  it("routes HTTP project changes through ProjectWrites without a persistence bypass", () => {
    const route = source("app/api/projects/[id]/route.ts");
    const patch = section(route, "export async function PATCH", "\n}");

    expect(patch).toContain("createProjectWrites(supabase).update");
    expect(patch).not.toMatch(/new ProjectsDB|\.updateProject\(/);
  });

  it("routes AI project changes through the same ProjectWrites boundary", () => {
    const tools = source("lib/ai/tools/projects.ts");
    const update = section(tools, 'name: "updateProject"', 'name: "deleteProject"');

    expect(update).toContain("createProjectWrites(ctx.supabase).update");
    expect(update).not.toMatch(/new ProjectsDB|\.updateProject\(/);
  });

  it("removes project creation from the generic database write inventory", () => {
    const projectsDb = source("lib/db/projects.ts");

    expect(projectsDb).not.toMatch(/async createProject\s*\(/);
    expect(projectsDb).not.toMatch(/ProjectInsert/);
  });

  it("removes project update and archive writes from the generic database inventory", () => {
    const projectsDb = source("lib/db/projects.ts");

    expect(projectsDb).not.toMatch(/async updateProject\s*\(/);
    expect(projectsDb).not.toMatch(/async archiveProject\s*\(/);
    expect(source("lib/db/types.ts")).not.toContain("ProjectUpdate");
  });

  it("keeps the creation request storage-independent", () => {
    const writes = source("lib/projects/writes.ts");
    const requestStart = writes.indexOf("export interface ProjectCreationRequest");
    const requestEnd = writes.indexOf("}\n", requestStart) + 2;
    const request = writes.slice(requestStart, requestEnd);

    expect(request).not.toContain("Supabase");
    expect(request).not.toContain("ProjectInsert");
    expect(writes).not.toContain("@/lib/db");
    expect(request).toContain("userId");
    expect(request).not.toContain("user_id");
  });

  it("keeps the update request storage-independent", () => {
    const writes = source("lib/projects/writes.ts");
    const requestStart = writes.indexOf("export interface ProjectUpdateRequest");
    const requestEnd = writes.indexOf("}\n", requestStart) + 2;
    const request = writes.slice(requestStart, requestEnd);

    expect(request).not.toContain("Supabase");
    expect(request).not.toContain("user_id");
    expect(request).not.toContain("sort_order");
    expect(request).toContain("userId");
    expect(request).toContain("projectId");
    expect(request).toContain("sortOrder");
  });
});
