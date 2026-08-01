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

function inventory() {
  return JSON.parse(
    readFileSync("docs/architecture/delivery-write-inventory.json", "utf8"),
  );
}

describe("delivery mutation inventory guard", () => {
  it("passes the permanent empty direct-write inventory", () => {
    expect(() => checkDeliveryWriteInventory()).not.toThrow();
    expect(scanDeliverySources()).toEqual([]);
    expect(inventory().entries).toEqual([]);
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

  it("rejects a direct adapter mutation even when the inventory has no exceptions", () => {
    const findings = scanDeliverySource(
      "app/api/tasks/query-fixture/route.ts",
      `
        import { TasksDB as Persistence } from "@/lib/db";
        const db = new Persistence(supabase);
        export async function DELETE() {
          return db.deleteTask("task-id", "user-id");
        }
      `,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        id: "app/api/tasks/query-fixture/route.ts#TasksDB.deleteTask",
        persistence: "database-adapter",
      }),
    ]);
    expect(() => validateDeliveryWriteInventory({
      inventory: inventory(),
      findings,
    })).toThrow("qualifying delivery mutation bypass(es) remain");
  });

  it("rejects raw table and RPC mutations from delivery sources", () => {
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

  it("rejects a reintroduced temporary entry, baseline, or migration allowlist", () => {
    const changed = inventory();
    changed.entries = [{ id: "temporary" }];
    expect(() => validateDeliveryWriteInventory({
      inventory: changed,
      findings: [],
    })).toThrow("temporary direct-write exceptions must be empty");

    const allowlisted = inventory();
    allowlisted.allowlist = [];
    expect(() => validateDeliveryWriteInventory({
      inventory: allowlisted,
      findings: [],
    })).toThrow("migration allowlists are not permitted");

    const legacyBaseline = inventory();
    legacyBaseline.baseline = {};
    expect(() => validateDeliveryWriteInventory({
      inventory: legacyBaseline,
      findings: [],
    })).toThrow("baseline is not permitted");
  });

  it("requires completed verification links for retired inventory entries", () => {
    const changed = inventory();
    const retired = changed.priorArt.find(
      (entry: { retiredFromInventory?: boolean }) => entry.retiredFromInventory,
    );
    delete retired.verification;

    expect(() => validateDeliveryWriteInventory({
      inventory: changed,
      findings: [],
    })).toThrow("needs verification evidence");
  });

  it("runs the permanent guard as a selected, fail-closed CI prerequisite", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain("run: pnpm check:write-inventory");
    expect(workflow).toContain("Check permanent delivery mutation boundaries");
    expect(workflow).toContain(
      "needs: [deployment-policy, changes, lint-and-test, check-migrations, write-inventory]",
    );
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
