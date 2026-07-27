import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createDefaultRunwayAnswers, simulateHouseholdRunway, toFinanceCushionView } from "@/lib/finance/cushion";
import { GET, PUT } from "@/app/api/finance/cushion/route";
import { createClient } from "@/lib/supabase/server";
import { appendRunwaySnapshot, getFinanceCushion, getRunwaySnapshots, saveHouseholdRunwayPlan } from "@/lib/finance/repository";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/finance/repository", () => ({ appendRunwaySnapshot: vi.fn(), getFinanceCushion: vi.fn(), getRunwaySnapshots: vi.fn(), saveHouseholdRunwayPlan: vi.fn() }));

const user = { id: "user-a" };
const mockSupabase = { auth: { getUser: vi.fn() } };

function validAnswers() {
  const answers = createDefaultRunwayAnswers(new Date("2026-07-26T00:00:00.000Z"));
  answers.region = "CA";
  answers.mine = { ...answers.mine, employment: "unemployed", entered_as: "net", take_home_source: "user_confirmed", confidence: "confirmed" };
  answers.available_cash = { cents: 3_000_000, confidence: "confirmed" };
  answers.expense_mode = "quick";
  answers.quick_expenses = { current_monthly_cents: 600_000, interruption_monthly_cents: 600_000, confidence: "confirmed" };
  return answers;
}

const answers = validAnswers();
const result = simulateHouseholdRunway(answers, "current", undefined, new Date("2026-07-26"));
const savedCushion = toFinanceCushionView({ id: "cushion-a", user_id: user.id, liquid_resources_cents: result.starting_resources_cents, monthly_essential_expenses_cents: result.interruption_expenses_cents, monthly_continuing_income_cents: result.continuing_monthly_income_cents, answers, latest_result: result, model_version: "3.0.0", status: "completed", created_at: "2026-07-26T00:00:00.000Z", updated_at: "2026-07-26T00:00:00.000Z" });

describe("/api/finance/cushion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user } });
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never);
    vi.mocked(getRunwaySnapshots).mockResolvedValue([]);
  });

  it("requires authentication", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET()).status).toBe(401);
  });

  it("reads the current plan and history for its owner", async () => {
    vi.mocked(getFinanceCushion).mockResolvedValue(savedCushion);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(getFinanceCushion).toHaveBeenCalledWith(mockSupabase, user.id);
    expect(getRunwaySnapshots).toHaveBeenCalledWith(mockSupabase, user.id);
  });

  it("recalculates on the server and creates an idempotent snapshot", async () => {
    vi.mocked(saveHouseholdRunwayPlan).mockResolvedValue(savedCushion);
    const request = new NextRequest("http://localhost:3000/api/finance/cushion", { method: "PUT", body: JSON.stringify({ answers, status: "completed", attribution: { campaign: "youtube" }, create_snapshot: true, snapshot_action_id: "74a303ae-1ba3-4ab5-beb9-5317eb94c790", snapshot_trigger: "imported" }), headers: { "content-type": "application/json" } });
    const response = await PUT(request);
    expect(response.status).toBe(200);
    expect(saveHouseholdRunwayPlan).toHaveBeenCalledWith(mockSupabase, user.id, expect.objectContaining({ answers, result: expect.objectContaining({ months_covered: 5 }) }));
    expect(appendRunwaySnapshot).toHaveBeenCalledWith(mockSupabase, expect.objectContaining({ planId: "cushion-a", userId: user.id }));
  });

  it("rejects negative values and retirement usable amounts above balances", async () => {
    const invalid = { ...answers, extreme_access: { ...answers.extreme_access, retirement_tax_free_cents: 1 } };
    const request = new NextRequest("http://localhost:3000/api/finance/cushion", { method: "PUT", body: JSON.stringify({ answers: invalid, status: "completed" }), headers: { "content-type": "application/json" } });
    expect((await PUT(request)).status).toBe(400);
    expect(saveHouseholdRunwayPlan).not.toHaveBeenCalled();
  });
});
