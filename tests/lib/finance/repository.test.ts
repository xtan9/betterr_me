import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import {
  appendRunwaySnapshot,
  saveHouseholdRunwayPlan,
} from "@/lib/finance/repository";
import { createDefaultRunwayAnswers } from "@/lib/finance/cushion";

function assessment() {
  const answers = createDefaultRunwayAnswers(
    new Date("2026-07-26T00:00:00.000Z"),
  );
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
  const outcome = assessHouseholdRunway({ answers });
  if (!outcome.success) throw new Error("test assessment should be valid");
  return outcome;
}

describe("household runway repository", () => {
  it("persists the complete assessment as the latest saved result", async () => {
    const outcome = assessment();
    const baseline = outcome.firstScenario.baseline;
    const upsert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({
          data: {
            id: "plan-a",
            user_id: "user-a",
            liquid_resources_cents: baseline.starting_resources_cents,
            monthly_essential_expenses_cents:
              baseline.interruption_expenses_cents,
            monthly_continuing_income_cents:
              baseline.continuing_monthly_income_cents,
            answers: outcome.answers,
            latest_result: outcome,
            model_version: "4.0.0",
            status: "completed",
            created_at: "2026-07-26T00:00:00.000Z",
            updated_at: "2026-07-26T00:00:00.000Z",
          },
          error: null,
        }),
      }),
    });
    const supabase = {
      from: vi.fn(() => ({ upsert })),
    } as unknown as SupabaseClient;

    await saveHouseholdRunwayPlan(supabase, "user-a", {
      assessment: outcome,
      status: "completed",
      attribution: {},
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ latest_result: outcome }),
      { onConflict: "user_id" },
    );
  });

  it("persists the complete assessment in snapshots", async () => {
    const outcome = assessment();
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = {
      from: vi.fn(() => ({ upsert })),
    } as unknown as SupabaseClient;

    await appendRunwaySnapshot(supabase, {
      planId: "plan-a",
      userId: "user-a",
      actionId: "action-a",
      trigger: "updated",
      assessment: outcome,
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ result: outcome }),
      { onConflict: "plan_id,action_id", ignoreDuplicates: true },
    );
  });
});
