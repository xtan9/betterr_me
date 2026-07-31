import fs from "node:fs";
import { createProductionGitHubAdapter } from "../../../scripts/ralph/v2/production-github-adapter.mjs";

const [queuePath, backendPath, operationId] = process.argv.slice(2);
const read = () => JSON.parse(fs.readFileSync(backendPath, "utf8"));
const write = (state) => fs.writeFileSync(backendPath, JSON.stringify(state));
const adapter = createProductionGitHubAdapter({
  repository: "o/r",
  queuePath,
  actor: "ralph",
  execute(args) {
    const command = args.join(" ");
    if (command.includes("issues/10/comments --paginate")) return JSON.stringify(read().comments);
    if (command.startsWith("issue edit 10 ")) return "";
    if (command.includes("issues/10/comments --method POST")) {
      const state = read();
      const body = args.find((entry) => entry.startsWith("body="))?.slice(5) ?? "";
      const comment = { id: state.comments.length + 1, created_at: new Date().toISOString(), body };
      state.comments.push(comment);
      write(state);
      return JSON.stringify(comment);
    }
    throw new Error(`unexpected contender command ${command}`);
  },
});
process.stdout.write(`${JSON.stringify(await adapter.claimIssue({
  issueNumber: 10,
  operationId,
  claimedAt: new Date().toISOString(),
}))}\n`);
