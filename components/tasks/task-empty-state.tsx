"use client";

import { useTranslations } from "next-intl";
import { ClipboardList, Search, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

type EmptyStateVariant = "no_tasks" | "no_results" | "all_complete";

interface TaskEmptyStateProps {
  variant: EmptyStateVariant;
  onCreateTask?: () => void;
}

const VARIANT_CONFIG = {
  no_tasks: {
    icon: ClipboardList,
    titleKey: "noTasks.title",
    descriptionKey: "noTasks.description",
    ctaKey: "noTasks.cta",
    iconColorClass: "text-primary",
  },
  no_results: {
    icon: Search,
    titleKey: "noResults.title",
    descriptionKey: "noResults.description",
    ctaKey: null,
    iconColorClass: "text-muted-foreground",
  },
  all_complete: {
    icon: PartyPopper,
    titleKey: "allComplete.title",
    descriptionKey: "allComplete.description",
    ctaKey: null,
    iconColorClass: "text-status-warning",
  },
} as const;

const ICON_BG_CLASS: Record<string, string> = {
  all_complete: "bg-status-warning/20",
  no_tasks: "bg-primary/10",
};

export function TaskEmptyState({ variant, onCreateTask }: TaskEmptyStateProps) {
  const t = useTranslations("tasks.empty");
  const config = VARIANT_CONFIG[variant];
  const showCta = config.ctaKey && onCreateTask;

  return (
    <EmptyState
      icon={config.icon}
      title={t(config.titleKey)}
      description={t(config.descriptionKey)}
      iconColorClass={config.iconColorClass}
      iconBgClass={ICON_BG_CLASS[variant]}
      variant={variant === "all_complete" ? "celebration" : "default"}
      action={
        showCta ? (
          <Button
            onClick={onCreateTask}
            className="bg-primary hover:bg-primary/90"
          >
            {t(config.ctaKey!)}
          </Button>
        ) : undefined
      }
    />
  );
}
