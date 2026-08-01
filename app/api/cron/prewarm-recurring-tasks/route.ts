import { NextRequest, NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron/auth";
import { log } from "@/lib/logger";
import { prewarmActiveRecurringTaskCoverage } from "@/lib/recurring-tasks/prewarming";
import { createSupabaseRecurringTaskLifecycle } from "@/lib/recurring-tasks/supabase-lifecycle";
import { errorType } from "@/lib/recurring-tasks/observability";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/prewarm-recurring-tasks
 *
 * Optional scheduled maintenance. It only asks the lifecycle for Active
 * Series and materializes a bounded future horizon; date-bounded reads remain
 * responsible for their own correctness horizon.
 */
export async function GET(request: NextRequest) {
  const authorization = authorizeCronRequest(request.headers.get("Authorization"));
  if (!authorization.ok) {
    if (authorization.status === 500) {
      log.error("[recurring-prewarm] cron secret is not configured");
    }
    return NextResponse.json(
      { error: authorization.error },
      { status: authorization.status },
    );
  }

  try {
    const lifecycle = createSupabaseRecurringTaskLifecycle(createAdminClient());
    const result = await prewarmActiveRecurringTaskCoverage(lifecycle);
    return NextResponse.json({
      status: result.status,
      type: result.type,
      series_count: result.seriesCount,
      warmed_series_count: result.warmedSeriesCount,
      skipped_series_count: result.skippedSeriesCount,
      failed_series_ids: result.failedSeriesIds,
      attempts: result.attempts,
    });
  } catch (error) {
    log.error("[recurring-prewarm] failed", undefined, {
      errorType: errorType(error),
    });
    return NextResponse.json(
      { error: "Recurring task prewarming failed" },
      { status: 500 },
    );
  }
}
