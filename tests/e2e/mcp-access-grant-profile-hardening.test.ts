// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  runAggregateCompatibilityEvidence,
  type AggregateCompatibilityArtifact,
  type AggregateCompatibilityEvidenceOptions,
} from "../../e2e/mcp-access-grant-aggregate-profile";
import {
  runPublicClientEvidence,
  type PublicClientArtifact,
  type PublicClientEvidenceOptions,
} from "../../e2e/mcp-access-grant-public-client-profile";

const startedAt = "2026-08-08T00:00:00.000Z";
const finishedAt = "2026-08-08T00:01:00.000Z";
const target = {
  name: "hardening-fixture",
  canonicalResource: "http://127.0.0.1:3000/mcp",
  supabaseUrl: "http://127.0.0.1:54321",
  expectedAuthorizationServer: "http://127.0.0.1:54321/auth/v1",
  loopbackHosts: ["127.0.0.1", "::1"],
} as const;

function clock(values: readonly string[] = [startedAt, finishedAt]): () => string {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)] as string;
}

function publicOptions(
  writes: PublicClientArtifact[] = [],
  overrides: Partial<PublicClientEvidenceOptions> = {},
): PublicClientEvidenceOptions {
  return {
    target,
    versions: { node: "22.0.0" },
    clock: clock(),
    writer: {
      write: async (artifact) => {
        writes.push(artifact);
      },
    },
    ...overrides,
  };
}

function aggregateOptions(
  writes: AggregateCompatibilityArtifact[] = [],
  overrides: Partial<AggregateCompatibilityEvidenceOptions> = {},
): AggregateCompatibilityEvidenceOptions {
  return {
    target,
    versions: { node: "22.0.0" },
    clock: clock(),
    writer: {
      write: async (artifact) => {
        writes.push(artifact);
      },
    },
    ...overrides,
  };
}

describe("MCP profile evidence lifecycle hardening", () => {
  it.each(["public", "aggregate"] as const)("rejects malformed options before the %s journey starts", async (profile) => {
    const journey = vi.fn();
    const clockSpy = vi.fn(() => startedAt);
    const writes: unknown[] = [];
    const options = profile === "public"
      ? publicOptions([], { clock: clockSpy, versions: { node: 7 } as never })
      : aggregateOptions([], { clock: clockSpy, versions: { node: 7 } as never });

    const run = profile === "public" ? runPublicClientEvidence : runAggregateCompatibilityEvidence;
    await expect(run(options as never, journey as never)).rejects.toThrow(/evidence journey failed/i);
    expect(journey).not.toHaveBeenCalled();
    expect(clockSpy).not.toHaveBeenCalled();
    expect(writes).toHaveLength(0);
  });

  it("snapshots public options before live work and freezes the artifact boundary", async () => {
    const writes: PublicClientArtifact[] = [];
    const input = publicOptions(writes);
    const resultPromise = runPublicClientEvidence(input, async (recorder) => {
      (input as unknown as { target: Record<string, unknown> }).target = { ...input.target, canonicalResource: "https://mutated.example/mcp" };
      (input.versions as Record<string, string>).node = "mutated";
      await recorder.record({
        kind: "configuration",
        role: "snapshot",
        observation: { loopbackHosts: ["127.0.0.1", "::1"] },
      });
    });

    const result = await resultPromise;
    expect(result.report.target.canonicalResource).toBe(target.canonicalResource);
    expect(result.report.versions.node).toBe("22.0.0");
    expect(writes).toHaveLength(1);
    expect(Object.isFrozen(writes[0])).toBe(true);
    expect(Object.isFrozen(writes[0]?.contents)).toBe(true);
  });

  it("samples a monotonic clock around accepted work and rejects reversed output without writing", async () => {
    const writes: PublicClientArtifact[] = [];
    const clockSpy = vi.fn()
      .mockReturnValueOnce(startedAt)
      .mockReturnValueOnce("2026-08-07T23:59:00.000Z");

    await expect(runPublicClientEvidence(publicOptions(writes, { clock: clockSpy }), async (recorder) => {
      await recorder.record({
        kind: "configuration",
        role: "snapshot",
        observation: { loopbackHosts: ["127.0.0.1", "::1"] },
      });
    })).rejects.toThrow(/evidence journey failed/i);
    expect(clockSpy).toHaveBeenCalledTimes(2);
    expect(writes).toHaveLength(0);
  });

  it("drains ignored accepted records but poisons the outer public run for ignored invalid records", async () => {
    const writes: PublicClientArtifact[] = [];
    const success = await runPublicClientEvidence(publicOptions(writes), async (recorder) => {
      void recorder.record({
        kind: "configuration",
        role: "snapshot",
        observation: { loopbackHosts: ["127.0.0.1", "::1"] },
      });
    });
    expect(success.report.gates.find(({ id }) => id === "reproducible-configuration")).toMatchObject({ status: "pass" });

    await expect(runPublicClientEvidence(publicOptions(writes), async (recorder) => {
      void recorder.record({ kind: "configuration", role: "not-a-role" } as never);
    })).rejects.toThrow(/evidence journey failed/i);
    expect(writes).toHaveLength(1);
  });

  it("rejects late leaked public recorder calls without mutating the completed report", async () => {
    const writes: PublicClientArtifact[] = [];
    let leaked: { record: (fact: never) => Promise<void> } | undefined;
    const result = await runPublicClientEvidence(publicOptions(writes), async (recorder) => {
      leaked = recorder as unknown as typeof leaked;
    });

    await expect(leaked?.record({} as never)).rejects.toThrow(/evidence journey failed/i);
    expect(writes).toHaveLength(1);
    expect(result.report.outcome).toBe("not-proven");
  });

  it("keeps public non-request facts idempotent, preserves request order, and fails bounded conflicts", async () => {
    const writes: PublicClientArtifact[] = [];
    const result = await runPublicClientEvidence(publicOptions(writes), async (recorder) => {
      const configuration = {
        kind: "configuration" as const,
        role: "snapshot" as const,
        observation: { loopbackHosts: ["127.0.0.1", "::1"] },
      };
      await recorder.record(configuration);
      await recorder.record(configuration);
      await recorder.record({
        ...configuration,
        observation: { loopbackHosts: ["127.0.0.1"] },
      });
      await recorder.record({
        kind: "resource-discovery",
        role: "primary",
        request: { method: "GET", url: "http://first.example.test", bodyFields: [] },
      });
      await recorder.record({
        kind: "resource-discovery",
        role: "primary",
        request: { method: "GET", url: "http://second.example.test", bodyFields: [] },
      });
    });

    const configuration = result.report.gates.find(({ id }) => id === "reproducible-configuration");
    expect(configuration).toMatchObject({ status: "fail", evidence: { errorKind: "conflicting-observation" } });
    expect(result.report.requests.map(({ url }) => url)).toEqual([
      "http://first.example.test/",
      "http://second.example.test/",
    ]);
    expect(result.artifact.contents.length).toBeLessThan(25_000);
  });

  it("keeps aggregate non-request facts idempotent and fails bounded conflicts", async () => {
    const writes: AggregateCompatibilityArtifact[] = [];
    const result = await runAggregateCompatibilityEvidence(aggregateOptions(writes), async ({ compatibility }) => {
      const configuration = {
        kind: "configuration" as const,
        role: "snapshot" as const,
        observation: { loopbackHosts: ["127.0.0.1", "::1"] },
      };
      await compatibility.record(configuration);
      await compatibility.record(configuration);
      await compatibility.record({
        ...configuration,
        observation: { loopbackHosts: ["127.0.0.1"] },
      });
    });

    expect(result.report.gates.find(({ id }) => id === "reproducible-configuration")).toMatchObject({
      status: "fail",
      evidence: { errorKind: "conflicting-observation" },
    });
  });

  it.each(["public", "aggregate"] as const)("captures %s fact input at recorder invocation", async (profile) => {
    const writes: unknown[] = [];
    const fact = {
      kind: "configuration" as const,
      role: "snapshot" as const,
      observation: { loopbackHosts: ["127.0.0.1", "::1"] },
    };
    const result = profile === "public"
      ? await runPublicClientEvidence(publicOptions(writes as PublicClientArtifact[]), async (recorder) => {
        const pending = recorder.record(fact);
        (fact.observation.loopbackHosts as string[])[0] = "mutated-host";
        await pending;
      })
      : await runAggregateCompatibilityEvidence(aggregateOptions(writes as AggregateCompatibilityArtifact[]), async ({ compatibility }) => {
        const pending = compatibility.record(fact);
        (fact.observation.loopbackHosts as string[])[0] = "mutated-host";
        await pending;
      });

    expect(result.report.gates.find(({ id }) => id === "reproducible-configuration")).toMatchObject({ status: "pass" });
  });

  it.each(["public", "aggregate"] as const)("keeps recursive ephemeral values out of the %s result", async (profile) => {
    const writes: unknown[] = [];
    const rawValues = [
      "raw-code-value",
      "raw-state-value",
      "raw-verifier-value",
      "raw-token-value",
      "raw-crypto-value",
    ];
    const responseBody = {
      error: "invalid_client_metadata",
      code: rawValues[0],
      state: rawValues[1],
      verifier: rawValues[2],
      token: rawValues[3],
      nested: { bearer: rawValues[3], cryptographic: { privateKey: rawValues[4], n: rawValues[4] } },
    };

    const result = profile === "public"
      ? await runPublicClientEvidence(publicOptions(writes as PublicClientArtifact[]), async (recorder) => {
        await recorder.record({
          kind: "registration",
          role: "negative",
          family: "ipv4",
          caseId: "malformed-metadata",
          response: { complete: false, status: 400, body: responseBody },
          request: { method: "POST", url: "http://127.0.0.1/register", response: { complete: false, status: 400, body: responseBody } },
        });
      })
      : await runAggregateCompatibilityEvidence(aggregateOptions(writes as AggregateCompatibilityArtifact[]), async ({ compatibility }) => {
        await compatibility.record({
          kind: "registration",
          role: "primary",
          response: { complete: false, status: 400, body: responseBody },
          request: { method: "POST", url: "http://127.0.0.1/register", response: { complete: false, status: 400, body: responseBody } },
        });
      });

    const serialized = JSON.stringify(result.report) + result.artifact.contents;
    for (const rawValue of rawValues) expect(serialized).not.toContain(rawValue);
  });

  it("rejects forged identity fields and impossible aggregate source pairings before persistence", async () => {
    const publicWrites: PublicClientArtifact[] = [];
    await expect(runPublicClientEvidence(publicOptions(publicWrites), async (recorder) => {
      await recorder.record({
        kind: "configuration",
        role: "snapshot",
        identity: "reproducible-configuration",
        observation: { loopbackHosts: ["127.0.0.1", "::1"] },
      } as never);
    })).rejects.toThrow(/evidence journey failed/i);

    const aggregateWrites: AggregateCompatibilityArtifact[] = [];
    await expect(runAggregateCompatibilityEvidence(aggregateOptions(aggregateWrites), async ({ publicClient }) => {
      await publicClient.record({
        kind: "resource-discovery",
        role: "primary",
      } as never);
    })).rejects.toThrow(/evidence journey failed/i);

    expect(publicWrites).toHaveLength(0);
    expect(aggregateWrites).toHaveLength(0);
  });

  it("does not finalize or write raw callback failures for the aggregate operation", async () => {
    const writes: AggregateCompatibilityArtifact[] = [];
    const clockSpy = vi.fn(() => startedAt);
    await expect(runAggregateCompatibilityEvidence(aggregateOptions(writes, { clock: clockSpy }), async ({ compatibility }) => {
      void compatibility.record({
        kind: "configuration",
        role: "snapshot",
        observation: { loopbackHosts: ["127.0.0.1", "::1"] },
      });
      throw new Error("raw-callback-secret");
    })).rejects.toThrow("Aggregate compatibility evidence journey failed.");

    expect(clockSpy).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(0);
  });

  it("does not finalize or write raw callback failures for the public operation", async () => {
    const writes: PublicClientArtifact[] = [];
    const clockSpy = vi.fn(() => startedAt);
    await expect(runPublicClientEvidence(publicOptions(writes, { clock: clockSpy }), async (recorder) => {
      void recorder.record({
        kind: "configuration",
        role: "snapshot",
        observation: { loopbackHosts: ["127.0.0.1", "::1"] },
      });
      throw new Error("raw-callback-secret");
    })).rejects.toThrow("Public-client evidence journey failed.");

    expect(clockSpy).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(0);
  });

  it("deduplicates aggregate facts and retries a failed frozen persistence boundary", async () => {
    const writes: AggregateCompatibilityArtifact[] = [];
    const writer = vi.fn(async (artifact: AggregateCompatibilityArtifact) => {
      expect(Object.isFrozen(artifact)).toBe(true);
      expect(Object.isFrozen(artifact.contents)).toBe(true);
      writes.push(artifact);
      throw new Error("raw-writer-secret");
    });
    const result = await runAggregateCompatibilityEvidence(aggregateOptions(writes, { writer }), async ({ compatibility }) => {
      const configuration = {
        kind: "configuration" as const,
        role: "snapshot" as const,
        observation: { loopbackHosts: ["127.0.0.1", "::1"] },
      };
      await compatibility.record(configuration);
      await compatibility.record(configuration);
    });

    expect(writer).toHaveBeenCalledTimes(3);
    expect(result.report.gates.find(({ id }) => id === "sanitized-evidence")).toMatchObject({ status: "fail" });
    expect(result.artifact.contents).not.toContain("raw-writer-secret");
  });
});
