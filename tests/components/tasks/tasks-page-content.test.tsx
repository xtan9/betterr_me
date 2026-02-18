import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { TasksPageContent } from "@/components/tasks/tasks-page-content";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock SWR
const mockUseSWR = vi.fn();
vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const messages = {
  tasks: {
    page: {
      title: "My Tasks",
      createButton: "Create Task",
    },
    paused: {
      title: "{count} paused recurring tasks",
      resume: "Resume",
      delete: "Delete",
      resumeSuccess: "Recurring task resumed",
      deleteSuccess: "Recurring task deleted",
      actionError: "Action failed",
    },
    list: {
      searchPlaceholder: "Search tasks...",
      tabs: {
        pending: "Pending",
        completed: "Completed",
      },
    },
    empty: {
      noTasks: {
        title: "No tasks yet",
        description: "Add your first task to stay organized.",
        cta: "Create First Task",
      },
      noResults: {
        title: "No matching tasks",
        description: "Try a different search term.",
      },
      allComplete: {
        title: "All tasks complete!",
        description: "Great job! All your tasks are done.",
      },
    },
    card: {
      markComplete: "Mark complete",
      overdue: "Overdue",
      noDueDate: "No due date",
    },
    categories: {
      work: "Work",
      personal: "Personal",
      shopping: "Shopping",
      other: "Other",
    },
    priorities: {
      "0": "None",
      "1": "Low",
      "2": "Medium",
      "3": "High",
    },
    error: {
      title: "Failed to load task",
      retry: "Try again",
    },
  },
};

function renderWithProviders(component: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>
  );
}

const mockTasks = [
  {
    id: "1",
    user_id: "user-1",
    title: "Buy groceries",
    description: null,
    is_completed: false,
    priority: 2,
    category: "shopping",
    due_date: "2026-02-10",
    due_time: null,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "2",
    user_id: "user-1",
    title: "Finish report",
    description: null,
    is_completed: true,
    priority: 3,
    category: "work",
    due_date: "2026-02-09",
    due_time: "17:00:00",
    completed_at: "2026-02-09T15:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

/** Default paused SWR return value (empty list, no paused templates) */
const defaultPausedReturn = { data: [], error: undefined, isLoading: false, mutate: vi.fn() };

describe("TasksPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton while data is loading", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: undefined, error: undefined, isLoading: true, mutate: vi.fn() };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    expect(screen.getByTestId("tasks-skeleton")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: undefined, error: new Error("Failed to fetch"), isLoading: false, mutate: vi.fn() };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    expect(screen.getByText(/Failed to load task/i)).toBeInTheDocument();
    expect(screen.getByText(/Try again/i)).toBeInTheDocument();
  });

  it("renders task list when data is loaded", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: mockTasks, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    expect(screen.getByText("My Tasks")).toBeInTheDocument();
    expect(screen.getByText("Buy groceries")).toBeInTheDocument();
  });

  it("navigates to create task page when button clicked", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: mockTasks, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    const createButton = screen.getByText("Create Task");
    createButton.click();

    expect(mockPush).toHaveBeenCalledWith("/tasks/new");
  });

  it("navigates to task detail when task clicked", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: mockTasks, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    const taskTitle = screen.getByText("Buy groceries");
    taskTitle.click();

    expect(mockPush).toHaveBeenCalledWith("/tasks/1");
  });

  it("calls toggle API when task checkbox is clicked", async () => {
    const mockMutate = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch;

    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: mockTasks, error: undefined, isLoading: false, mutate: mockMutate };
      }
      return { ...defaultPausedReturn, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);

    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes[0].click();

    // Wait for async toggle
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/tasks/1/toggle", {
        method: "POST",
      });
    });
  });

  it("shows paused recurring tasks banner when paused templates exist", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: mockTasks, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      if (key === "/api/recurring-tasks?status=paused") {
        return {
          data: [
            { id: "rt-1", title: "Weekly review", status: "paused", recurrence_rule: { frequency: "weekly", interval: 1 } },
          ],
          error: undefined,
          isLoading: false,
          mutate: vi.fn(),
        };
      }
      return { data: undefined, error: undefined, isLoading: false, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);
    expect(screen.getByText("Weekly review")).toBeInTheDocument();
  });

  it("does not show paused banner when no paused templates", () => {
    mockUseSWR.mockImplementation((key: string) => {
      if (key === "/api/tasks") {
        return { data: mockTasks, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { data: [], error: undefined, isLoading: false, mutate: vi.fn() };
    });

    renderWithProviders(<TasksPageContent />);
    expect(screen.queryByText(/paused recurring/i)).not.toBeInTheDocument();
  });
});
