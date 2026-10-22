import type { Task } from "@/lib/db/types";

export type TaskStatusTab = "pending" | "completed";

/** Keep task counts and case-insensitive list filtering consistent across views. */
export function selectTaskList(
  tasks: readonly Task[],
  activeTab: TaskStatusTab,
  search: string,
) {
  const query = search.toLowerCase();
  const counts = { pending: 0, completed: 0 };
  const filteredTasks: Task[] = [];
  for (const task of tasks) {
    const status = task.is_completed ? "completed" : "pending";
    counts[status]++;
    if (status === activeTab && (!query || task.title.toLowerCase().includes(query))) {
      filteredTasks.push(task);
    }
  }
  return { counts, filteredTasks };
}
