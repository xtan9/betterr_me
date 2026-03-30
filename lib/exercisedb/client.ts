import type { ExerciseDBEntry } from "./types";

const BASE_URL = "https://exercisedb.p.rapidapi.com";

export class ExerciseDBClient {
  private headers: Record<string, string>;

  constructor(apiKey: string) {
    this.headers = {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": "exercisedb.p.rapidapi.com",
    };
  }

  async fetchAll(limit = 1400, offset = 0): Promise<ExerciseDBEntry[]> {
    const url = `${BASE_URL}/exercises?limit=${limit}&offset=${offset}`;
    const response = await fetch(url, { headers: this.headers });

    if (!response.ok) {
      throw new Error(
        `ExerciseDB API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<ExerciseDBEntry[]>;
  }

  async fetchById(id: string): Promise<ExerciseDBEntry> {
    const url = `${BASE_URL}/exercises/exercise/${id}`;
    const response = await fetch(url, { headers: this.headers });

    if (!response.ok) {
      throw new Error(
        `ExerciseDB API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<ExerciseDBEntry>;
  }
}
