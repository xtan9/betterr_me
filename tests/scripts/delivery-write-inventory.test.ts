import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  checkDeliveryWriteInventory,
  scanDeliverySource,
  scanDeliverySources,
  validateDeliveryWriteInventory,
} from "@/scripts/check-delivery-write-inventory.mjs";
import {
  classifyChanges,
  classifyComparison,
  formatGitHubOutputs,
} from "../../scripts/ci/classify-changes.mjs";

describe("delivery write inventory guard", () => {
  it("passes the maintained repository baseline", () => {
    expect(() => checkDeliveryWriteInventory()).not.toThrow();
  });

  it("allows documented query-only persistence access", () => {
    const findings = scanDeliverySource(
      "lib/ai/tools/tasks.ts",
      `
        import { TasksDB } from "@/lib/db";
        const db = new TasksDB(supabase);
        export async function GET() {
          return db.getTask("task-id", "user-id");
        }
      `,
    );

    expect(findings).toEqual([]);
  });

  it("allows a domain authority while rejecting raw table mutation syntax", () => {
    expect(scanDeliverySource(
      "app/api/tasks/query-fixture/route.ts",
      `return createTaskWrites(supabase).delete({ userId, taskId });`,
    )).toEqual([]);

    expect(scanDeliverySource(
      "app/api/tasks/query-fixture/route.ts",
      `await supabase.from("tasks").delete().eq("id", taskId);`,
    )).toEqual([
      expect.objectContaining({
        id: "app/api/tasks/query-fixture/route.ts#raw-supabase.delete",
        persistence: "raw-supabase",
      }),
    ]);

    expect(scanDeliverySource(
      "app/api/tasks/query-fixture/route.ts",
      `await supabase.rpc("save_task", { taskId });`,
    )).toEqual([
      expect.objectContaining({
        id: "app/api/tasks/query-fixture/route.ts#raw-supabase.rpc",
        method: "rpc",
        persistence: "raw-supabase",
      }),
    ]);
  });

  it("rejects a new direct database write that is absent from the baseline", () => {
    const findings = scanDeliverySource(
      "app/api/tasks/query-fixture/route.ts",
      `
        import { TasksDB } from "@/lib/db";
        const db = new TasksDB(supabase);
        export async function DELETE() {
          return db.deleteTask("task-id", "user-id");
        }
      `,
    );
    const inventory = JSON.parse(
      readFileSync("docs/architecture/delivery-write-inventory.json", "utf8"),
    );

    expect(() => validateDeliveryWriteInventory({
      inventory,
      findings,
      lockText: readFileSync("docs/architecture/delivery-write-inventory.sha256", "utf8"),
    })).toThrow("qualifying direct write(s) are not recorded");
  });

  it("rejects an inventory edit without its baseline lock update", () => {
    const inventory = JSON.parse(
      readFileSync("docs/architecture/delivery-write-inventory.json", "utf8"),
    );
    const changed = structuredClone(inventory);
    changed.entries[0].evidence = `${changed.entries[0].evidence} (edited)`;

    expect(() => validateDeliveryWriteInventory({
      inventory: changed,
      findings: scanDeliverySources(),
      lockText: readFileSync("docs/architecture/delivery-write-inventory.sha256", "utf8"),
    })).toThrow("baseline lock is stale or missing");
  });

  it("runs the guard as a selected, fail-closed CI prerequisite", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("run: pnpm check:write-inventory");
    expect(workflow).toContain("needs: [deployment-policy, changes, lint-and-test, check-migrations, write-inventory]");
    expect(workflow).toContain('"name":"write inventory","suite":"architecture"');
  });

  it("selects the architecture guard for ordinary changes and skips only validated pushes", () => {
    expect(classifyChanges([
      { status: "M", path: "docs/architecture/delivery-write-inventory.json" },
    ]).suites.architecture).toBe(true);

    const validatedPush = classifyComparison({
      eventName: "push",
      baseSha: "base",
      headSha: "head",
      validatedByPullRequest: true,
    });
    expect(validatedPush.suites.architecture).toBe(false);
    expect(formatGitHubOutputs(validatedPush)).toContain("architecture=false");
  });
});
