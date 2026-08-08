import { describe, it, expect } from "vitest";
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, getModelById } from "@/lib/ai/models";

describe("models", () => {
  it("exposes only Codex 5.3 Spark", () => {
    expect(AVAILABLE_MODELS).toEqual([
      { id: "gpt-5.3-codex-spark", label: "Codex 5.3 Spark" },
    ]);
  });

  it("each model has id and label", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.label).toBeTruthy();
    }
  });

  it("uses Codex 5.3 Spark by default", () => {
    expect(DEFAULT_MODEL_ID).toBe("gpt-5.3-codex-spark");
  });

  it("default model exists in the available models list", () => {
    const found = AVAILABLE_MODELS.find((m) => m.id === DEFAULT_MODEL_ID);
    expect(found).toBeDefined();
  });

  it("getModelById returns the correct model", () => {
    const model = getModelById("gpt-5.3-codex-spark");
    expect(model).toBeDefined();
    expect(model!.label).toBe("Codex 5.3 Spark");
  });

  it("getModelById returns undefined for unknown model", () => {
    expect(getModelById("unknown-model")).toBeUndefined();
  });
});
