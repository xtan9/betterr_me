"use client";

/** Asset entry presentation using Runtime-owned facts. */

import type { ReactNode } from "react";

import { useTranslations } from "next-intl";

import type {
  HouseholdRunwayInterviewRuntimeScreen,
  HouseholdRunwayInterviewIntent,
} from "@/lib/finance/household-runway-interview-runtime";

import { ToggleMoneyCard } from "./household-runway-fields";

const ASSET_KEYS = [
  "liquid_investments",
  "illiquid_investments",
  "home_equity",
  "retirement_tax_deferred",
  "retirement_tax_free",
] as const;

type HouseholdRunwayAssetsRenderModel = Extract<
  HouseholdRunwayInterviewRuntimeScreen,
  { kind: "assets" }
>;

export function AssetsStep({
  title,
  t,
  model,
  dispatchInterviewCommand,
}: {
  title: ReactNode;
  t: ReturnType<typeof useTranslations>;
  model: HouseholdRunwayAssetsRenderModel;
  dispatchInterviewCommand: (input: HouseholdRunwayInterviewIntent) => unknown;
}) {
  const currency = model.location.currency ?? "USD";
  const country = model.location.country ?? "US";
  return (
    <>
      {title}
      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {ASSET_KEYS.map((key) => {
          const asset = model.assets[key];
          return (
            <ToggleMoneyCard
              key={key}
              title={t(`assets.${key}.title`)}
              description={t(`assets.${key}.description`, { country: t(`countries.${country}`) })}
              badge={t(`assets.${key}.${key === "liquid_investments" ? "included" : "excluded"}`)}
              enabled={asset.confidence !== "skipped"}
              currency={currency}
              value={asset.cents}
              onEnabled={(enabled) =>
                dispatchInterviewCommand({
                  type: "set_asset",
                  asset: key,
                  value: {
                    cents: enabled ? asset.cents : 0,
                    confidence: enabled ? "confirmed" : "skipped",
                  },
                })
              }
              onChange={(value) =>
                dispatchInterviewCommand({
                  type: "set_asset",
                  asset: key,
                  value: { cents: value, confidence: "confirmed" },
                })
              }
            />
          );
        })}
      </div>
    </>
  );
}
