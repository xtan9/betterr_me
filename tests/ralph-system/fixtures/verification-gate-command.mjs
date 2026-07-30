import fs from "node:fs";
import path from "node:path";

const [fixtureRoot, gateId, behavior = "pass", ...observedArguments] =
  process.argv.slice(2);
if (!fixtureRoot || !gateId) {
  throw new Error(
    "usage: verification-gate-command.mjs FIXTURE_ROOT GATE_ID [BEHAVIOR] [ARG...]",
  );
}

const invocation = {
  gateId,
  behavior,
  cwd: process.cwd(),
  observedArguments,
  secretVisible: Boolean(process.env.GH_TOKEN || process.env.GITHUB_TOKEN),
};
if (fixtureRoot !== ":stdout-only") {
  const invocationRoot = path.join(fixtureRoot, "gate-invocations");
  fs.mkdirSync(invocationRoot, { recursive: true });
  const invocationPath = path.join(invocationRoot, `${gateId}.json`);
  fs.writeFileSync(invocationPath, `${JSON.stringify(invocation, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}
process.stdout.write(`stdout:${gateId}:${observedArguments.join("|")}\n`);
process.stderr.write(`stderr:${gateId}\n`);

if (behavior === "fail") process.exitCode = 23;
