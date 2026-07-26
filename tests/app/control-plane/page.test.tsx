import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  forbidden: vi.fn(() => {
    throw new Error("NEXT_FORBIDDEN");
  }),
}));

const { getUser: mockGetUser, rpc: mockRpc, redirect: mockRedirect, forbidden: mockForbidden } = mocks;

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  forbidden: mocks.forbidden,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));

vi.mock("@/components/control-plane/control-plane-content", () => ({
  ControlPlaneContent: (props: unknown) => <div data-testid="control-plane" data-props={JSON.stringify(props)} />,
}));

import ControlPlanePage from "@/app/control-plane/page";

describe("ControlPlanePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to login", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(ControlPlanePage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/auth/login");
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("renders the controlled 403 state for an authenticated non-member", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-id" } } });
    mockRpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(ControlPlanePage()).rejects.toThrow("NEXT_FORBIDDEN");
    expect(mockForbidden).toHaveBeenCalledOnce();
    expect(mockRpc).toHaveBeenCalledWith("control_plane_list_members");
    expect(mockRpc).toHaveBeenCalledWith("control_plane_list_work_items");
  });
});
