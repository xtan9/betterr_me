import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { CreateHabitContent } from "@/components/habits/create-habit-content";

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

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));

vi.mock("@/lib/hooks/use-categories", () => ({
  useCategories: () => ({
    categories: [],
    error: null,
    isLoading: false,
    mutate: vi.fn(),
  }),
}));

const messages = {
  categories: {
    add: "Add",
    namePlaceholder: "Category name",
    creating: "Creating...",
    create: "Create",
  },
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
  },
};

function renderWithProviders(component: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {component}
    </NextIntlClientProvider>
  );
}

describe("CreateHabitContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  it("renders create habit form with correct title", () => {
    renderWithProviders(<CreateHabitContent />);

    expect(screen.getByText("Create New Habit")).toBeInTheDocument();
    expect(screen.getByLabelText(/Habit Name/i)).toBeInTheDocument();
  });

  it("navigates back when cancel button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateHabitContent />);

    await user.click(screen.getByText("Cancel"));

    expect(mockBack).toHaveBeenCalled();
  });

  it("shows validation error when submitting without name", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateHabitContent />);

    await user.click(screen.getByText("Create Habit"));

    await waitFor(() => {
      expect(screen.getByText(/Name is required/i)).toBeInTheDocument();
    });
  });

  it("submits form and navigates to habits page on success", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ habit: { id: "new-habit-id" } }),
    });

    renderWithProviders(<CreateHabitContent />);

    await user.type(screen.getByLabelText(/Habit Name/i), "Morning Meditation");
    await user.click(screen.getByText("Create Habit"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/habits",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/habits");
    });
  });

  it("shows loading state while submitting", async () => {
    const user = userEvent.setup();
    let resolvePromise: (value: unknown) => void;
    const pendingPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockFetch.mockReturnValueOnce(pendingPromise);

    renderWithProviders(<CreateHabitContent />);

    await user.type(screen.getByLabelText(/Habit Name/i), "Test Habit");
    await user.click(screen.getByText("Create Habit"));

    await waitFor(() => {
      expect(screen.getByText("Creating...")).toBeInTheDocument();
    });

    // Clean up
    resolvePromise!({
      ok: true,
      json: () => Promise.resolve({ habit: { id: "1" } }),
    });
  });
});
