import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createVerificationSessionProtocol } from "../../scripts/ralph/v2/verification-session-protocol.mjs";

const temporaryRoots: string[] = [];

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ralph-v2-protocol-"));
  temporaryRoots.push(root);
  return root;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function digest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

function requestInput() {
  const verificationPlan = {
    schemaVersion: 1,
    tests: [{ id: "full-suite", command: "trusted command" }],
    review: { kind: "exhaustive", axes: ["standards", "security"] },
  };
  return {
    sessionId: "verify-482-attempt-1",
    baseSha: "1".repeat(40),
    candidateTreeSha: "2".repeat(40),
    changedPaths: ["scripts/ralph/v2/runtime.mjs"],
    requirements: {
      schemaVersion: 2,
      issueNumber: 482,
      acceptanceCriteria: ["Ralph resumes safely after a crash."],
    },
    verificationPlan,
    verificationPlanSha256: digest(verificationPlan),
    deadline: 1_800_000_000_000,
  };
}

function verifierReceipt() {
  return {
    kind: "passed",
    sessionId: "verify-482-attempt-1",
    candidateTreeSha: "2".repeat(40),
    evidence: { tests: ["full-suite"], review: "pass" },
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Ralph v2 verification session protocol", () => {
  it("immutably publishes and reads a request and request-bound result", () => {
    const sessionRoot = path.join(temporaryRoot(), "controller-session");
    fs.mkdirSync(sessionRoot, { mode: 0o700 });
    const protocol = createVerificationSessionProtocol({ sessionRoot });

    const request = protocol.publishRequest(requestInput());
    expect(request).toMatchObject({
      schemaVersion: 1,
      kind: "verification-request",
      requestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      ...requestInput(),
    });
    expect(protocol.publishRequest(requestInput())).toEqual(request);
    expect(protocol.readRequest()).toEqual(request);

    const requestOnDisk = JSON.parse(
      fs.readFileSync(path.join(sessionRoot, "request.json"), "utf8"),
    );
    expect(Object.keys(requestOnDisk).sort()).toEqual(
      [
        "baseSha",
        "candidateTreeSha",
        "changedPaths",
        "deadline",
        "kind",
        "requestSha256",
        "requirements",
        "schemaVersion",
        "sessionId",
        "verificationPlan",
        "verificationPlanSha256",
      ].sort(),
    );
    expect(JSON.stringify(requestOnDisk)).not.toContain(sessionRoot);

    const result = protocol.publishResult({
      requestSha256: request.requestSha256,
      verifierReceipt: verifierReceipt(),
    });
    expect(result).toEqual({
      schemaVersion: 1,
      kind: "verification-result",
      requestSha256: request.requestSha256,
      resultSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      verifierReceipt: verifierReceipt(),
    });
    expect(
      protocol.publishResult({
        requestSha256: request.requestSha256,
        verifierReceipt: verifierReceipt(),
      }),
    ).toEqual(result);
    expect(protocol.readResult()).toEqual(result);
  });

  it("rejects unknown request fields, unsafe paths, and publication conflicts", () => {
    const sessionRoot = path.join(temporaryRoot(), "controller-session");
    fs.mkdirSync(sessionRoot);
    const protocol = createVerificationSessionProtocol({ sessionRoot });

    expect(() =>
      protocol.publishRequest({
        ...requestInput(),
        verificationWorkspacePath: "C:\\worker-controlled\\checkout",
      }),
    ).toThrow(/request.*integrity/i);
    expect(() =>
      protocol.publishRequest({
        ...requestInput(),
        changedPaths: ["../outside-controller"],
      }),
    ).toThrow(/request.*integrity/i);

    protocol.publishRequest(requestInput());
    expect(() =>
      protocol.publishRequest({ ...requestInput(), deadline: 1_800_000_000_001 }),
    ).toThrow(/conflict/i);

    const request = protocol.readRequest();
    protocol.publishResult({
      requestSha256: request.requestSha256,
      verifierReceipt: verifierReceipt(),
    });
    expect(() =>
      protocol.publishResult({
        requestSha256: request.requestSha256,
        verifierReceipt: { ...verifierReceipt(), kind: "failed" },
      }),
    ).toThrow(/conflict/i);
  });

  it("rehashes every read and rejects request or result tampering", () => {
    const sessionRoot = path.join(temporaryRoot(), "controller-session");
    fs.mkdirSync(sessionRoot);
    const protocol = createVerificationSessionProtocol({ sessionRoot });
    const request = protocol.publishRequest(requestInput());
    protocol.publishResult({
      requestSha256: request.requestSha256,
      verifierReceipt: verifierReceipt(),
    });
    expect(protocol.readRequest()).toEqual(request);
    expect(protocol.readResult()).toMatchObject({
      requestSha256: request.requestSha256,
    });

    const requestPath = path.join(sessionRoot, "request.json");
    const tamperedRequest = JSON.parse(fs.readFileSync(requestPath, "utf8"));
    tamperedRequest.deadline += 1;
    fs.writeFileSync(requestPath, `${JSON.stringify(tamperedRequest)}\n`);
    expect(() => protocol.readRequest()).toThrow(/digest.*integrity|integrity.*digest/i);

    const resultPath = path.join(sessionRoot, "result.json");
    const tamperedResult = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    tamperedResult.verifierReceipt.kind = "failed";
    fs.writeFileSync(resultPath, `${JSON.stringify(tamperedResult)}\n`);
    expect(() => protocol.readResult()).toThrow(/digest.*integrity|integrity.*digest/i);
  });

  it("rejects a result for another request and a symlinked session root", () => {
    const parent = temporaryRoot();
    const realRoot = path.join(parent, "real-session");
    const linkedRoot = path.join(parent, "linked-session");
    fs.mkdirSync(realRoot);
    fs.symlinkSync(realRoot, linkedRoot, "junction");

    expect(() =>
      createVerificationSessionProtocol({ sessionRoot: linkedRoot }),
    ).toThrow(/session root.*integrity/i);

    const protocol = createVerificationSessionProtocol({ sessionRoot: realRoot });
    const request = protocol.publishRequest(requestInput());
    expect(() =>
      protocol.publishResult({
        requestSha256: "f".repeat(64),
        verifierReceipt: verifierReceipt(),
      }),
    ).toThrow(/request.*integrity/i);
    expect(protocol.readRequest().requestSha256).toBe(request.requestSha256);
  });
});
