import { afterEach, expect, it, vi } from "vitest";
import {
  currentExerciseCommand,
  prepareExerciseCommand,
  resolveExerciseRejection,
  sendExerciseCommand,
} from "@/lib/fitness/exercise-command-client";
import contract from "@/tests/fixtures/train-custom-exercise-contract.json";

const owner = contract.create.response.receipt.ownerId;
afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});
function receipt(operationId: string) {
  const original = contract.create.response.receipt;
  return {
    protocolVersion: 1,
    receipt: {
      ...original,
      operationId,
      exerciseId: operationId,
      definition: { ...original.definition, id: operationId },
    },
  };
}

it("does not replace a journal whose persisted lifecycle state is unsupported", () => {
  const request = prepareExerciseCommand(
    owner,
    contract.create.request.command,
  );
  const key = `train:exercise-command:${owner}:${request.operationId}`;
  const unsupported = JSON.stringify({
    ownerId: owner,
    request,
    state: "future-terminal-state",
  });
  localStorage.setItem(key, unsupported);
  expect(() =>
    prepareExerciseCommand(owner, contract.create.request.command),
  ).toThrow("invalid_command_journal");
  expect(localStorage.getItem(key)).toBe(unsupported);
  expect(localStorage.getItem(`train:exercise-command-active:${owner}`)).toBe(
    request.operationId,
  );
});

it("does not let a delayed duplicate acknowledgment remove a newer saved command", async () => {
  const waiting: ((response: Response) => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise<Response>((resolve) => waiting.push(resolve))),
  );
  const first = prepareExerciseCommand(owner, contract.create.request.command);
  const one = sendExerciseCommand(owner, first),
    duplicate = sendExerciseCommand(owner, first);
  waiting[0](Response.json(receipt(first.operationId)));
  await one;
  const next = prepareExerciseCommand(owner, {
    ...contract.create.request.command,
    definition: {
      ...contract.create.request.command.definition,
      name: "Next definition",
    },
  });
  waiting[1](Response.json(receipt(first.operationId)));
  await duplicate;
  expect(currentExerciseCommand(owner)).toMatchObject({
    state: "pending",
    request: next,
  });
});

it("retains pending work when a same-owner success does not describe the requested definition", async () => {
  const request = prepareExerciseCommand(
    owner,
    contract.create.request.command,
  );
  const response = receipt(request.operationId);
  response.receipt.definition.name = "Unrelated result";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(response)),
  );
  await expect(sendExerciseCommand(owner, request)).rejects.toThrow(
    "invalid_response",
  );
  expect(currentExerciseCommand(owner)).toMatchObject({
    state: "pending",
    request,
  });
});

it.each(["missing", "cycle", "owner", "target"])(
  "keeps a broken replacement chain unavailable without discarding it: %s",
  async (damage) => {
    const request = prepareExerciseCommand(
      owner,
      contract.rename.request.command,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            ...contract.versionConflict.response,
            rejection: {
              ...contract.versionConflict.response.rejection,
              operationId: request.operationId,
            },
          },
          { status: 409 },
        ),
      ),
    );
    await expect(sendExerciseCommand(owner, request)).rejects.toThrow(
      "version_conflict",
    );
    const replacement = resolveExerciseRejection(owner, {
      ...request.command,
      expectedVersion: "2",
    })!;
    const oldKey = `train:exercise-command:${owner}:${request.operationId}`;
    const nextKey = `train:exercise-command:${owner}:${replacement.operationId}`;
    localStorage.setItem(
      `train:exercise-command-active:${owner}`,
      request.operationId,
    );
    if (damage === "missing") localStorage.removeItem(nextKey);
    else if (damage === "cycle")
      localStorage.setItem(
        oldKey,
        JSON.stringify({
          ...JSON.parse(localStorage.getItem(oldKey)!),
          replacementOperationId: request.operationId,
        }),
      );
    else {
      const next = JSON.parse(localStorage.getItem(nextKey)!);
      if (damage === "owner")
        next.ownerId = "99999999-9999-4999-8999-999999999999";
      else
        next.request.command.exerciseId =
          "99999999-9999-4999-8999-999999999999";
      localStorage.setItem(nextKey, JSON.stringify(next));
    }
    const before = [
      localStorage.getItem(oldKey),
      localStorage.getItem(nextKey),
    ];
    expect(() => currentExerciseCommand(owner)).toThrow(
      "invalid_command_journal",
    );
    expect(() =>
      prepareExerciseCommand(owner, contract.create.request.command),
    ).toThrow("invalid_command_journal");
    expect([
      localStorage.getItem(oldKey),
      localStorage.getItem(nextKey),
    ]).toEqual(before);
    expect(localStorage.getItem(`train:exercise-command-active:${owner}`)).toBe(
      request.operationId,
    );
  },
);
