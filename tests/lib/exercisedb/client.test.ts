import { describe, it, expect, vi, beforeEach } from "vitest";
import { ExerciseDBClient } from "@/lib/exercisedb/client";
import type { ExerciseDBEntry } from "@/lib/exercisedb/types";

const mockExercise: ExerciseDBEntry = {
  id: "0001",
  name: "3/4 sit-up",
  bodyPart: "waist",
  target: "abs",
  secondaryMuscles: ["hip flexors"],
  equipment: "body weight",
  gifUrl: "https://v2.exercisedb.io/image/0001.gif",
  instructions: ["Lie flat on your back", "Curl up to 3/4 position"],
};

describe("ExerciseDBClient", () => {
  let client: ExerciseDBClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new ExerciseDBClient("test-api-key");
  });

  describe("fetchAll", () => {
    it("sends correct URL with limit and offset params", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([mockExercise]),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.fetchAll(100, 50);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://exercisedb.p.rapidapi.com/exercises?limit=100&offset=50",
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it("sends X-RapidAPI-Key and X-RapidAPI-Host headers", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([mockExercise]),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.fetchAll();

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders["X-RapidAPI-Key"]).toBe("test-api-key");
      expect(callHeaders["X-RapidAPI-Host"]).toBe(
        "exercisedb.p.rapidapi.com"
      );
    });

    it("returns parsed JSON array", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([mockExercise]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await client.fetchAll();

      expect(result).toEqual([mockExercise]);
      expect(result).toHaveLength(1);
    });

    it("throws on non-ok response (status 429)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.fetchAll()).rejects.toThrow(
        "ExerciseDB API error: 429 Too Many Requests"
      );
    });
  });

  describe("fetchById", () => {
    it("sends correct URL with exercise ID", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockExercise),
      });
      vi.stubGlobal("fetch", mockFetch);

      await client.fetchById("0001");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://exercisedb.p.rapidapi.com/exercises/exercise/0001",
        expect.objectContaining({ headers: expect.any(Object) })
      );
    });

    it("throws on non-ok response (status 404)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(client.fetchById("9999")).rejects.toThrow(
        "ExerciseDB API error: 404 Not Found"
      );
    });
  });
});
