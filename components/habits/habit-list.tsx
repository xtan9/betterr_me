"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { HabitCard } from "./habit-card";
import { HabitEmptyState } from "./habit-empty-state";
import { GraduationNudgeBanner } from "./graduation-nudge-banner";
import { FormedHabitCard } from "./formed-habit-card";
import { GraduateDialog } from "./graduate-dialog";
import { ReactivateDialog } from "./reactivate-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useCategories } from "@/lib/hooks/use-categories";
import { log } from "@/lib/logger";
import type { HabitWithTodayStatus } from "@/lib/db/types";

interface HabitListProps {
  habits: HabitWithTodayStatus[];
  onToggle: (habitId: string) => Promise<void>;
  onHabitClick: (habitId: string) => void;
  togglingHabitIds?: Set<string>;
  onMutate?: () => void | Promise<unknown>;
}

type StatusTab = "active" | "paused" | "formed";

export function HabitList({
  habits,
  onToggle,
  onHabitClick,
  togglingHabitIds,
  onMutate,
}: HabitListProps) {
  const t = useTranslations("habits.list");
  const tHabits = useTranslations("habits");
  const { categories } = useCategories();
  const [activeTab, setActiveTab] = useState<StatusTab>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [graduateTarget, setGraduateTarget] =
    useState<HabitWithTodayStatus | null>(null);
  const [reactivateTarget, setReactivateTarget] =
    useState<HabitWithTodayStatus | null>(null);

  // Count habits by status
  const counts = useMemo(() => {
    return {
      active: habits.filter((h) => h.status === "active").length,
      paused: habits.filter((h) => h.status === "paused").length,
      formed: habits.filter((h) => h.status === "formed").length,
    };
  }, [habits]);

  // Filter habits by status and search
  const filteredHabits = useMemo(() => {
    let filtered = habits.filter((h) => h.status === activeTab);

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter((h) => h.name.toLowerCase().includes(query));
    }

    return filtered;
  }, [habits, activeTab, debouncedSearch]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as StatusTab);
    setSearchQuery(""); // Clear search on tab change
  }, []);

  const handleDismissNudge = useCallback(
    async (habitId: string) => {
      try {
        const res = await fetch(
          `/api/habits/${habitId}/dismiss-graduation-nudge`,
          { method: "POST" },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
      } catch (err) {
        log.error("[habits] dismiss-graduation-nudge", err, { habitId });
        toast.error(tHabits("graduate.dismiss_error"));
      } finally {
        await onMutate?.();
      }
    },
    [onMutate, tHabits],
  );

  const confirmGraduate = useCallback(async () => {
    if (!graduateTarget) return;
    const habitId = graduateTarget.id;
    try {
      const res = await fetch(`/api/habits/${habitId}/graduate`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      toast.success(tHabits("graduate.success_toast"));
    } catch (err) {
      log.error("[habits] graduate", err, { habitId });
      toast.error(tHabits("graduate.error_toast"));
    } finally {
      await onMutate?.();
    }
  }, [graduateTarget, onMutate, tHabits]);

  const confirmReactivate = useCallback(async () => {
    if (!reactivateTarget) return;
    const habitId = reactivateTarget.id;
    try {
      const res = await fetch(`/api/habits/${habitId}/reactivate`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      toast.success(tHabits("reactivate.success_toast"));
    } catch (err) {
      log.error("[habits] reactivate", err, { habitId });
      toast.error(tHabits("reactivate.error_toast"));
    } finally {
      await onMutate?.();
    }
  }, [reactivateTarget, onMutate, tHabits]);

  const handleDeleteFormed = useCallback(
    async (habitId: string) => {
      if (!window.confirm(tHabits("formed_gallery.confirm_delete"))) return;
      try {
        const res = await fetch(`/api/habits/${habitId}`, { method: "DELETE" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        toast.success(tHabits("formed_gallery.delete_success"));
      } catch (err) {
        log.error("[habits] delete-formed", err, { habitId });
        toast.error(tHabits("formed_gallery.delete_error"));
      } finally {
        await onMutate?.();
      }
    },
    [onMutate, tHabits],
  );

  // Determine empty state variant
  const getEmptyStateVariant = () => {
    if (habits.length === 0) return "no_habits";
    if (debouncedSearch && filteredHabits.length === 0) return "no_results";
    if (activeTab === "paused" && filteredHabits.length === 0)
      return "no_paused";
    if (activeTab === "formed" && filteredHabits.length === 0)
      return "no_formed";
    return null;
  };

  const emptyStateVariant = getEmptyStateVariant();

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <TabsList>
            <TabsTrigger value="active">
              {t("tabs.active")} ({counts.active})
            </TabsTrigger>
            <TabsTrigger value="paused">
              {t("tabs.paused")} ({counts.paused})
            </TabsTrigger>
            <TabsTrigger value="formed">
              {t("tabs.formed")} ({counts.formed})
            </TabsTrigger>
          </TabsList>

          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full sm:w-64"
            />
          </div>
        </div>

        <TabsContent value={activeTab} className="mt-6">
          {emptyStateVariant ? (
            <HabitEmptyState
              variant={emptyStateVariant}
              searchQuery={debouncedSearch}
            />
          ) : activeTab === "formed" ? (
            <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
              {filteredHabits.map((habit) => (
                <FormedHabitCard
                  key={habit.id}
                  habit={habit}
                  onReactivate={(id) => {
                    const target = habits.find((h) => h.id === id);
                    if (target) setReactivateTarget(target);
                  }}
                  onDelete={handleDeleteFormed}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
              {filteredHabits.map((habit) => (
                <div key={habit.id} className="contents">
                  {activeTab === "active" &&
                    habit.graduation_eligible &&
                    habit.status === "active" && (
                      <div className="col-span-full">
                        <GraduationNudgeBanner
                          habitId={habit.id}
                          onGraduate={(id) => {
                            const target = habits.find((h) => h.id === id);
                            if (target) setGraduateTarget(target);
                          }}
                          onDismiss={handleDismissNudge}
                        />
                      </div>
                    )}
                  <HabitCard
                    habit={habit}
                    categories={categories}
                    onToggle={() => onToggle(habit.id)}
                    onClick={() => onHabitClick(habit.id)}
                    isToggling={togglingHabitIds?.has(habit.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {graduateTarget && (
        <GraduateDialog
          open={!!graduateTarget}
          onOpenChange={(open) => !open && setGraduateTarget(null)}
          habitName={graduateTarget.name}
          onConfirm={confirmGraduate}
        />
      )}
      {reactivateTarget && (
        <ReactivateDialog
          open={!!reactivateTarget}
          onOpenChange={(open) => !open && setReactivateTarget(null)}
          habitName={reactivateTarget.name}
          bestStreak={reactivateTarget.best_streak}
          onConfirm={confirmReactivate}
        />
      )}
    </div>
  );
}
