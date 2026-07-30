import fs from "node:fs";
import path from "node:path";
import { git } from "./git-world";
import { assertPathWithin } from "./test-paths";

type WorkerChange = {
  path: string;
  content: string;
};

export function createScriptedWorker(
  changes: WorkerChange[],
  events: Array<{ kind: string; [key: string]: unknown }>,
) {
  let activeWorkers = 0;
  let maximumActiveWorkers = 0;
  const sessions: Array<{
    sessionId: string;
    issueNumber: number;
    worktreePath: string;
    baseSha: string;
  }> = [];

  return {
    async implement(input: {
      sessionId: string;
      issue: { number: number };
      worktreePath: string;
    }) {
      activeWorkers += 1;
      maximumActiveWorkers = Math.max(maximumActiveWorkers, activeWorkers);
      sessions.push({
        sessionId: input.sessionId,
        issueNumber: input.issue.number,
        worktreePath: input.worktreePath,
        baseSha: git(input.worktreePath, ["rev-parse", "HEAD"]).stdout.trim(),
      });
      events.push({
        kind: "worker-started",
        issueNumber: input.issue.number,
        sessionId: input.sessionId,
      });

      try {
        for (const change of changes) {
          const destination = assertPathWithin(
            input.worktreePath,
            path.join(input.worktreePath, change.path),
            "worker change",
          );
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, change.content);
        }
        events.push({
          kind: "worker-completed",
          issueNumber: input.issue.number,
          sessionId: input.sessionId,
        });
        return { kind: "completed" as const, sessionId: input.sessionId };
      } finally {
        activeWorkers -= 1;
      }
    },
    inspect() {
      return structuredClone({
        activeWorkers,
        maximumActiveWorkers,
        sessions,
      });
    },
  };
}
