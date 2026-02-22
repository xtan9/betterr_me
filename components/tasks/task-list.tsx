"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { TaskCard } from "./task-card";
import { TaskEmptyState } from "./task-empty-state";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useCategories } from "@/lib/hooks/use-categories";
import type { Task } from "@/lib/db/types";

interface TaskListProps {
  tasks: Task[];
  onToggle: (taskId: string) => Promise<void>;
  onTaskClick: (taskId: string) => void;
  onCreateTask: () => void;
  isLoading?: boolean;
}

type StatusTab = "pending" | "completed";

export function TaskList({
  tasks,
  onToggle,
  onTaskClick,
  onCreateTask,
  isLoading = false,
}: TaskListProps) {
  const t = useTranslations("tasks.list");
  const { categories } = useCategories();
  const [activeTab, setActiveTab] = useState<StatusTab>("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const counts = useMemo(() => {
    return {
      pending: tasks.filter((t) => !t.is_completed).length,
      completed: tasks.filter((t) => t.is_completed).length,
    };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter((t) =>
      activeTab === "pending" ? !t.is_completed : t.is_completed
    );

    if (debouncedSearch) {
      const query = debouncedSearch.toLowerCase();
      filtered = filtered.filter((t) =>
        t.title.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [tasks, activeTab, debouncedSearch]);

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as StatusTab);
    setSearchQuery("");
  }, []);

  const getEmptyStateVariant = () => {
    if (tasks.length === 0) return "no_tasks" as const;
    if (debouncedSearch && filteredTasks.length === 0)
      return "no_results" as const;
    if (activeTab === "pending" && filteredTasks.length === 0)
      return "all_complete" as const;
    return null;
  };

  const emptyStateVariant = getEmptyStateVariant();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
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
            <TabsTrigger value="pending">
              {t("tabs.pending")} ({counts.pending})
            </TabsTrigger>
            <TabsTrigger value="completed">
              {t("tabs.completed")} ({counts.completed})
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
            <TaskEmptyState
              variant={emptyStateVariant}
              onCreateTask={onCreateTask}
            />
          ) : (
            <div className="grid gap-card-gap md:grid-cols-2 lg:grid-cols-3">
              {filteredTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  categories={categories}
                  onToggle={() => onToggle(task.id)}
                  onClick={() => onTaskClick(task.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
