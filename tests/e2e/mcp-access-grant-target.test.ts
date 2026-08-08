// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  evaluateMcpAccessGrantTargetConfiguration,
  loadMcpAccessGrantConfiguration,
  loadMcpAccessGrantTargets,
  McpAccessGrantTargetConfigurationError,
} from "../../e2e/mcp-access-grant-target";

function environment(values: Record<string, string>): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...values };
}

describe("MCP access-grant canonical target boundary", () => {
  it("loads valid targets, derives the provider issuer, and resolves explicit loopback hosts", () => {
    const configuredEnvironment = environment({
      MCP_ACCESS_GRANT_TARGETS: JSON.stringify([{
        name: "configured-local",
        canonicalResource: "http://127.0.0.1:3000/mcp",
        supabaseUrl: "http://127.0.0.1:54321",
        loopbackHosts: ["::1", "127.0.0.1", "::1"],
        anonKeyEnv: "MCP_CUSTOM_ANON_KEY",
      }]),
      MCP_CUSTOM_ANON_KEY: "configured-anon-key",
    });
    const configuration = loadMcpAccessGrantConfiguration(configuredEnvironment);

    expect(configuration.targets).toEqual([{
      name: "configured-local",
      canonicalResource: "http://127.0.0.1:3000/mcp",
      supabaseUrl: "http://127.0.0.1:54321",
      expectedAuthorizationServer: "http://127.0.0.1:54321/auth/v1",
      loopbackHosts: ["::1", "127.0.0.1"],
      anonKey: "configured-anon-key",
      email: undefined,
      password: undefined,
      locality: {
        canonicalResourceIsLoopback: true,
        supabaseUrlIsLoopback: true,
        expectedAuthorizationServerIsLoopback: true,
        allEndpointsLoopback: true,
        nonProductionAcknowledged: true,
      },
    }]);
    expect(configuration.configuredValues).toEqual(["configured-anon-key"]);
    expect(loadMcpAccessGrantTargets(configuredEnvironment).map(({ name }) => name)).toEqual(["configured-local"]);
  });

  it("fails fast on malformed target JSON", () => {
    expect(() => loadMcpAccessGrantConfiguration(environment({ MCP_ACCESS_GRANT_TARGETS: "[{" })))
      .toThrowError(McpAccessGrantTargetConfigurationError);
  });

  it("fails fast on structurally invalid target entries", () => {
    expect(() => loadMcpAccessGrantConfiguration(environment({ MCP_ACCESS_GRANT_TARGETS: JSON.stringify(["not-an-object"]) })))
      .toThrowError(McpAccessGrantTargetConfigurationError);
  });

  it("rejects invalid endpoint and loopback configuration", () => {
    expect(() => loadMcpAccessGrantConfiguration(environment({
      MCP_ACCESS_GRANT_TARGETS: JSON.stringify([{
        name: 42,
        canonicalResource: "not-a-url",
        supabaseUrl: "https://supabase.example.test",
        loopbackHosts: ["localhost"],
      }]),
    }))).toThrowError(McpAccessGrantTargetConfigurationError);
  });

  it("falls back from a target-specific anon-key environment name to the public anon key", () => {
    const configuration = loadMcpAccessGrantConfiguration(environment({
      MCP_ACCESS_GRANT_TARGETS: JSON.stringify([{
        name: "fallback-key-target",
        canonicalResource: "http://127.0.0.1:3000/mcp",
        supabaseUrl: "http://127.0.0.1:54321",
        anonKeyEnv: "MCP_CUSTOM_ANON_KEY",
      }]),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "fallback-anon-key",
    }));

    expect(configuration.targets[0]).toMatchObject({ anonKey: "fallback-anon-key" });
    expect(configuration.configuredValues).toEqual(["fallback-anon-key"]);
  });

  it("builds one conservative redaction set across target credentials and sensitive environment values", () => {
    const configuration = loadMcpAccessGrantConfiguration(environment({
      MCP_ACCESS_GRANT_TARGETS: JSON.stringify([{
        name: "redaction-target",
        canonicalResource: "http://127.0.0.1:3000/mcp",
        supabaseUrl: "http://127.0.0.1:54321",
        anonKeyEnv: "MCP_CUSTOM_ANON_KEY",
      }]),
      MCP_CUSTOM_ANON_KEY: "target-anon-key",
      MCP_TEST_EMAIL: "test@example.com",
      MCP_TEST_PASSWORD: "target-password",
      SUPABASE_ANON_KEY: "legacy-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
      API_KEY_HMAC_SECRET: "hmac-secret",
    }));

    expect(configuration.configuredValues).toEqual([
      "target-anon-key",
      "test@example.com",
      "target-password",
      "legacy-anon-key",
      "service-role-key",
      "public-anon-key",
      "hmac-secret",
    ]);
  });

  it("keeps missing optional credentials valid while freezing shared target state", () => {
    const configuration = loadMcpAccessGrantConfiguration(environment({
      MCP_ACCESS_GRANT_TARGETS: JSON.stringify([{
        name: "credential-limited-target",
        canonicalResource: "https://mcp.example.test/mcp",
        supabaseUrl: "https://supabase.example.test",
      }]),
    }));
    const configuredTarget = configuration.targets[0];

    expect(configuredTarget).toMatchObject({ email: undefined, password: undefined, anonKey: undefined });
    expect(configuration.configuredValues).toEqual([]);
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(Object.isFrozen(configuration.targets)).toBe(true);
    expect(Object.isFrozen(configuredTarget)).toBe(true);
    expect(Object.isFrozen(configuredTarget.loopbackHosts)).toBe(true);
    expect(Object.isFrozen(configuredTarget.locality)).toBe(true);
    expect(Object.isFrozen(configuration.configuredValues)).toBe(true);
  });

  it("preserves the non-loopback acknowledgement policy at the target boundary", () => {
    const localConfiguration = loadMcpAccessGrantConfiguration(environment({
      MCP_ACCESS_GRANT_TARGETS: JSON.stringify([{
        name: "local-fixture",
        canonicalResource: "http://127.0.0.1:3000/mcp",
        supabaseUrl: "http://127.0.0.1:54321",
      }]),
    }));
    const hostedConfiguration = loadMcpAccessGrantConfiguration(environment({
      MCP_ACCESS_GRANT_TARGETS: JSON.stringify([{
        name: "hosted-fixture",
        canonicalResource: "https://mcp.example.test/mcp",
        supabaseUrl: "https://supabase.example.test",
      }]),
    }));
    const acknowledgedConfiguration = loadMcpAccessGrantConfiguration(environment({
      MCP_ACCESS_GRANT_NON_PRODUCTION_ACK: "true",
      MCP_ACCESS_GRANT_TARGETS: JSON.stringify([{
        name: "hosted-fixture",
        canonicalResource: "https://mcp.example.test/mcp",
        supabaseUrl: "https://supabase.example.test",
      }]),
    }));

    expect(evaluateMcpAccessGrantTargetConfiguration(localConfiguration.targets[0])).toEqual({ configured: true, nonProduction: true });
    expect(evaluateMcpAccessGrantTargetConfiguration(hostedConfiguration.targets[0])).toEqual({ configured: true, nonProduction: false });
    expect(evaluateMcpAccessGrantTargetConfiguration(acknowledgedConfiguration.targets[0])).toEqual({ configured: true, nonProduction: true });
  });
});
