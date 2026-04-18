"use client";

import { useTranslations } from "next-intl";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  habitId: string;
  onGraduate: (habitId: string) => void;
  onDismiss: (habitId: string) => void;
}

export function GraduationNudgeBanner({ habitId, onGraduate, onDismiss }: Props) {
  const t = useTranslations("habits");
  return (
    <div
      role="region"
      aria-label={t("graduate.nudge_title")}
      className="mb-2 flex flex-col gap-2 rounded-control border bg-primary/5 p-3 text-body sm:flex-row sm:items-start"
    >
      <GraduationCap className="size-5 shrink-0 text-status-warning" aria-hidden="true" />
      <div className="flex-1">
        <div className="font-medium">{t("graduate.nudge_title")}</div>
        <p className="text-muted-foreground">{t("graduate.nudge_body")}</p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDismiss(habitId)}
        >
          {t("graduate.nudge_dismiss")}
        </Button>
        <Button size="sm" onClick={() => onGraduate(habitId)}>
          {t("graduate.nudge_cta")}
        </Button>
      </div>
    </div>
  );
}
