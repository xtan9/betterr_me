import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { ExerciseForm } from "@/components/fitness/exercise-library/exercise-form";
import type { Exercise } from "@/lib/db/types";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-1",
    user_id: "u-1",
    name: "Old Name",
    muscle_group_primary: "back",
    muscle_groups_secondary: [],
    equipment: "dumbbell",
    exercise_type: "weight_reps",
    is_custom: true,
    created_at: "2026-02-22T00:00:00Z",
    updated_at: "2026-02-22T00:00:00Z",
    exercise_media: null,
    ...overrides,
  };
}

describe("ExerciseForm", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders create title when no exercise is provided", () => {
    render(
      <ExerciseForm open onOpenChange={vi.fn()} onSaved={vi.fn()} />
    );
    expect(
      screen.getByRole("heading", { name: "createCustom" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "create" })).toBeInTheDocument();
  });

  it("renders edit title and prefills values when exercise is provided", () => {
    render(
      <ExerciseForm
        open
        onOpenChange={vi.fn()}
        exercise={makeExercise()}
        onSaved={vi.fn()}
      />
    );
    expect(
      screen.getByRole("heading", { name: "editExercise" })
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "name" })).toHaveValue(
      "Old Name"
    );
    expect(screen.getByRole("button", { name: "save" })).toBeInTheDocument();
  });

  it("shows validation error when name is blank on submit", async () => {
    const user = userEvent.setup();
    render(<ExerciseForm open onOpenChange={vi.fn()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => {
      expect(screen.getByText(/Name is required/i)).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("submits POST to /api/exercises on create and calls onSaved", async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const user = userEvent.setup();

    render(
      <ExerciseForm open onOpenChange={onOpenChange} onSaved={onSaved} />
    );

    await user.type(
      screen.getByRole("textbox", { name: "name" }),
      "Goblet Squat"
    );
    await user.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe("/api/exercises");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("Goblet Squat");
    expect(body.muscle_group_primary).toBe("chest"); // default
    expect(body.equipment).toBe("barbell"); // default
    expect(body.exercise_type).toBe("weight_reps"); // default
    expect(body.muscle_groups_secondary).toEqual([]);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("createSuccess"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalled();
  });

  it("submits PATCH to /api/exercises/:id when editing", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const user = userEvent.setup();

    render(
      <ExerciseForm
        open
        onOpenChange={vi.fn()}
        exercise={makeExercise()}
        onSaved={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "save" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe("/api/exercises/ex-1");
    expect(init.method).toBe("PATCH");

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("saveSuccess"));
  });

  it("shows error toast when the request fails", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server said no" }),
    });
    const user = userEvent.setup();

    render(<ExerciseForm open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    await user.type(
      screen.getByRole("textbox", { name: "name" }),
      "Valid Name"
    );
    await user.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Server said no"));
  });

  it("closes the dialog when cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ExerciseForm open onOpenChange={onOpenChange} onSaved={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("toggles a secondary muscle checkbox when clicked", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    const user = userEvent.setup();

    render(<ExerciseForm open onOpenChange={vi.fn()} onSaved={vi.fn()} />);

    // Primary defaults to "chest" — back should be visible as secondary option
    const backCheckbox = screen.getByRole("checkbox", {
      name: "muscleGroups.back",
    });
    expect(backCheckbox).toHaveAttribute("aria-checked", "false");
    await user.click(backCheckbox);
    expect(backCheckbox).toHaveAttribute("aria-checked", "true");

    await user.type(
      screen.getByRole("textbox", { name: "name" }),
      "Thing"
    );
    await user.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.muscle_groups_secondary).toContain("back");
  });

  it("has no accessibility violations", async () => {
    const { baseElement } = render(
      <ExerciseForm open onOpenChange={vi.fn()} onSaved={vi.fn()} />
    );
    // Radix SelectTrigger button name resolves via portaled value — skip button-name
    expect(
      await axe(baseElement, { rules: { "button-name": { enabled: false } } })
    ).toHaveNoViolations();
  });
});
