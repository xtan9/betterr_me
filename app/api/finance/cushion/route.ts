import { NextRequest, NextResponse } from "next/server";
import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { createHouseholdRunwayService } from "@/lib/finance/household-runway-service";
import { validateRequestBody } from "@/lib/validations/api";
import { financeCushionPlanSchema } from "@/lib/validations/finance-cushion";
import { log } from "@/lib/logger";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const WRITE_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "write",
} as const satisfies AuthenticatedRequestPolicy;

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }
    return NextResponse.json(
      await createHouseholdRunwayService(auth.client).load(
        auth.principal.userId,
      ),
    );
  } catch (error) {
    log.error("[household-runway] GET failed", error);
    return NextResponse.json(
      { error: "Failed to fetch runway" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
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
      financeCushionPlanSchema,
    );
    if (!validation.success) return validation.response;
    const result = await createHouseholdRunwayService(auth.client).save(
      auth.principal.userId,
      validation.data,
    );
    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid household runway assessment",
          issues: result.validationIssues,
        },
        { status: 400 },
      );
    }
    return NextResponse.json({
      cushion: result.cushion,
      snapshots: result.snapshots,
    });
  } catch (error) {
    log.error("[household-runway] PUT failed", error);
    return NextResponse.json(
      { error: "Failed to save runway" },
      { status: 500 },
    );
  }
}

export const POST = PUT;
