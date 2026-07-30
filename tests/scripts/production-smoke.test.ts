import { describe, expect, it, vi } from "vitest";

import {
  runProductionSmoke,
  smokeProduction,
  waitForVercelDeployment,
} from "../../scripts/ci/production-smoke.mjs";

function response(payload, status = 200) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("production smoke", () => {
  it("waits for a successful Vercel deployment", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ statuses: [] }))
      .mockResolvedValueOnce(response({
        statuses: [{
          context: "Vercel",
          state: "success",
          description: "Deployment has completed",
        }],
      }));

    await expect(waitForVercelDeployment({
      repository: "xtan9/betterr_me",
      sha: "abc123",
      token: "token",
      fetchImpl,
      sleep: vi.fn(),
    })).resolves.toMatchObject({ skipped: false });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("recognizes a Vercel ignored build without probing production", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      statuses: [{
        context: "Vercel",
        state: "success",
        description: "Canceled by Ignored Build Step",
      }],
    }));

    await expect(runProductionSmoke({
      repository: "xtan9/betterr_me",
      sha: "abc123",
      token: "token",
      appUrl: "https://example.com",
      fetchImpl,
    })).resolves.toMatchObject({ action: "skipped" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails immediately when Vercel reports a deployment failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      statuses: [{
        context: "Vercel",
        state: "failure",
        description: "Build failed",
      }],
    }));

    await expect(waitForVercelDeployment({
      repository: "xtan9/betterr_me",
      sha: "abc123",
      token: "token",
      fetchImpl,
    })).rejects.toThrow("Vercel deployment failed");
  });

  it("checks the public landing and login pages", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () =>
      new Response("<!doctype html><html><body>ok</body></html>", { status: 200 }));

    await expect(smokeProduction({
      appUrl: "https://example.com/base",
      fetchImpl,
    })).resolves.toEqual([
      { path: "/", status: 200 },
      { path: "/auth/login", status: 200 },
    ]);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/auth/login"),
      expect.objectContaining({ redirect: "follow" }),
    );
  });
});
