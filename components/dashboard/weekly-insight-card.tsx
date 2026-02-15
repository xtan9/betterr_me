"use client";

import { useTranslations } from "next-intl";
import { Brain, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface WeeklyInsight {
  type: string;
  message: string;
  params: Record<string, string | number>;
  priority: number;
}

interface WeeklyInsightCardProps {
  insights: WeeklyInsight[];
  onDismiss: () => void;
}

export function WeeklyInsightCard({ insights, onDismiss }: WeeklyInsightCardProps) {
  const t = useTranslations("dashboard.insight");

  if (insights.length === 0) return null;

  const topInsight = insights[0];

  return (
    <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
      <CardContent className="flex items-start gap-3 p-4">
        <Brain className="size-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-0.5">
            {t("title")}
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            {t(topInsight.message, topInsight.params)}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="shrink-0 h-7 w-7 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900"
          aria-label={t("dismiss")}
        >
          <X className="size-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
