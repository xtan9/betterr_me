import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanDetailModal } from "@/components/kanban/kanban-detail-modal";
import type { Task } from "@/lib/db/types";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      "detail.detailsTab": "Details",
      "detail.activityTab": "Activity",
      "detail.status": "Status",
      "detail.priority": "Priority",
      "detail.project": "Project",
      "detail.dueDate": "Due Date",
      "detail.noDueDate": "No due date",
      "detail.infoHeading": "Info",
      "detail.descriptionHeading": "Description",
      "detail.descriptionPlaceholder": "Add a description...",
      "detail.updatesHeading": "Item updates",
      "detail.writeUpdate": "Write an update...",
      "detail.noUpdates": "No updates yet",
      "detail.updateError": "Failed to update task",
      "detail.clickToEdit": "Click to edit title",
      "detail.saving": "Saving...",
      "detail.saved": "Saved",
      "detail.delete": "Delete",
      "detail.deleting": "Deleting...",
      "detail.cancel": "Cancel",
      "detail.deleteError": "Failed to delete task",
      "detail.deleteConfirmTitle": "Delete this task?",
      "detail.deleteConfirmDescription":
        "This action cannot be undone. This will permanently delete the task.",
      "detail.activityPlaceholder": "Activity log coming soon",
      "columns.backlog": "Backlog",
      "columns.todo": "To Do",
      "columns.in_progress": "In Progress",
      "columns.done": "Done",
      "priority.high": "High",
      "priority.medium": "Medium",
      "priority.low": "Low",
      "priority.none": "None",
    };
    return messages[key] ?? key;
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockTask: Task = {
  id: "task-1",
  user_id: "user-1",
  title: "Test Task",
  description: "Test description",
  is_completed: false,
  priority: 2,
  due_date: "2026-03-28",
  due_time: null,
  completed_at: null,
  created_at: "2026-03-01T00:00:00Z",
  updated_at: "2026-03-01T00:00:00Z",
  completion_difficulty: null,
  recurring_task_id: null,
  is_exception: false,
  original_date: null,
  status: "todo" as const,
  section: "work" as const,
  sort_order: 0,
  project_id: "proj-1",
  category_id: null,
};

describe("KanbanDetailModal", () => {
  const mockOnClose = vi.fn();
  const mockOnTaskUpdated = vi.fn();
  const mockOnTaskDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  function renderModal(task: Task | null = mockTask) {
    return render(
      <KanbanDetailModal
        task={task}
        onClose={mockOnClose}
        projectName="Test Project"
        onTaskUpdated={mockOnTaskUpdated}
        onTaskDeleted={mockOnTaskDeleted}
      />
    );
  }

  it("renders nothing when task is null", () => {
    const { container } = renderModal(null);
    expect(container.innerHTML).toBe("");
  });

  it("renders the task title", () => {
    renderModal();
    expect(screen.getByText("Test Task")).toBeInTheDocument();
  });

  it("shows the title as a tooltip hint", () => {
    renderModal();
    const titleElement = screen.getByTitle("Click to edit title");
    expect(titleElement).toBeInTheDocument();
  });

  describe("title editing", () => {
    it("enters edit mode when title is clicked", async () => {
      const user = userEvent.setup();
      renderModal();
      await user.click(screen.getByText("Test Task"));
      const input = screen.getByDisplayValue("Test Task");
      expect(input).toBeInTheDocument();
      expect(input.tagName).toBe("INPUT");
    });

    it("saves title on blur with changed value", async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });
      renderModal();

      await user.click(screen.getByText("Test Task"));
      const input = screen.getByDisplayValue("Test Task");
      await user.clear(input);
      await user.type(input, "Updated Title");
      await user.tab(); // blur

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tasks/task-1",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ title: "Updated Title" }),
          })
        );
      });
      expect(mockOnTaskUpdated).toHaveBeenCalled();
    });

    it("does not save if title is unchanged", async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText("Test Task"));
      const _input = screen.getByDisplayValue("Test Task");
      await user.tab(); // blur without changing

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("reverts title on Escape", async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText("Test Task"));
      const input = screen.getByDisplayValue("Test Task");
      await user.clear(input);
      await user.type(input, "Changed");
      await user.keyboard("{Escape}");

      // Should show original title, not be in edit mode
      expect(screen.getByText("Test Task")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("Changed")).not.toBeInTheDocument();
    });

    it("saves title on Enter", async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });
      renderModal();

      await user.click(screen.getByText("Test Task"));
      const input = screen.getByDisplayValue("Test Task");
      await user.clear(input);
      await user.type(input, "New Title{Enter}");

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/tasks/task-1",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ title: "New Title" }),
          })
        );
      });
    });

    it("reverts title if save fails (HTTP error)", async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Server error" }),
      });
      const { toast } = await import("sonner");
      renderModal();

      await user.click(screen.getByText("Test Task"));
      const input = screen.getByDisplayValue("Test Task");
      await user.clear(input);
      await user.type(input, "Failed Title");
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText("Test Task")).toBeInTheDocument();
      });
      expect(toast.error).toHaveBeenCalled();
    });

    it("reverts title if save fails (network error)", async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new TypeError("Failed to fetch")
      );
      const { toast } = await import("sonner");
      renderModal();

      await user.click(screen.getByText("Test Task"));
      const input = screen.getByDisplayValue("Test Task");
      await user.clear(input);
      await user.type(input, "Network Fail Title");
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText("Test Task")).toBeInTheDocument();
      });
      expect(toast.error).toHaveBeenCalled();
    });

    it("does not save empty or whitespace-only title", async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByText("Test Task"));
      const input = screen.getByDisplayValue("Test Task");
      await user.clear(input);
      await user.type(input, "   ");
      await user.tab();

      expect(global.fetch).not.toHaveBeenCalled();
      expect(screen.getByText("Test Task")).toBeInTheDocument();
    });
  });

  describe("description auto-save indicator", () => {
    it("shows saved indicator after description save", async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });
      renderModal();

      const textarea = screen.getByPlaceholderText("Add a description...");
      await user.clear(textarea);
      await user.type(textarea, "New description");
      await user.tab(); // blur to trigger save

      await waitFor(() => {
        expect(screen.getByText("Saved")).toBeInTheDocument();
      });
    });

    it("does not save description if unchanged", async () => {
      const user = userEvent.setup();
      renderModal();

      const textarea = screen.getByPlaceholderText("Add a description...");
      await user.click(textarea);
      await user.tab(); // blur without changing

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("delete task", () => {
    it("shows delete button with accessible label", () => {
      renderModal();
      const deleteButton = screen.getByRole("button", { name: "Delete" });
      expect(deleteButton).toBeInTheDocument();
    });

    it("shows confirmation dialog when delete is clicked", async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(screen.getByText("Delete this task?")).toBeInTheDocument();
        expect(
          screen.getByText(
            "This action cannot be undone. This will permanently delete the task."
          )
        ).toBeInTheDocument();
      });
    });

    it("deletes task when confirmed", async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });
      renderModal();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(screen.getByText("Delete this task?")).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: "Delete", exact: true }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/tasks/task-1", {
          method: "DELETE",
        });
      });
      expect(mockOnClose).toHaveBeenCalled();
      expect(mockOnTaskDeleted).toHaveBeenCalled();
    });

    it("shows error toast when delete fails (HTTP error)", async () => {
      const user = userEvent.setup();
      const { toast } = await import("sonner");
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Failed to delete task" }),
      });
      renderModal();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(screen.getByText("Delete this task?")).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: "Delete", exact: true }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Failed to delete task");
      });
    });

    it("shows error toast when delete fails (network error)", async () => {
      const user = userEvent.setup();
      const { toast } = await import("sonner");
      (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new TypeError("Failed to fetch")
      );
      renderModal();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(screen.getByText("Delete this task?")).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: "Delete", exact: true }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Failed to delete task");
      });
      expect(mockOnClose).not.toHaveBeenCalled();
      expect(mockOnTaskDeleted).not.toHaveBeenCalled();
    });

    it("cancels delete when cancel is clicked", async () => {
      const user = userEvent.setup();
      renderModal();

      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(screen.getByText("Cancel")).toBeInTheDocument();
      });
      await user.click(screen.getByText("Cancel"));

      expect(global.fetch).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it("works when onTaskDeleted is not provided", async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });
      render(
        <KanbanDetailModal
          task={mockTask}
          onClose={mockOnClose}
          projectName="Test Project"
          onTaskUpdated={mockOnTaskUpdated}
        />
      );

      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(screen.getByText("Delete this task?")).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: "Delete", exact: true }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/tasks/task-1", {
          method: "DELETE",
        });
      });
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe("description revert on failure", () => {
    it("reverts description if save fails", async () => {
      const user = userEvent.setup();
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Server error" }),
      });
      renderModal();

      const textarea = screen.getByPlaceholderText("Add a description...");
      await user.clear(textarea);
      await user.type(textarea, "New failing description");
      await user.tab();

      await waitFor(() => {
        expect(screen.getByDisplayValue("Test description")).toBeInTheDocument();
      });
    });
  });

  describe("task switching", () => {
    it("resets editing state when task changes", () => {
      const task2: Task = {
        ...mockTask,
        id: "task-2",
        title: "Second Task",
        description: "Second description",
      };

      const { rerender } = render(
        <KanbanDetailModal
          task={mockTask}
          onClose={mockOnClose}
          projectName="Test Project"
          onTaskUpdated={mockOnTaskUpdated}
          onTaskDeleted={mockOnTaskDeleted}
        />
      );

      expect(screen.getByText("Test Task")).toBeInTheDocument();

      rerender(
        <KanbanDetailModal
          task={task2}
          onClose={mockOnClose}
          projectName="Test Project"
          onTaskUpdated={mockOnTaskUpdated}
          onTaskDeleted={mockOnTaskDeleted}
        />
      );

      expect(screen.getByText("Second Task")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Second description")).toBeInTheDocument();
      // Should not be in title edit mode (no input with the task title)
      expect(screen.queryByDisplayValue("Second Task")).not.toBeInTheDocument();
    });
  });

  describe("existing functionality", () => {
    it("renders project name", () => {
      renderModal();
      expect(screen.getByText("Test Project")).toBeInTheDocument();
    });

    it("renders description", () => {
      renderModal();
      expect(screen.getByDisplayValue("Test description")).toBeInTheDocument();
    });

    it("renders tabs", () => {
      renderModal();
      expect(screen.getByText("Details")).toBeInTheDocument();
      expect(screen.getByText("Activity")).toBeInTheDocument();
    });
  });
});
