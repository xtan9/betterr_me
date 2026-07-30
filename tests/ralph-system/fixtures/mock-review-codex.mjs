import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [fixtureRoot, ...codexArgs] = process.argv.slice(2);
if (!fixtureRoot) {
  throw new Error("usage: mock-review-codex.mjs <fixture-root> <codex-args...>");
}

const optionValue = (name) => {
  const index = codexArgs.indexOf(name);
  return index >= 0 ? codexArgs[index + 1] : null;
};
const configurations = codexArgs.flatMap((entry, index) =>
  entry === "-c" ? [codexArgs[index + 1]] : [],
);
if (
  codexArgs[0] !== "exec" ||
  !codexArgs.includes("--ephemeral") ||
  !codexArgs.includes("--json") ||
  !codexArgs.includes("--ignore-user-config") ||
  optionValue("--model") !== "gpt-5.6-sol" ||
  !configurations.includes('model_reasoning_effort="xhigh"') ||
  !configurations.includes('approval_policy="never"') ||
  !configurations.some((entry) => entry.includes("network.enabled=false")) ||
  !configurations.some((entry) => entry.includes('":root"="deny"'))
) {
  throw new Error("mock Codex rejected an unsafe review launch");
}
const resultPath = optionValue("--output-last-message");
const schemaPath = optionValue("--output-schema");
if (!resultPath || !schemaPath || !fs.existsSync(schemaPath)) {
  throw new Error("mock Codex did not receive trusted output bindings");
}

let prompt = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) prompt += chunk;
if (!prompt.trim()) throw new Error("mock Codex received an empty review prompt");
process.stdout.write(`${JSON.stringify({ type: "thread.started", thread_id: randomUUID() })}\n`);
process.stdout.write(`${JSON.stringify({ type: "turn.started" })}\n`);
if (fs.existsSync(path.join(fixtureRoot, "hold-review"))) {
  fs.writeFileSync(path.join(fixtureRoot, "review-started"), "started\n", { flag: "wx" });
  while (!fs.existsSync(path.join(fixtureRoot, "release-review"))) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
const axis = path.basename(resultPath).replace(/\.report\.json$/, "");
const coverageMatch = prompt.match(
  /Coverage inventory block:\n(RALPH_COVERAGE_INVENTORY_[a-f0-9]+)\n([\s\S]*?)\n\1/,
);
const coverageInventory = coverageMatch ? JSON.parse(coverageMatch[2]) : [];
const report = {
  reviewKind: "exhaustive",
  complete: true,
  status: "pass",
  axes: [
    {
      id: axis,
      complete: true,
      evidenceReviewed: [`${axis} inspected the exact candidate`],
      findingIds: [],
    },
  ],
  coverage: [
    ...coverageInventory.map(({ id, subject }) => ({
      id,
      subject,
      implementationEvidence: [`${axis} inspected ${subject}`],
      testEvidence: [`${axis} correlated the bound gate receipts`],
      verdict: "pass",
    })),
    ...(coverageInventory.length > 0
      ? [
          {
            id: "NO-SURFACE",
            subject: `${axis} found no additional observable surface`,
            implementationEvidence: [`${axis} inventoried the complete diff`],
            testEvidence: [`${axis} checked every planned gate`],
            verdict: "pass",
          },
        ]
      : []),
  ],
  findings: [],
  blockingFindings: [],
  repairable: false,
  blockerKind: "none",
  evidenceReviewed: [`${axis} prompt evidence`],
  summary: `${axis} passed in a fresh mock Codex process.`,
};
fs.mkdirSync(path.dirname(resultPath), { recursive: true });
fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`, {
  flag: "wx",
});
const launchRoot = path.join(fixtureRoot, "review-launches");
fs.mkdirSync(launchRoot, { recursive: true });
fs.writeFileSync(
  path.join(launchRoot, `${process.pid}-${randomUUID()}.json`),
  `${JSON.stringify(
    {
      processId: process.pid,
      parentProcessId: process.ppid,
      uid: process.getuid?.(),
      gid: process.getgid?.(),
      axis,
      resultPath,
      promptSha256: createHash("sha256").update(prompt).digest("hex"),
      arguments: codexArgs,
    },
    null,
    2,
  )}\n`,
  { flag: "wx" },
);
process.stdout.write(`${JSON.stringify({ type: "turn.completed" })}\n`);
