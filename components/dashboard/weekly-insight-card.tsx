"use client";

import { useTranslations } from "next-intl";
import { Brain, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { WeeklyInsight } from "@/lib/db/insights";

interface WeeklyInsightCardProps {
  insights: WeeklyInsight[];
  onDismiss: () => void;
}

export function WeeklyInsightCard({ insights, onDismiss }: WeeklyInsightCardProps) {
  const t = useTranslations("dashboard.insight");

  if (insights.length === 0) return null;

  const topInsight = insights[0];

  return (
    <Card className="bg-gradient-to-r from-info-card to-info-card-to border-info-card-border">
      <CardContent className="flex items-start gap-3 p-4">
        <Brain className="size-5 text-info-card-icon mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-info-card-text mb-0.5">
            {t("title")}
          </p>
          <p className="text-sm text-info-card-text-secondary">
            {t(topInsight.message, topInsight.params)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="shrink-0 h-7 w-7 p-0 text-info-card-button hover:text-info-card-button-hover hover:bg-info-card-button-hover-bg"
          aria-label={t("dismiss")}
        >
          <X className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
