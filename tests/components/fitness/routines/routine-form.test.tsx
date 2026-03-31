import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RoutineForm } from "@/components/fitness/routines/routine-form";
import type { RoutineWithExercises } from "@/lib/db/types";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-routines", () => ({
  useRoutines: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/lib/hooks/use-active-workout", () => ({
  useWeightUnit: () => "kg",
}));

vi.mock("react-plaid-link", () => ({
  usePlaidLink: () => ({ open: vi.fn(), ready: false }),
}));

const makeRoutine = (
  overrides: Partial<RoutineWithExercises> = {}
): RoutineWithExercises => ({
  id: "routine-1",
  user_id: "user-1",
  name: "Push Day",
  notes: "Chest and triceps",
  last_performed_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  exercises: [],
  ...overrides,
});

describe("RoutineForm", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSaved: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("populates form fields when editing an existing routine", async () => {
    const routine = makeRoutine();

    render(<RoutineForm {...defaultProps} routine={routine} />);

    await waitFor(() => {
      const nameInput = screen.getByDisplayValue("Push Day");
      expect(nameInput).toBeDefined();
    });

    const notesInput = screen.getByDisplayValue("Chest and triceps");
    expect(notesInput).toBeDefined();
  });

  it("resets form with routine data when dialog reopens for editing", async () => {
    const routine = makeRoutine();

    // First render with no routine (create mode)
    const { rerender } = render(
      <RoutineForm {...defaultProps} routine={null} />
    );

    // Now rerender with a routine (edit mode) — this is the bug scenario
    rerender(<RoutineForm {...defaultProps} routine={routine} />);

    await waitFor(() => {
      const nameInput = screen.getByDisplayValue("Push Day");
      expect(nameInput).toBeDefined();
    });

    const notesInput = screen.getByDisplayValue("Chest and triceps");
    expect(notesInput).toBeDefined();
  });

  it("shows empty fields when creating a new routine", () => {
    render(<RoutineForm {...defaultProps} routine={null} />);

    const inputs = screen.getAllByRole("textbox");
    for (const input of inputs) {
      expect((input as HTMLInputElement).value).toBe("");
    }
  });

  it("updates form when switching between different routines", async () => {
    const routine1 = makeRoutine({ name: "Push Day", notes: "Chest" });
    const routine2 = makeRoutine({
      id: "routine-2",
      name: "Pull Day",
      notes: "Back",
    });

    const { rerender } = render(
      <RoutineForm {...defaultProps} routine={routine1} />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Push Day")).toBeDefined();
    });

    rerender(<RoutineForm {...defaultProps} routine={routine2} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Pull Day")).toBeDefined();
    });
    expect(screen.getByDisplayValue("Back")).toBeDefined();
  });
});
