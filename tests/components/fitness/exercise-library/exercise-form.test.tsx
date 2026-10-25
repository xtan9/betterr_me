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
    id: "64181000-0000-4000-8000-000000000010",
    version: "1",
    user_id: "64181000-0000-4000-8000-000000000001",
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
    localStorage.clear();
  });

  it("renders create title when no exercise is provided", () => {
    render(
      <ExerciseForm ownerId="64181000-0000-4000-8000-000000000001" canCreate open onOpenChange={vi.fn()} onSaved={vi.fn()} />
    );
    expect(
      screen.getByRole("heading", { name: "createCustom" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "create" })).toBeInTheDocument();
  });

  it("renders edit title and prefills values when exercise is provided", () => {
    render(
      <ExerciseForm ownerId="64181000-0000-4000-8000-000000000001" canCreate
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
    render(<ExerciseForm ownerId="64181000-0000-4000-8000-000000000001" canCreate open onOpenChange={vi.fn()} onSaved={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => {
      expect(screen.getByText(/Name is required/i)).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("submits a durable create command and calls onSaved only after its validated receipt", async () => {
    const onOpenChange = vi.fn();
    const onSaved = vi.fn();
    (global.fetch as any).mockImplementation(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      return Response.json({protocolVersion:1,receipt:{operationId:request.operationId,operation:request.command.kind,
        ownerId:"64181000-0000-4000-8000-000000000001",exerciseId:request.operationId,acceptedAt:"2026-10-25T10:00:00Z",
        definition:{id:request.operationId,ownerId:"64181000-0000-4000-8000-000000000001",...request.command.definition,
          archivedAt:null,version:"1",createdAt:null,updatedAt:null}}});
    });
    const user = userEvent.setup();

    render(
      <ExerciseForm ownerId="64181000-0000-4000-8000-000000000001" canCreate open onOpenChange={onOpenChange} onSaved={onSaved} />
    );

    await user.type(
      screen.getByRole("textbox", { name: "name" }),
      "Goblet Squat"
    );
    await user.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe("/api/exercises/commands");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.command.definition.name).toBe("Goblet Squat");
    expect(body.command.definition.primaryMuscle).toBe("other"); // visible default
    expect(body.command.definition.equipment).toBe("barbell"); // default
    expect(body.command.definition.mode).toBe("weight_reps"); // default
    expect(body.command.definition.secondaryMuscles).toEqual([]);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("createSuccess"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSaved).toHaveBeenCalled();
  });

  it("closes an unchanged edit without writing a new operation", async () => {
    const close = vi.fn();
    render(<ExerciseForm open exercise={makeExercise()} onOpenChange={close} onSaved={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole("button", {name:"save"}));
    await waitFor(()=>expect(close).toHaveBeenCalledWith(false));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows error toast when the request fails", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server said no" }),
    });
    const user = userEvent.setup();

    render(<ExerciseForm ownerId="64181000-0000-4000-8000-000000000001" canCreate open onOpenChange={vi.fn()} onSaved={vi.fn()} />);
    await user.type(
      screen.getByRole("textbox", { name: "name" }),
      "Valid Name"
    );
    await user.click(screen.getByRole("button", { name: "create" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("commandFailed"));
  });

  it("closes the dialog when cancel is clicked", async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ExerciseForm ownerId="64181000-0000-4000-8000-000000000001" canCreate open onOpenChange={onOpenChange} onSaved={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("toggles a secondary muscle checkbox when clicked", async () => {
    (global.fetch as any).mockImplementation(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      return Response.json({protocolVersion:1,receipt:{operationId:request.operationId,operation:request.command.kind,
        ownerId:"64181000-0000-4000-8000-000000000001",exerciseId:request.operationId,acceptedAt:"2026-10-25T10:00:00Z",
        definition:{id:request.operationId,ownerId:"64181000-0000-4000-8000-000000000001",...request.command.definition,
          archivedAt:null,version:"1",createdAt:null,updatedAt:null}}});
    });
    const user = userEvent.setup();

    render(<ExerciseForm ownerId="64181000-0000-4000-8000-000000000001" canCreate open onOpenChange={vi.fn()} onSaved={vi.fn()} />);

    // Primary defaults to "other" — back should be visible as secondary option
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
    expect(body.command.definition.secondaryMuscles).toContain("back");
  });

  it("has no accessibility violations", async () => {
    const { baseElement } = render(
      <ExerciseForm ownerId="64181000-0000-4000-8000-000000000001" canCreate open onOpenChange={vi.fn()} onSaved={vi.fn()} />
    );
    // Radix SelectTrigger button name resolves via portaled value — skip button-name
    expect(
      await axe(baseElement, { rules: { "button-name": { enabled: false } } })
    ).toHaveNoViolations();
  });
});
