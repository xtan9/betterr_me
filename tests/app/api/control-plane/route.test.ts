// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  }),
}));

import { GET, POST } from "@/app/api/control-plane/route";

function postControlPlane(body: unknown) {
  return POST(new NextRequest("http://localhost:3000/api/control-plane", {
    method: "POST",
    body: JSON.stringify(body),
  }));
}

describe("/api/control-plane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "manager-id" } } });
  });

  it("rejects anonymous reads before handing off to the database", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects anonymous mutations before parsing or database handoff", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await postControlPlane({ action: "create", title: "Unauthorized" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden" });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("returns the control-plane response after database authorization", async () => {
    const members = [{ user_id: "manager-id", role: "manager" }];
    const workItems = [{ id: "11111111-1111-4111-8111-111111111111", status: "backlog" }];
    mockRpc
      .mockResolvedValueOnce({ data: members, error: null })
      .mockResolvedValueOnce({ data: workItems, error: null });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ members, workItems });
    expect(mockRpc.mock.calls).toEqual([
      ["control_plane_list_members"],
      ["control_plane_list_work_items"],
    ]);
  });

  it("maps database read denial to the public forbidden response", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: null, error: { code: "42501" } })
      .mockResolvedValueOnce({ data: [], error: null });

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Control Plane access denied",
    });
  });

  it("maps a thrown database read denial to the public forbidden response", async () => {
    mockRpc.mockRejectedValue(Object.assign(new Error("permission denied"), { code: "42501" }));

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Control Plane access denied",
    });
  });

  it("rejects invalid mutations before handing off to the database", async () => {
    const response = await postControlPlane({ action: "create", title: "   " });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request" });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON before handing off to the database", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/control-plane", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request" });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it.each([
    {
      body: { action: "create", title: "  Ship proof  " },
      rpc: "control_plane_create_work_item",
      args: {
        p_title: "Ship proof",
        p_assignee_id: null,
        p_lease_expires_at: null,
        p_blockers: [],
        p_evidence_urls: [],
      },
    },
    {
      body: {
        action: "assign",
        workItemId: "11111111-1111-4111-8111-111111111111",
        assigneeId: "22222222-2222-4222-8222-222222222222",
      },
      rpc: "control_plane_assign_work_item",
      args: {
        p_work_item_id: "11111111-1111-4111-8111-111111111111",
        p_assignee_id: "22222222-2222-4222-8222-222222222222",
        p_lease_expires_at: null,
      },
    },
    {
      body: {
        action: "transition",
        workItemId: "11111111-1111-4111-8111-111111111111",
        status: "active_sprint",
      },
      rpc: "control_plane_transition_work_item",
      args: {
        p_work_item_id: "11111111-1111-4111-8111-111111111111",
        p_to_status: "active_sprint",
      },
    },
  ])("hands $body.action authorization to $rpc", async ({ body, rpc, args }) => {
    const workItem = { id: "11111111-1111-4111-8111-111111111111" };
    mockRpc.mockResolvedValue({ data: workItem, error: null });

    const response = await postControlPlane(body);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ workItem });
    expect(mockRpc).toHaveBeenCalledExactlyOnceWith(rpc, args);
  });

  it("maps a resolved mutation denial to forbidden", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: "42501" } });

    const response = await postControlPlane({ action: "create", title: "Denied work" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Control Plane mutation denied",
    });
  });

  it("maps a thrown mutation denial to forbidden instead of validation failure", async () => {
    mockRpc.mockRejectedValue(Object.assign(new Error("permission denied"), { code: "42501" }));

    const response = await postControlPlane({ action: "create", title: "Denied work" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Control Plane mutation denied",
    });
  });
});
