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

  private async fetchWithTimeout(
    url: string
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(url, {
        headers: this.headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `ExerciseDB API error: ${response.status} ${response.statusText}`
        );
      }

      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchAll(limit = 1400, offset = 0): Promise<ExerciseDBEntry[]> {
    const url = `${BASE_URL}/exercises?limit=${limit}&offset=${offset}`;
    const response = await this.fetchWithTimeout(url);
    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error(
        `ExerciseDB API returned unexpected response type: ${typeof data}`
      );
    }

    return data as ExerciseDBEntry[];
  }

  async fetchById(id: string): Promise<ExerciseDBEntry> {
    const url = `${BASE_URL}/exercises/exercise/${id}`;
    const response = await this.fetchWithTimeout(url);
    const data = await response.json();

    if (!data || typeof data !== "object" || !("name" in data)) {
      throw new Error("ExerciseDB API returned unexpected response shape");
    }

    return data as ExerciseDBEntry;
  }
}
