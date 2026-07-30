import { afterEach, describe, expect, it } from "vitest";
import { createGitWorld } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";

const worlds: Array<ReturnType<typeof createGitWorld>> = [];

afterEach(() => {
  for (const world of worlds.splice(0)) world.cleanup();
});

describe("Ralph v2 implementation deadline", () => {
  it("terminates a worker that exceeds its durable bound and preserves the issue for humans", async () => {
    const world = createGitWorld();
    worlds.push(world);
    const scenario = createSystemScenario(world, {
      issues: [{ number: 499, title: "Bound implementation", body: "Create src/bounded.txt." }],
      workerChanges: [{ path: "src/bounded.txt", content: "partial\n" }],
      expectedChanges: [{ path: "src/bounded.txt", content: "partial\n", mode: "100644", status: "A" }],
      holdWorker: true,
      implementationTimeoutMilliseconds: 200,
    });
    const active = scenario.start(["run", "--mode", "PrOnly", "--max-issues", "1", "--json"]);
    await scenario.waitForWorkerStart();
    const completion = await Promise.race([
      active.completion,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2_000)),
    ]);
    if (!completion) {
      scenario.releaseWorker();
      await active.completion;
    }

    expect(completion, "implementation exceeded its controller deadline").not.toBeNull();
    expect(completion?.exitCode, completion?.stderr.join("\n")).toBe(0);
    const status = JSON.parse(completion?.stdout.at(-1) ?? "{}");
    expect(status).toMatchObject({
      workerLease: null,
      issues: [{
        number: 499,
        disposition: "safety_blocked",
        blocker: { kind: "implementation_timeout" },
        artifactPath: expect.any(String),
      }],
    });
    expect(scenario.inspectExternalState().activeWorkers).toBe(0);
  });
});
