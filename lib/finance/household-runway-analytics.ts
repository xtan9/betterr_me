import type { RunwayLocale } from "@/lib/finance/runway-regions";

export const HOUSEHOLD_RUNWAY_ANALYTICS_EVENT_KINDS = [
  "landing_view",
  "started",
  "skipped",
  "completed",
  "result_interaction",
  "registration_clicked",
] as const;

export type HouseholdRunwayAnalyticsEventKind =
  (typeof HOUSEHOLD_RUNWAY_ANALYTICS_EVENT_KINDS)[number];

export const HOUSEHOLD_RUNWAY_ANALYTICS_STAGES = [
  "landing",
  "new",
  "resume",
  "location",
  "household",
  "employment",
  "myIncome",
  "partnerIncome",
  "otherIncome",
  "cash",
  "assets",
  "expenses",
  "reductions",
  "review",
  "result",
  "scenario_switch",
] as const;

export type HouseholdRunwayAnalyticsStage =
  (typeof HOUSEHOLD_RUNWAY_ANALYTICS_STAGES)[number];

export const HOUSEHOLD_RUNWAY_ANALYTICS_LOCALES = [
  "en",
  "zh",
  "zh-TW",
] as const satisfies readonly RunwayLocale[];

export type HouseholdRunwayAnalyticsLocale =
  (typeof HOUSEHOLD_RUNWAY_ANALYTICS_LOCALES)[number];

export const HOUSEHOLD_RUNWAY_ANALYTICS_ATTRIBUTION_KEYS = [
  "video",
  "campaign",
  "cta",
  "landing_variant",
  "language",
] as const;

export type HouseholdRunwayAnalyticsAttributionKey =
  (typeof HOUSEHOLD_RUNWAY_ANALYTICS_ATTRIBUTION_KEYS)[number];

export type HouseholdRunwayAnalyticsAttribution = Partial<
  Record<HouseholdRunwayAnalyticsAttributionKey, string>
>;
