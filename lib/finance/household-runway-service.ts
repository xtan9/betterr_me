import type { SupabaseClient } from "@supabase/supabase-js";

import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import {
  appendRunwaySnapshot,
  getFinanceCushion,
  getRunwaySnapshots,
  saveHouseholdRunwayPlan,
} from "@/lib/finance/repository";
import type { FinanceCushionPlanInput } from "@/lib/validations/finance-cushion";

export function createHouseholdRunwayService(client: SupabaseClient) {
  return {
    async load(userId: string) {
      const [cushion, snapshots] = await Promise.all([
        getFinanceCushion(client, userId),
        getRunwaySnapshots(client, userId),
      ]);
      return { cushion, snapshots };
    },

    async save(userId: string, input: FinanceCushionPlanInput) {
      const assessment = assessHouseholdRunway({
        answers: input.answers,
        adjustments: input.adjustments,
      });
      if (!assessment.success) return assessment;

      const cushion = await saveHouseholdRunwayPlan(client, userId, {
        assessment,
        status: input.status,
        attribution: input.attribution ?? {},
      });
      if (
        input.create_snapshot &&
        input.snapshot_action_id &&
        input.snapshot_trigger
      ) {
        await appendRunwaySnapshot(client, {
          planId: cushion.id,
          userId,
          actionId: input.snapshot_action_id,
          trigger: input.snapshot_trigger,
          assessment,
        });
      }
      const snapshots = await getRunwaySnapshots(client, userId);
      return { success: true as const, cushion, snapshots, assessment };
    },
  };
}
