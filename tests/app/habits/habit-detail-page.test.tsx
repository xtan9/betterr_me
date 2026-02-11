import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { HabitDetailContent } from "@/components/habits/habit-detail-content";

// Mock next/navigation
const mockPush = vi.fn();
const mockBack = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: vi.fn(),
  }),
}));

// Mock SWR
const mockUseSWR = vi.fn();
vi.mock("swr", () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

const messages = {
  habits: {
    detail: {
      backToHabits: "Back to Habits",
      edit: "Edit",
      status: {
        active: "Active",
        paused: "Paused",
        archived: "Archived",
      },
      completion: {
        title: "Completion Rate",
        thisWeek: "This Week",
        thisMonth: "This Month",
        allTime: "All Time",
        days: "{completed}/{total} days",
        percent: "{percent}%",
      },
      actions: {
        pause: "Pause Habit",
        resume: "Resume Habit",
        archive: "Archive Habit",
        delete: "Delete Habit",
      },
      confirmArchive: "Are you sure you want to archive this habit?",
      confirmDelete: "Are you sure you want to delete this habit?",
      cannotEditOldLogs: "Cannot edit logs older than 7 days",
      notFound: "Habit not found",
    },
    streak: {
      current: "Current Streak",
      best: "Best Streak",
      days: "{count} days",
      personalBest: "Personal best!",
      messages: {
        zero: "Start today!",
        building: "Building momentum!",
        almostWeek: "Almost a week!",
        keepGoing: "Keep going!",
        incredible: "Incredible!",
        unstoppable: "Unstoppable!",
        legendary: "Legendary!",
      },
    },
    heatmap: {
      title: "Last 30 Days",
      completed: "Completed",
      missed: "Missed",
      notScheduled: "Not scheduled",
      today: "Today",
      cannotEdit: "Cannot edit",
      clickToToggle: "Click to toggle",
      days: {
        sun: "Sun",
        mon: "Mon",
        tue: "Tue",
        wed: "Wed",
        thu: "Thu",
        fri: "Fri",
        sat: "Sat",
      },
      legend: {
        completed: "Completed",
        missed: "Missed",
        notScheduled: "Not scheduled",
      },
    },
    categories: {
      health: "Health",
      wellness: "Wellness",
      learning: "Learning",
      productivity: "Productivity",
      other: "Other",
    },
    frequency: {
      daily: "Every day",
      weekdays: "Mon – Fri",
      weekly: "Once a week",
      timesPerWeek: "{count} times/week",
      custom: "Custom days",
    },
    loading: {
      title: "Loading...",
    },
    milestone: {
      celebration: "{habit} reached {count} days!",
      celebration7: "One week strong!",
      celebration14: "Two weeks in!",
      celebration30: "A whole month!",
      celebration50: "50 days!",
      celebration100: "Triple digits!",
      celebration200: "200 days!",
      celebration365: "One full year!",
      nextMilestone: "{days} more days to your {milestone}-day milestone!",
      noNextMilestone: "You've passed every milestone. Keep going!",
    },
    error: {
      title: "Failed to load habit",
      retry: "Try again",
    },
  },
};

const mockHabit = {
  id: "habit-1",
  user_id: "user-1",
  name: "Morning Meditation",
  description: "10 minutes of mindfulness",
  category: "wellness",
  frequency: { type: "daily" },
  status: "active",
  current_streak: 23,
  best_streak: 45,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockLogs = [
  { id: "log-1", habit_id: "habit-1", completed_at: "2024-01-15", created_at: "2024-01-15T10:00:00Z" },
  { id: "log-2", habit_id: "habit-1", completed_at: "2024-01-14", created_at: "2024-01-14T10:00:00Z" },
];

const mockStats = {
  thisWeek: { completed: 4, total: 5, percent: 80 },
  thisMonth: { completed: 18, total: 20, percent: 90 },
  allTime: { completed: 127, total: 150, percent: 85 },
};

function renderWithProviders(component: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>
  );
}

describe("HabitDetailContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("shows loading skeleton while fetching", () => {
    mockUseSWR.mockImplementation((key: unknown) => {
      if (typeof key === "string" && key.includes("/logs")) {
        return { data: undefined, error: undefined, isLoading: true, mutate: vi.fn() };
      }
      if (typeof key === "string" && key.includes("/stats")) {
        return { data: undefined, error: undefined, isLoading: true, mutate: vi.fn() };
      }
      return { data: undefined, error: undefined, isLoading: true, mutate: vi.fn() };
    });

    renderWithProviders(<HabitDetailContent habitId="habit-1" />);

    expect(screen.getByTestId("habit-detail-skeleton")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", () => {
    mockUseSWR.mockImplementation(() => ({
      data: undefined,
      error: new Error("Failed to fetch"),
      isLoading: false,
      mutate: vi.fn(),
    }));

    renderWithProviders(<HabitDetailContent habitId="habit-1" />);

    expect(screen.getByText(/Failed to load habit/i)).toBeInTheDocument();
  });

  it("renders habit details when loaded", () => {
    mockUseSWR.mockImplementation((key: unknown) => {
      if (typeof key === "string" && key.includes("/logs")) {
        return { data: mockLogs, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      if (typeof key === "string" && key.includes("/stats")) {
        return { data: mockStats, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { data: mockHabit, error: undefined, isLoading: false, mutate: vi.fn() };
    });

    renderWithProviders(<HabitDetailContent habitId="habit-1" />);

    expect(screen.getByText("Morning Meditation")).toBeInTheDocument();
    expect(screen.getByText("10 minutes of mindfulness")).toBeInTheDocument();
    expect(screen.getByText("23 days")).toBeInTheDocument();
    expect(screen.getByText("45 days")).toBeInTheDocument();
  });

  it("navigates to edit page when edit button clicked", async () => {
    const user = userEvent.setup();
    mockUseSWR.mockImplementation((key: unknown) => {
      if (typeof key === "string" && key.includes("/logs")) {
        return { data: mockLogs, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      if (typeof key === "string" && key.includes("/stats")) {
        return { data: mockStats, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { data: mockHabit, error: undefined, isLoading: false, mutate: vi.fn() };
    });

    renderWithProviders(<HabitDetailContent habitId="habit-1" />);

    await user.click(screen.getByText("Edit"));

    expect(mockPush).toHaveBeenCalledWith("/habits/habit-1/edit");
  });

  it("navigates back when back button clicked", async () => {
    const user = userEvent.setup();
    mockUseSWR.mockImplementation((key: unknown) => {
      if (typeof key === "string" && key.includes("/logs")) {
        return { data: mockLogs, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      if (typeof key === "string" && key.includes("/stats")) {
        return { data: mockStats, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { data: mockHabit, error: undefined, isLoading: false, mutate: vi.fn() };
    });

    renderWithProviders(<HabitDetailContent habitId="habit-1" />);

    await user.click(screen.getByText("Back to Habits"));

    expect(mockPush).toHaveBeenCalledWith("/habits");
  });

  it("displays status badge for active habit", () => {
    mockUseSWR.mockImplementation((key: unknown) => {
      if (typeof key === "string" && key.includes("/logs")) {
        return { data: mockLogs, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      if (typeof key === "string" && key.includes("/stats")) {
        return { data: mockStats, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { data: mockHabit, error: undefined, isLoading: false, mutate: vi.fn() };
    });

    renderWithProviders(<HabitDetailContent habitId="habit-1" />);

    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders NextMilestone with correct streak data", () => {
    mockUseSWR.mockImplementation((key: unknown) => {
      if (typeof key === "string" && key.includes("/logs")) {
        return { data: mockLogs, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      if (typeof key === "string" && key.includes("/stats")) {
        return { data: mockStats, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { data: mockHabit, error: undefined, isLoading: false, mutate: vi.fn() };
    });

    renderWithProviders(<HabitDetailContent habitId="habit-1" />);

    // mockHabit has current_streak: 23, next milestone is 30, days remaining = 7
    expect(screen.getByText("7 more days to your 30-day milestone!")).toBeInTheDocument();
  });

  it("shows completion stats", () => {
    mockUseSWR.mockImplementation((key: unknown) => {
      if (typeof key === "string" && key.includes("/logs")) {
        return { data: mockLogs, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      if (typeof key === "string" && key.includes("/stats")) {
        return { data: mockStats, error: undefined, isLoading: false, mutate: vi.fn() };
      }
      return { data: mockHabit, error: undefined, isLoading: false, mutate: vi.fn() };
    });

    renderWithProviders(<HabitDetailContent habitId="habit-1" />);

    expect(screen.getByText("Completion Rate")).toBeInTheDocument();
    expect(screen.getByText("This Week")).toBeInTheDocument();
    expect(screen.getByText("This Month")).toBeInTheDocument();
    expect(screen.getByText("All Time")).toBeInTheDocument();
  });
});
