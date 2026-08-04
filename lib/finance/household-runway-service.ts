import type { SupabaseClient } from "@supabase/supabase-js";

import { assessHouseholdRunway } from "@/lib/finance/household-runway-assessment";
import {
  commitHouseholdRunwayPlan,
  getHouseholdRunwayPlan,
  getRunwaySnapshots,
} from "@/lib/finance/repository";
import type {
  FinanceCushionCommitInput,
} from "@/lib/validations/finance-cushion";

export function createHouseholdRunwayService(client: SupabaseClient) {
  return {
    async load(userId: string) {
      const [plan, snapshots] = await Promise.all([
        getHouseholdRunwayPlan(client, userId),
        getRunwaySnapshots(client, userId),
      ]);
      return { plan, snapshots };
    },

    async commit(input: FinanceCushionCommitInput) {
      const assessment = assessHouseholdRunway({
        answers: input.answers,
        adjustments: input.adjustments,
        startDate: new Date(input.answers.updated_at),
      });
      if (!assessment.success) return assessment;

      return commitHouseholdRunwayPlan(client, {
        answers: input.answers,
        adjustments: input.adjustments,
        status: input.status,
        attribution: input.attribution,
        idempotencyKey: input.idempotency_key,
        expectedRevision: input.expected_revision,
        snapshotActionId: input.snapshot_action_id,
        snapshotTrigger: input.snapshot_trigger,
        assessment,
      });
    },
  };
}
