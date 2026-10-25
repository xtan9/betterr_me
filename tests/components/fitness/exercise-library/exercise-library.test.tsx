import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { ExerciseLibrary } from "@/components/fitness/exercise-library/exercise-library";
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

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

const { mockUseExercises } = vi.hoisted(() => ({
  mockUseExercises: vi.fn(),
}));

vi.mock("@/lib/hooks/use-exercises", () => ({
  useExercises: (...args: unknown[]) => ({ownerId:"64181000-0000-4000-8000-000000000001",canCreate:true,journal:null,...mockUseExercises(...args)}),
}));

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "ex-1",
    user_id: "64181000-0000-4000-8000-000000000001",
    version: "1",
    name: "Bench Press",
    muscle_group_primary: "chest",
    muscle_groups_secondary: [],
    equipment: "barbell",
    exercise_type: "weight_reps",
    is_custom: false,
    created_at: "2026-02-22T00:00:00Z",
    updated_at: "2026-02-22T00:00:00Z",
    exercise_media: null,
    ...overrides,
  };
}

describe("ExerciseLibrary", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    localStorage.clear();
  });

  it("renders loading skeletons while exercises are loading", () => {
    mockUseExercises.mockReturnValue({
      exercises: [],
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
    });

    const { container } = render(<ExerciseLibrary />);
    // Skeletons render as divs with animate-pulse; check we're not in title state
    expect(
      screen.queryByRole("heading", { name: "title" })
    ).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("renders error message when the hook reports an error", () => {
    mockUseExercises.mockReturnValue({
      exercises: [],
      error: new Error("boom"),
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<ExerciseLibrary />);
    expect(screen.getByText("loadError")).toBeInTheDocument();
  });

  it("renders the title, create button, and groups exercises by muscle group", () => {
    mockUseExercises.mockReturnValue({
      exercises: [
        makeExercise({ id: "a", name: "Bench Press", muscle_group_primary: "chest" }),
        makeExercise({ id: "b", name: "Squat", muscle_group_primary: "quadriceps" }),
      ],
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    render(<ExerciseLibrary />);

    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /createCustom/ })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bench Press" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Squat" })).toBeInTheDocument();
    // Group headers show translation key + count
    expect(screen.getByText(/muscleGroups\.chest \(1\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/muscleGroups\.quadriceps \(1\)/)
    ).toBeInTheDocument();
  });

  it("filters exercises by search text (client-side)", async () => {
    mockUseExercises.mockReturnValue({
      exercises: [
        makeExercise({ id: "a", name: "Bench Press" }),
        makeExercise({ id: "b", name: "Squat", muscle_group_primary: "quadriceps" }),
      ],
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
    const user = userEvent.setup();

    render(<ExerciseLibrary />);

    await user.type(
      screen.getByPlaceholderText("searchPlaceholder"),
      "bench"
    );

    expect(screen.getByRole("heading", { name: "Bench Press" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Squat" })
    ).not.toBeInTheDocument();
  });

  it("shows the empty-results state when search matches nothing", async () => {
    mockUseExercises.mockReturnValue({
      exercises: [makeExercise({ name: "Bench Press" })],
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
    const user = userEvent.setup();

    render(<ExerciseLibrary />);
    await user.type(
      screen.getByPlaceholderText("searchPlaceholder"),
      "xxxxxxxxx"
    );

    expect(screen.getByText("noResults")).toBeInTheDocument();
    expect(screen.getByText("noResultsDescription")).toBeInTheDocument();
  });

  it("opens the create form when the create button is clicked", async () => {
    mockUseExercises.mockReturnValue({
      exercises: [],
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
    const user = userEvent.setup();

    render(<ExerciseLibrary />);

    await user.click(screen.getByRole("button", { name: /createCustom/ }));

    // Dialog title appears
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "createCustom" })
      ).toBeInTheDocument();
    });
  });

  it("opens the archive confirmation and sends a versioned command", async () => {
    const mutate = vi.fn();
    const custom = makeExercise({ id: "64181000-0000-4000-8000-000000000010", name: "Custom Row", is_custom: true });
    mockUseExercises.mockReturnValue({
      exercises: [custom],
      error: undefined,
      isLoading: false,
      mutate,
    });

    (global.fetch as any).mockImplementation(async (_url:string,init:RequestInit)=>{
      const request=JSON.parse(String(init.body));
      return Response.json({protocolVersion:1,receipt:{operationId:request.operationId,operation:"archive",ownerId:custom.user_id,
        exerciseId:custom.id,acceptedAt:"2026-10-25T10:00:00Z",definition:{id:custom.id,ownerId:custom.user_id,name:custom.name,
          equipment:custom.equipment,mode:custom.exercise_type,convention:null,primaryMuscle:custom.muscle_group_primary,
          secondaryMuscles:custom.muscle_groups_secondary,archivedAt:"2026-10-25T10:00:00Z",version:"2",createdAt:null,updatedAt:null}}});
    });
    const user = userEvent.setup();

    render(<ExerciseLibrary />);

    // Open card action menu
    await user.click(screen.getByRole("button", { name: /actions/i }));
    const deleteItem = await screen.findByRole("menuitem", {
      name: /archiveExercise/,
    });
    await user.click(deleteItem);

    // Alert dialog shows
    expect(
      await screen.findByRole("heading",{name:"archiveExercise"})
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "archiveExercise" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/exercises/commands",
        expect.objectContaining({ method: "POST" })
      )
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("archiveSuccess")
    );
    expect(mutate).toHaveBeenCalled();
  });

  it("shows a sanitized error when archive remains unconfirmed", async () => {
    const custom = makeExercise({ id: "64181000-0000-4000-8000-000000000010", name: "Custom Row", is_custom: true });
    mockUseExercises.mockReturnValue({
      exercises: [custom],
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    (global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "nope" }),
    });
    const user = userEvent.setup();

    render(<ExerciseLibrary />);
    await user.click(screen.getByRole("button", { name: /actions/i }));
    const deleteItem = await screen.findByRole("menuitem", {
      name: /archiveExercise/,
    });
    await user.click(deleteItem);
    await user.click(screen.getByRole("button", { name: "archiveExercise" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("commandFailed"));
  });

  it("opens the edit form when edit menuitem is clicked on a custom exercise", async () => {
    const custom = makeExercise({ id: "64181000-0000-4000-8000-000000000010", name: "Row Variant", is_custom: true });
    mockUseExercises.mockReturnValue({
      exercises: [custom],
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
    const user = userEvent.setup();

    render(<ExerciseLibrary />);
    await user.click(screen.getByRole("button", { name: /actions/i }));
    const editItem = await screen.findByRole("menuitem", {
      name: /editExercise/,
    });
    await user.click(editItem);

    // Edit dialog title appears
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "editExercise" })
      ).toBeInTheDocument();
    });

    // Close via cancel — exercises the handleFormClose branch that resets editingExercise
    await user.click(screen.getByRole("button", { name: "cancel" }));
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "editExercise" })
      ).not.toBeInTheDocument();
    });
  });

  it("cancels archive without creating an operation", async () => {
    const custom = makeExercise({ id: "64181000-0000-4000-8000-000000000010", is_custom: true });
    mockUseExercises.mockReturnValue({
      exercises: [custom],
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });
    const user = userEvent.setup();

    render(<ExerciseLibrary />);
    await user.click(screen.getByRole("button", { name: /actions/i }));
    const deleteItem = await screen.findByRole("menuitem", {
      name: /archiveExercise/,
    });
    await user.click(deleteItem);

    await user.click(screen.getByRole("button", { name: "deleteCancel" }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("has no accessibility violations in the loaded state", async () => {
    mockUseExercises.mockReturnValue({
      exercises: [makeExercise()],
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
    });

    const { container } = render(<ExerciseLibrary />);
    expect(
      await axe(container, { rules: { "button-name": { enabled: false } } })
    ).toHaveNoViolations();
  });
});
