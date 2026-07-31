// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("node:crypto", () => ({
  default: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
}));

import { POST } from "@/app/api/oauth/register/route";

describe("POST /api/oauth/register", () => {
  it("registers a public OAuth client with a stable response contract", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/oauth/register", {
      method: "POST",
      body: JSON.stringify({
        client_name: "Desktop MCP",
        redirect_uris: ["http://127.0.0.1:9876/callback"],
      }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      client_id: "11111111-1111-4111-8111-111111111111",
      client_name: "Desktop MCP",
      redirect_uris: ["http://127.0.0.1:9876/callback"],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  it("rejects malformed JSON as invalid client metadata", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/oauth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_client_metadata",
    });
  });
});
