import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGitWorld } from "./support/git-world";
import { createSystemScenario } from "./support/test-cli";

const worlds: Array<ReturnType<typeof createGitWorld>> = [];
afterEach(() => {
  for (const world of worlds.splice(0)) world.cleanup();
});

describe("Ralph v2 deterministic fault-injection soak", () => {
  it("recovers every sampled lifecycle crash without duplicates or a leaked worker", () => {
    const checkpoints = [
      "claim-applied",
      "worktree-created",
      "worker-completed",
      "candidate-verified",
      "candidate-committed",
      "branch-pushed",
      "draft-pr-created",
      "checkout-cleaned",
    ];
    for (const [index, crashPoint] of checkpoints.entries()) {
      const world = createGitWorld();
      worlds.push(world);
      const number = 1200 + index;
      const scenario = createSystemScenario(world, {
        issues: [{ number, title: `Soak ${crashPoint}`, body: `Create src/soak-${index}.txt.` }],
        workerChanges: [{ path: `src/soak-${index}.txt`, content: `${crashPoint}\n` }],
        expectedChanges: [{
          path: `src/soak-${index}.txt`, content: `${crashPoint}\n`, mode: "100644", status: "A",
        }],
        crashPoint,
      });
      const args = ["run", "--mode", "PrOnly", "--max-issues", "1", "--json"];
      expect(scenario.run(args).exitCode, crashPoint).not.toBe(0);
      const recovered = scenario.run(args);
      expect(recovered.exitCode, `${crashPoint}: ${recovered.stderr.join("\n")}`).toBe(0);
      expect(scenario.run(args).exitCode).toBe(0);
      const state = scenario.inspectExternalState();
      expect(state.maximumActiveWorkers, crashPoint).toBe(1);
      expect(state.claims, crashPoint).toHaveLength(1);
      expect(state.sessions, crashPoint).toHaveLength(1);
      expect(state.pullRequests, crashPoint).toHaveLength(1);
      expect(state.pullRequestRequests, crashPoint).toHaveLength(1);
      expect(fs.existsSync(path.join(world.runtimePath, "worktrees", "current")), crashPoint)
        .toBe(false);
    }
  }, 180_000);
});
