import { NextRequest, NextResponse } from "next/server";

import {
  authenticateRequest,
  cookieRouteErrorMessage,
} from "@/lib/auth/authenticated-request";
import type { AuthenticatedRequestPolicy } from "@/lib/auth/request-context";
import { log } from "@/lib/logger";
import {
  CALENDAR_OVERLAY_LAYERS,
  queryCalendarOverlayFeed,
  type CalendarOverlayLayer,
} from "@/lib/calendar/overlay-feed";
import { createSupabaseOverlayCapabilities } from "@/lib/calendar/supabase-overlay-feed";

const READ_REQUEST_POLICY = {
  allowedCredentials: ["cookie"],
  requiredPermission: "read",
} as const satisfies AuthenticatedRequestPolicy;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 42;

function isValidLocalDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function rangeLength(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

function validTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function unavailableLayers(
  outcome: Awaited<ReturnType<typeof queryCalendarOverlayFeed>>,
) {
  return CALENDAR_OVERLAY_LAYERS.filter((layer) =>
    outcome.unavailable.some((unavailable) => unavailable.layer === layer),
  );
}

/** GET /api/calendar/overlay-feed — selected non-event Calendar Layers. */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, READ_REQUEST_POLICY);
    if (!auth.ok) {
      return NextResponse.json(
        { error: cookieRouteErrorMessage(auth) },
        { status: auth.status },
      );
    }

    const params = request.nextUrl.searchParams;
    const startDate = params.get("start_date");
    const endDate = params.get("end_date");
    const layersParam = params.get("layers");
    const timezone = params.get("timezone");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "start_date and end_date query parameters are required" },
        { status: 400 },
      );
    }
    if (!isValidLocalDate(startDate) || !isValidLocalDate(endDate)) {
      return NextResponse.json(
        { error: "start_date and end_date must be valid YYYY-MM-DD dates" },
        { status: 400 },
      );
    }
    const days = rangeLength(startDate, endDate);
    if (days < 1 || days > MAX_RANGE_DAYS) {
      return NextResponse.json(
        { error: "The requested date range must be inclusive and no more than 42 days" },
        { status: 400 },
      );
    }
    if (timezone !== null && !validTimeZone(timezone)) {
      return NextResponse.json({ error: "timezone must be a valid IANA timezone" }, { status: 400 });
    }

    const parsedLayers = (layersParam ?? "")
      .split(",")
      .map((layer) => layer.trim())
      .filter(Boolean);
    const invalidLayers = parsedLayers.filter(
      (layer) => !CALENDAR_OVERLAY_LAYERS.includes(layer as CalendarOverlayLayer),
    );
    if (parsedLayers.length === 0) {
      return NextResponse.json(
        { error: "At least one overlay layer is required" },
        { status: 400 },
      );
    }
    if (invalidLayers.length > 0) {
      return NextResponse.json(
        { error: `Invalid overlay layers: ${invalidLayers.join(", ")}` },
        { status: 400 },
      );
    }
    const requestedLayers = CALENDAR_OVERLAY_LAYERS.filter((layer) => parsedLayers.includes(layer));

    const outcome = await queryCalendarOverlayFeed(
      {
        userId: auth.principal.userId,
        range: { from: startDate, to: endDate },
        layers: requestedLayers as CalendarOverlayLayer[],
        ...(timezone !== null ? { timezone } : {}),
      },
      createSupabaseOverlayCapabilities(auth.client),
      {
        reportFailure: ({ layer, request: safeRequest, cause }) => {
          log.error("Calendar overlay layer acquisition failed", cause, {
            layer,
            userId: safeRequest.userId,
            from: safeRequest.range.from,
            to: safeRequest.range.to,
          });
        },
      },
    );

    const body = {
      items: outcome.items,
      ...(outcome.unavailable.length > 0 && {
        unavailableLayers: unavailableLayers(outcome),
      }),
    };
    return NextResponse.json(body, { status: outcome.status === "failed" ? 503 : 200 });
  } catch (error) {
    log.error("GET /api/calendar/overlay-feed error", error);
    return NextResponse.json(
      { error: "Failed to fetch calendar overlay" },
      { status: 500 },
    );
  }
}
