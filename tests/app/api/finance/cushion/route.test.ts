import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  createDefaultRunwayAnswers,
  simulateHouseholdRunway,
  toFinanceCushionView,
} from "@/lib/finance/cushion";
import { GET, PUT } from "@/app/api/finance/cushion/route";
import { createClient } from "@/lib/supabase/server";
import {
  appendRunwaySnapshot,
  getFinanceCushion,
  getRunwaySnapshots,
  saveHouseholdRunwayPlan,
} from "@/lib/finance/repository";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/finance/repository", () => ({
  appendRunwaySnapshot: vi.fn(),
  getFinanceCushion: vi.fn(),
  getRunwaySnapshots: vi.fn(),
  saveHouseholdRunwayPlan: vi.fn(),
}));

const user = { id: "user-a" };
const mockSupabase = { auth: { getUser: vi.fn() } };

function validAnswers() {
  const answers = createDefaultRunwayAnswers(
    new Date("2026-07-26T00:00:00.000Z"),
  );
  answers.region = "California";
  answers.mine = {
    employment: "unemployed",
    monthly_take_home_cents: 0,
    entered_amount_cents: 0,
    entered_period: "monthly",
    entered_as: "net",
    confidence: "confirmed",
    take_home_reviewed: true,
  };
  answers.available_cash = { cents: 3_000_000, confidence: "confirmed" };
  answers.expenses.other = {
    current_cents: 600_000,
    interruption_cents: 600_000,
    confidence: "confirmed",
  };
  return answers;
}

const answers = validAnswers();
const result = simulateHouseholdRunway(
  answers,
  "current",
  undefined,
  new Date("2026-07-26"),
);
const savedCushion = toFinanceCushionView({
  id: "cushion-a",
  user_id: user.id,
  liquid_resources_cents: result.starting_resources_cents,
  monthly_essential_expenses_cents: result.interruption_expenses_cents,
  monthly_continuing_income_cents: result.continuing_monthly_income_cents,
  answers,
  latest_result: result,
  model_version: "2.0.0",
  status: "completed",
  created_at: "2026-07-26T00:00:00.000Z",
  updated_at: "2026-07-26T00:00:00.000Z",
});

describe("/api/finance/cushion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user } });
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never);
    vi.mocked(getRunwaySnapshots).mockResolvedValue([]);
  });

  it("returns 401 without an authenticated user", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(getFinanceCushion).not.toHaveBeenCalled();
  });

  it("reads the current plan and append-only history for the signed-in user", async () => {
    vi.mocked(getFinanceCushion).mockResolvedValue(savedCushion);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cushion.id).toBe("cushion-a");
    expect(getFinanceCushion).toHaveBeenCalledWith(mockSupabase, user.id);
    expect(getRunwaySnapshots).toHaveBeenCalledWith(mockSupabase, user.id);
  });

  it("recalculates trusted results on the server before saving and creates an idempotent snapshot", async () => {
    vi.mocked(saveHouseholdRunwayPlan).mockResolvedValue(savedCushion);
    const request = new NextRequest(
      "http://localhost:3000/api/finance/cushion",
      {
        method: "PUT",
        body: JSON.stringify({
          answers,
          status: "completed",
          attribution: { campaign: "youtube" },
          create_snapshot: true,
          snapshot_action_id: "74a303ae-1ba3-4ab5-beb9-5317eb94c790",
          snapshot_trigger: "imported",
        }),
        headers: { "content-type": "application/json" },
      },
    );

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(saveHouseholdRunwayPlan).toHaveBeenCalledWith(
      mockSupabase,
      user.id,
      expect.objectContaining({
        answers,
        status: "completed",
        attribution: { campaign: "youtube" },
        result: expect.objectContaining({ months_covered: 5 }),
      }),
    );
    expect(appendRunwaySnapshot).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        planId: "cushion-a",
        userId: user.id,
        actionId: "74a303ae-1ba3-4ab5-beb9-5317eb94c790",
        trigger: "imported",
      }),
    );
  });

  it("rejects invalid and negative financial inputs before persistence", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/finance/cushion",
      {
        method: "PUT",
        body: JSON.stringify({
          answers: {
            ...answers,
            available_cash: { cents: -1, confidence: "confirmed" },
          },
          status: "completed",
        }),
        headers: { "content-type": "application/json" },
      },
    );

    const response = await PUT(request);

    expect(response.status).toBe(400);
    expect(saveHouseholdRunwayPlan).not.toHaveBeenCalled();
  });
});
