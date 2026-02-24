"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Repeat, ListChecks, Search } from "lucide-react";
import useSWR from "swr";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useHabits } from "@/lib/hooks/use-habits";
import { fetcher } from "@/lib/fetcher";
import { addLink } from "@/lib/hooks/use-journal-links";
import type { JournalLinkType } from "@/lib/db/types";

interface ExistingLink {
  link_type: JournalLinkType;
  link_id: string;
}

interface JournalLinkSelectorProps {
  entryId: string;
  existingLinks: ExistingLink[];
  onLinkAdded: () => void;
  onLinkRemoved: () => void;
}

interface TaskItem {
  id: string;
  title: string;
}

interface TasksResponse {
  tasks: TaskItem[];
}

export function JournalLinkSelector({
  entryId,
  existingLinks,
  onLinkAdded,
}: JournalLinkSelectorProps) {
  const t = useTranslations("journal.links");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { habits } = useHabits({ status: "active" });
  const { data: tasksData } = useSWR<TasksResponse>(
    "/api/tasks?is_completed=false",
    fetcher,
  );
  const tasks = tasksData?.tasks ?? [];

  const linkedSet = new Set(
    existingLinks.map((l) => `${l.link_type}:${l.link_id}`),
  );

  const filteredHabits = habits.filter(
    (h) =>
      !linkedSet.has(`habit:${h.id}`) &&
      h.name.toLowerCase().includes(search.toLowerCase()),
  );

  const filteredTasks = tasks.filter(
    (t) =>
      !linkedSet.has(`task:${t.id}`) &&
      t.title.toLowerCase().includes(search.toLowerCase()),
  );

  const hasResults = filteredHabits.length > 0 || filteredTasks.length > 0;

  const handleAdd = useCallback(
    async (linkType: JournalLinkType, linkId: string) => {
      try {
        await addLink(entryId, linkType, linkId);
        onLinkAdded();
        setOpen(false);
        setSearch("");
      } catch (error) {
        console.error("Failed to add journal link", error);
        toast.error(t("addError"));
      }
    },
    [entryId, onLinkAdded, t],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="link-selector-trigger"
        >
          <Plus className="size-3.5" />
          {t("addLink")}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded-md bg-muted/50 py-1.5 pl-7 pr-2 text-sm outline-none placeholder:text-muted-foreground"
              data-testid="link-search-input"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {!hasResults && (
            <p
              className="p-2 text-center text-sm text-muted-foreground"
              data-testid="link-no-results"
            >
              {t("noResults")}
            </p>
          )}

          {filteredHabits.length > 0 && (
            <div>
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {t("habits")}
              </p>
              {filteredHabits.map((habit) => (
                <button
                  key={habit.id}
                  type="button"
                  onClick={() => handleAdd("habit", habit.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
                  data-testid={`link-habit-${habit.id}`}
                >
                  <Repeat className="size-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="truncate">{habit.name}</span>
                </button>
              ))}
            </div>
          )}

          {filteredTasks.length > 0 && (
            <div>
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {t("tasks")}
              </p>
              {filteredTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => handleAdd("task", task.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
                  data-testid={`link-task-${task.id}`}
                >
                  <ListChecks className="size-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="truncate">{task.title}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
