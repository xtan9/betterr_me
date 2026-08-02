import {
  HOUSEHOLD_RUNWAY_ANALYTICS_ATTRIBUTION_KEYS,
  type HouseholdRunwayAnalyticsAttribution,
  type HouseholdRunwayAnalyticsEventKind,
  type HouseholdRunwayAnalyticsStage,
} from "@/lib/finance/household-runway-analytics";
import { normalizeRunwayLocale } from "@/lib/finance/runway-regions";

const RUNWAY_ANALYTICS_SESSION_KEY = "betterr.household-runway.analytics-session";

function attributionValue(value: string | null, maxLength: number) {
  const normalized = value?.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

function analyticsLocale() {
  if (typeof document === "undefined") return "en" as const;
  return normalizeRunwayLocale(document.documentElement.lang || "en");
}

/** Return only approved, non-financial campaign metadata from the URL. */
export function runwayAttribution(): HouseholdRunwayAnalyticsAttribution {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const values: HouseholdRunwayAnalyticsAttribution = {
    video: attributionValue(params.get("video"), 120),
    campaign: attributionValue(params.get("campaign"), 120),
    cta: attributionValue(params.get("cta"), 120),
    landing_variant: attributionValue(params.get("variant"), 120),
    language: analyticsLocale(),
  };

  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as HouseholdRunwayAnalyticsAttribution;
}

export async function trackRunwayEvent(
  eventName: HouseholdRunwayAnalyticsEventKind,
  stage?: HouseholdRunwayAnalyticsStage,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    let sessionId = window.sessionStorage.getItem(RUNWAY_ANALYTICS_SESSION_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      window.sessionStorage.setItem(RUNWAY_ANALYTICS_SESSION_KEY, sessionId);
    }
    const response = await fetch("/api/finance/cushion/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action_id: crypto.randomUUID(),
        session_id: sessionId,
        event_name: eventName,
        step_id: stage,
        locale: analyticsLocale(),
        attribution: runwayAttribution(),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export { HOUSEHOLD_RUNWAY_ANALYTICS_ATTRIBUTION_KEYS };
