import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { calculateCushion, type FinanceCushionView } from "@/lib/finance/cushion";
import { GET, POST } from "@/app/api/finance/cushion/route";
import { createClient } from "@/lib/supabase/server";
import {
  getFinanceCushion,
  saveFinanceCushion,
} from "@/lib/finance/repository";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/finance/repository", () => ({
  getFinanceCushion: vi.fn(),
  saveFinanceCushion: vi.fn(),
}));

const user = { id: "user-a" };
const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
};

const savedCushion: FinanceCushionView = {
  id: "cushion-a",
  user_id: user.id,
  liquid_resources_cents: 120000,
  monthly_essential_expenses_cents: 30000,
  monthly_continuing_income_cents: 0,
  created_at: "2026-07-26T00:00:00.000Z",
  updated_at: "2026-07-26T00:00:00.000Z",
  calculation: calculateCushion({
    liquid_resources_cents: 120000,
    monthly_essential_expenses_cents: 30000,
    monthly_continuing_income_cents: 0,
  }),
};

describe("/api/finance/cushion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user } });
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never);
  });

  it("returns 401 without an authenticated user", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(getFinanceCushion).not.toHaveBeenCalled();
  });

  it("reads the cushion through the signed-in user's id", async () => {
    vi.mocked(getFinanceCushion).mockResolvedValue(savedCushion);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cushion).toEqual(savedCushion);
    expect(getFinanceCushion).toHaveBeenCalledWith(mockSupabase, user.id);
  });

  it("saves validated inputs using the signed-in user's id", async () => {
    vi.mocked(saveFinanceCushion).mockResolvedValue(savedCushion);
    const request = new NextRequest("http://localhost:3000/api/finance/cushion", {
      method: "POST",
      body: JSON.stringify({
        liquid_resources_cents: 120000,
        monthly_essential_expenses_cents: 30000,
        monthly_continuing_income_cents: 0,
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cushion).toEqual(savedCushion);
    expect(saveFinanceCushion).toHaveBeenCalledWith(mockSupabase, user.id, {
      liquid_resources_cents: 120000,
      monthly_essential_expenses_cents: 30000,
      monthly_continuing_income_cents: 0,
    });
  });

  it("rejects invalid inputs before reaching persistence", async () => {
    const request = new NextRequest("http://localhost:3000/api/finance/cushion", {
      method: "POST",
      body: JSON.stringify({
        liquid_resources_cents: 100,
        monthly_essential_expenses_cents: 0,
        monthly_continuing_income_cents: 0,
      }),
      headers: { "content-type": "application/json" },
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(saveFinanceCushion).not.toHaveBeenCalled();
  });
});
