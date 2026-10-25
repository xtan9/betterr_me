import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExerciseLibrary } from "@/components/fitness/exercise-library/exercise-library";
import messages from "@/i18n/messages/en.json";

const owner = "64181000-0000-4000-8000-000000000001";
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: auth.getSession,
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
beforeEach(() => {
  auth.getSession.mockResolvedValue({
    data: { session: { user: { id: owner } } },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const mount = () =>
  render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <ExerciseLibrary />
      </NextIntlClientProvider>
    </SWRConfig>,
  );

it("shows an unavailable library when session recovery fails without issuing an ownerless read", async () => {
  auth.getSession.mockRejectedValue(new Error("Device session unavailable"));
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  mount();
  await screen.findByText(messages.exercises.loadError);
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: messages.exercises.createCustom }),
  ).not.toBeInTheDocument();
});

it("retains an unreadable saved command and blocks replacement rather than discarding the intention", async () => {
  const operation = "64181000-0000-4000-8000-000000000099";
  const key = `train:exercise-command:${owner}:${operation}`;
  localStorage.setItem(`train:exercise-command-active:${owner}`, operation);
  localStorage.setItem(key, "{unfinished");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        ownerId: owner,
        exercises: [],
        customExercises: { contractVersion: 1, ready: true },
      }),
    ),
  );
  mount();
  await screen.findByText(messages.exercises.loadError);
  expect(localStorage.getItem(key)).toBe("{unfinished");
  expect(localStorage.getItem(`train:exercise-command-active:${owner}`)).toBe(
    operation,
  );
  expect(
    screen.queryByRole("button", { name: messages.exercises.createCustom }),
  ).not.toBeInTheDocument();
});
const customRow = () => ({
  id: "64181000-0000-4000-8000-000000000010",
  user_id: owner,
  name: "Owned exercise",
  is_custom: true,
  equipment: "barbell",
  exercise_type: "weight_reps",
  muscle_group_primary: "other",
  muscle_groups_secondary: [] as string[],
  catalog_key: null,
  measurement_convention: "barbell-total",
  version: "1",
  archived_at: null as string | null,
  created_at: null,
  updated_at: null,
  exercise_media: null,
});
type Row = ReturnType<typeof customRow>;
function accepted(
  request: { operationId: string; command: Record<string, unknown> },
  row: Row,
) {
  return {
    protocolVersion: 1,
    receipt: {
      operationId: request.operationId,
      operation: request.command.kind,
      ownerId: owner,
      exerciseId: row.id,
      acceptedAt: "2026-10-25T10:00:00Z",
      definition: {
        id: row.id,
        ownerId: owner,
        name: row.name,
        equipment: row.equipment,
        mode: row.exercise_type,
        convention: row.measurement_convention,
        primaryMuscle: row.muscle_group_primary,
        secondaryMuscles: row.muscle_groups_secondary,
        archivedAt: row.archived_at,
        version: row.version,
        createdAt: null,
        updatedAt: null,
      },
    },
  };
}

it("renames through the real library/form/hook while preserving unsupported meaning and unknown metadata", async () => {
  const row = {
    id: "64181000-0000-4000-8000-000000000010",
    user_id: owner,
    name: "Legacy band timer",
    is_custom: true,
    equipment: "band",
    exercise_type: "duration_weight",
    muscle_group_primary: "other",
    muscle_groups_secondary: ["legacy-muscle"],
    catalog_key: null,
    measurement_convention: null,
    version: "9007199254740992",
    archived_at: null,
    created_at: null,
    updated_at: null,
    exercise_media: null,
  };
  const commands: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/exercises") && !init?.method)
        return Response.json({
          ownerId: owner,
          exercises: [row],
          customExercises: { contractVersion: 1, ready: true },
        });
      if (url === "/api/exercises/commands" && init?.method === "POST") {
        const input = JSON.parse(String(init.body));
        commands.push(input);
        if (
          input.command?.kind !== "update-metadata" ||
          Object.keys(input.command.patch).join(",") !== "name"
        )
          return Response.json(
            { protocolVersion: 1, error: { code: "invalid_request" } },
            { status: 400 },
          );
        row.name = input.command.patch.name;
        row.version = "9007199254740993";
        return Response.json({
          protocolVersion: 1,
          receipt: {
            operationId: input.operationId,
            operation: "update-metadata",
            ownerId: owner,
            exerciseId: row.id,
            acceptedAt: "2026-10-25T10:00:00Z",
            definition: {
              id: row.id,
              ownerId: owner,
              name: row.name,
              equipment: row.equipment,
              mode: row.exercise_type,
              convention: null,
              primaryMuscle: "other",
              secondaryMuscles: ["legacy-muscle"],
              archivedAt: null,
              version: row.version,
              createdAt: null,
              updatedAt: null,
            },
          },
        });
      }
      return Response.json(
        { protocolVersion: 1, error: { code: "invalid_request" } },
        { status: 400 },
      );
    }),
  );
  render(
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <ExerciseLibrary />
      </NextIntlClientProvider>
    </SWRConfig>,
  );
  await screen.findByRole("heading", { name: "Legacy band timer" });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Edit Exercise" }),
  );
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
    target: { value: "Renamed band timer" },
  });
  await user.click(
    within(dialog).getByRole("button", { name: "Save Changes" }),
  );
  await screen.findByRole("heading", { name: "Renamed band timer" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(commands).toEqual([
    {
      protocolVersion: 1,
      operationId: expect.any(String),
      command: {
        kind: "update-metadata",
        exerciseId: row.id,
        expectedVersion: "9007199254740992",
        patch: { name: "Renamed band timer" },
      },
    },
  ]);
  expect(row).toMatchObject({
    equipment: "band",
    exercise_type: "duration_weight",
    muscle_groups_secondary: ["legacy-muscle"],
    measurement_convention: null,
    version: "9007199254740993",
  });
});

it("archives and restores the same definition through explicit library actions", async () => {
  const row = customRow();
  const commands: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!init?.method)
        return Response.json({
          ownerId: owner,
          exercises: [row],
          customExercises: { contractVersion: 1, ready: true },
        });
      const request = JSON.parse(String(init.body));
      commands.push(request.command);
      expect(new Headers(init.headers).get("X-Train-Owner")).toBe(owner);
      if (request.command.expectedVersion !== row.version)
        throw new Error("Unexpected stale write");
      row.archived_at =
        request.command.kind === "archive" ? "2026-10-25T10:00:00Z" : null;
      row.version = String(BigInt(row.version) + BigInt(1));
      return Response.json(accepted(request, row));
    }),
  );
  mount();
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: row.name });
  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(
    await screen.findByRole("menuitem", {
      name: messages.exercises.archiveExercise,
    }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: messages.exercises.archiveExercise,
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: row.name }),
    ).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("tab", { name: "Archived" }));
  await screen.findByRole("heading", { name: row.name });
  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(
    await screen.findByRole("menuitem", {
      name: messages.exercises.restoreExercise,
    }),
  );
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: messages.exercises.restoreExercise,
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: row.name }),
    ).not.toBeInTheDocument(),
  );
  await user.click(screen.getByRole("tab", { name: "Available" }));
  await screen.findByRole("heading", { name: row.name });
  expect(commands).toEqual([
    { kind: "archive", exerciseId: row.id, expectedVersion: "1" },
    { kind: "restore", exerciseId: row.id, expectedVersion: "2" },
  ]);
  expect(row).toMatchObject({
    id: "64181000-0000-4000-8000-000000000010",
    version: "3",
    archived_at: null,
    equipment: "barbell",
  });
});

it("keeps a lost-response create nonselectable after remount and retries the exact saved command", async () => {
  const rows: Row[] = [];
  const requests: string[] = [];
  let firstReceipt: ReturnType<typeof accepted> | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method)
        return Response.json({
          ownerId: owner,
          exercises: rows,
          customExercises: { contractVersion: 1, ready: true },
        });
      requests.push(String(init.body));
      const request = JSON.parse(String(init.body));
      if (!firstReceipt) {
        const row = {
          ...customRow(),
          id: request.operationId,
          name: request.command.definition.name,
        };
        rows.push(row);
        firstReceipt = accepted(request, row);
        throw new TypeError("Response lost after commit");
      }
      return Response.json(firstReceipt);
    }),
  );
  const view = mount();
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", {
      name: messages.exercises.createCustom,
    }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByText("Recording convention: total barbell load"),
  ).toBeInTheDocument();
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
    target: { value: "New durable definition" },
  });
  await user.click(
    within(dialog).getByRole("button", { name: messages.exercises.create }),
  );
  await waitFor(() => expect(requests).toHaveLength(1));
  await screen.findAllByText(messages.exercises.pendingCommand);
  view.unmount();
  mount();
  await screen.findByText(messages.exercises.pendingCommand);
  expect(
    screen.queryByRole("heading", { name: "New durable definition" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: messages.exercises.createCustom }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: messages.exercises.retryCommand }),
  );
  await screen.findByRole("heading", { name: "New durable definition" });
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
  expect(rows).toHaveLength(1);
});

it("changes reviewed muscle metadata without normalizing an untouched unusual legacy name", async () => {
  const row = { ...customRow(), name: "  Legacy spelling  " };
  const commands: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method)
        return Response.json({
          ownerId: owner,
          exercises: [row],
          customExercises: { contractVersion: 1, ready: true },
        });
      const request = JSON.parse(String(init.body));
      commands.push(request.command);
      row.muscle_group_primary = request.command.patch.primaryMuscle;
      row.version = "2";
      return Response.json(accepted(request, row));
    }),
  );
  mount();
  const user = userEvent.setup();
  await screen.findByRole("heading", { name: "Legacy spelling" });
  await user.click(screen.getByRole("button", { name: "Actions" }));
  await user.click(
    await screen.findByRole("menuitem", { name: "Edit Exercise" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.click(
    within(dialog).getByRole("combobox", {
      name: messages.exercises.muscleGroup,
    }),
  );
  await user.click(await screen.findByRole("option", { name: "Back" }));
  await user.click(
    within(dialog).getByRole("button", { name: "Save Changes" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(commands).toEqual([
    {
      kind: "update-metadata",
      exerciseId: row.id,
      expectedVersion: "1",
      patch: { primaryMuscle: "back" },
    },
  ]);
  expect(row.name).toBe("  Legacy spelling  ");
});

it.each([false, true])(
  "retains a reviewed replacement across remount when its final journal pointer write fails: %s",
  async (failPointer) => {
    const row = customRow();
    const requests: {
      operationId: string;
      command: Record<string, unknown>;
    }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (!init?.method)
          return Response.json({
            ownerId: owner,
            exercises: [row],
            customExercises: { contractVersion: 1, ready: true },
          });
        const request = JSON.parse(String(init.body));
        requests.push(request);
        if (requests.length === 1) {
          row.name = "Remote name";
          row.version = "2";
          return Response.json(
            {
              protocolVersion: 1,
              error: { code: "version_conflict" },
              rejection: {
                operationId: request.operationId,
                operation: "update-metadata",
                ownerId: owner,
                exerciseId: row.id,
                rejectedAt: "2026-10-25T10:00:00Z",
                code: "version_conflict",
                current: accepted(request, row).receipt.definition,
              },
            },
            { status: 409 },
          );
        }
        row.name = request.command.patch.name;
        row.version = "3";
        return Response.json(accepted(request, row));
      }),
    );
    let view = mount();
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: row.name });
    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Edit Exercise" }),
    );
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Name" }), {
      target: { value: "Reviewed proposal" },
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Save Changes" }),
    );
    await screen.findAllByText(messages.exercises.reviewConflict);
    view.unmount();
    view = mount();
    await screen.findByRole("heading", { name: "Remote name" });
    expect(requests).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: messages.exercises.reviewProposal }),
    );
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue(
      "Reviewed proposal",
    );
    let savedReplacement: (typeof requests)[number] | undefined;
    if (failPointer) {
      const originalSet = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
        this: Storage,
        key,
        value,
      ) {
        if (key === `train:exercise-command-active:${owner}`) {
          savedReplacement = JSON.parse(
            localStorage.getItem(`train:exercise-command:${owner}:${value}`)!,
          ).request;
          throw new Error("Final pointer write failed");
        }
        originalSet.call(this, key, value);
      });
    }
    await user.click(
      within(dialog).getByRole("button", {
        name: messages.exercises.applyReviewed,
      }),
    );
    if (failPointer) {
      expect(savedReplacement).toBeDefined();
      expect(requests).toHaveLength(1);
      vi.restoreAllMocks();
      view.unmount();
      mount();
      await screen.findByText(messages.exercises.pendingCommand);
      expect(
        screen.getByRole("button", { name: messages.exercises.createCustom }),
      ).toBeDisabled();
      await user.click(
        screen.getByRole("button", { name: messages.exercises.retryCommand }),
      );
    }
    await screen.findByRole("heading", { name: "Reviewed proposal" });
    expect(requests).toHaveLength(2);
    expect(requests[1].operationId).not.toBe(requests[0].operationId);
    if (failPointer) expect(requests[1]).toEqual(savedReplacement);
    expect(requests[1].command).toEqual({
      kind: "update-metadata",
      exerciseId: row.id,
      expectedVersion: "2",
      patch: { name: "Reviewed proposal" },
    });
  },
);
