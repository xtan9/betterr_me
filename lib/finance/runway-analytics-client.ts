const RUNWAY_ANALYTICS_SESSION_KEY = "betterr.household-runway.analytics-session";

export function runwayAttribution() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return {
    video: params.get("video") ?? undefined,
    campaign: params.get("campaign") ?? undefined,
    cta: params.get("cta") ?? undefined,
    landing_variant: params.get("variant") ?? undefined,
    language: document.documentElement.lang,
  };
}

export function trackRunwayEvent(eventName: string, stepId?: string) {
  if (typeof window === "undefined") return;
  let sessionId = window.sessionStorage.getItem(RUNWAY_ANALYTICS_SESSION_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.sessionStorage.setItem(RUNWAY_ANALYTICS_SESSION_KEY, sessionId);
  }
  void fetch("/api/finance/cushion/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action_id: crypto.randomUUID(),
      session_id: sessionId,
      event_name: eventName,
      step_id: stepId,
      locale: document.documentElement.lang,
      attribution: runwayAttribution(),
    }),
  }).catch(() => undefined);
}
