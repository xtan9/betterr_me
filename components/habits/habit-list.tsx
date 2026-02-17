"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { HabitCard } from "./habit-card";
import { HabitEmptyState } from "./habit-empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type { HabitWithTodayStatus } from "@/lib/db/types";

interface HabitListProps {
  habits: HabitWithTodayStatus[];
  onToggle: (habitId: string) => Promise<void>;
  onHabitClick: (habitId: string) => void;
  isLoading?: boolean;
  togglingHabitIds?: Set<string>;
}

type StatusTab = "active" | "paused" | "archived";

export function HabitList({
  habits,
  onToggle,
  onHabitClick,
  isLoading = false,
  togglingHabitIds,
}: HabitListProps) {
  const t = useTranslations("habits.list");
  const [activeTab, setActiveTab] = useState<StatusTab>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Count habits by status
  const counts = useMemo(() => {
    return {
      active: habits.filter((h) => h.status === "active").length,
      paused: habits.filter((h) => h.status === "paused").length,
      archived: habits.filter((h) => h.status === "archived").length,
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

  // Determine empty state variant
  const getEmptyStateVariant = () => {
    if (habits.length === 0) return "no_habits";
    if (debouncedSearch && filteredHabits.length === 0) return "no_results";
    if (activeTab === "paused" && filteredHabits.length === 0)
      return "no_paused";
    if (activeTab === "archived" && filteredHabits.length === 0)
      return "no_archived";
    return null;
  };

  const emptyStateVariant = getEmptyStateVariant();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

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
            <TabsTrigger value="archived">
              {t("tabs.archived")} ({counts.archived})
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
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredHabits.map((habit) => (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  onToggle={() => onToggle(habit.id)}
                  onClick={() => onHabitClick(habit.id)}
                  isToggling={togglingHabitIds?.has(habit.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
