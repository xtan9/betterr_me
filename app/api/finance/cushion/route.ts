import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { createHouseholdRunwayService } from "@/lib/finance/household-runway-service";
import { validateRequestBody } from "@/lib/validations/api";
import { financeCushionCommitSchema } from "@/lib/validations/finance-cushion";
import { log } from "@/lib/logger";
import type { HouseholdRunwayAnswers } from "@/lib/finance/cushion";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

function toPlanWire(value: unknown) {
  if (!value || typeof value !== "object") return value;
  const plan = value as {
    revision?: unknown;
    inputs?: HouseholdRunwayAnswers;
    answers?: HouseholdRunwayAnswers;
  };
  return {
    revision: plan.revision,
    answers: plan.inputs ?? plan.answers,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const { plan, snapshots } = await createHouseholdRunwayService(auth.client).load(
      auth.principal.userId,
    );
    return NextResponse.json({
      cushion: toPlanWire(plan),
      snapshots,
    });
  } catch (error) {
    log.error("[household-runway] GET failed", error);
    return NextResponse.json(
      { error: "Failed to fetch runway" },
      { status: 500 },
    );
  }
}

async function commit(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, WRITE_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    const validation = validateRequestBody(
      await request.json(),
      financeCushionCommitSchema,
    );
    if (!validation.success) return validation.response;
    const result = await createHouseholdRunwayService(auth.client).commit({
      ...validation.data,
      attribution: validation.data.attribution ?? {},
    });
    if (!result.success) {
      if ("validationIssues" in result) {
        return NextResponse.json(
          {
            type: "validation_error",
            error: "Invalid household runway commit",
            issues: result.validationIssues,
          },
          { status: 400 },
        );
      }
      if (result.kind === "stale_revision") {
        return NextResponse.json(
          {
            type: "stale_revision_conflict",
            error: "Household Runway Plan revision is stale",
            expected_revision: result.expectedRevision,
            current_revision: result.currentRevision,
          },
          { status: 409 },
        );
      }
      if (result.kind === "idempotency_conflict") {
        return NextResponse.json(
          {
            type: "idempotency_conflict",
            error: "Idempotency key was reused for a different commit",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          type: "invalid_snapshot_trigger",
          error: result.message,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({
      status: result.replayed ? "already-applied" : "committed",
      revision: result.revision,
      plan: toPlanWire(result.plan),
      assessment: result.assessment,
      snapshot: result.snapshot,
      snapshots: result.snapshots,
    });
  } catch (error) {
    log.error("[household-runway] commit failed", error);
    return NextResponse.json(
      { error: "Failed to save runway" },
      { status: 500 },
    );
  }
}

export const PUT = commit;
export const POST = commit;
