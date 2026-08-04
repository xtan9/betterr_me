// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("MCP access-grant evidence architecture", () => {
  it("keeps the deterministic kernel independent of live adapters and capabilities", () => {
    const kernel = source("e2e/mcp-access-grant-evidence.ts");

    expect(kernel).not.toMatch(/@playwright\/test|@modelcontextprotocol|@supabase\/supabase-js/);
    expect(kernel).not.toMatch(/node:(?:child_process|fs|http|net|timers|worker_threads)/);
    expect(kernel).not.toMatch(/mcp-access-grant-(?:public-client|compatibility)/);
    expect(kernel).toMatch(/export class GateAccumulator/);
    expect(kernel).toMatch(/export function finalizeEvidence/);
    expect(kernel).toMatch(/export function verifyEvidence/);
  });

  it("leaves live capabilities, journey sequencing, and suite manifests in the adapters", () => {
    const adapters = [
      source("e2e/mcp-access-grant-public-client.ts"),
      source("e2e/mcp-access-grant-compatibility.ts"),
    ];

    for (const adapter of adapters) {
      expect(adapter).toMatch(/mcp-access-grant-evidence/);
      expect(adapter).not.toMatch(/interface Compatibility(?:Gate|Report)/);
      expect(adapter).not.toMatch(/class GateAccumulator/);
      expect(adapter).not.toMatch(/function (?:sanitizeEvidence|verifyEvidence|finalizeEvidence|finalizeReport)\s*\(/);
    }

    expect(adapters[0]).toMatch(/PUBLIC_CLIENT_REQUIRED_GATE_IDS/);
    expect(adapters[1]).toMatch(/REQUIRED_GATE_IDS/);
  });

  it("keeps deterministic unit tests independent of either live runner", () => {
    const tests = [
      source("tests/e2e/mcp-access-grant-evidence.test.ts"),
      source("tests/e2e/mcp-access-grant-policy.test.ts"),
      source("tests/e2e/mcp-access-grant-compatibility.test.ts"),
    ];

    for (const testSource of tests) {
      expect(testSource).not.toMatch(/from ["'](?:@\/)?(?:\.\/|\.\.\/)*e2e\/mcp-access-grant-(?:public-client|compatibility)["']/);
    }
  });
});
