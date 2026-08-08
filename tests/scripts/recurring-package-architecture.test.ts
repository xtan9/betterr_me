import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd());
const supportedProductionImport =
  /@\/lib\/recurring-tasks(?:"|\/scheduling"|\/compatibility")/;
const privateRecurringImport = /@\/lib\/recurring-tasks\/(?!scheduling|compatibility)[^"']+/;
const privateCompositionFiles = new Set([
  "app/api/cron/prewarm-recurring-tasks/route.ts",
  "lib/recurring-tasks/compatibility.ts",
  "lib/recurring-tasks/index.ts",
  "lib/recurring-tasks/scheduling.ts",
  "lib/tasks/commands.ts",
]);

describe("Recurring Task package surface", () => {
  it("has only the authenticated factory as a runtime root export", async () => {
    const packageSurface = await import("@/lib/recurring-tasks");

    expect(Object.keys(packageSurface)).toEqual([
      "createAuthenticatedRecurringTaskCapabilities",
    ]);
  });

  it("exports only the authenticated factory and public contract types from the root", () => {
    const index = readFileSync(
      resolve(root, "lib/recurring-tasks/index.ts"),
      "utf8",
    );

    expect(index).toContain("createAuthenticatedRecurringTaskCapabilities");
    expect(index).not.toContain("export *");
    expect(index).not.toMatch(/createRecurringTaskCapabilities\s*[,=]/);
    expect(index).not.toMatch(/createRecurringTaskMaintenanceCapability/);
    expect(index).not.toMatch(/SupabaseRecurringTaskLifecycle|RecurringTaskLifecycle/);
    expect(index).not.toMatch(/OccurrenceAdapter|SeriesStateAdapter/);
    expect(index).not.toMatch(/InMemoryRecurringTaskLifecyclePersistence|RecurringTaskLifecycleState/);
    expect(index).not.toMatch(/ensureRecurringTaskCoverage|emitRecurringLifecycleSignal/);
  });

  it("keeps obsolete adapters and competing package entry points private or removed", () => {
    for (const relative of [
      "lib/recurring-tasks/creation.ts",
      "lib/recurring-tasks/occurrence-adapter.ts",
      "lib/recurring-tasks/supabase-occurrence-adapter.ts",
      "lib/recurring-tasks/series-state-adapter.ts",
      "lib/recurring-tasks/supabase-series-state-adapter.ts",
    ]) {
      expect(existsSync(resolve(root, relative)), relative).toBe(false);
    }

    expect(existsSync(resolve(root, "lib/recurring-tasks/internal"))).toBe(true);
  });

  it("allows production callers to use only the root, scheduling, or compatibility entry points", () => {
    const violations: string[] = [];
    for (const directory of ["app", "components", "lib"]) {
      for (const file of walk(resolve(root, directory))) {
        const relative = file.slice(root.length + 1).replaceAll("\\", "/");
        if (relative.startsWith("lib/recurring-tasks/internal/")) continue;
        const source = readFileSync(file, "utf8");
        const imports = source.matchAll(
          /(?:from\s+|import\s*\(\s*)(["'])(@\/lib\/recurring-tasks\/[^"']+|@\/lib\/recurring-tasks)(?:\1)/g,
        );
        for (const match of imports) {
          const imported = match[2];
          if (!supportedProductionImport.test(`${imported}"`)) {
            if (
              privateRecurringImport.test(`${imported}"`) &&
              !privateCompositionFiles.has(relative)
            ) {
              violations.push(`${relative}: ${imported}`);
            }
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not let delivery select a recurring lifecycle through Task Writes", () => {
    const violations: string[] = [];
    for (const directory of ["app", "components", "lib"]) {
      for (const file of walk(resolve(root, directory))) {
        const relative = file.slice(root.length + 1).replaceAll("\\", "/");
        if (relative.startsWith("lib/recurring-tasks/internal/")) continue;
        const normalized = readFileSync(file, "utf8").replace(/\s+/g, " ");
        if (/createTaskWrites\([^)]{0,300}\blifecycle\s*:/.test(normalized)) {
          violations.push(relative);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("retires the recurring compatibility seam from Task Writes", () => {
    const writes = readFileSync(resolve(root, "lib/tasks/writes.ts"), "utf8");

    expect(writes).not.toContain("RecurringTaskLifecyclePort");
    expect(writes).not.toContain("TaskDeletionRequest");
    expect(writes).not.toContain("deleteSeries");
  });
});

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
