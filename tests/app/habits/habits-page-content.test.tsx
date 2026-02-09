import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { HabitsPageContent } from "@/components/habits/habits-page-content";

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

const messages = {
  habits: {
    page: {
      title: "My Habits",
      createButton: "Create Habit",
    },
    list: {
      title: "Habits",
      tabs: {
        active: "Active",
        paused: "Paused",
        archived: "Archived",
      },
      searchPlaceholder: "Search habits...",
    },
    empty: {
      no_habits: {
        title: "No habits yet",
        description: "Create your first habit",
      },
      no_results: {
        title: "No results",
        description: "Try a different search",
      },
      no_paused: {
        title: "No paused habits",
        description: "Paused habits appear here",
      },
      no_archived: {
        title: "No archived habits",
        description: "Archived habits appear here",
      },
    },
    card: {
      streakDays: "{count} days",
      toggle: "Toggle completion",
      completed: "Completed",
      pending: "Pending",
    },
    loading: {
      title: "Loading habits...",
    },
    error: {
      title: "Failed to load habits",
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

const mockHabits = [
  {
    id: "1",
    user_id: "user-1",
    name: "Morning Meditation",
    description: "10 minutes of mindfulness",
    category: "wellness",
    frequency: { type: "daily" },
    status: "active",
    current_streak: 7,
    best_streak: 10,
    paused_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    completed_today: true,
    monthly_completion_rate: 80,
  },
  {
    id: "2",
    user_id: "user-1",
    name: "Daily Exercise",
    description: "30 minutes workout",
    category: "health",
    frequency: { type: "daily" },
    status: "active",
    current_streak: 3,
    best_streak: 5,
    paused_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    completed_today: false,
    monthly_completion_rate: 40,
  },
];

describe("HabitsPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes local date in SWR key for timezone-correct queries", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    });

    renderWithProviders(<HabitsPageContent />);

    const swrKey = mockUseSWR.mock.calls[0][0];
    expect(swrKey).toMatch(
      /^\/api\/habits\?with_today=true&date=\d{4}-\d{2}-\d{2}$/
    );
  });

  it("shows loading skeleton while data is loading", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    });

    renderWithProviders(<HabitsPageContent />);

    expect(screen.getByTestId("habits-skeleton")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: new Error("Failed to fetch"),
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<HabitsPageContent />);

    expect(screen.getByText(/Failed to load habits/i)).toBeInTheDocument();
    expect(screen.getByText(/Try again/i)).toBeInTheDocument();
  });

  it("renders habits list when data is loaded", () => {
    mockUseSWR.mockReturnValue({
      data: mockHabits,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<HabitsPageContent />);

    expect(screen.getByText("My Habits")).toBeInTheDocument();
    expect(screen.getByText("Morning Meditation")).toBeInTheDocument();
    expect(screen.getByText("Daily Exercise")).toBeInTheDocument();
  });

  it("navigates to create habit page when button clicked", () => {
    mockUseSWR.mockReturnValue({
      data: mockHabits,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<HabitsPageContent />);

    const createButton = screen.getByText("Create Habit");
    createButton.click();

    expect(mockPush).toHaveBeenCalledWith("/habits/new");
  });

  it("navigates to habit detail when habit clicked", () => {
    mockUseSWR.mockReturnValue({
      data: mockHabits,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<HabitsPageContent />);

    const habitCard = screen.getByText("Morning Meditation");
    habitCard.click();

    expect(mockPush).toHaveBeenCalledWith("/habits/1");
  });
});
