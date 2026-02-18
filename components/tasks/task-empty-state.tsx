"use client";

import { useTranslations } from "next-intl";
import { ClipboardList, Search, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    iconColorClass: "text-slate-400",
  },
  all_complete: {
    icon: PartyPopper,
    titleKey: "allComplete.title",
    descriptionKey: "allComplete.description",
    ctaKey: null,
    iconColorClass: "text-amber-500",
  },
} as const;

export function TaskEmptyState({ variant, onCreateTask }: TaskEmptyStateProps) {
  const t = useTranslations("tasks.empty");
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  const showCta = config.ctaKey && onCreateTask;

  return (
    <div
      data-testid="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-4",
        variant === "all_complete" &&
          "bg-gradient-to-b from-amber-50/50 to-transparent rounded-xl"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center size-16 rounded-full mb-4",
          variant === "all_complete"
            ? "bg-amber-100"
            : variant === "no_tasks"
              ? "bg-primary/10"
              : "bg-slate-100"
        )}
      >
        <Icon className={cn("size-8", config.iconColorClass)} />
      </div>

      <h3 className="text-lg font-semibold text-foreground mb-2">
        {t(config.titleKey)}
      </h3>

      <p className="text-sm text-muted-foreground max-w-xs">
        {t(config.descriptionKey)}
      </p>

      {showCta && (
        <Button
          onClick={onCreateTask}
          className="mt-6 bg-primary hover:bg-primary/90"
        >
          {t(config.ctaKey!)}
        </Button>
      )}
    </div>
  );
}
