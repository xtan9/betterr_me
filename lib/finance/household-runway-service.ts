import type { SupabaseClient } from "@supabase/supabase-js";

import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import {
  commitHouseholdRunwayPlan,
  getHouseholdRunwayPlan,
  getRunwaySnapshots,
} from "@/lib/finance/household-runway-repository";
import type { RunwayAdjustments } from "@/lib/finance/cushion";
import type { HouseholdRunwayPlan } from "@/lib/finance/household-runway-plan";

export interface HouseholdRunwayPlanCommitInput {
  plan: HouseholdRunwayPlan;
  adjustments: RunwayAdjustments;
  status: "completed";
  attribution: Record<string, string | undefined>;
  idempotencyKey: string;
  snapshotActionId: string;
  snapshotTrigger: "completed" | "updated" | "imported";
}

export function createHouseholdRunwayService(client: SupabaseClient) {
  return {
    async load(userId: string) {
      const [plan, snapshots] = await Promise.all([
        getHouseholdRunwayPlan(client, userId),
        getRunwaySnapshots(client, userId),
      ]);
      return { plan, snapshots };
    },

    async commit(input: HouseholdRunwayPlanCommitInput) {
      const assessment = assessHouseholdRunway({
        answers: input.plan.inputs,
        adjustments: input.adjustments,
        startDate: new Date(input.plan.inputs.updated_at),
      });
      if (!assessment.success) return assessment;

      return commitHouseholdRunwayPlan(client, {
        plan: input.plan,
        adjustments: input.adjustments,
        status: input.status,
        attribution: input.attribution,
        idempotencyKey: input.idempotencyKey,
        snapshotActionId: input.snapshotActionId,
        snapshotTrigger: input.snapshotTrigger,
        assessment,
      });
    },
  };
}
