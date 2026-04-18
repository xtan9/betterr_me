"use client";

import { useTranslations } from "next-intl";
import { ClipboardList, PartyPopper, Search, Pause, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

type EmptyStateVariant =
  | "no_habits"
  | "all_complete"
  | "no_results"
  | "no_paused"
  | "no_formed";

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
    iconColorClass: "text-primary",
  },
  all_complete: {
    icon: PartyPopper,
    titleKey: "allComplete.title",
    descriptionKey: "allComplete.description",
    ctaKey: null,
    iconColorClass: "text-status-warning",
  },
  no_results: {
    icon: Search,
    titleKey: "noResults.title",
    descriptionKey: "noResults.description",
    ctaKey: null,
    iconColorClass: "text-muted-foreground",
  },
  no_paused: {
    icon: Pause,
    titleKey: "noPaused.title",
    descriptionKey: "noPaused.description",
    ctaKey: null,
    iconColorClass: "text-muted-foreground",
  },
  no_formed: {
    icon: GraduationCap,
    titleKey: "noFormed.title",
    descriptionKey: "noFormed.description",
    ctaKey: null,
    iconColorClass: "text-status-warning",
  },
} as const;

const ICON_BG_CLASS: Record<string, string> = {
  all_complete: "bg-status-warning/20",
  no_habits: "bg-primary/10",
};

export function HabitEmptyState({
  variant,
  searchQuery,
  onCreateHabit,
}: HabitEmptyStateProps) {
  const t = useTranslations("habits.empty");
  const config = VARIANT_CONFIG[variant];

  const title =
    variant === "no_results"
      ? t(config.titleKey, { query: searchQuery ?? "" })
      : t(config.titleKey);

  const showCta = config.ctaKey && onCreateHabit;

  return (
    <EmptyState
      icon={config.icon}
      title={title}
      description={t(config.descriptionKey)}
      iconColorClass={config.iconColorClass}
      iconBgClass={ICON_BG_CLASS[variant]}
      variant={variant === "all_complete" ? "celebration" : "default"}
      action={
        showCta ? (
          <Button
            onClick={onCreateHabit}
            className="bg-primary hover:bg-primary/90"
          >
            {t(config.ctaKey!)}
          </Button>
        ) : undefined
      }
    />
  );
}
