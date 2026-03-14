"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money/arithmetic";
import type { DetectedIncome } from "@/lib/db/types";

interface IncomeConfirmationProps {
  detectedIncome: DetectedIncome[];
  onConfirm: (income: {
    merchant_name: string;
    amount_cents: number;
    frequency: string;
    next_expected_date: string;
  }) => Promise<void>;
  onDismiss: () => void;
}

/** Map frequency code to a human-friendly label key */
function getFrequencyLabelKey(frequency: string): string {
  switch (frequency) {
    case "WEEKLY":
      return "frequencyWeekly";
    case "BIWEEKLY":
      return "frequencyBiweekly";
    case "SEMI_MONTHLY":
      return "frequencySemiMonthly";
    case "MONTHLY":
      return "frequencyMonthly";
    default:
      return "frequencyMonthly";
  }
}

/**
 * One-time income confirmation prompt.
 * Shows when recurring deposits are detected but not yet confirmed.
 * User confirms or dismisses; confirmed income feeds into projections.
 */
export function IncomeConfirmation({
  detectedIncome,
  onConfirm,
  onDismiss,
}: IncomeConfirmationProps) {
  const t = useTranslations("money.dashboard");
  const [confirming, setConfirming] = useState<string | null>(null);

  if (detectedIncome.length === 0) return null;

  // Show top 1-2 highest confidence patterns
  const topPatterns = detectedIncome
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 2);

  const handleConfirm = async (pattern: DetectedIncome) => {
    setConfirming(pattern.merchant_name);
    try {
      await onConfirm({
        merchant_name: pattern.merchant_name,
        amount_cents: pattern.amount_cents,
        frequency: pattern.frequency,
        next_expected_date: pattern.next_predicted,
      });
    } finally {
      setConfirming(null);
    }
  };

  return (
    <Card className="border-money-amber bg-money-surface">
      <CardHeader>
        <CardTitle className="text-base text-money-amber-foreground">
          {t("incomeDetectedTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {topPatterns.map((pattern) => {
          const frequencyKey = getFrequencyLabelKey(pattern.frequency);
          return (
            <div key={pattern.merchant_name} className="space-y-2">
              <p className="text-sm">
                {t("incomePatternDescription", {
                  amount: formatMoney(pattern.amount_cents),
                  merchant: pattern.merchant_name,
                  frequency: t(frequencyKey),
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("incomeConfirmQuestion")}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleConfirm(pattern)}
                  disabled={confirming !== null}
                >
                  {confirming === pattern.merchant_name
                    ? t("confirming")
                    : t("confirmIncome")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onDismiss}
                  disabled={confirming !== null}
                >
                  {t("notQuite")}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
