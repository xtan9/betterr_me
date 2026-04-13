import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { ExerciseCard } from "@/components/fitness/exercise-library/exercise-card";
import type { Exercise } from "@/lib/db/types";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/fitness/exercise-thumbnail", () => ({
  ExerciseThumbnail: ({ exerciseName }: { exerciseName: string }) => (
    <div data-testid="thumb">{exerciseName}</div>
  ),
}));

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-1",
    user_id: null,
    name: "Bench Press",
    muscle_group_primary: "chest",
    muscle_groups_secondary: ["triceps"],
    equipment: "barbell",
    exercise_type: "weight_reps",
    is_custom: false,
    created_at: "2026-02-22T00:00:00Z",
    updated_at: "2026-02-22T00:00:00Z",
    exercise_media: null,
    ...overrides,
  };
}

describe("ExerciseCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders exercise name and links to detail page", () => {
    render(<ExerciseCard exercise={makeExercise()} />);

    expect(
      screen.getByRole("heading", { name: "Bench Press" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/workouts/exercises/ex-1"
    );
  });

  it("renders muscle group, equipment, and secondary muscle badges", () => {
    render(<ExerciseCard exercise={makeExercise()} />);

    expect(screen.getByText("muscleGroups.chest")).toBeInTheDocument();
    expect(screen.getByText("equipmentTypes.barbell")).toBeInTheDocument();
    expect(screen.getByText("muscleGroups.triceps")).toBeInTheDocument();
  });

  it("renders tracking fields derived from exercise_type", () => {
    render(<ExerciseCard exercise={makeExercise()} />);
    // weight_reps -> Weight + Reps
    expect(
      screen.getByText(/Weight \+ Reps/)
    ).toBeInTheDocument();
  });

  it("does not render the custom badge or action menu for preset exercises", () => {
    render(
      <ExerciseCard
        exercise={makeExercise({ is_custom: false })}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    expect(screen.queryByText("custom")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /actions/i })
    ).not.toBeInTheDocument();
  });

  it("renders custom badge and action menu for custom exercises", async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const user = userEvent.setup();
    const exercise = makeExercise({ is_custom: true });

    render(
      <ExerciseCard
        exercise={exercise}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText("custom")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /actions/i }));

    const editItem = await screen.findByRole("menuitem", {
      name: /editExercise/,
    });
    await user.click(editItem);
    expect(onEdit).toHaveBeenCalledWith(exercise);
  });

  it("fires onDelete with exercise when delete menuitem is clicked", async () => {
    const onDelete = vi.fn();
    const user = userEvent.setup();
    const exercise = makeExercise({ is_custom: true });

    render(<ExerciseCard exercise={exercise} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: /actions/i }));

    const deleteItem = await screen.findByRole("menuitem", {
      name: /deleteExercise/,
    });
    await user.click(deleteItem);

    expect(onDelete).toHaveBeenCalledWith(exercise);
  });

  it("renders cardio exercise_type without tracking-field suffix when no flags apply", () => {
    render(
      <ExerciseCard
        exercise={makeExercise({
          exercise_type: "bodyweight_reps",
          muscle_groups_secondary: [],
        })}
      />
    );
    // bodyweight_reps has showReps=true, so suffix appears
    expect(screen.getByText(/Reps/)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <ExerciseCard exercise={makeExercise({ is_custom: true })} onEdit={vi.fn()} />
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
