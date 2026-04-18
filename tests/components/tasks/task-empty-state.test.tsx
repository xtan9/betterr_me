import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaskEmptyState } from "@/components/tasks/task-empty-state";

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => {
      const messages: Record<string, string> = {
        "noTasks.title": "No tasks yet",
        "noTasks.description": "Add your first task to get started.",
        "noTasks.cta": "Add Task",
        "noResults.title": "No tasks match your search",
        "noResults.description": "Try a different search term.",
        "allComplete.title": "All done!",
        "allComplete.description": "You've completed every task for today.",
      };
      return messages[key] ?? key;
    };
    return t;
  },
}));

vi.mock("lucide-react", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    ClipboardList: (props: Record<string, unknown>) => (
      <span data-testid="icon-clipboard" {...props} />
    ),
    Search: (props: Record<string, unknown>) => (
      <span data-testid="icon-search" {...props} />
    ),
    PartyPopper: (props: Record<string, unknown>) => (
      <span data-testid="icon-party" {...props} />
    ),
  };
});

describe("TaskEmptyState", () => {
  describe("no_tasks variant", () => {
    it("renders the title, description, and clipboard icon", () => {
      render(<TaskEmptyState variant="no_tasks" />);
      expect(screen.getByText("No tasks yet")).toBeInTheDocument();
      expect(
        screen.getByText("Add your first task to get started.")
      ).toBeInTheDocument();
      expect(screen.getByTestId("icon-clipboard")).toBeInTheDocument();
    });

    it("renders the CTA button when onCreateTask is provided", () => {
      const onCreateTask = vi.fn();
      render(<TaskEmptyState variant="no_tasks" onCreateTask={onCreateTask} />);
      expect(
        screen.getByRole("button", { name: "Add Task" })
      ).toBeInTheDocument();
    });

    it("calls onCreateTask when the CTA is clicked", () => {
      const onCreateTask = vi.fn();
      render(<TaskEmptyState variant="no_tasks" onCreateTask={onCreateTask} />);
      fireEvent.click(screen.getByRole("button", { name: "Add Task" }));
      expect(onCreateTask).toHaveBeenCalledTimes(1);
    });

    it("does not render a CTA when onCreateTask is not provided", () => {
      render(<TaskEmptyState variant="no_tasks" />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("no_results variant", () => {
    it("renders the search icon and description", () => {
      render(<TaskEmptyState variant="no_results" />);
      expect(screen.getByText("No tasks match your search")).toBeInTheDocument();
      expect(screen.getByTestId("icon-search")).toBeInTheDocument();
    });

    it("does not render a CTA even when onCreateTask is provided", () => {
      render(
        <TaskEmptyState variant="no_results" onCreateTask={vi.fn()} />
      );
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
  });

  describe("all_complete variant", () => {
    it("renders the celebration title and party icon", () => {
      render(<TaskEmptyState variant="all_complete" />);
      expect(screen.getByText("All done!")).toBeInTheDocument();
      expect(screen.getByTestId("icon-party")).toBeInTheDocument();
    });

    it("applies celebration variant classes to the container", () => {
      render(<TaskEmptyState variant="all_complete" />);
      const container = screen.getByTestId("empty-state");
      expect(container).toHaveClass("bg-gradient-to-b");
      expect(container).toHaveClass("rounded-card");
    });
  });

  describe("common styles", () => {
    it("exposes the empty-state test id for downstream tests", () => {
      render(<TaskEmptyState variant="no_tasks" />);
      expect(screen.getByTestId("empty-state")).toBeInTheDocument();
    });

    it("has centered layout", () => {
      render(<TaskEmptyState variant="no_tasks" />);
      const container = screen.getByTestId("empty-state");
      expect(container).toHaveClass("text-center");
    });
  });
});
