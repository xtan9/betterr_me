import fs from "node:fs";
import path from "node:path";
import { git } from "./git-world";

type WorkerChange = {
  path: string;
  content: string;
};

export function createScriptedWorker(changes: WorkerChange[]) {
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

      try {
        for (const change of changes) {
          const destination = path.resolve(input.worktreePath, change.path);
          const relative = path.relative(path.resolve(input.worktreePath), destination);
          if (
            !relative ||
            relative.startsWith("..") ||
            path.isAbsolute(relative)
          ) {
            throw new Error(`worker change escapes its worktree: ${change.path}`);
          }
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, change.content);
        }
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
