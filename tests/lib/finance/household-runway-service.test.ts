import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHouseholdRunwayService } from "@/lib/finance/household-runway-service";
import { createDefaultRunwayAnswers } from "@/lib/finance/cushion";
import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import { createHouseholdRunwayPlan } from "@/lib/finance/household-runway-plan";
import {
  commitHouseholdRunwayPlan,
  getHouseholdRunwayPlan,
  getRunwaySnapshots,
} from "@/lib/finance/repository";

vi.mock("@/lib/finance/repository", () => ({
  commitHouseholdRunwayPlan: vi.fn(),
  getHouseholdRunwayPlan: vi.fn(),
  getRunwaySnapshots: vi.fn(),
}));

describe("Household Runway service reads", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the domain Plan and assessment history without a persistence view", async () => {
    const plan = { revision: 7, inputs: { region: "CA" } };
    const snapshots = [{ id: "snapshot-1", trigger: "completed" }];
    vi.mocked(getHouseholdRunwayPlan).mockResolvedValue(plan as never);
    vi.mocked(getRunwaySnapshots).mockResolvedValue(snapshots as never);

    await expect(
      createHouseholdRunwayService({} as never).load("owner-1"),
    ).resolves.toEqual({ plan, snapshots });
    expect(getHouseholdRunwayPlan).toHaveBeenCalledWith({}, "owner-1");
    expect(getRunwaySnapshots).toHaveBeenCalledWith({}, "owner-1");
  });

  it("preserves a missing Plan as null while still returning history", async () => {
    vi.mocked(getHouseholdRunwayPlan).mockResolvedValue(null);
    vi.mocked(getRunwaySnapshots).mockResolvedValue([]);

    await expect(
      createHouseholdRunwayService({} as never).load("owner-1"),
    ).resolves.toEqual({ plan: null, snapshots: [] });
  });

  it("assesses and commits a domain Plan without exposing persistence fields", async () => {
    const answers = createDefaultRunwayAnswers(new Date("2026-07-26T00:00:00.000Z"));
    answers.region = "CA";
    answers.mine = {
      ...answers.mine,
      employment: "unemployed",
      entered_as: "net",
      take_home_source: "user_confirmed",
      confidence: "confirmed",
    };
    answers.available_cash = { cents: 3_000_000, confidence: "confirmed" };
    answers.expense_mode = "quick";
    answers.quick_expenses = {
      current_monthly_cents: 600_000,
      interruption_monthly_cents: 600_000,
      confidence: "confirmed",
    };
    const plan = createHouseholdRunwayPlan({ revision: 2, inputs: answers });
    if (!plan) throw new Error("test Plan should be valid");
    const assessment = assessHouseholdRunway({ answers });
    if (!assessment.success) throw new Error("test assessment should be valid");
    vi.mocked(commitHouseholdRunwayPlan).mockResolvedValue({
      success: true,
      replayed: false,
      revision: 3,
      plan: { revision: 3, inputs: answers },
      assessment,
      snapshot: { id: "snapshot-1", trigger: "completed" } as never,
      snapshots: [],
    });

    await expect(
      createHouseholdRunwayService({} as never).commit({
        plan,
        adjustments: {
          expense_reduction_cents: 0,
          added_cash_cents: 0,
          added_monthly_income_cents: 0,
          expected_unconfirmed_funds_cents: 0,
          usable_illiquid_investments_cents: 0,
          usable_retirement_tax_deferred_cents: 0,
          usable_retirement_tax_free_cents: 0,
        },
        status: "completed",
        attribution: {},
        idempotencyKey: "74a303ae-1ba3-4ab5-beb9-5317eb94c790",
        snapshotActionId: "74a303ae-1ba3-4ab5-beb9-5317eb94c790",
        snapshotTrigger: "completed",
      }),
    ).resolves.toMatchObject({ success: true, plan: { revision: 3 } });
    expect(commitHouseholdRunwayPlan).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ plan, assessment }),
    );
  });
});
