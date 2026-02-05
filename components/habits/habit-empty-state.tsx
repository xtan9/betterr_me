"use client";

import { useTranslations } from "next-intl";
import { ClipboardList, PartyPopper, Search, Pause, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateVariant =
  | "no_habits"
  | "all_complete"
  | "no_results"
  | "no_paused"
  | "no_archived";

interface HabitEmptyStateProps {
  variant: EmptyStateVariant;
  searchQuery?: string;
  onCreateHabit?: () => void;
}

const VARIANT_CONFIG = {
  no_habits: {
    icon: ClipboardList,
    titleKey: "noHabits.title",
    descriptionKey: "noHabits.description",
    ctaKey: "noHabits.cta",
    iconColorClass: "text-emerald-500",
  },
  all_complete: {
    icon: PartyPopper,
    titleKey: "allComplete.title",
    descriptionKey: "allComplete.description",
    ctaKey: null,
    iconColorClass: "text-amber-500",
  },
  no_results: {
    icon: Search,
    titleKey: "noResults.title",
    descriptionKey: "noResults.description",
    ctaKey: null,
    iconColorClass: "text-slate-400",
  },
  no_paused: {
    icon: Pause,
    titleKey: "noPaused.title",
    descriptionKey: "noPaused.description",
    ctaKey: null,
    iconColorClass: "text-slate-400",
  },
  no_archived: {
    icon: Archive,
    titleKey: "noArchived.title",
    descriptionKey: "noArchived.description",
    ctaKey: null,
    iconColorClass: "text-slate-400",
  },
} as const;

export function HabitEmptyState({
  variant,
  searchQuery,
  onCreateHabit,
}: HabitEmptyStateProps) {
  const t = useTranslations("habits.empty");
  const config = VARIANT_CONFIG[variant];
  const Icon = config.icon;

  const title =
    variant === "no_results"
      ? t(config.titleKey, { query: searchQuery ?? "" })
      : t(config.titleKey);

  const showCta = config.ctaKey && onCreateHabit;

  return (
    <div
      data-testid="empty-state"
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-4",
        variant === "all_complete" && "bg-gradient-to-b from-amber-50/50 to-transparent rounded-xl"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center size-16 rounded-full mb-4",
          variant === "all_complete"
            ? "bg-amber-100"
            : variant === "no_habits"
            ? "bg-emerald-100"
            : "bg-slate-100"
        )}
      >
        <Icon className={cn("size-8", config.iconColorClass)} />
      </div>

      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>

      <p className="text-sm text-muted-foreground max-w-xs">
        {t(config.descriptionKey)}
      </p>

      {showCta && (
        <Button
          onClick={onCreateHabit}
          className="mt-6 bg-emerald-500 hover:bg-emerald-600"
        >
          {t(config.ctaKey!)}
        </Button>
      )}
    </div>
  );
}
