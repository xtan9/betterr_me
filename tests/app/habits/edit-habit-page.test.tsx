import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { EditHabitContent } from "@/components/habits/edit-habit-content";

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

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

const messages = {
  habits: {
    form: {
      createTitle: "Create New Habit",
      editTitle: "Edit Habit",
      nameLabel: "Habit Name",
      namePlaceholder: "e.g., Morning Run...",
      descriptionLabel: "Description",
      descriptionPlaceholder: "Optional notes",
      categoryLabel: "Category",
      frequencyLabel: "How often?",
      cancel: "Cancel",
      create: "Create Habit",
      save: "Save Changes",
      creating: "Creating...",
      saving: "Saving...",
      validation: {
        nameRequired: "Name is required",
        nameMax: "Name must be 100 characters or less",
        frequencyRequired: "Please select a frequency",
        customDaysRequired: "Select at least one day",
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
      selectedDays: "Selected: {days}",
      days: {
        sun: "Sun",
        mon: "Mon",
        tue: "Tue",
        wed: "Wed",
        thu: "Thu",
        fri: "Fri",
        sat: "Sat",
      },
    },
    loading: {
      title: "Loading...",
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
  category_id: null,
  frequency: { type: "daily" },
  status: "active",
  current_streak: 7,
  best_streak: 10,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

function renderWithProviders(component: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>
  );
}

describe("EditHabitContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("shows loading skeleton while fetching habit", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    });

    renderWithProviders(<EditHabitContent habitId="habit-1" />);

    expect(screen.getByTestId("edit-habit-skeleton")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: new Error("Failed to fetch"),
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<EditHabitContent habitId="habit-1" />);

    expect(screen.getByText(/Failed to load habit/i)).toBeInTheDocument();
  });

  it("renders edit form with habit data when loaded", () => {
    mockUseSWR.mockReturnValue({
      data: mockHabit,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<EditHabitContent habitId="habit-1" />);

    expect(screen.getByText("Edit Habit")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Morning Meditation")).toBeInTheDocument();
  });

  it("navigates back when cancel button is clicked", async () => {
    const user = userEvent.setup();
    mockUseSWR.mockReturnValue({
      data: mockHabit,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    renderWithProviders(<EditHabitContent habitId="habit-1" />);

    await user.click(screen.getByText("Cancel"));

    expect(mockBack).toHaveBeenCalled();
  });

  it("submits updated data and navigates back on success", async () => {
    const user = userEvent.setup();
    const mockMutate = vi.fn();
    mockUseSWR.mockReturnValue({
      data: mockHabit,
      error: undefined,
      isLoading: false,
      mutate: mockMutate,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ habit: { ...mockHabit, name: "Updated Name" } }),
    });

    renderWithProviders(<EditHabitContent habitId="habit-1" />);

    const nameInput = screen.getByDisplayValue("Morning Meditation");
    await user.clear(nameInput);
    await user.type(nameInput, "Updated Meditation");
    await user.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/habits/habit-1",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it("shows saving state while submitting", async () => {
    const user = userEvent.setup();
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockUseSWR.mockReturnValue({
      data: mockHabit,
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
    mockFetch.mockReturnValueOnce(pendingPromise);

    renderWithProviders(<EditHabitContent habitId="habit-1" />);

    await user.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });

    // Clean up
    resolvePromise!({
      ok: true,
      json: () => Promise.resolve({ habit: mockHabit }),
    });
  });
});
