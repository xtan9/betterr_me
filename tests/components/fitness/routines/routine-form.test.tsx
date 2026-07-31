import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import React from "react";
import { RoutineForm } from "@/components/fitness/routines/routine-form";
import type { RoutineWithExercises } from "@/lib/db/types";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const { mockMutate } = vi.hoisted(() => ({ mockMutate: vi.fn() }));
vi.mock("@/lib/hooks/use-routines", () => ({
  useRoutines: () => ({ mutate: mockMutate }),
}));

vi.mock("@/lib/hooks/use-active-workout", () => ({
  useWeightUnit: () => "kg",
}));

vi.mock("react-plaid-link", () => ({
  usePlaidLink: () => ({ open: vi.fn(), ready: false }),
}));

// Mock sonner
const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock the exercise picker so we can invoke onSelectExercise directly
const { capturedPicker } = vi.hoisted(() => ({
  capturedPicker: { onSelectExercise: null as ((id: string) => void) | null },
}));
vi.mock("@/components/fitness/workout-logger/workout-add-exercise", () => ({
  WorkoutAddExercise: ({
    open,
    onSelectExercise,
  }: {
    open: boolean;
    onSelectExercise: (id: string) => void;
  }) => {
    capturedPicker.onSelectExercise = onSelectExercise;
    return open
      ? React.createElement(
          "button",
          {
            "data-testid": "picker-select",
            onClick: () =>
              onSelectExercise("11111111-1111-1111-1111-111111111111"),
          },
          "pick exercise"
        )
      : null;
  },
}));

// Mock the routine exercise list so we can invoke its callbacks from tests
const { capturedList } = vi.hoisted(() => ({
  capturedList: {
    onUpdate: null as
      | ((reId: string, updates: Record<string, unknown>) => void)
      | null,
    onRemove: null as ((reId: string) => void) | null,
  },
}));
vi.mock("@/components/fitness/routines/routine-exercise-list", () => ({
  RoutineExerciseList: ({
    exercises,
    onUpdate,
    onRemove,
  }: {
    exercises: Array<{ id: string }>;
    onUpdate: (reId: string, updates: Record<string, unknown>) => void;
    onRemove: (reId: string) => void;
  }) => {
    capturedList.onUpdate = onUpdate;
    capturedList.onRemove = onRemove;
    return React.createElement(
      "div",
      { "data-testid": "exercise-list" },
      `exercises:${exercises.length}`
    );
  },
}));

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

const routineWithExercises = (): RoutineWithExercises =>
  makeRoutine({
    exercises: [
      {
        id: "re-1",
        routine_id: "routine-1",
        exercise_id: "ex-1",
        target_sets: 3,
        target_reps: 10,
        target_weight_kg: null,
        target_duration_seconds: null,
        rest_timer_seconds: 90,
        notes: null,
        sort_order: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        exercise: {
          id: "ex-1",
          name: "Bench Press",
          category: "chest",
          equipment: null,
          default_target_muscles: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      },
    ] as unknown as RoutineWithExercises["exercises"],
  });

describe("RoutineForm", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSaved: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    capturedPicker.onSelectExercise = null;
    capturedList.onUpdate = null;
    capturedList.onRemove = null;
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

  it("renders Create title and button in create mode", () => {
    render(<RoutineForm {...defaultProps} routine={null} />);

    expect(screen.getByText("createRoutine")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "create" })
    ).toBeInTheDocument();
  });

  it("renders Edit title and save button in edit mode", () => {
    render(<RoutineForm {...defaultProps} routine={makeRoutine()} />);

    expect(screen.getByText("editRoutine")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "save" })
    ).toBeInTheDocument();
  });

  it("does NOT render exercise-management section in create mode", () => {
    render(<RoutineForm {...defaultProps} routine={null} />);

    expect(screen.queryByTestId("exercise-list")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /addExercise/ })
    ).not.toBeInTheDocument();
  });

  it("renders exercise-management section only in edit mode", () => {
    render(
      <RoutineForm {...defaultProps} routine={routineWithExercises()} />
    );

    expect(screen.getByTestId("exercise-list")).toBeInTheDocument();
    expect(screen.getByTestId("exercise-list")).toHaveTextContent(
      "exercises:1"
    );
    expect(screen.getByText("addExercise")).toBeInTheDocument();
  });

  it("shows a validation error when submitting with an empty name", async () => {
    const onSaved = vi.fn();
    render(
      <RoutineForm {...defaultProps} routine={null} onSaved={onSaved} />
    );

    fireEvent.click(screen.getByRole("button", { name: "create" }));

    // Zod min(1) on name — FormMessage should display the error
    await waitFor(() => {
      // react-hook-form surfaces the zod message in a FormMessage element
      const messages = document.querySelectorAll('[id$="-message"]');
      const texts = Array.from(messages).map((m) => m.textContent ?? "");
      expect(texts.some((t) => t.length > 0)).toBe(true);
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("submits create with POST /api/routines and the form payload", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <RoutineForm
        {...defaultProps}
        routine={null}
        onSaved={onSaved}
        onOpenChange={onOpenChange}
      />
    );

    const nameInput = screen.getByRole("textbox", { name: "name" });
    fireEvent.change(nameInput, { target: { value: "Leg Day" } });
    const notesInput = screen.getByRole("textbox", { name: "notes" });
    fireEvent.change(notesInput, { target: { value: "Squats" } });

    fireEvent.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Leg Day", notes: "Squats" }),
      });
    });

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith("createSuccess");
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("submits edit with PATCH /api/routines/:id", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    render(<RoutineForm {...defaultProps} routine={makeRoutine()} />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("Push Day")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/routines/routine-1",
        expect.objectContaining({ method: "PATCH" })
      );
    });

    expect(mockToastSuccess).toHaveBeenCalledWith("updateSuccess");
  });

  it("surfaces server error message as a toast on submit failure", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Name already in use" }),
    });

    render(<RoutineForm {...defaultProps} routine={null} />);

    fireEvent.change(screen.getByRole("textbox", { name: "name" }), {
      target: { value: "Duplicate" },
    });

    fireEvent.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Name already in use");
    });
  });

  it("falls back to generic message when server returns no JSON body", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    });

    render(<RoutineForm {...defaultProps} routine={null} />);
    fireEvent.change(screen.getByRole("textbox", { name: "name" }), {
      target: { value: "X" },
    });
    fireEvent.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Failed to save routine");
    });
  });

  it("cancel button closes the dialog without submitting", () => {
    const onOpenChange = vi.fn();
    render(
      <RoutineForm
        {...defaultProps}
        routine={null}
        onOpenChange={onOpenChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "deleteCancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  describe("exercise management (edit mode)", () => {
    it("clicking Add Exercise opens the picker", () => {
      render(
        <RoutineForm {...defaultProps} routine={routineWithExercises()} />
      );

      expect(screen.queryByTestId("picker-select")).not.toBeInTheDocument();
      fireEvent.click(screen.getByText("addExercise"));
      expect(screen.getByTestId("picker-select")).toBeInTheDocument();
    });

    it("selecting an exercise POSTs to /api/routines/:id/exercises", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      render(
        <RoutineForm {...defaultProps} routine={routineWithExercises()} />
      );

      fireEvent.click(screen.getByText("addExercise"));
      fireEvent.click(screen.getByTestId("picker-select"));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/routines/routine-1/exercises",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              exercise_id: "11111111-1111-1111-1111-111111111111",
            }),
          })
        );
      });
      expect(mockToastSuccess).toHaveBeenCalledWith("exerciseAdded");
    });

    it("add-exercise failure surfaces an error toast", async () => {
      mockFetch.mockResolvedValue({ ok: false });
      render(
        <RoutineForm {...defaultProps} routine={routineWithExercises()} />
      );

      fireEvent.click(screen.getByText("addExercise"));
      fireEvent.click(screen.getByTestId("picker-select"));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith("addExerciseError");
      });
    });

    it("remove-exercise DELETEs the routine-exercise", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      render(
        <RoutineForm {...defaultProps} routine={routineWithExercises()} />
      );

      // Trigger the captured onRemove callback
      expect(capturedList.onRemove).toBeTypeOf("function");
      await capturedList.onRemove!("re-1");

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/routines/routine-1/exercises/re-1",
          { method: "DELETE" }
        );
      });
      expect(mockToastSuccess).toHaveBeenCalledWith("exerciseRemoved");
    });

    it("remove-exercise failure surfaces an error toast", async () => {
      mockFetch.mockResolvedValue({ ok: false });
      render(
        <RoutineForm {...defaultProps} routine={routineWithExercises()} />
      );

      await capturedList.onRemove!("re-1");

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith("removeExerciseError");
      });
    });

    it("update-exercise PATCHes the routine-exercise with the given payload", async () => {
      mockFetch.mockResolvedValue({ ok: true });
      render(
        <RoutineForm {...defaultProps} routine={routineWithExercises()} />
      );

      await capturedList.onUpdate!("re-1", { target_sets: 5 });

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/routines/routine-1/exercises/re-1",
          expect.objectContaining({
            method: "PATCH",
            body: JSON.stringify({ target_sets: 5 }),
          })
        );
      });
    });

    it("update-exercise failure surfaces an error toast", async () => {
      mockFetch.mockResolvedValue({ ok: false });
      render(
        <RoutineForm {...defaultProps} routine={routineWithExercises()} />
      );

      await capturedList.onUpdate!("re-1", { target_sets: 5 });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith("updateExerciseError");
      });
    });
  });

  it("has no accessibility violations", async () => {
    const { baseElement } = render(
      <RoutineForm {...defaultProps} routine={null} />
    );

    const results = await axe(baseElement, {
      rules: {
        // Dialog and icon-only toggles trip these rules in isolation;
        // they're component-library concerns outside this unit test.
        "button-name": { enabled: false },
      },
    });
    expect(results).toHaveNoViolations();
  });
});
