import { describe, it, expect } from "vitest";
import { AVAILABLE_MODELS, DEFAULT_MODEL_ID, getModelById } from "@/lib/ai/models";

describe("models", () => {
  it("exports a non-empty list of available models", () => {
    expect(AVAILABLE_MODELS.length).toBeGreaterThan(0);
  });

  it("each model has id and label", () => {
    for (const model of AVAILABLE_MODELS) {
      expect(model.id).toBeTruthy();
      expect(model.label).toBeTruthy();
    }
  });

  it("DEFAULT_MODEL_ID is claude-haiku-4-5", () => {
    expect(DEFAULT_MODEL_ID).toBe("claude-haiku-4-5");
  });

  it("default model exists in the available models list", () => {
    const found = AVAILABLE_MODELS.find((m) => m.id === DEFAULT_MODEL_ID);
    expect(found).toBeDefined();
  });

  it("getModelById returns the correct model", () => {
    const model = getModelById("claude-opus-4-6");
    expect(model).toBeDefined();
    expect(model!.label).toBe("Opus 4.6");
  });

  it("getModelById returns undefined for unknown model", () => {
    expect(getModelById("unknown-model")).toBeUndefined();
  });
});
