import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock next/navigation
const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

// Mock sonner
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Namespace-aware mock matching next-intl's useTranslations behavior
const allTranslations: Record<string, Record<string, string>> = {
  tasks: {
    "detail.title": "Task Details",
    "detail.edit": "Edit",
    "detail.delete": "Delete Task",
    "detail.deleteConfirm": "Are you sure you want to delete this task?",
    "detail.deleteCancel": "Cancel",
    "detail.back": "Back",
    "detail.completed": "Completed",
    "detail.pending": "Pending",
    "detail.dueDate": "Due Date",
    "detail.dueTime": "Due Time",
    "detail.priority": "Priority",
    "detail.category": "Category",
    "detail.noDueDate": "No due date",
    "detail.notFound": "Task not found",
    "detail.yourWhy": "Your Why",
    "detail.reflection.easy": "You rated this: Easy ⚡",
    "detail.reflection.good": "You rated this: Good 👌",
    "detail.reflection.hard": "You rated this: Hard 💪",
    "edit.success": "Task updated successfully",
    "edit.error": "Failed to update task",
    "delete.success": "Task deleted successfully",
    "delete.error": "Failed to delete task",
    "toast.toggleError": "Failed to update task",
    "error.title": "Failed to load task",
    "error.retry": "Try again",
  },
  "tasks.categories": {
    work: "Work",
    personal: "Personal",
    shopping: "Shopping",
    other: "Other",
  },
  "tasks.priorities": {
    "0": "None",
    "1": "Low",
    "2": "Medium",
    "3": "High",
  },
};

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => {
    const ns = allTranslations[namespace] ?? {};
    return (key: string) => {
      return ns[key] ?? key;
    };
  },
}));

// Mock SWR
const mockMutate = vi.fn();
vi.mock("swr", () => ({
  default: vi.fn(),
}));

import useSWR from "swr";
import { TaskDetailContent } from "@/components/tasks/task-detail-content";

const mockTask = {
  id: "task-1",
  user_id: "user-1",
  title: "Buy groceries",
  description: "Milk, eggs, bread",
  intention: null,
  is_completed: false,
  priority: 2 as const,
  category: "shopping" as const,
  due_date: "2026-02-10",
  due_time: "14:30:00",
  completion_difficulty: null,
  completed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const completedTask = {
  ...mockTask,
  is_completed: true,
  completed_at: "2026-02-09T10:00:00Z",
};

describe("TaskDetailContent", () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.mocked(useSWR).mockReturnValue({
      data: mockTask,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
      isValidating: false,
    } as any);
  });

  it("shows loading skeleton while fetching", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: mockMutate,
      isValidating: false,
    } as any);

    render(<TaskDetailContent taskId="task-1" />);
    expect(screen.getByTestId("task-detail-skeleton")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: new Error("Failed to fetch"),
      isLoading: false,
      mutate: mockMutate,
      isValidating: false,
    } as any);

    render(<TaskDetailContent taskId="task-1" />);
    expect(screen.getByText("Failed to load task")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });

  it("shows not-found state when task is null", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: null,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
      isValidating: false,
    } as any);

    render(<TaskDetailContent taskId="task-1" />);
    expect(screen.getByText("Task not found")).toBeInTheDocument();
  });

  it("renders task details when loaded", () => {
    render(<TaskDetailContent taskId="task-1" />);

    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
    expect(screen.getByText("Milk, eggs, bread")).toBeInTheDocument();
    expect(screen.getByText("Shopping")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("2026-02-10")).toBeInTheDocument();
    expect(screen.getByText("14:30")).toBeInTheDocument();
  });

  it("displays completion status badge for pending task", () => {
    render(<TaskDetailContent taskId="task-1" />);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("displays completion status badge for completed task", () => {
    vi.mocked(useSWR).mockReturnValue({
      data: completedTask,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
      isValidating: false,
    } as any);

    render(<TaskDetailContent taskId="task-1" />);
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("toggles task completion", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ task: completedTask }),
    } as Response);

    render(<TaskDetailContent taskId="task-1" />);

    const toggleButton = screen.getByRole("button", { name: /pending/i });
    await user.click(toggleButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(`/api/tasks/task-1/toggle`, {
        method: "POST",
      });
    });
    expect(mockMutate).toHaveBeenCalled();
  });

  it("navigates to edit page when edit button clicked", async () => {
    render(<TaskDetailContent taskId="task-1" />);

    await user.click(screen.getByRole("button", { name: /edit/i }));
    expect(mockPush).toHaveBeenCalledWith("/tasks/task-1/edit");
  });

  it("navigates back when back button clicked", async () => {
    render(<TaskDetailContent taskId="task-1" />);

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(mockPush).toHaveBeenCalledWith("/tasks");
  });

  it("shows delete confirmation dialog", async () => {
    render(<TaskDetailContent taskId="task-1" />);

    await user.click(screen.getByRole("button", { name: /delete task/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Are you sure you want to delete this task?"),
      ).toBeInTheDocument();
    });
  });

  it("deletes task and redirects on confirm", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    render(<TaskDetailContent taskId="task-1" />);

    // Open dialog
    await user.click(screen.getByRole("button", { name: /delete task/i }));

    // Wait for dialog and find confirm button within it
    await waitFor(() => {
      expect(
        screen.getByText("Are you sure you want to delete this task?"),
      ).toBeInTheDocument();
    });

    // Click the confirm delete button in the dialog
    const dialog = screen.getByRole("alertdialog");
    const confirmButton = within(dialog).getByRole("button", {
      name: /delete task/i,
    });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/tasks/task-1", {
        method: "DELETE",
      });
    });
    expect(mockToastSuccess).toHaveBeenCalledWith("Task deleted successfully");
    expect(mockPush).toHaveBeenCalledWith("/tasks");
  });

  it("shows error toast on delete failure", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Server error" }),
    } as Response);

    render(<TaskDetailContent taskId="task-1" />);

    await user.click(screen.getByRole("button", { name: /delete task/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Are you sure you want to delete this task?"),
      ).toBeInTheDocument();
    });

    const dialog = screen.getByRole("alertdialog");
    const confirmButton = within(dialog).getByRole("button", {
      name: /delete task/i,
    });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to delete task");
    });
  });

  it("shows Your Why card when task has intention", () => {
    const taskWithIntention = {
      ...mockTask,
      intention: "To stay organized and focused",
    };
    vi.mocked(useSWR).mockReturnValue({
      data: taskWithIntention,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
      isValidating: false,
    } as any);

    render(<TaskDetailContent taskId="task-1" />);
    expect(screen.getByText("Your Why")).toBeInTheDocument();
    expect(
      screen.getByText("To stay organized and focused"),
    ).toBeInTheDocument();
  });

  it("hides Your Why card when task has no intention", () => {
    render(<TaskDetailContent taskId="task-1" />);
    expect(screen.queryByText("Your Why")).not.toBeInTheDocument();
  });

  it("hides Your Why card when intention is empty string", () => {
    const taskWithEmptyIntention = {
      ...mockTask,
      intention: "",
    };
    vi.mocked(useSWR).mockReturnValue({
      data: taskWithEmptyIntention,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
      isValidating: false,
    } as any);

    render(<TaskDetailContent taskId="task-1" />);
    expect(screen.queryByText("Your Why")).not.toBeInTheDocument();
  });

  it("shows error toast on toggle failure", async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error("Network error"));

    render(<TaskDetailContent taskId="task-1" />);

    const toggleButton = screen.getByRole("button", { name: /pending/i });
    await user.click(toggleButton);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to update task");
    });
  });

  describe("reflection badge", () => {
    it("shows Easy reflection badge when completion_difficulty is 1", () => {
      vi.mocked(useSWR).mockReturnValue({
        data: { ...mockTask, completion_difficulty: 1 },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
        isValidating: false,
      } as any);

      render(<TaskDetailContent taskId="task-1" />);
      expect(screen.getByText("⚡")).toBeInTheDocument();
      expect(screen.getByText("You rated this: Easy ⚡")).toBeInTheDocument();
    });

    it("shows Good reflection badge when completion_difficulty is 2", () => {
      vi.mocked(useSWR).mockReturnValue({
        data: { ...mockTask, completion_difficulty: 2 },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
        isValidating: false,
      } as any);

      render(<TaskDetailContent taskId="task-1" />);
      expect(screen.getByText("👌")).toBeInTheDocument();
      expect(screen.getByText("You rated this: Good 👌")).toBeInTheDocument();
    });

    it("shows Hard reflection badge when completion_difficulty is 3", () => {
      vi.mocked(useSWR).mockReturnValue({
        data: { ...mockTask, completion_difficulty: 3 },
        error: undefined,
        isLoading: false,
        mutate: mockMutate,
        isValidating: false,
      } as any);

      render(<TaskDetailContent taskId="task-1" />);
      expect(screen.getByText("💪")).toBeInTheDocument();
      expect(screen.getByText("You rated this: Hard 💪")).toBeInTheDocument();
    });

    it("hides reflection badge when completion_difficulty is null", () => {
      render(<TaskDetailContent taskId="task-1" />);
      expect(screen.queryByText("⚡")).not.toBeInTheDocument();
      expect(screen.queryByText("👌")).not.toBeInTheDocument();
      expect(screen.queryByText("💪")).not.toBeInTheDocument();
    });
  });
});
