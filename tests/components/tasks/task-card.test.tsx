import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TaskCard } from "@/components/tasks/task-card";
import type { Task } from "@/lib/db/types";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const allMessages: Record<string, string> = {
      "tasks.card.markComplete": "Mark complete",
      "tasks.card.overdue": "Overdue",
      "tasks.card.noDueDate": "No due date",
      "tasks.categories.work": "Work",
      "tasks.categories.personal": "Personal",
      "tasks.categories.shopping": "Shopping",
      "tasks.categories.other": "Other",
      "tasks.priorities.0": "None",
      "tasks.priorities.1": "Low",
      "tasks.priorities.2": "Medium",
      "tasks.priorities.3": "High",
    };
    const t = (key: string) => {
      const fullKey = namespace ? `${namespace}.${key}` : key;
      return allMessages[fullKey] ?? key;
    };
    return t;
  },
}));

const baseTask: Task = {
  id: "task-1",
  user_id: "user-1",
  title: "Buy groceries",
  description: "Milk, eggs, bread",
  is_completed: false,
  priority: 2,
  category: "shopping",
  due_date: "2026-12-31",
  due_time: null,
  completed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("TaskCard", () => {
  const mockOnToggle = vi.fn().mockResolvedValue(undefined);
  const mockOnClick = vi.fn();
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("rendering", () => {
    it("renders task title", () => {
      render(
        <TaskCard
          task={baseTask}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      expect(screen.getByText("Buy groceries")).toBeInTheDocument();
    });

    it("renders category label", () => {
      render(
        <TaskCard
          task={baseTask}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      expect(screen.getByText("Shopping")).toBeInTheDocument();
    });

    it("renders priority label", () => {
      render(
        <TaskCard
          task={baseTask}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      expect(screen.getByText("Medium")).toBeInTheDocument();
    });

    it("renders due date", () => {
      render(
        <TaskCard
          task={baseTask}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      expect(screen.getByText("2026-12-31")).toBeInTheDocument();
    });

    it("shows 'No due date' when due_date is null", () => {
      const noDueDate = { ...baseTask, due_date: null };
      render(
        <TaskCard
          task={noDueDate}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      expect(screen.getByText("No due date")).toBeInTheDocument();
    });

    it("shows overdue styling for past due dates", () => {
      const overdueTask = { ...baseTask, due_date: "2020-01-01" };
      render(
        <TaskCard
          task={overdueTask}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      expect(screen.getByText(/overdue/i)).toBeInTheDocument();
    });

    it("does not show overdue for completed tasks", () => {
      const completedOverdue = {
        ...baseTask,
        due_date: "2020-01-01",
        is_completed: true,
      };
      render(
        <TaskCard
          task={completedOverdue}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      expect(screen.queryByText(/Overdue/)).not.toBeInTheDocument();
    });

    it("applies line-through on completed task title", () => {
      const completed = { ...baseTask, is_completed: true };
      render(
        <TaskCard
          task={completed}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      const title = screen.getByText("Buy groceries");
      expect(title.className).toContain("line-through");
    });
  });

  describe("interactions", () => {
    it("calls onClick when card title is clicked", async () => {
      render(
        <TaskCard
          task={baseTask}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      await user.click(screen.getByText("Buy groceries"));
      expect(mockOnClick).toHaveBeenCalledWith("task-1");
    });

    it("calls onToggle when checkbox is clicked", async () => {
      render(
        <TaskCard
          task={baseTask}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      const checkbox = screen.getByRole("checkbox");
      await user.click(checkbox);
      expect(mockOnToggle).toHaveBeenCalledWith("task-1");
    });

    it("checkbox does not trigger onClick", async () => {
      render(
        <TaskCard
          task={baseTask}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      const checkbox = screen.getByRole("checkbox");
      await user.click(checkbox);
      expect(mockOnClick).not.toHaveBeenCalled();
    });

    it("shows checked state when is_completed is true", () => {
      const completed = { ...baseTask, is_completed: true };
      render(
        <TaskCard
          task={completed}
          onToggle={mockOnToggle}
          onClick={mockOnClick}
        />
      );
      const checkbox = screen.getByRole("checkbox");
      expect(checkbox).toBeChecked();
    });
  });
});
